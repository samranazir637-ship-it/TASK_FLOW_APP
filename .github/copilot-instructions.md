# TaskFlow project notes

- Backend schema models live in `backend/app/db/models.py`; schema changes require Alembic migrations.
- Run PostgreSQL integration tests only against the isolated `taskflow_test` database on port 5433.
- Store timestamps as UTC `timestamptz`; convert to user timezone in application code.
- Scope repository reads and writes by `user_id`; never persist raw refresh or verification tokens.