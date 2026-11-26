from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Date, and_, case, cast, func, or_, select
from sqlalchemy.orm import Session

from app.api.endpoints.tasks import _task_json
from app.core.dependencies import get_current_user, get_db
from app.db.models import Task, TaskPriority, TaskStatus, User, UserPreferences

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _timezone(session: Session, user_id) -> ZoneInfo:
    prefs = session.get(UserPreferences, user_id)
    try:
        return ZoneInfo(prefs.timezone if prefs else "UTC")
    except Exception:
        return ZoneInfo("UTC")


def _base(user_id):
    return select(Task).where(
        Task.user_id == user_id,
        Task.deleted_at.is_(None),
        Task.status != TaskStatus.ARCHIVED,
    )


@router.get("/summary", summary="Get task counts and completion rate")
def summary(user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    timezone = _timezone(session, user.id)
    now = datetime.now(UTC)
    today = now.astimezone(timezone).date()
    local_due_date = cast(func.timezone(timezone.key, Task.due_at), Date)
    overdue_condition = and_(
        Task.due_at.is_not(None),
        Task.status.not_in([TaskStatus.COMPLETED, TaskStatus.ARCHIVED]),
        or_(
            and_(Task.is_all_day.is_(True), local_due_date < today),
            and_(Task.is_all_day.is_(False), Task.due_at < now),
        ),
    )
    row = session.execute(
        select(
            func.count(Task.id).label("total"),
            func.count(case((Task.status == TaskStatus.COMPLETED, Task.id))).label("completed"),
            func.count(case((Task.status == TaskStatus.PENDING, Task.id))).label("pending"),
            func.count(case((Task.status == TaskStatus.IN_PROGRESS, Task.id))).label("in_progress"),
            func.count(case((overdue_condition, Task.id))).label("overdue"),
            func.count(case((local_due_date == today, Task.id))).label("due_today"),
            func.count(
                case(
                    (
                        and_(
                            Task.priority.in_([TaskPriority.HIGH, TaskPriority.URGENT]),
                            Task.status.not_in([TaskStatus.COMPLETED, TaskStatus.ARCHIVED]),
                        ),
                        Task.id,
                    )
                )
            ).label("high_or_urgent"),
        )
        .select_from(Task)
        .where(
            Task.user_id == user.id,
            Task.deleted_at.is_(None),
            Task.status != TaskStatus.ARCHIVED,
        )
    ).one()
    completed = row.completed or 0
    total = row.total or 0
    return {
        "total": total,
        "completed": completed,
        "pending": row.pending or 0,
        "in_progress": row.in_progress or 0,
        "overdue": row.overdue or 0,
        "due_today": row.due_today or 0,
        "high_or_urgent": row.high_or_urgent or 0,
        "completion_percent": round(completed * 100 / total, 2) if total else 0.0,
    }


@router.get("/productivity", summary="Completions grouped by local calendar day")
def productivity(
    days: int = Query(default=7, ge=7, le=30),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    if days not in {7, 30}:
        raise HTTPException(status_code=422, detail="days must be 7 or 30")
    timezone = _timezone(session, user.id)
    today = datetime.now(timezone).date()
    first_day = today - timedelta(days=days - 1)
    completion_day = cast(func.timezone(timezone.key, Task.completed_at), Date)
    rows = session.execute(
        select(completion_day.label("day"), func.count(Task.id).label("count"))
        .where(
            Task.user_id == user.id,
            Task.deleted_at.is_(None),
            Task.status == TaskStatus.COMPLETED,
            Task.completed_at.is_not(None),
            completion_day >= first_day,
            completion_day <= today,
        )
        .group_by(completion_day)
    )
    counts = {row.day: row.count for row in rows}
    return {
        "days": [
            {
                "date": (first_day + timedelta(days=offset)).isoformat(),
                "completed": counts.get(first_day + timedelta(days=offset), 0),
            }
            for offset in range(days)
        ]
    }


@router.get("/status-distribution", summary="Count tasks by status")
def status_distribution(user: User = Depends(get_current_user), session: Session = Depends(get_db)):
    rows = session.execute(
        select(Task.status, func.count(Task.id))
        .where(
            Task.user_id == user.id,
            Task.deleted_at.is_(None),
            Task.status != TaskStatus.ARCHIVED,
        )
        .group_by(Task.status)
    )
    return {task_status.value: count for task_status, count in rows}


@router.get("/upcoming", summary="List tasks due soon")
def upcoming(
    days: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=10, ge=1, le=50),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    now = datetime.now(UTC)
    timezone = _timezone(session, user.id)
    today = now.astimezone(timezone).date()
    local_due_day = cast(func.timezone(timezone.key, Task.due_at), Date)
    tasks = session.scalars(
        select(Task)
        .where(
            Task.user_id == user.id,
            Task.deleted_at.is_(None),
            Task.status.not_in([TaskStatus.COMPLETED, TaskStatus.ARCHIVED]),
            or_(
                and_(
                    Task.is_all_day.is_(True),
                    local_due_day >= today,
                    local_due_day <= today + timedelta(days=days),
                ),
                and_(
                    Task.is_all_day.is_(False),
                    Task.due_at >= now,
                    Task.due_at <= now + timedelta(days=days),
                ),
            ),
        )
        .order_by(Task.due_at)
        .limit(limit)
    )
    return [_task_json(session, task) for task in tasks]


@router.get("/recent", summary="List recently updated tasks")
def recent(
    limit: int = Query(default=10, ge=1, le=50),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_db),
):
    tasks = session.scalars(
        select(Task)
        .where(
            Task.user_id == user.id,
            Task.deleted_at.is_(None),
            Task.status != TaskStatus.ARCHIVED,
        )
        .order_by(Task.updated_at.desc())
        .limit(limit)
    )
    return [_task_json(session, task) for task in tasks]
