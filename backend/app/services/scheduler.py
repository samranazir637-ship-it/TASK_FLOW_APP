from apscheduler.schedulers.background import BackgroundScheduler

from app.core.config import get_settings
from app.services.reminders import cleanup_orphaned_files, create_due_reminders

_scheduler: BackgroundScheduler | None = None


def start_scheduler() -> None:
    global _scheduler
    if not get_settings().scheduler_enabled or _scheduler is not None:
        return
    scheduler = BackgroundScheduler(timezone="UTC", daemon=True)
    scheduler.add_job(
        create_due_reminders,
        "interval",
        seconds=30,
        id="task-reminders",
        max_instances=1,
        coalesce=True,
    )
    scheduler.add_job(
        cleanup_orphaned_files,
        "interval",
        hours=6,
        id="upload-orphan-cleanup",
        max_instances=1,
        coalesce=True,
    )
    scheduler.start()
    _scheduler = scheduler


def stop_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
