from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert

from app.core.config import get_settings
from app.core.security import send_email
from app.db.models import Notification, Task, TaskAttachment, TaskStatus, User, UserPreferences
from app.db.session import SessionLocal
from app.storage.backend import LocalStorage


def create_due_reminders() -> int:
    now = datetime.now(UTC)
    inserted = 0
    with SessionLocal.begin() as session:
        tasks = session.scalars(
            select(Task)
            .where(
                Task.deleted_at.is_(None),
                Task.status.not_in([TaskStatus.COMPLETED, TaskStatus.ARCHIVED]),
                Task.due_at.is_not(None),
                Task.reminder_offset_minutes.is_not(None),
                Task.due_at <= now + Task.reminder_offset_minutes * text("INTERVAL '1 minute'"),
            )
            .with_for_update(skip_locked=True)
        )
        for task in tasks:
            if task.due_at is None or task.reminder_offset_minutes is None:
                continue
            reminder_at = task.due_at - timedelta(minutes=task.reminder_offset_minutes)
            if reminder_at > now:
                continue
            key = f"task:{task.id}:due:{task.due_at.isoformat()}"
            statement = (
                insert(Notification)
                .values(
                    user_id=task.user_id,
                    task_id=task.id,
                    type="task_reminder",
                    title="Task reminder",
                    body=task.title,
                    dedupe_key=key,
                )
                .on_conflict_do_nothing(constraint="uq_notifications_user_dedupe_key")
            )
            result = session.execute(statement)
            did_insert = result.rowcount or 0
            inserted += did_insert
            if did_insert:
                preferences = session.get(UserPreferences, task.user_id)
                user = session.get(User, task.user_id)
                if preferences and preferences.notify_email and user is not None:
                    send_email(user.email, "TaskFlow reminder", task.title)
    return inserted


def cleanup_orphaned_files() -> int:
    settings = get_settings()
    root = settings.upload_directory
    if not root.is_absolute():
        root = Path(__file__).resolve().parents[2] / root
    storage = LocalStorage(root)
    with SessionLocal() as session:
        attachment_keys = set(session.scalars(select(TaskAttachment.storage_key)))
        profile_keys = set(
            session.scalars(
                select(User.profile_picture_key).where(User.profile_picture_key.is_not(None))
            )
        )
    referenced = attachment_keys | profile_keys
    removed = 0
    cutoff = datetime.now().timestamp() - 86400
    for path in root.rglob("*"):
        if path.is_file() and path.stat().st_mtime < cutoff:
            key = path.relative_to(root).as_posix()
            if key not in referenced:
                storage.delete(key)
                removed += 1
    return removed
