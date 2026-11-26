from datetime import UTC
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session


class ScopedRepository[ModelT]:
    def __init__(self, session: Session, model: type[ModelT], user_id: UUID) -> None:
        if not hasattr(model, "user_id"):
            raise TypeError("Scoped models must define user_id")
        self.session = session
        self.model = model
        self.user_id = user_id

    def get(self, record_id: UUID) -> ModelT | None:
        statement = select(self.model).where(
            self.model.id == record_id,
            self.model.user_id == self.user_id,
        )
        return self.session.scalar(statement)

    def list(self, *, limit: int = 100, offset: int = 0) -> list[ModelT]:
        statement = (
            select(self.model).where(self.model.user_id == self.user_id).limit(limit).offset(offset)
        )
        return list(self.session.scalars(statement))

    def delete(self, record_id: UUID) -> bool:
        record = self.get(record_id)
        if record is None:
            return False
        self.session.delete(record)
        return True


class TaskRepository(ScopedRepository[Any]):
    def __init__(self, session: Session, user_id: UUID) -> None:
        from app.db.models import Task

        super().__init__(session, Task, user_id)

    def get(self, record_id: UUID) -> Any | None:
        task = super().get(record_id)
        if task is None or task.deleted_at is not None:
            return None
        return task

    def list(self, *, limit: int = 100, offset: int = 0) -> list[Any]:
        from app.db.models import Task

        statement = (
            select(Task)
            .where(Task.user_id == self.user_id, Task.deleted_at.is_(None))
            .limit(limit)
            .offset(offset)
        )
        return list(self.session.scalars(statement))

    def soft_delete(self, task_id: UUID) -> bool:
        from datetime import datetime

        task = self.get(task_id)
        if task is None:
            return False
        task.deleted_at = datetime.now(UTC)
        return True
