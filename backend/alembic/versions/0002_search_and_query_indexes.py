"""Add query and full-text search indexes."""

from alembic import op

revision = "0002_search_and_query_indexes"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE UNIQUE INDEX uq_users_email_lower ON users (lower(email))")
    op.execute("CREATE INDEX ix_refresh_sessions_token_hash ON refresh_sessions (token_hash)")
    op.execute(
        "CREATE INDEX ix_refresh_sessions_user_expires_at ON refresh_sessions (user_id, expires_at)"
    )
    op.execute(
        "CREATE INDEX ix_refresh_sessions_replaced_by_id ON refresh_sessions (replaced_by_id)"
    )
    op.execute(
        "CREATE INDEX ix_password_reset_tokens_user_expires_at ON password_reset_tokens (user_id, expires_at)"
    )
    op.execute(
        "CREATE INDEX ix_email_verification_tokens_user_expires_at ON email_verification_tokens (user_id, expires_at)"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_categories_user_lower_name ON categories (user_id, lower(name))"
    )
    op.execute("CREATE UNIQUE INDEX uq_tags_user_lower_name ON tags (user_id, lower(name))")
    op.execute("CREATE INDEX ix_tasks_user_status ON tasks (user_id, status)")
    op.execute("CREATE INDEX ix_tasks_user_priority ON tasks (user_id, priority)")
    op.execute("CREATE INDEX ix_tasks_user_due_at ON tasks (user_id, due_at)")
    op.execute("CREATE INDEX ix_tasks_user_deleted_at ON tasks (user_id, deleted_at)")
    op.execute("CREATE INDEX ix_tasks_user_created_at ON tasks (user_id, created_at)")
    op.execute(
        "CREATE INDEX ix_tasks_active_user_due_at ON tasks (user_id, due_at) WHERE deleted_at IS NULL AND status IN ('pending', 'in_progress')"
    )
    op.execute("CREATE INDEX ix_tasks_user_category_id ON tasks (user_id, category_id)")
    op.execute("CREATE INDEX ix_tasks_category_id ON tasks (category_id)")
    op.execute(
        "CREATE INDEX ix_tasks_search_fts ON tasks USING gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')))"
    )
    op.execute("CREATE INDEX ix_task_tags_tag_id ON task_tags (tag_id)")
    op.execute("CREATE INDEX ix_task_attachments_task_id ON task_attachments (task_id)")
    op.execute("CREATE INDEX ix_task_attachments_user_id ON task_attachments (user_id)")
    op.execute(
        "CREATE INDEX ix_notifications_user_read_created ON notifications (user_id, is_read, created_at)"
    )
    op.execute("CREATE INDEX ix_notifications_task_id ON notifications (task_id)")
    op.execute(
        "CREATE INDEX ix_task_activity_task_created_at ON task_activity (task_id, created_at)"
    )
    op.execute(
        "CREATE INDEX ix_task_activity_user_created_at ON task_activity (user_id, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX ix_task_activity_user_created_at")
    op.execute("DROP INDEX ix_task_activity_task_created_at")
    op.execute("DROP INDEX ix_notifications_task_id")
    op.execute("DROP INDEX ix_notifications_user_read_created")
    op.execute("DROP INDEX ix_task_attachments_user_id")
    op.execute("DROP INDEX ix_task_attachments_task_id")
    op.execute("DROP INDEX ix_task_tags_tag_id")
    op.execute("DROP INDEX ix_tasks_search_fts")
    op.execute("DROP INDEX ix_tasks_category_id")
    op.execute("DROP INDEX ix_tasks_user_category_id")
    op.execute("DROP INDEX ix_tasks_active_user_due_at")
    op.execute("DROP INDEX ix_tasks_user_created_at")
    op.execute("DROP INDEX ix_tasks_user_deleted_at")
    op.execute("DROP INDEX ix_tasks_user_due_at")
    op.execute("DROP INDEX ix_tasks_user_priority")
    op.execute("DROP INDEX ix_tasks_user_status")
    op.execute("DROP INDEX uq_tags_user_lower_name")
    op.execute("DROP INDEX uq_categories_user_lower_name")
    op.execute("DROP INDEX ix_email_verification_tokens_user_expires_at")
    op.execute("DROP INDEX ix_password_reset_tokens_user_expires_at")
    op.execute("DROP INDEX ix_refresh_sessions_replaced_by_id")
    op.execute("DROP INDEX ix_refresh_sessions_user_expires_at")
    op.execute("DROP INDEX ix_refresh_sessions_token_hash")
    op.execute("DROP INDEX uq_users_email_lower")
