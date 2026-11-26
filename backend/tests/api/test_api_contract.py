import base64
import re
from datetime import UTC, datetime, timedelta
from io import BytesIO
from uuid import uuid4

import jwt
from fastapi.testclient import TestClient
from PIL import Image

from app.core.config import get_settings
from app.core.security import decode_access_token
from app.main import app
from app.schemas.api import RegisterRequest, TaskCreate, TaskPriority, TaskStatus, UserUpdate
from app.storage.images import sanitize_image

client = TestClient(app)


def test_health_and_openapi_are_public() -> None:
    assert client.get("/health").json() == {"status": "ok"}
    schema = client.get("/openapi.json").json()
    assert schema["info"]["version"] == "1.0.0"
    assert "/api/v1/tasks" in schema["paths"]
    request_schemas = schema["components"]["schemas"]
    for name in ("RegisterRequest", "LoginRequest", "TaskCreate", "TaskUpdate"):
        assert request_schemas[name].get("examples"), f"{name} must document an example"


def test_expired_or_wrong_issuer_access_tokens_are_rejected() -> None:
    settings = get_settings()
    now = datetime.now(UTC)
    expired = jwt.encode(
        {
            "sub": str(uuid4()),
            "type": "access",
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "iat": now - timedelta(hours=2),
            "exp": now - timedelta(hours=1),
        },
        settings.jwt_secret_key,
        algorithm="HS256",
    )
    wrong_issuer = jwt.encode(
        {
            "sub": str(uuid4()),
            "type": "access",
            "iss": "untrusted-issuer",
            "aud": settings.jwt_audience,
            "iat": now,
            "exp": now + timedelta(minutes=5),
        },
        settings.jwt_secret_key,
        algorithm="HS256",
    )
    assert decode_access_token(expired) is None
    assert decode_access_token(wrong_issuer) is None


def test_user_update_schema_ignores_mass_assignment_fields() -> None:
    update = UserUpdate.model_validate(
        {
            "full_name": "Safe Name",
            "is_active": False,
            "email": "attacker@example.com",
            "password_hash": "attacker-controlled",
        }
    )
    assert update.model_dump(exclude_unset=True) == {"full_name": "Safe Name"}


def test_api_documents_authentication_on_private_operations() -> None:
    schema = client.get("/openapi.json").json()
    public = {
        ("/api/v1/auth/register", "post"),
        ("/api/v1/auth/login", "post"),
        ("/api/v1/auth/refresh", "post"),
        ("/api/v1/auth/logout", "post"),
        ("/api/v1/auth/forgot-password", "post"),
        ("/api/v1/auth/reset-password", "post"),
        ("/api/v1/auth/email-verification/confirm", "post"),
        ("/health", "get"),
        ("/ready", "get"),
        ("/openapi.json", "get"),
    }
    for path, operations in schema["paths"].items():
        for method, operation in operations.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            if (path, method) not in public:
                assert operation.get("security"), f"{method.upper()} {path} lacks auth in OpenAPI"


def test_private_routes_require_bearer_token() -> None:
    private_routes = [
        "/api/v1/users/me",
        "/api/v1/users/me/preferences",
        "/api/v1/users/me/profile-picture",
        "/api/v1/users/me/categories",
        "/api/v1/users/me/tags",
        "/api/v1/users/me/sessions",
        "/api/v1/tasks",
        "/api/v1/tasks/trash",
        "/api/v1/tasks/00000000-0000-4000-8000-000000000001/attachments",
        "/api/v1/dashboard/summary",
        "/api/v1/dashboard/productivity",
        "/api/v1/notifications",
        "/api/v1/notifications/unread-count",
    ]
    for path in private_routes:
        response = client.get(path)
        assert response.status_code == 401, (path, response.status_code)
        assert response.json()["error"]["code"] == "http_401"


def test_every_openapi_private_operation_rejects_anonymous_requests() -> None:
    schema = client.get("/openapi.json").json()
    for path, operations in schema["paths"].items():
        for method, operation in operations.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            if not operation.get("security"):
                continue
            concrete_path = re.sub(r"\{[^}]+\}", str(uuid4()), path)
            response = client.request(method.upper(), concrete_path, json={})
            assert response.status_code == 401, (
                f"{method.upper()} {path} accepted anonymous request: {response.status_code}"
            )


def test_cookie_refresh_requires_csrf_header() -> None:
    response = client.post("/api/v1/auth/refresh", cookies={"refresh_token": "opaque"})
    assert response.status_code == 403
    mismatch = client.post(
        "/api/v1/auth/refresh",
        cookies={"refresh_token": "opaque", "csrf_token": "cookie-value"},
        headers={"X-CSRF-Token": "different-value"},
    )
    assert mismatch.status_code == 403


def test_oversized_request_is_rejected_by_middleware() -> None:
    limit = get_settings().request_max_bytes
    response = client.post(
        "/api/v1/auth/login",
        content=b"x" * (limit + 1),
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "request_too_large"


def test_request_body_remains_available_after_size_check() -> None:
    response = client.post("/api/v1/auth/forgot-password", json={"email": "invalid"})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_password_policy_rejects_weak_password() -> None:
    try:
        RegisterRequest(full_name="Person", email="person@example.com", password="weakpassword")
    except ValueError:
        return
    raise AssertionError("weak passwords must be rejected")


def test_task_input_rejects_unsafe_urls_and_invalid_state() -> None:
    try:
        TaskCreate(title="unsafe", external_url="javascript:alert(1)")
    except ValueError:
        pass
    else:
        raise AssertionError("unsafe URL scheme must be rejected")

    try:
        TaskCreate(title="invalid", status=TaskStatus.COMPLETED, priority=TaskPriority.HIGH)
    except ValueError:
        return
    raise AssertionError("completed tasks must use the completion action")


def test_sort_field_is_allowlisted() -> None:
    operation = client.get("/openapi.json").json()["paths"]["/api/v1/tasks"]["get"]
    sort_parameter = next(
        parameter for parameter in operation["parameters"] if parameter["name"] == "sort"
    )
    assert sort_parameter["schema"]["enum"] == ["due_at", "priority", "created_at", "title"]


def test_image_sanitizer_rejects_svg_and_strips_polyglot_content() -> None:
    try:
        sanitize_image(b"<svg xmlns='http://www.w3.org/2000/svg'></svg>")
    except ValueError:
        pass
    else:
        raise AssertionError("SVG content must not be accepted as an image")

    source = BytesIO()
    Image.new("RGB", (4, 4), "red").save(source, format="PNG")
    sanitized, content_type, extension = sanitize_image(source.getvalue() + b"<html>payload</html>")
    assert content_type == "image/png"
    assert extension == ".png"
    assert b"<html>payload</html>" not in sanitized
    with Image.open(BytesIO(sanitized)) as result:
        assert result.format == "PNG"


def test_image_sanitizer_rejects_corrupt_png_as_validation_error() -> None:
    corrupt_png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/2ioAAAAASUVORK5CYII="
    )
    try:
        sanitize_image(corrupt_png)
    except ValueError as error:
        assert str(error) == "Uploaded file is not a valid image"
    else:
        raise AssertionError("Corrupt image files must be rejected")
