from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.db.models import (
    RefreshSession,
    Tag,
    Task,
    TaskAttachment,
    TaskStatus,
    TaskTag,
    User,
)
from app.repositories.scoped import TaskRepository


def make_user(session, email: str = "person@example.com") -> User:
    user = User(full_name="Test Person", email=email, password_hash="test-hash")
    session.add(user)
    session.flush()
    return user


def test_email_is_normalized_and_case_insensitive_unique(db_session) -> None:
    user = make_user(db_session, "  Alice@Example.Com ")
    assert user.email == "alice@example.com"
    db_session.add(User(full_name="Other", email="ALICE@example.com", password_hash="hash"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_user_delete_cascades_to_tasks_tags_sessions(db_session) -> None:
    user = make_user(db_session)
    task = Task(user_id=user.id, title="Remove with user")
    tag = Tag(user_id=user.id, name="work")
    refresh = RefreshSession(
        user_id=user.id, token_hash="hash", expires_at=datetime.now(UTC) + timedelta(days=1)
    )
    db_session.add_all([task, tag, refresh])
    db_session.flush()
    task_id, tag_id, session_id = task.id, tag.id, refresh.id

    db_session.delete(user)
    db_session.flush()
    db_session.expire_all()

    assert db_session.get(Task, task_id) is None
    assert db_session.get(Tag, tag_id) is None
    assert db_session.get(RefreshSession, session_id) is None


def test_task_delete_cascades_to_attachment_and_tag_link(db_session) -> None:
    user = make_user(db_session)
    task = Task(user_id=user.id, title="Delete parent")
    tag = Tag(user_id=user.id, name="cleanup")
    db_session.add_all([task, tag])
    db_session.flush()
    attachment = TaskAttachment(
        task_id=task.id,
        user_id=user.id,
        storage_key="local/example",
        original_filename="example.txt",
        content_type="text/plain",
        size_bytes=1,
        checksum="sha256:placeholder",
    )
    link = TaskTag(task_id=task.id, tag_id=tag.id)
    db_session.add_all([attachment, link])
    db_session.flush()
    attachment_id, task_id = attachment.id, task.id

    db_session.delete(task)
    db_session.flush()
    db_session.expire_all()

    assert db_session.get(TaskAttachment, attachment_id) is None
    assert db_session.scalar(select(TaskTag).where(TaskTag.task_id == task_id)) is None


@pytest.mark.parametrize(
    "values",
    [
        {"title": "   "},
        {
            "title": "Invalid interval",
            "start_at": datetime(2026, 1, 2, tzinfo=UTC),
            "due_at": datetime(2026, 1, 1, tzinfo=UTC),
        },
        {"title": "Missing completion time", "status": TaskStatus.COMPLETED},
        {"title": "Completion time on pending task", "completed_at": datetime.now(UTC)},
    ],
)
def test_task_checks_reject_invalid_data(db_session, values) -> None:
    user = make_user(db_session)
    db_session.add(Task(user_id=user.id, **values))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_soft_delete_keeps_row_but_hides_other_users_tasks(db_session) -> None:
    owner = make_user(db_session)
    stranger = make_user(db_session, "stranger@example.com")
    task = Task(user_id=owner.id, title="Private task")
    db_session.add(task)
    db_session.flush()

    assert TaskRepository(db_session, stranger.id).get(task.id) is None
    assert TaskRepository(db_session, owner.id).soft_delete(task.id)
    db_session.flush()
    assert TaskRepository(db_session, owner.id).get(task.id) is None
    assert db_session.get(Task, task.id).deleted_at is not None


def test_tag_name_is_case_insensitive_per_user(db_session) -> None:
    owner = make_user(db_session)
    other = make_user(db_session, "second@example.com")
    db_session.add_all([Tag(user_id=owner.id, name="Work"), Tag(user_id=other.id, name="work")])
    db_session.flush()
    db_session.add(Tag(user_id=owner.id, name="WORK"))
    with pytest.raises(IntegrityError):
        db_session.flush()
