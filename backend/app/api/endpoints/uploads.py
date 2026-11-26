from __future__ import annotations

import hashlib
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_db
from app.db.models import Task, TaskAttachment, User
from app.storage.backend import LocalStorage
from app.storage.images import sanitize_image

router = APIRouter(tags=["uploads"])


def _storage() -> LocalStorage:
    root = get_settings().upload_directory
    if not root.is_absolute():
        root = Path(__file__).resolve().parents[3] / root
    return LocalStorage(root)


async def _read_image(upload: UploadFile) -> tuple[bytes, str, str]:
    maximum = get_settings().max_upload_bytes
    data = await upload.read(maximum + 1)
    if not data or len(data) > maximum:
        raise HTTPException(
            status_code=413, detail="Image is empty or exceeds the upload size limit"
        )
    try:
        cleaned, content_type, extension = sanitize_image(data)
    except ValueError as error:
        raise HTTPException(status_code=415, detail=str(error)) from error
    if len(cleaned) > maximum:
        raise HTTPException(
            status_code=413, detail="Re-encoded image exceeds the upload size limit"
        )
    return cleaned, content_type, extension


@router.post("/users/me/profile-picture", summary="Upload a profile picture")
async def upload_profile_picture(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    data, content_type, extension = await _read_image(file)
    storage = _storage()
    if user.profile_picture_key:
        storage.delete(user.profile_picture_key)
    key = f"profiles/{user.id}/{uuid4().hex}{extension}"
    storage.put(key, data)
    user.profile_picture_key = key
    return {"profile_picture_key": key, "content_type": content_type}


@router.delete(
    "/users/me/profile-picture",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a profile picture",
)
def delete_profile_picture(
    user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    if user.profile_picture_key:
        _storage().delete(user.profile_picture_key)
        user.profile_picture_key = None
    return None


@router.get("/users/me/profile-picture", summary="Get the current user's profile picture")
def get_profile_picture(user: User = Depends(get_current_user)):
    if not user.profile_picture_key:
        raise HTTPException(status_code=404, detail="Profile picture not found")
    path = _storage().get_path(user.profile_picture_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Profile picture not found")
    media_type = {".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}.get(
        path.suffix.lower(), "application/octet-stream"
    )
    return FileResponse(path, media_type=media_type, headers={"X-Content-Type-Options": "nosniff"})


@router.post(
    "/tasks/{task_id}/attachments",
    status_code=status.HTTP_201_CREATED,
    summary="Attach a sanitized image",
)
async def upload_task_attachment(
    task_id: UUID,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    task = session.scalar(
        select(Task).where(
            Task.id == task_id,
            Task.user_id == user.id,
            Task.deleted_at.is_(None),
        )
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    data, content_type, extension = await _read_image(file)
    key = f"tasks/{user.id}/{task.id}/{uuid4().hex}{extension}"
    _storage().put(key, data)
    attachment = TaskAttachment(
        task_id=task.id,
        user_id=user.id,
        storage_key=key,
        original_filename=Path(file.filename or "image").name[:255],
        content_type=content_type,
        size_bytes=len(data),
        checksum=hashlib.sha256(data).hexdigest(),
    )
    session.add(attachment)
    session.flush()
    return attachment


@router.get("/tasks/{task_id}/attachments", summary="List a task's attachment metadata")
def list_task_attachments(
    task_id: UUID,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    task = session.scalar(
        select(Task).where(
            Task.id == task_id,
            Task.user_id == user.id,
            Task.deleted_at.is_(None),
        )
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return list(
        session.scalars(
            select(TaskAttachment)
            .where(TaskAttachment.task_id == task.id, TaskAttachment.user_id == user.id)
            .order_by(TaskAttachment.created_at.desc())
        )
    )


@router.get("/attachments/{attachment_id}", summary="Download an authorized attachment")
def download_attachment(
    attachment_id: UUID,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    attachment = session.scalar(
        select(TaskAttachment)
        .join(
            Task,
            Task.id == TaskAttachment.task_id,
        )
        .where(
            TaskAttachment.id == attachment_id,
            TaskAttachment.user_id == user.id,
            Task.user_id == user.id,
            Task.deleted_at.is_(None),
        )
    )
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    path = _storage().get_path(attachment.storage_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Attachment not found")
    return FileResponse(
        path,
        media_type=attachment.content_type,
        filename=Path(attachment.original_filename).name,
        headers={"X-Content-Type-Options": "nosniff", "Content-Disposition": "attachment"},
    )


@router.delete(
    "/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an attachment",
)
def delete_attachment(
    attachment_id: UUID,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    attachment = session.scalar(
        select(TaskAttachment)
        .join(Task, Task.id == TaskAttachment.task_id)
        .where(
            TaskAttachment.id == attachment_id,
            TaskAttachment.user_id == user.id,
            Task.user_id == user.id,
        )
    )
    if attachment is None:
        raise HTTPException(status_code=404, detail="Attachment not found")
    _storage().delete(attachment.storage_key)
    session.delete(attachment)
    return None
