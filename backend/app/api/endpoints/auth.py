from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db, require_csrf
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    new_opaque_token,
    send_email,
    verify_dummy_password,
    verify_password,
)
from app.db.models import (
    EmailVerificationToken,
    PasswordResetToken,
    RefreshSession,
    User,
    UserPreferences,
)
from app.schemas.api import (
    ForgotPasswordRequest,
    LoginRequest,
    RegisterRequest,
    ResetPasswordRequest,
    UserResponse,
    VerifyEmailRequest,
)

router = APIRouter(prefix="/auth", tags=["authentication"])


def _set_session_cookies(response: Response, refresh: str, csrf: str, remember: bool) -> None:
    settings = get_settings()
    max_age = (settings.remember_refresh_days if remember else settings.refresh_days) * 86400
    common = {
        "secure": bool(settings.secure_cookies),
        "samesite": settings.cookie_same_site,
        "max_age": max_age,
        "path": "/api/v1/auth",
    }
    response.set_cookie("refresh_token", refresh, httponly=True, **common)
    response.set_cookie("csrf_token", csrf, httponly=False, **common)


def _clear_session_cookies(response: Response) -> None:
    settings = get_settings()
    for name in ("refresh_token", "csrf_token"):
        response.delete_cookie(
            name,
            path="/api/v1/auth",
            secure=bool(settings.secure_cookies),
            httponly=name == "refresh_token",
            samesite=settings.cookie_same_site,
        )


def _refresh_failure(response: Response, message: str) -> dict[str, dict[str, str]]:
    _clear_session_cookies(response)
    response.status_code = status.HTTP_401_UNAUTHORIZED
    return {"error": {"code": "http_401", "message": message}}


def _token_response(user: User) -> dict[str, object]:
    token, lifetime = create_access_token(str(user.id))
    return {
        "access_token": token,
        "token_type": "Bearer",
        "expires_in": lifetime,
        "user": UserResponse.model_validate(user),
    }


def _password_reset_url(token: str) -> str:
    settings = get_settings()
    query = urlencode({"token": token})
    return f"{settings.frontend_base_url.rstrip('/')}/reset-password?{query}"


@router.post("/register", status_code=status.HTTP_201_CREATED, summary="Create an account")
@limiter.limit("5/minute")
def register(
    request: Request, body: RegisterRequest, response: Response, session: Session = Depends(get_db)
):
    user = User(
        full_name=body.full_name,
        email=str(body.email).strip().lower(),
        password_hash=hash_password(body.password),
    )
    settings = get_settings()
    session.add(user)
    verification_token = None
    try:
        session.flush()
        session.add(UserPreferences(user_id=user.id))
        if settings.email_verification_enabled:
            verification_token = new_opaque_token()
            session.add(
                EmailVerificationToken(
                    user_id=user.id,
                    token_hash=hash_token(verification_token),
                    expires_at=datetime.now(UTC) + timedelta(hours=24),
                )
            )
        session.flush()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="An account with that email already exists"
        ) from error
    if verification_token:
        send_email(
            user.email, "Verify your TaskFlow email", f"Verification token: {verification_token}"
        )
    return {
        "user": UserResponse.model_validate(user),
        "verification_required": settings.email_verification_enabled,
    }


@router.post("/login", summary="Authenticate and establish a refresh session")
@limiter.limit("5/minute")
def login(
    request: Request, body: LoginRequest, response: Response, session: Session = Depends(get_db)
):
    email = str(body.email).strip().lower()
    user = session.query(User).filter(User.email == email).one_or_none()
    if user is None:
        verify_dummy_password(body.password)
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    settings = get_settings()
    if not user.is_active or (settings.email_verification_enabled and not user.is_verified):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    now = datetime.now(UTC)
    days = settings.remember_refresh_days if body.remember_me else settings.refresh_days
    raw_refresh = new_opaque_token()
    csrf = new_opaque_token()
    session.add(
        RefreshSession(
            user_id=user.id,
            token_hash=hash_token(raw_refresh),
            family_id=uuid4(),
            user_agent=request.headers.get("user-agent"),
            ip=request.client.host if request.client else None,
            expires_at=now + timedelta(days=days),
            remember_me=body.remember_me,
        )
    )
    _set_session_cookies(response, raw_refresh, csrf, body.remember_me)
    return _token_response(user)


@router.post("/refresh", summary="Rotate the refresh token")
@limiter.limit("30/minute")
def refresh(
    request: Request,
    response: Response,
    _: None = Depends(require_csrf),
    session: Session = Depends(get_db),
):
    raw_refresh = request.cookies.get("refresh_token")
    if not raw_refresh:
        return _refresh_failure(response, "Refresh session is unavailable")
    token_hash = hash_token(raw_refresh)
    current = (
        session.query(RefreshSession)
        .filter(RefreshSession.token_hash == token_hash)
        .with_for_update()
        .one_or_none()
    )
    now = datetime.now(UTC)
    if current is None:
        return _refresh_failure(response, "Refresh session is unavailable")
    if current.revoked_at is not None:
        session.execute(
            update(RefreshSession)
            .where(
                RefreshSession.family_id == current.family_id, RefreshSession.revoked_at.is_(None)
            )
            .values(revoked_at=now)
        )
        session.commit()
        return _refresh_failure(response, "Refresh token reuse detected; session family revoked")
    if current.expires_at <= now:
        current.revoked_at = now
        return _refresh_failure(response, "Refresh session expired")
    user = session.get(User, current.user_id)
    if user is None or not user.is_active:
        current.revoked_at = now
        return _refresh_failure(response, "Refresh session is unavailable")

    raw_next = new_opaque_token()
    days = (
        get_settings().remember_refresh_days if current.remember_me else get_settings().refresh_days
    )
    next_session = RefreshSession(
        user_id=user.id,
        token_hash=hash_token(raw_next),
        family_id=current.family_id,
        user_agent=request.headers.get("user-agent"),
        ip=request.client.host if request.client else None,
        expires_at=now + timedelta(days=days),
        remember_me=current.remember_me,
    )
    current.revoked_at = now
    session.add(next_session)
    session.flush()
    current.replaced_by_id = next_session.id
    _set_session_cookies(response, raw_next, new_opaque_token(), current.remember_me)
    return _token_response(user)


@router.post(
    "/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Revoke the current refresh session"
)
def logout(
    request: Request,
    response: Response,
    _: None = Depends(require_csrf),
    session: Session = Depends(get_db),
):
    raw_refresh = request.cookies.get("refresh_token")
    if raw_refresh:
        session.query(RefreshSession).filter(
            RefreshSession.token_hash == hash_token(raw_refresh),
            RefreshSession.revoked_at.is_(None),
        ).update({RefreshSession.revoked_at: datetime.now(UTC)}, synchronize_session=False)
    _clear_session_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/forgot-password", summary="Request a password reset")
@limiter.limit("3/minute")
def forgot_password(
    request: Request,
    response: Response,
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    session: Session = Depends(get_db),
):
    user = session.query(User).filter(User.email == str(body.email).strip().lower()).one_or_none()
    if user is not None and user.is_active:
        raw_token = new_opaque_token()
        session.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hash_token(raw_token),
                expires_at=datetime.now(UTC) + timedelta(minutes=30),
            )
        )
        background_tasks.add_task(
            send_email,
            user.email,
            "Reset your TaskFlow password",
            _password_reset_url(raw_token),
        )
    verify_dummy_password("constant-time-reset-check")
    return {"message": "If the account exists, password reset instructions have been sent."}


@router.post("/reset-password", summary="Consume a single-use password reset token")
@limiter.limit("5/minute")
def reset_password(
    request: Request,
    response: Response,
    body: ResetPasswordRequest,
    session: Session = Depends(get_db),
):
    reset = (
        session.query(PasswordResetToken)
        .filter(PasswordResetToken.token_hash == hash_token(body.token))
        .with_for_update()
        .one_or_none()
    )
    now = datetime.now(UTC)
    if reset is None or reset.used_at is not None or reset.expires_at <= now:
        raise HTTPException(status_code=400, detail="Reset token is invalid or expired")
    user = session.get(User, reset.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Reset token is invalid or expired")
    reset.used_at = now
    user.password_hash = hash_password(body.new_password)
    session.query(RefreshSession).filter(
        RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None)
    ).update({RefreshSession.revoked_at: now}, synchronize_session=False)
    session.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.id != reset.id,
        PasswordResetToken.used_at.is_(None),
    ).update({PasswordResetToken.used_at: now}, synchronize_session=False)
    return {"message": "Password has been reset. Please sign in again."}


@router.post("/email-verification/confirm", summary="Confirm an email address")
def confirm_email(body: VerifyEmailRequest, session: Session = Depends(get_db)):
    if not get_settings().email_verification_enabled:
        raise HTTPException(status_code=404, detail="Email verification is disabled")
    record = (
        session.query(EmailVerificationToken)
        .filter(EmailVerificationToken.token_hash == hash_token(body.token))
        .with_for_update()
        .one_or_none()
    )
    now = datetime.now(UTC)
    if record is None or record.used_at is not None or record.expires_at <= now:
        raise HTTPException(status_code=400, detail="Verification token is invalid or expired")
    user = session.get(User, record.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Verification token is invalid or expired")
    if record.new_email:
        user.email = record.new_email.strip().lower()
    user.is_verified = True
    record.used_at = now
    try:
        session.flush()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(
            status_code=409, detail="That email address is already in use"
        ) from error
    return {"message": "Email verified"}


@router.post("/email-verification/request", summary="Send an email verification link")
def request_email_verification(
    user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    if not get_settings().email_verification_enabled:
        raise HTTPException(status_code=404, detail="Email verification is disabled")
    token = new_opaque_token()
    session.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=datetime.now(UTC) + timedelta(hours=24),
        )
    )
    send_email(user.email, "Verify your TaskFlow email", f"Verification token: {token}")
    return {"message": "Verification instructions have been sent."}
