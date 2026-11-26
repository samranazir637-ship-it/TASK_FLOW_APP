from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.core.security import (
    hash_password,
    hash_token,
    new_opaque_token,
    send_email,
    verify_password,
)
from app.db.models import (
    Category,
    EmailVerificationToken,
    Notification,
    RefreshSession,
    Tag,
    Task,
    TaskActivity,
    TaskAttachment,
    User,
    UserPreferences,
)
from app.schemas.api import (
    CategoryCreate,
    CategoryUpdate,
    ChangePasswordRequest,
    PreferencesUpdate,
    TagCreate,
    TagUpdate,
    UserResponse,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["users"])


class EmailChangeRequest(BaseModel):
    email: EmailStr


@router.get("/me", response_model=UserResponse, summary="Get the current user profile")
def get_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.get("/me/preferences", summary="Get the current user's preferences")
def get_preferences(user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    preferences = session.get(UserPreferences, user.id)
    if preferences is None:
        preferences = UserPreferences(user_id=user.id)
        session.add(preferences)
        session.flush()
    return preferences


@router.patch("/me", response_model=UserResponse, summary="Update allowlisted profile fields")
def update_me(
    body: UserUpdate, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    changes = body.model_dump(exclude_unset=True)
    for field in ("full_name", "phone_number"):
        if field in changes:
            setattr(
                user, field, changes[field].strip() if isinstance(changes[field], str) else None
            )
    session.flush()
    return user


@router.patch("/me/preferences", summary="Update display and notification preferences")
def update_preferences(
    body: PreferencesUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    preferences = session.get(UserPreferences, user.id)
    if preferences is None:
        preferences = UserPreferences(user_id=user.id)
        session.add(preferences)
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(preferences, field, value)
    session.flush()
    return preferences


@router.post("/me/change-password", summary="Change password and revoke all sessions")
def change_password(
    body: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    now = datetime.now(UTC)
    session.execute(
        RefreshSession.__table__.update()
        .where(RefreshSession.user_id == user.id, RefreshSession.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    return {"message": "Password changed; sign in again on your devices."}


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, summary="Delete the current account")
def delete_account(user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    session.delete(user)
    return None


@router.get("/me/export", summary="Export the current user's data")
def export_data(user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    return {
        "user": UserResponse.model_validate(user).model_dump(mode="json"),
        "preferences": _as_json(session.get(UserPreferences, user.id)),
        "categories": [
            _as_json(row)
            for row in session.scalars(select(Category).where(Category.user_id == user.id))
        ],
        "tags": [
            _as_json(row) for row in session.scalars(select(Tag).where(Tag.user_id == user.id))
        ],
        "tasks": [
            _as_json(row) for row in session.scalars(select(Task).where(Task.user_id == user.id))
        ],
        "attachments": [
            _as_json(row)
            for row in session.scalars(
                select(TaskAttachment).where(TaskAttachment.user_id == user.id)
            )
        ],
        "notifications": [
            _as_json(row)
            for row in session.scalars(select(Notification).where(Notification.user_id == user.id))
        ],
        "activity": [
            _as_json(row)
            for row in session.scalars(select(TaskActivity).where(TaskActivity.user_id == user.id))
        ],
    }


def _as_json(value):
    if value is None:
        return None
    from fastapi.encoders import jsonable_encoder

    return jsonable_encoder(value, exclude={"password_hash", "token_hash"})


@router.get("/me/sessions", summary="List active refresh sessions")
def list_sessions(user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    rows = session.scalars(
        select(RefreshSession)
        .where(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
            RefreshSession.expires_at > datetime.now(UTC),
        )
        .order_by(RefreshSession.created_at.desc())
    )
    return [
        {
            "id": row.id,
            "created_at": row.created_at,
            "expires_at": row.expires_at,
            "user_agent": row.user_agent,
            "ip": str(row.ip) if row.ip else None,
            "remember_me": row.remember_me,
        }
        for row in rows
    ]


@router.delete(
    "/me/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke one refresh session",
)
def revoke_session(
    session_id: UUID, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    record = session.scalar(
        select(RefreshSession).where(
            RefreshSession.id == session_id,
            RefreshSession.user_id == user.id,
        )
    )
    if record is None:
        raise HTTPException(status_code=404, detail="Session not found")
    record.revoked_at = datetime.now(UTC)
    return None


@router.post(
    "/me/email", status_code=status.HTTP_202_ACCEPTED, summary="Request a verified email change"
)
def request_email_change(
    body: EmailChangeRequest,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    if not get_settings().email_verification_enabled:
        raise HTTPException(status_code=404, detail="Email verification is disabled")
    email = str(body.email).strip().lower()
    if email == user.email:
        return {"message": "Email change instructions have been sent."}
    token = new_opaque_token()
    session.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=hash_token(token),
            new_email=email,
            expires_at=datetime.now(UTC) + timedelta(hours=24),
        )
    )
    send_email(email, "Confirm your TaskFlow email change", f"Verification token: {token}")
    return {"message": "Email change instructions have been sent."}


@router.get("/me/categories", summary="List the current user's categories")
def list_categories(user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    return list(
        session.scalars(select(Category).where(Category.user_id == user.id).order_by(Category.name))
    )


@router.post("/me/categories", status_code=status.HTTP_201_CREATED, summary="Create a category")
def create_category(
    body: CategoryCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    category = Category(user_id=user.id, name=body.name, color=body.color)
    session.add(category)
    try:
        session.flush()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail="Category name already exists") from error
    return category


@router.patch("/me/categories/{category_id}", summary="Rename or recolor a category")
def update_category(
    category_id: UUID,
    body: CategoryUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    category = session.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    changes = body.model_dump(exclude_unset=True)
    if "name" in changes:
        category.name = changes["name"]
    if "color" in changes:
        category.color = changes["color"]
    try:
        session.flush()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail="Category name already exists") from error
    return category


@router.delete(
    "/me/categories/{category_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a category",
)
def delete_category(
    category_id: UUID, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    category = session.scalar(
        select(Category).where(Category.id == category_id, Category.user_id == user.id)
    )
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    session.delete(category)
    return None


@router.get("/me/tags", summary="List the current user's tags")
def list_tags(user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    return list(session.scalars(select(Tag).where(Tag.user_id == user.id).order_by(Tag.name)))


@router.post("/me/tags", status_code=status.HTTP_201_CREATED, summary="Create a tag")
def create_tag(
    body: TagCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    tag = Tag(user_id=user.id, name=body.name)
    session.add(tag)
    try:
        session.flush()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail="Tag name already exists") from error
    return tag


@router.patch("/me/tags/{tag_id}", summary="Rename a tag")
def update_tag(
    tag_id: UUID,
    body: TagUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    tag = session.scalar(select(Tag).where(Tag.id == tag_id, Tag.user_id == user.id))
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    tag.name = body.name
    try:
        session.flush()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(status_code=409, detail="Tag name already exists") from error
    return tag


@router.delete("/me/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a tag")
def delete_tag(
    tag_id: UUID, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    tag = session.scalar(select(Tag).where(Tag.id == tag_id, Tag.user_id == user.id))
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    session.delete(tag)
    return None
