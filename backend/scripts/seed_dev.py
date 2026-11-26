from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.core.config import get_settings
from app.db.models import Task, TaskPriority, TaskStatus, User
from app.db.session import SessionLocal


def main() -> None:
    if get_settings().app_env.lower() == "production":
        raise SystemExit("Refusing to run the development seed in production")

    with SessionLocal.begin() as session:
        email = "demo@taskflow.local"
        user = session.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                full_name="TaskFlow Demo",
                email=email,
                password_hash="disabled$development-seed$no-login",
                is_active=False,
            )
            session.add(user)
            session.flush()

        if not session.scalar(select(Task.id).where(Task.user_id == user.id).limit(1)):
            session.add_all(
                [
                    Task(
                        user_id=user.id,
                        title="Plan the week",
                        status=TaskStatus.PENDING,
                        priority=TaskPriority.HIGH,
                    ),
                    Task(
                        user_id=user.id,
                        title="Review project notes",
                        status=TaskStatus.IN_PROGRESS,
                        priority=TaskPriority.MEDIUM,
                        due_at=datetime.now(UTC) + timedelta(days=1),
                    ),
                ]
            )


if __name__ == "__main__":
    main()
