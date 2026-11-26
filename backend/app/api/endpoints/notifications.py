from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.db.models import Notification, User
from app.schemas.api import NotificationResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationResponse], summary="List notifications")
def list_notifications(
    unread_only: bool = False,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    statement = select(Notification).where(Notification.user_id == user.id)
    if unread_only:
        statement = statement.where(Notification.is_read.is_(False))
    return list(
        session.scalars(
            statement.order_by(Notification.created_at.desc()).limit(limit).offset(offset)
        )
    )


@router.get("/unread-count", summary="Count unread notifications")
def unread_count(user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    count = session.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id,
            Notification.is_read.is_(False),
        )
    )
    return {"count": count or 0}


@router.post(
    "/{notification_id}/read",
    response_model=NotificationResponse,
    summary="Mark one notification read",
)
def mark_read(
    notification_id: UUID,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    notification = session.scalar(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
    )
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    notification.is_read = True
    return notification


@router.post("/read-all", summary="Mark all notifications read")
def mark_all_read(user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    result = session.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True)
    )
    return {"updated": result.rowcount or 0}
