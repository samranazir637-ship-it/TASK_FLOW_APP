from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_db
from app.main import app


@pytest.fixture
def api_client(db_session) -> Generator[TestClient, None, None]:
    previous = app.dependency_overrides.get(get_db)

    def override_db():
        # Commit rows created by the test before request handling. Otherwise an expected
        # HTTPException (for example, a cross-user 404) rolls back the test's setup rows.
        db_session.commit()
        try:
            yield db_session
            db_session.commit()
        except Exception:
            db_session.rollback()
            raise

    app.dependency_overrides[get_db] = override_db
    try:
        with TestClient(app, client=("127.0.0.1", 50000)) as client:
            yield client
    finally:
        if previous is None:
            app.dependency_overrides.pop(get_db, None)
        else:
            app.dependency_overrides[get_db] = previous
