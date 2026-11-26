from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy import select

from app.core.rate_limit import limiter
from app.core.security import create_access_token, hash_password, hash_token
from app.db.models import (
    Category,
    Notification,
    PasswordResetToken,
    RefreshSession,
    Tag,
    Task,
    TaskAttachment,
    TaskPriority,
    TaskStatus,
    User,
    UserPreferences,
)


def test_register_login_refresh_rotation_and_reuse_revocation(api_client, db_session) -> None:
    email = f"user-{uuid4().hex}@example.com"
    payload = {
        "full_name": "API Test User",
        "email": email.upper(),
        "password": "S0methingSecure!2026",
    }
    registered = api_client.post("/api/v1/auth/register", json=payload)
    assert registered.status_code == 201
    assert registered.json()["user"]["email"] == email
    assert api_client.post("/api/v1/auth/register", json=payload).status_code == 409

    login = api_client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": payload["password"], "remember_me": True},
    )
    assert login.status_code == 200
    assert "access_token" in login.json()
    old_refresh = api_client.cookies.get("refresh_token")
    csrf = api_client.cookies.get("csrf_token")
    assert old_refresh and csrf

    rotated = api_client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf})
    assert rotated.status_code == 200
    assert api_client.cookies.get("refresh_token") != old_refresh

    api_client.cookies.set("refresh_token", old_refresh, path="/api/v1/auth")
    reused = api_client.post(
        "/api/v1/auth/refresh",
        headers={"X-CSRF-Token": api_client.cookies.get("csrf_token")},
    )
    assert reused.status_code == 401
    user = db_session.scalar(select(User).where(User.email == email))
    assert user is not None
    active_sessions = db_session.scalars(
        select(RefreshSession).where(
            RefreshSession.user_id == user.id,
            RefreshSession.revoked_at.is_(None),
        )
    )
    assert list(active_sessions) == []


def test_task_complete_reopen_and_foreign_resource_is_hidden(api_client, db_session) -> None:
    owner = User(
        full_name="Owner",
        email=f"owner-{uuid4().hex}@example.com",
        password_hash="unused",
    )
    other = User(
        full_name="Other",
        email=f"other-{uuid4().hex}@example.com",
        password_hash="unused",
    )
    db_session.add_all([owner, other])
    db_session.flush()
    task = Task(user_id=other.id, title="Private task")
    db_session.add(task)
    db_session.flush()
    token, _ = create_access_token(str(owner.id))
    headers = {"Authorization": f"Bearer {token}"}

    assert api_client.get(f"/api/v1/tasks/{task.id}", headers=headers).status_code == 404
    created = api_client.post("/api/v1/tasks", headers=headers, json={"title": "Write tests"})
    assert created.status_code == 201
    task_id = created.json()["id"]
    completed = api_client.post(f"/api/v1/tasks/{task_id}/complete", headers=headers)
    assert completed.json()["status"] == "completed"
    assert completed.json()["completed_at"] is not None
    reopened = api_client.post(f"/api/v1/tasks/{task_id}/reopen", headers=headers)
    assert reopened.json()["status"] == "pending"
    assert reopened.json()["completed_at"] is None


def test_login_failure_logout_and_password_change_revoke_sessions(api_client, db_session) -> None:
    email = f"auth-{uuid4().hex}@example.com"
    password = "S0methingSecure!2026"
    user = User(full_name="Auth User", email=email, password_hash=hash_password(password))
    db_session.add(user)
    db_session.flush()

    assert (
        api_client.post(
            "/api/v1/auth/login", json={"email": email, "password": "incorrect-password"}
        ).status_code
        == 401
    )
    login = api_client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert login.status_code == 200
    refresh_cookie = api_client.cookies.get("refresh_token")
    csrf = api_client.cookies.get("csrf_token")
    assert refresh_cookie and csrf

    session_record = db_session.scalar(
        select(RefreshSession).where(RefreshSession.token_hash == hash_token(refresh_cookie))
    )
    assert session_record is not None and session_record.revoked_at is None
    logout = api_client.post("/api/v1/auth/logout", headers={"X-CSRF-Token": csrf})
    assert logout.status_code == 204
    db_session.refresh(session_record)
    assert session_record.revoked_at is not None

    token, _ = create_access_token(str(user.id))
    replacement_login = api_client.post(
        "/api/v1/auth/login", json={"email": email, "password": password}
    )
    assert replacement_login.status_code == 200
    changed = api_client.post(
        "/api/v1/users/me/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={"current_password": password, "new_password": "NewPassword!2026"},
    )
    assert changed.status_code == 200
    assert (
        list(
            db_session.scalars(
                select(RefreshSession).where(
                    RefreshSession.user_id == user.id,
                    RefreshSession.revoked_at.is_(None),
                )
            )
        )
        == []
    )


def test_login_rate_limit_is_enforced(api_client) -> None:
    limiter.reset()
    try:
        for attempt in range(5):
            response = api_client.post(
                "/api/v1/auth/login",
                json={
                    "email": f"missing-{attempt}@example.com",
                    "password": "WrongPassword!2026",
                },
            )
            assert response.status_code == 401
        limited = api_client.post(
            "/api/v1/auth/login",
            json={"email": "missing-final@example.com", "password": "WrongPassword!2026"},
        )
        assert limited.status_code == 429
        assert limited.json()["error"]["code"] == "rate_limited"
    finally:
        limiter.reset()


def test_password_reset_tokens_expire_are_single_use_and_revoke_sessions(
    api_client, db_session, monkeypatch
) -> None:
    import app.api.endpoints.auth as auth_endpoint

    email = f"reset-{uuid4().hex}@example.com"
    user = User(
        full_name="Reset User", email=email, password_hash=hash_password("OldPassword!2026")
    )
    db_session.add(user)
    db_session.flush()
    messages: list[str] = []
    monkeypatch.setattr(
        auth_endpoint, "send_email", lambda _to, _subject, body: messages.append(body)
    )

    expired_raw = "x" * 48
    db_session.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(expired_raw),
            expires_at=datetime.now(UTC) - timedelta(seconds=1),
        )
    )
    db_session.flush()
    assert (
        api_client.post(
            "/api/v1/auth/reset-password",
            json={"token": expired_raw, "new_password": "NewPassword!2026"},
        ).status_code
        == 400
    )

    assert api_client.post("/api/v1/auth/forgot-password", json={"email": email}).status_code == 200
    generic_response = api_client.post(
        "/api/v1/auth/forgot-password", json={"email": f"missing-{uuid4().hex}@example.com"}
    )
    assert generic_response.status_code == 200
    assert generic_response.json() == {
        "message": "If the account exists, password reset instructions have been sent."
    }
    assert len(messages) == 1
    reset_link = messages[0]
    assert reset_link.startswith("http://localhost:5173/reset-password?")
    raw_token = parse_qs(urlparse(reset_link).query)["token"][0]
    login = api_client.post(
        "/api/v1/auth/login", json={"email": email, "password": "OldPassword!2026"}
    )
    assert login.status_code == 200

    reset = api_client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "NewPassword!2026"},
    )
    assert reset.status_code == 200
    replay = api_client.post(
        "/api/v1/auth/reset-password",
        json={"token": raw_token, "new_password": "YetAnother!2026"},
    )
    assert replay.status_code == 400
    assert (
        list(
            db_session.scalars(
                select(RefreshSession).where(
                    RefreshSession.user_id == user.id,
                    RefreshSession.revoked_at.is_(None),
                )
            )
        )
        == []
    )


def test_profile_allowlist_export_and_foreign_catalog_notification_resources(
    api_client, db_session
) -> None:
    owner = User(full_name="Owner", email=f"owner-{uuid4().hex}@example.com", password_hash="x")
    other = User(full_name="Other", email=f"other-{uuid4().hex}@example.com", password_hash="x")
    db_session.add_all([owner, other])
    db_session.flush()
    category = Category(user_id=other.id, name="Private category")
    tag = Tag(user_id=other.id, name="private")
    task = Task(user_id=other.id, title="Private task")
    notification = Notification(user_id=other.id, type="test", title="Private", dedupe_key="x")
    db_session.add_all([category, tag, task, notification])
    db_session.flush()
    token, _ = create_access_token(str(owner.id))
    headers = {"Authorization": f"Bearer {token}"}

    updated = api_client.patch(
        "/api/v1/users/me",
        headers=headers,
        json={
            "full_name": "Updated Owner",
            "is_active": False,
            "email": "attacker@example.com",
            "password_hash": "attacker-controlled",
        },
    )
    assert updated.status_code == 200
    assert updated.json()["full_name"] == "Updated Owner"
    assert updated.json()["email"] == owner.email
    assert updated.json()["is_active"] is True

    exported = api_client.get("/api/v1/users/me/export", headers=headers)
    assert exported.status_code == 200
    assert "password_hash" not in str(exported.json())
    assert api_client.get(f"/api/v1/tasks/{task.id}", headers=headers).status_code == 404
    assert (
        api_client.post(
            f"/api/v1/notifications/{notification.id}/read", headers=headers
        ).status_code
        == 404
    )
    assert (
        api_client.post(
            "/api/v1/tasks",
            headers=headers,
            json={"title": "Wrong category", "category_id": str(category.id)},
        ).status_code
        == 404
    )
    assert (
        api_client.post(
            "/api/v1/tasks",
            headers=headers,
            json={"title": "Wrong tag", "tag_ids": [str(tag.id)]},
        ).status_code
        == 404
    )


def test_task_list_filter_sort_and_pagination_are_user_scoped(api_client, db_session) -> None:
    owner = User(full_name="Owner", email=f"list-{uuid4().hex}@example.com", password_hash="x")
    other = User(full_name="Other", email=f"other-{uuid4().hex}@example.com", password_hash="x")
    db_session.add_all([owner, other])
    db_session.flush()
    db_session.add_all(
        [
            Task(user_id=owner.id, title="Alpha", priority=TaskPriority.LOW),
            Task(user_id=owner.id, title="Beta", priority=TaskPriority.HIGH),
            Task(user_id=other.id, title="Secret Beta", priority=TaskPriority.URGENT),
        ]
    )
    db_session.flush()
    token, _ = create_access_token(str(owner.id))
    headers = {"Authorization": f"Bearer {token}"}

    page = api_client.get("/api/v1/tasks?search=Beta&sort=title&order=asc&limit=1", headers=headers)
    assert page.status_code == 200
    assert page.json()["total"] == 1
    assert [item["title"] for item in page.json()["items"]] == ["Beta"]
    injection = api_client.get("/api/v1/tasks?sort=title%3Bdrop%20table%20tasks", headers=headers)
    assert injection.status_code == 422
    search_injection = api_client.get("/api/v1/tasks?search=%27%20OR%201%3D1%20--", headers=headers)
    assert search_injection.status_code == 200
    assert search_injection.json()["total"] == 0


def test_task_update_duplicate_bulk_trash_restore_and_archive(api_client, db_session) -> None:
    user = User(full_name="Workflow", email=f"flow-{uuid4().hex}@example.com", password_hash="x")
    db_session.add(user)
    db_session.flush()
    token, _ = create_access_token(str(user.id))
    headers = {"Authorization": f"Bearer {token}"}
    created = api_client.post("/api/v1/tasks", headers=headers, json={"title": "Initial"})
    assert created.status_code == 201
    original = created.json()
    updated = api_client.patch(
        f"/api/v1/tasks/{original['id']}",
        headers=headers,
        json={"expected_updated_at": original["updated_at"], "title": "Renamed"},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Renamed"
    conflict = api_client.patch(
        f"/api/v1/tasks/{original['id']}",
        headers=headers,
        json={"expected_updated_at": original["updated_at"], "title": "Stale edit"},
    )
    assert conflict.status_code == 409
    duplicate = api_client.post(f"/api/v1/tasks/{original['id']}/duplicate", headers=headers)
    assert duplicate.status_code == 201
    task_ids = [original["id"], duplicate.json()["id"]]
    bulk = api_client.post("/api/v1/tasks/bulk-complete", headers=headers, json={"ids": task_ids})
    assert bulk.status_code == 200
    assert bulk.json()["updated"] == 2
    assert (
        api_client.post(f"/api/v1/tasks/{original['id']}/reopen", headers=headers).status_code
        == 200
    )
    deleted = api_client.post("/api/v1/tasks/bulk-delete", headers=headers, json={"ids": task_ids})
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] == 2
    assert api_client.get(f"/api/v1/tasks/{original['id']}", headers=headers).status_code == 404
    trash = api_client.get("/api/v1/tasks/trash", headers=headers)
    assert {task["id"] for task in trash.json()} == set(task_ids)
    assert (
        api_client.post(f"/api/v1/tasks/{original['id']}/restore", headers=headers).status_code
        == 200
    )
    archived = api_client.post(f"/api/v1/tasks/{original['id']}/archive", headers=headers)
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"


def test_cross_user_attachment_is_hidden_and_upload_uses_detected_image_type(
    api_client, db_session, tmp_path, monkeypatch
) -> None:
    from io import BytesIO

    from PIL import Image

    from app.core.config import get_settings

    owner = User(full_name="Owner", email=f"upload-{uuid4().hex}@example.com", password_hash="x")
    other = User(full_name="Other", email=f"other-{uuid4().hex}@example.com", password_hash="x")
    db_session.add_all([owner, other])
    db_session.flush()
    task = Task(user_id=other.id, title="Other task")
    db_session.add(task)
    db_session.flush()
    attachment = TaskAttachment(
        task_id=task.id,
        user_id=other.id,
        storage_key="tasks/other/private.png",
        original_filename="private.png",
        content_type="image/png",
        size_bytes=10,
        checksum="unused",
    )
    db_session.add(attachment)
    db_session.flush()
    token, _ = create_access_token(str(owner.id))
    headers = {"Authorization": f"Bearer {token}"}
    assert (
        api_client.get(f"/api/v1/attachments/{attachment.id}", headers=headers).status_code == 404
    )
    assert (
        api_client.post(
            f"/api/v1/tasks/{task.id}/attachments",
            headers=headers,
            files={"file": ("x.png", b"x", "image/png")},
        ).status_code
        == 404
    )

    owned_task = Task(user_id=owner.id, title="Owned task")
    db_session.add(owned_task)
    db_session.flush()
    settings = get_settings()
    monkeypatch.setattr(settings, "upload_directory", tmp_path)
    image = BytesIO()
    Image.new("RGB", (2, 2), "blue").save(image, format="PNG")
    uploaded = api_client.post(
        f"/api/v1/tasks/{owned_task.id}/attachments",
        headers=headers,
        files={"file": ("malicious.svg", image.getvalue(), "image/svg+xml")},
    )
    assert uploaded.status_code == 201
    assert uploaded.json()["content_type"] == "image/png"
    assert uploaded.json()["storage_key"].endswith(".png")
    svg = api_client.post(
        f"/api/v1/tasks/{owned_task.id}/attachments",
        headers=headers,
        files={
            "file": (
                "vector.svg",
                b"<svg xmlns='http://www.w3.org/2000/svg'></svg>",
                "image/svg+xml",
            )
        },
    )
    assert svg.status_code == 415
    monkeypatch.setattr(settings, "max_upload_bytes", 4)
    oversized = api_client.post(
        f"/api/v1/tasks/{owned_task.id}/attachments",
        headers=headers,
        files={"file": ("large.png", image.getvalue(), "image/png")},
    )
    assert oversized.status_code == 413


def test_dashboard_aggregates_respect_user_timezone_and_task_visibility(
    api_client, db_session
) -> None:
    timezone = ZoneInfo("Asia/Karachi")
    user = User(full_name="Dashboard", email=f"dash-{uuid4().hex}@example.com", password_hash="x")
    db_session.add(user)
    db_session.flush()
    db_session.add(UserPreferences(user_id=user.id, timezone=timezone.key))
    now = datetime.now(UTC)
    local_today = now.astimezone(timezone).date()
    today_at_local_midnight = datetime.combine(
        local_today, datetime.min.time(), timezone
    ).astimezone(UTC)
    yesterday_at_local_midnight = datetime.combine(
        local_today - timedelta(days=1), datetime.min.time(), timezone
    ).astimezone(UTC)
    completed_at = today_at_local_midnight + timedelta(minutes=30)
    db_session.add_all(
        [
            Task(
                user_id=user.id,
                title="All day due today",
                is_all_day=True,
                due_at=today_at_local_midnight,
            ),
            Task(
                user_id=user.id,
                title="All day overdue",
                is_all_day=True,
                due_at=yesterday_at_local_midnight,
            ),
            Task(user_id=user.id, title="Timed overdue", due_at=now - timedelta(minutes=1)),
            Task(
                user_id=user.id,
                title="Completed today",
                status=TaskStatus.COMPLETED,
                completed_at=completed_at,
                due_at=yesterday_at_local_midnight,
            ),
            Task(
                user_id=user.id,
                title="Archived",
                status=TaskStatus.ARCHIVED,
                due_at=yesterday_at_local_midnight,
            ),
            Task(
                user_id=user.id,
                title="Deleted",
                due_at=yesterday_at_local_midnight,
                deleted_at=now,
            ),
        ]
    )
    db_session.flush()
    token, _ = create_access_token(str(user.id))
    headers = {"Authorization": f"Bearer {token}"}

    summary = api_client.get("/api/v1/dashboard/summary", headers=headers)
    assert summary.status_code == 200
    assert summary.json() == {
        "total": 4,
        "completed": 1,
        "pending": 3,
        "in_progress": 0,
        "overdue": 2,
        # The timed-overdue task is still due on today's local calendar date.
        "due_today": 2,
        "high_or_urgent": 0,
        "completion_percent": 25.0,
    }
    productivity = api_client.get("/api/v1/dashboard/productivity?days=7", headers=headers)
    assert productivity.status_code == 200
    assert productivity.json()["days"][-1] == {
        "date": local_today.isoformat(),
        "completed": 1,
    }
    assert (
        api_client.get("/api/v1/dashboard/productivity?days=30", headers=headers).status_code == 200
    )
    assert (
        api_client.get("/api/v1/dashboard/productivity?days=8", headers=headers).status_code == 422
    )
