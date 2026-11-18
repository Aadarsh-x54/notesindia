-- Flyway V1: Core NotesIndia Schema (PostgreSQL)

CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(120) NOT NULL,
    bio             TEXT,
    institution     VARCHAR(200),
    role            VARCHAR(20)  NOT NULL DEFAULT 'USER',
    active          BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY,
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens (user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          UUID PRIMARY KEY,
    user_id     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token       VARCHAR(128) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    used        BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS categories (
    id              UUID PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    normalized_name VARCHAR(100) NOT NULL UNIQUE,
    slug            VARCHAR(120) NOT NULL UNIQUE,
    description     TEXT,
    accent_color    VARCHAR(7)   NOT NULL DEFAULT '#3B82F6',
    parent_id       UUID         REFERENCES categories(id) ON DELETE SET NULL,
    created_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories (parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_created_at ON categories (created_at DESC);

CREATE TABLE IF NOT EXISTS notes (
    id                  UUID PRIMARY KEY,
    title               VARCHAR(255) NOT NULL,
    description         TEXT         NOT NULL,
    subject             VARCHAR(150),
    institution         VARCHAR(200),
    author_name         VARCHAR(150),
    original_filename   VARCHAR(255) NOT NULL,
    storage_key         VARCHAR(500) NOT NULL UNIQUE,
    file_format         VARCHAR(20)  NOT NULL,
    mime_type           VARCHAR(120) NOT NULL,
    file_size_bytes     BIGINT       NOT NULL,
    file_checksum       VARCHAR(64)  NOT NULL,
    uploaded_by         UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    download_count      BIGINT       NOT NULL DEFAULT 0,
    view_count          BIGINT       NOT NULL DEFAULT 0,
    status              VARCHAR(20)  NOT NULL DEFAULT 'PUBLISHED',
    ai_indexed          BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_status_created_at ON notes (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_uploaded_by ON notes (uploaded_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_checksum ON notes (file_checksum);

CREATE TABLE IF NOT EXISTS note_categories (
    note_id     UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_note_categories_category ON note_categories (category_id, note_id);

CREATE TABLE IF NOT EXISTS note_bookmarks (
    id          UUID PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id     UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_note_bookmarks_user_note UNIQUE (user_id, note_id)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON note_bookmarks (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS note_views (
    id          UUID PRIMARY KEY,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    note_id     UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_note_views_user ON note_views (user_id, viewed_at DESC);

CREATE TABLE IF NOT EXISTS note_downloads (
    id              UUID PRIMARY KEY,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    note_id         UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    downloaded_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_note_downloads_note ON note_downloads (note_id, downloaded_at DESC);

CREATE TABLE IF NOT EXISTS note_reports (
    id              UUID PRIMARY KEY,
    note_id         UUID         NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    reported_by     UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason          VARCHAR(60)  NOT NULL,
    details         TEXT,
    status          VARCHAR(30)  NOT NULL DEFAULT 'PENDING',
    reviewed_by     UUID         REFERENCES users(id) ON DELETE SET NULL,
    resolution_note TEXT,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_note_reports_status ON note_reports (status, created_at DESC);

CREATE TABLE IF NOT EXISTS ai_conversations (
    id                  UUID PRIMARY KEY,
    user_id             UUID         NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title               VARCHAR(200) NOT NULL DEFAULT 'New Conversation',
    focused_note_id     UUID         REFERENCES notes(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_messages (
    id                  UUID PRIMARY KEY,
    conversation_id     UUID        NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
    role                VARCHAR(20) NOT NULL,
    content             TEXT        NOT NULL,
    referenced_notes    TEXT,
    model_used          VARCHAR(100),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv ON ai_messages (conversation_id, created_at ASC);

CREATE TABLE IF NOT EXISTS audit_logs (
    id          UUID PRIMARY KEY,
    actor_id    UUID         REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(80)  NOT NULL,
    target_type VARCHAR(50)  NOT NULL,
    target_id   VARCHAR(100),
    details     TEXT,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
