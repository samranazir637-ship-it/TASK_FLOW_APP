import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]


def run_alembic(*arguments: str) -> None:
    subprocess.run(
        [sys.executable, "-m", "alembic", *arguments],
        cwd=BACKEND_DIR,
        env=os.environ.copy(),
        check=True,
    )


def test_migration_round_trip() -> None:
    run_alembic("downgrade", "base")
    run_alembic("upgrade", "head")
    run_alembic("check")
