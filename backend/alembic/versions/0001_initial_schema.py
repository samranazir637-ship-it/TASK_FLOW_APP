"""Create the TaskFlow relational schema."""

from alembic import op

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE TYPE theme AS ENUM ('light', 'dark', 'system')")
    op.execute(
        "CREATE TYPE task_status AS ENUM ('pending', 'in_progress', 'completed', 'archived')"
    )
    op.execute("CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high', 'urgent')")

    op.execute("""
        CREATE TABLE users (
            id UUID NOT NULL,
            full_name VARCHAR(200) NOT NULL,
            email VARCHAR(320) NOT NULL,
            phone_number VARCHAR(32),
            profile_picture_key VARCHAR(512),
            password_hash VARCHAR(255) NOT NULL,
            is_active BOOLEAN DEFAULT true NOT NULL,
            is_verified BOOLEAN DEFAULT false NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            CONSTRAINT pk_users PRIMARY KEY (id),
            CONSTRAINT ck_users_full_name_nonempty CHECK (length(trim(full_name)) > 0),
            CONSTRAINT ck_users_email_normalized CHECK (email = lower(trim(email))),
            CONSTRAINT uq_users_email UNIQUE (email)
        )
    """)
    op.execute("""
        CREATE TABLE user_preferences (
            user_id UUID NOT NULL,
            theme theme DEFAULT 'system' NOT NULL,
            timezone VARCHAR(64) DEFAULT 'UTC' NOT NULL,
            date_format VARCHAR(16) DEFAULT 'YYYY-MM-DD' NOT NULL,
            time_format VARCHAR(4) DEFAULT '24h' NOT NULL,
            default_priority VARCHAR(10) DEFAULT 'medium' NOT NULL,
            accent_color VARCHAR(32),
            notify_in_app BOOLEAN DEFAULT true NOT NULL,
            notify_email BOOLEAN DEFAULT false NOT NULL,
            dashboard_preferences JSONB DEFAULT '{}'::jsonb NOT NULL,
            CONSTRAINT pk_user_preferences PRIMARY KEY (user_id),
            CONSTRAINT fk_user_preferences_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            CONSTRAINT ck_user_preferences_default_priority_valid CHECK (default_priority IN ('low', 'medium', 'high', 'urgent')),
            CONSTRAINT ck_user_preferences_date_format_valid CHECK (date_format IN ('YYYY-MM-DD', 'DD/MM/YYYY', 'MM/DD/YYYY')),
            CONSTRAINT ck_user_preferences_time_format_valid CHECK (time_format IN ('12h', '24h'))
        )
    """)
    op.execute("""
        CREATE TABLE refresh_sessions (
            id UUID NOT NULL,
            user_id UUID NOT NULL,
            token_hash VARCHAR(128) NOT NULL,
            family_id UUID NOT NULL,
            user_agent TEXT,
            ip INET,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            revoked_at TIMESTAMP WITH TIME ZONE,
            replaced_by_id UUID,
            remember_me BOOLEAN DEFAULT false NOT NULL,
            CONSTRAINT pk_refresh_sessions PRIMARY KEY (id),
            CONSTRAINT fk_refresh_sessions_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            CONSTRAINT fk_refresh_sessions_replaced_by_id_refresh_sessions FOREIGN KEY (replaced_by_id) REFERENCES refresh_sessions (id) ON DELETE SET NULL,
            CONSTRAINT ck_refresh_sessions_token_hash_nonempty CHECK (length(token_hash) > 0)
        )
    """)
    op.execute("""
        CREATE TABLE password_reset_tokens (
            id UUID NOT NULL,
            user_id UUID NOT NULL,
            token_hash VARCHAR(128) NOT NULL,
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            used_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            CONSTRAINT pk_password_reset_tokens PRIMARY KEY (id),
            CONSTRAINT fk_password_reset_tokens_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            CONSTRAINT uq_password_reset_tokens_token_hash UNIQUE (token_hash)
        )
    """)
    op.execute("""
        CREATE TABLE email_verification_tokens (
            id UUID NOT NULL,
            user_id UUID NOT NULL,
            token_hash VARCHAR(128) NOT NULL,
            new_email VARCHAR(320),
            expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
            used_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            CONSTRAINT pk_email_verification_tokens PRIMARY KEY (id),
            CONSTRAINT fk_email_verification_tokens_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            CONSTRAINT uq_email_verification_tokens_token_hash UNIQUE (token_hash)
        )
    """)
    op.execute("""
        CREATE TABLE categories (
            id UUID NOT NULL,
            user_id UUID NOT NULL,
            name VARCHAR(100) NOT NULL,
            color VARCHAR(32),
            CONSTRAINT pk_categories PRIMARY KEY (id),
            CONSTRAINT fk_categories_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE TABLE tags (
            id UUID NOT NULL,
            user_id UUID NOT NULL,
            name VARCHAR(80) NOT NULL,
            CONSTRAINT pk_tags PRIMARY KEY (id),
            CONSTRAINT fk_tags_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE TABLE tasks (
            id UUID NOT NULL,
            user_id UUID NOT NULL,
            category_id UUID,
            title VARCHAR(300) NOT NULL,
            description TEXT,
            status task_status DEFAULT 'pending' NOT NULL,
            priority task_priority DEFAULT 'medium' NOT NULL,
            start_at TIMESTAMP WITH TIME ZONE,
            due_at TIMESTAMP WITH TIME ZONE,
            is_all_day BOOLEAN DEFAULT false NOT NULL,
            estimated_duration_minutes INTEGER,
            completed_at TIMESTAMP WITH TIME ZONE,
            external_url VARCHAR(2048),
            reminder_offset_minutes INTEGER,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            deleted_at TIMESTAMP WITH TIME ZONE,
            CONSTRAINT pk_tasks PRIMARY KEY (id),
            CONSTRAINT fk_tasks_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            CONSTRAINT fk_tasks_category_id_categories FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL,
            CONSTRAINT ck_tasks_title_nonempty CHECK (length(trim(title)) > 0),
            CONSTRAINT ck_tasks_due_after_start CHECK (due_at IS NULL OR start_at IS NULL OR due_at >= start_at),
            CONSTRAINT ck_tasks_estimated_duration_positive CHECK (estimated_duration_minutes IS NULL OR estimated_duration_minutes > 0),
            CONSTRAINT ck_tasks_reminder_offset_nonnegative CHECK (reminder_offset_minutes IS NULL OR reminder_offset_minutes >= 0),
            CONSTRAINT ck_tasks_completed_at_matches_status CHECK ((status = 'completed') = (completed_at IS NOT NULL))
        )
    """)
    op.execute("""
        CREATE TABLE task_tags (
            task_id UUID NOT NULL,
            tag_id UUID NOT NULL,
            CONSTRAINT pk_task_tags PRIMARY KEY (task_id, tag_id),
            CONSTRAINT fk_task_tags_task_id_tasks FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
            CONSTRAINT fk_task_tags_tag_id_tags FOREIGN KEY (tag_id) REFERENCES tags (id) ON DELETE CASCADE
        )
    """)
    op.execute("""
        CREATE TABLE task_attachments (
            id UUID NOT NULL,
            task_id UUID NOT NULL,
            user_id UUID NOT NULL,
            storage_key VARCHAR(512) NOT NULL,
            original_filename VARCHAR(255) NOT NULL,
            content_type VARCHAR(255) NOT NULL,
            size_bytes INTEGER NOT NULL,
            checksum VARCHAR(128) NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            CONSTRAINT pk_task_attachments PRIMARY KEY (id),
            CONSTRAINT fk_task_attachments_task_id_tasks FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
            CONSTRAINT fk_task_attachments_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            CONSTRAINT ck_task_attachments_size_bytes_nonnegative CHECK (size_bytes >= 0)
        )
    """)
    op.execute("""
        CREATE TABLE notifications (
            id UUID NOT NULL,
            user_id UUID NOT NULL,
            task_id UUID,
            type VARCHAR(64) NOT NULL,
            title VARCHAR(200) NOT NULL,
            body TEXT,
            is_read BOOLEAN DEFAULT false NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            dedupe_key VARCHAR(255),
            CONSTRAINT pk_notifications PRIMARY KEY (id),
            CONSTRAINT fk_notifications_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            CONSTRAINT fk_notifications_task_id_tasks FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE SET NULL,
            CONSTRAINT uq_notifications_user_dedupe_key UNIQUE (user_id, dedupe_key)
        )
    """)
    op.execute("""
        CREATE TABLE task_activity (
            id UUID NOT NULL,
            task_id UUID NOT NULL,
            user_id UUID NOT NULL,
            action VARCHAR(64) NOT NULL,
            changes JSONB DEFAULT '{}'::jsonb NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            CONSTRAINT pk_task_activity PRIMARY KEY (id),
            CONSTRAINT fk_task_activity_task_id_tasks FOREIGN KEY (task_id) REFERENCES tasks (id) ON DELETE CASCADE,
            CONSTRAINT fk_task_activity_user_id_users FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE task_activity")
    op.execute("DROP TABLE notifications")
    op.execute("DROP TABLE task_attachments")
    op.execute("DROP TABLE task_tags")
    op.execute("DROP TABLE tasks")
    op.execute("DROP TABLE tags")
    op.execute("DROP TABLE categories")
    op.execute("DROP TABLE email_verification_tokens")
    op.execute("DROP TABLE password_reset_tokens")
    op.execute("DROP TABLE refresh_sessions")
    op.execute("DROP TABLE user_preferences")
    op.execute("DROP TABLE users")
    op.execute("DROP TYPE task_priority")
    op.execute("DROP TYPE task_status")
    op.execute("DROP TYPE theme")
