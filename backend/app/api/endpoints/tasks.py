from datetime import UTC, datetime
from typing import Literal
from uuid import UUID
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, delete, func, or_, select, text
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, get_db
from app.db.models import (
    Category,
    Tag,
    Task,
    TaskActivity,
    TaskPriority,
    TaskStatus,
    TaskTag,
    User,
    UserPreferences,
)
from app.schemas.api import TaskCreate, TaskResponse, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _owned_task(
    session: Session, user_id: UUID, task_id: UUID, *, trash: bool = False, lock: bool = False
) -> Task:
    statement = select(Task).where(Task.id == task_id, Task.user_id == user_id)
    statement = statement.where(
        Task.deleted_at.is_not(None) if trash else Task.deleted_at.is_(None)
    )
    if lock:
        statement = statement.with_for_update()
    task = session.scalar(statement)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _task_json(session: Session, task: Task) -> TaskResponse:
    tag_ids = list(session.scalars(select(TaskTag.tag_id).where(TaskTag.task_id == task.id)))
    data = {column.name: getattr(task, column.name) for column in Task.__table__.columns}
    return TaskResponse.model_validate({**data, "tag_ids": tag_ids})


def _activity(
    session: Session, task: Task, user_id: UUID, action: str, changes: dict | None = None
) -> None:
    session.add(
        TaskActivity(task_id=task.id, user_id=user_id, action=action, changes=changes or {})
    )


def _set_tags(session: Session, task: Task, user_id: UUID, tag_ids: list[UUID]) -> None:
    unique_ids = set(tag_ids)
    if unique_ids:
        owned = set(
            session.scalars(select(Tag.id).where(Tag.user_id == user_id, Tag.id.in_(unique_ids)))
        )
        if owned != unique_ids:
            raise HTTPException(status_code=404, detail="One or more tags were not found")
    session.execute(delete(TaskTag).where(TaskTag.task_id == task.id))
    session.add_all(TaskTag(task_id=task.id, tag_id=tag_id) for tag_id in unique_ids)


def _validate_category(session: Session, user_id: UUID, category_id: UUID | None) -> None:
    if (
        category_id is not None
        and session.scalar(
            select(Category.id).where(Category.id == category_id, Category.user_id == user_id)
        )
        is None
    ):
        raise HTTPException(status_code=404, detail="Category not found")


def _user_timezone(session: Session, user_id: UUID) -> str:
    preferences = session.get(UserPreferences, user_id)
    timezone_name = preferences.timezone if preferences else "UTC"
    try:
        ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return "UTC"
    return timezone_name


@router.get("/trash", summary="List soft-deleted tasks")
def list_trash(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    tasks = session.scalars(
        select(Task)
        .where(Task.user_id == user.id, Task.deleted_at.is_not(None))
        .order_by(Task.deleted_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return [_task_json(session, task) for task in tasks]


@router.get("", summary="List, search, filter, and page through tasks")
def list_tasks(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
    search: str | None = Query(default=None, max_length=200),
    status_filter: list[TaskStatus] | None = Query(default=None, alias="status"),
    priority: TaskPriority | None = None,
    category_id: UUID | None = None,
    tag_id: UUID | None = None,
    due_from: datetime | None = None,
    due_to: datetime | None = None,
    overdue: bool | None = None,
    include_archived: bool = False,
    sort: Literal["due_at", "priority", "created_at", "title"] = "due_at",
    order: Literal["asc", "desc"] = "asc",
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    statement = select(Task).where(Task.user_id == user.id, Task.deleted_at.is_(None))
    if not include_archived:
        statement = statement.where(Task.status != TaskStatus.ARCHIVED)
    if status_filter:
        statement = statement.where(Task.status.in_(status_filter))
    if priority:
        statement = statement.where(Task.priority == priority)
    if category_id:
        statement = statement.where(Task.category_id == category_id)
    if tag_id:
        statement = statement.where(
            Task.id.in_(
                select(TaskTag.task_id)
                .join(Tag, Tag.id == TaskTag.tag_id)
                .where(TaskTag.tag_id == tag_id, Tag.user_id == user.id)
            )
        )
    if due_from:
        statement = statement.where(Task.due_at >= due_from)
    if due_to:
        statement = statement.where(Task.due_at <= due_to)
    if search:
        query = func.plainto_tsquery("english", search)
        document = func.to_tsvector(
            "english", text("coalesce(title, '') || ' ' || coalesce(description, '')")
        )
        statement = statement.where(document.op("@@")(query))
    if overdue is not None:
        now = datetime.now(UTC)
        local_today = now.astimezone(ZoneInfo(_user_timezone(session, user.id))).date()
        overdue_condition = or_(
            and_(
                Task.is_all_day.is_(True),
                func.date(func.timezone(_user_timezone(session, user.id), Task.due_at))
                < local_today,
            ),
            and_(Task.is_all_day.is_(False), Task.due_at < now),
        )
        overdue_condition = and_(
            Task.due_at.is_not(None),
            Task.status.not_in([TaskStatus.COMPLETED, TaskStatus.ARCHIVED]),
            overdue_condition,
        )
        statement = statement.where(
            overdue_condition if overdue else or_(Task.due_at.is_(None), ~overdue_condition)
        )

    count_statement = select(func.count()).select_from(statement.order_by(None).subquery())
    total = session.scalar(count_statement) or 0
    if sort == "priority":
        sort_column = case(
            (Task.priority == TaskPriority.URGENT, 0),
            (Task.priority == TaskPriority.HIGH, 1),
            (Task.priority == TaskPriority.MEDIUM, 2),
            else_=3,
        )
    else:
        sort_column = {"due_at": Task.due_at, "created_at": Task.created_at, "title": Task.title}[
            sort
        ]
    statement = statement.order_by(sort_column.desc() if order == "desc" else sort_column.asc())
    tasks = session.scalars(statement.limit(limit).offset(offset))
    return {
        "items": [_task_json(session, task) for task in tasks],
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a task")
def create_task(
    body: TaskCreate, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    _validate_category(session, user.id, body.category_id)
    values = body.model_dump(exclude={"tag_ids"})
    if values.get("start_at") and values["start_at"].tzinfo is None:
        raise HTTPException(status_code=422, detail="start_at must include a timezone")
    if values.get("due_at") and values["due_at"].tzinfo is None:
        raise HTTPException(status_code=422, detail="due_at must include a timezone")
    task = Task(user_id=user.id, **values)
    if task.status == TaskStatus.COMPLETED:
        raise HTTPException(status_code=422, detail="Use the complete action after creation")
    session.add(task)
    session.flush()
    _set_tags(session, task, user.id, body.tag_ids)
    _activity(session, task, user.id, "created")
    session.flush()
    return _task_json(session, task)


@router.get("/{task_id}", summary="Get a task")
def get_task(
    task_id: UUID, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    return _task_json(session, _owned_task(session, user.id, task_id))


@router.patch("/{task_id}", summary="Update a task using an updated_at concurrency check")
def update_task(
    task_id: UUID,
    body: TaskUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    task = _owned_task(session, user.id, task_id, lock=True)
    if task.updated_at != body.expected_updated_at:
        raise HTTPException(status_code=409, detail="Task was modified; reload before updating")
    changes = body.model_dump(exclude_unset=True, exclude={"expected_updated_at", "tag_ids"})
    if "title" in changes:
        changes["title"] = changes["title"].strip()
        if not changes["title"]:
            raise HTTPException(status_code=422, detail="Title cannot be empty")
    _validate_category(session, user.id, changes.get("category_id", task.category_id))
    start_at = changes.get("start_at", task.start_at)
    due_at = changes.get("due_at", task.due_at)
    if start_at and due_at and due_at < start_at:
        raise HTTPException(status_code=422, detail="due_at must not precede start_at")
    before = {key: str(getattr(task, key)) for key in changes}
    for field, value in changes.items():
        setattr(task, field, value)
    if body.tag_ids is not None:
        _set_tags(session, task, user.id, body.tag_ids)
    session.flush()
    after = {key: str(getattr(task, key)) for key in changes}
    _activity(
        session,
        task,
        user.id,
        "updated",
        {key: {"from": before[key], "to": after[key]} for key in changes},
    )
    session.flush()
    return _task_json(session, task)


@router.post("/{task_id}/complete", summary="Complete a task")
def complete_task(
    task_id: UUID, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    task = _owned_task(session, user.id, task_id, lock=True)
    if task.status == TaskStatus.ARCHIVED:
        raise HTTPException(status_code=409, detail="Restore the task before completing it")
    if task.status != TaskStatus.COMPLETED:
        task.status = TaskStatus.COMPLETED
        task.completed_at = datetime.now(UTC)
        _activity(session, task, user.id, "completed")
    session.flush()
    return _task_json(session, task)


@router.post("/{task_id}/reopen", summary="Reopen a completed task")
def reopen_task(
    task_id: UUID, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    task = _owned_task(session, user.id, task_id, lock=True)
    if task.status == TaskStatus.COMPLETED:
        task.status = TaskStatus.PENDING
        task.completed_at = None
        _activity(session, task, user.id, "reopened")
    session.flush()
    return _task_json(session, task)


@router.post(
    "/{task_id}/duplicate", status_code=status.HTTP_201_CREATED, summary="Duplicate a task"
)
def duplicate_task(
    task_id: UUID, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    source = _owned_task(session, user.id, task_id)
    duplicate = Task(
        user_id=user.id,
        category_id=source.category_id,
        title=f"{source.title} (copy)",
        description=source.description,
        priority=source.priority,
        start_at=source.start_at,
        due_at=source.due_at,
        is_all_day=source.is_all_day,
        estimated_duration_minutes=source.estimated_duration_minutes,
        external_url=source.external_url,
        reminder_offset_minutes=source.reminder_offset_minutes,
    )
    session.add(duplicate)
    session.flush()
    tag_ids = list(session.scalars(select(TaskTag.tag_id).where(TaskTag.task_id == source.id)))
    _set_tags(session, duplicate, user.id, tag_ids)
    _activity(session, duplicate, user.id, "duplicated", {"source_task_id": str(source.id)})
    session.flush()
    return _task_json(session, duplicate)


@router.post("/bulk-complete", summary="Complete multiple tasks")
def bulk_complete(
    body: dict, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    ids = _parse_ids(body)
    tasks = list(
        session.scalars(
            select(Task).where(
                Task.user_id == user.id,
                Task.id.in_(ids),
                Task.deleted_at.is_(None),
                Task.status != TaskStatus.ARCHIVED,
            )
        )
    )
    now = datetime.now(UTC)
    for task in tasks:
        if task.status not in {TaskStatus.COMPLETED, TaskStatus.ARCHIVED}:
            task.status = TaskStatus.COMPLETED
            task.completed_at = now
            _activity(session, task, user.id, "completed")
    session.flush()
    return {"updated": len(tasks), "items": [_task_json(session, task) for task in tasks]}


@router.post("/bulk-delete", summary="Move multiple tasks to trash")
def bulk_delete(
    body: dict, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    ids = _parse_ids(body)
    tasks = list(
        session.scalars(
            select(Task).where(Task.user_id == user.id, Task.id.in_(ids), Task.deleted_at.is_(None))
        )
    )
    now = datetime.now(UTC)
    for task in tasks:
        task.deleted_at = now
        _activity(session, task, user.id, "soft_deleted")
    return {"deleted": len(tasks)}


def _parse_ids(body: dict) -> list[UUID]:
    try:
        ids = list(dict.fromkeys(UUID(str(value)) for value in body["ids"]))
    except (KeyError, TypeError, ValueError) as error:
        raise HTTPException(status_code=422, detail="ids must be an array of UUIDs") from error
    if not ids or len(ids) > 100:
        raise HTTPException(status_code=422, detail="ids must contain between 1 and 100 values")
    return ids


@router.post("/{task_id}/archive", summary="Archive a task")
def archive_task(
    task_id: UUID, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    task = _owned_task(session, user.id, task_id)
    task.status = TaskStatus.ARCHIVED
    task.completed_at = None
    _activity(session, task, user.id, "archived")
    session.flush()
    return _task_json(session, task)


@router.post("/{task_id}/restore", summary="Restore a task from trash")
def restore_task(
    task_id: UUID, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    task = _owned_task(session, user.id, task_id, trash=True)
    task.deleted_at = None
    _activity(session, task, user.id, "restored")
    session.flush()
    return _task_json(session, task)


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Move a task to trash")
def delete_task(
    task_id: UUID, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    task = _owned_task(session, user.id, task_id)
    task.deleted_at = datetime.now(UTC)
    _activity(session, task, user.id, "soft_deleted")
    return None


@router.get("/{task_id}/activity", summary="Get a task's activity history")
def task_activity(
    task_id: UUID, user: User = Depends(get_current_user), session: Session = Depends(get_db)
):
    task = _owned_task(session, user.id, task_id)
    return list(
        session.scalars(
            select(TaskActivity)
            .where(
                TaskActivity.task_id == task.id,
                TaskActivity.user_id == user.id,
            )
            .order_by(TaskActivity.created_at.desc())
            .limit(100)
        )
    )


@router.get("/calendar/events", summary="Get tasks within an inclusive date range")
def calendar_events(
    start: datetime,
    end: datetime,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    if start.tzinfo is None or end.tzinfo is None or end < start:
        raise HTTPException(
            status_code=422, detail="start and end must be timezone-aware and start <= end"
        )
    tasks = session.scalars(
        select(Task)
        .where(
            Task.user_id == user.id,
            Task.deleted_at.is_(None),
            Task.status != TaskStatus.ARCHIVED,
            func.coalesce(Task.start_at, Task.due_at) <= end,
            func.coalesce(Task.due_at, Task.start_at) >= start,
        )
        .order_by(Task.is_all_day.desc(), Task.start_at, Task.due_at)
    )
    return [_task_json(session, task) for task in tasks]
