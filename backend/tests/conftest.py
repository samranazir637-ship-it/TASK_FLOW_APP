import os
import subprocess
import sys
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.config import Settings

BACKEND_DIR = Path(__file__).resolve().parents[1]
configured_test_url = os.environ.get("TEST_DATABASE_URL", str(Settings().test_database_url))
parsed_test_url = make_url(configured_test_url)
database_name = parsed_test_url.database
if database_name != "taskflow_test":
    raise RuntimeError("Tests are permitted only against the isolated taskflow_test database")
TEST_DATABASE_URL = parsed_test_url.set(
    query={**parsed_test_url.query, "connect_timeout": "3"}
).render_as_string(hide_password=False)

os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("APP_ENV", "test")


@pytest.fixture(scope="session")
def migrated_test_database() -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        cwd=BACKEND_DIR,
        env=os.environ.copy(),
        check=True,
    )


@pytest.fixture
def db_session(migrated_test_database: None) -> Session:
    engine = create_engine(TEST_DATABASE_URL)
    with engine.begin() as connection:
        connection.execute(text("TRUNCATE TABLE users CASCADE"))
    session = Session(engine)
    try:
        yield session
    finally:
        session.close()
        engine.dispose()
