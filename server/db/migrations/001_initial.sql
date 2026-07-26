CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE
    CHECK (username ~ '^[a-z0-9_-]{3,32}$'),
  display_name TEXT NOT NULL
    CHECK (char_length(display_name) BETWEEN 1 AND 80),
  role TEXT NOT NULL
    CHECK (role IN ('admin', 'member')),
  accent_color TEXT NOT NULL,
  password_hash TEXT,
  password_salt TEXT,
  avatar_image_id TEXT,
  auth_provider TEXT,
  provider_subject TEXT,
  email TEXT,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_password_pair
    CHECK ((password_hash IS NULL) = (password_salt IS NULL))
);

CREATE UNIQUE INDEX users_provider_identity_unique
  ON users (auth_provider, provider_subject)
  WHERE auth_provider IS NOT NULL AND provider_subject IS NOT NULL;

CREATE UNIQUE INDEX users_email_unique
  ON users (LOWER(email))
  WHERE email IS NOT NULL;

CREATE TABLE images (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL
    CHECK (kind IN ('avatar', 'profile', 'story_cover', 'scene_art', 'sprite')),
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  width INTEGER CHECK (width IS NULL OR width BETWEEN 1 AND 8192),
  height INTEGER CHECK (height IS NULL OR height BETWEEN 1 AND 8192),
  size_bytes BIGINT NOT NULL
    CHECK (size_bytes BETWEEN 1 AND 10485760),
  status TEXT NOT NULL
    CHECK (status IN ('pending', 'ready', 'rejected', 'deleted')),
  variants JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(variants) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
  ADD CONSTRAINT users_avatar_image_fk
  FOREIGN KEY (avatar_image_id) REFERENCES images(id) ON DELETE SET NULL;

CREATE TABLE sessions (
  token_hash BYTEA PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > created_at)
);

CREATE INDEX sessions_user_id_idx ON sessions(user_id);
CREATE INDEX sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL
    CHECK (char_length(title) BETWEEN 1 AND 160),
  visibility TEXT NOT NULL
    CHECK (visibility IN ('public', 'private')),
  presentation_mode TEXT NOT NULL
    CHECK (presentation_mode IN ('phone', 'battle')),
  cover_image_id TEXT REFERENCES images(id) ON DELETE SET NULL,
  cover_color TEXT NOT NULL,
  storyboard JSONB NOT NULL
    CHECK (jsonb_typeof(storyboard) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX stories_public_feed_idx
  ON stories (updated_at DESC, id DESC)
  WHERE visibility = 'public';

CREATE INDEX stories_owner_id_idx ON stories(owner_id);

CREATE TABLE upload_audit_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  provider_subject TEXT,
  email_at_upload TEXT,
  ip_address INET,
  user_agent TEXT,
  image_id TEXT REFERENCES images(id) ON DELETE SET NULL,
  object_key TEXT NOT NULL,
  action TEXT NOT NULL
    CHECK (
      action IN (
        'upload_started',
        'upload_completed',
        'rejected',
        'deleted',
        'reported'
      )
    ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX upload_audit_log_user_id_idx
  ON upload_audit_log(user_id, created_at DESC);

CREATE INDEX upload_audit_log_image_id_idx
  ON upload_audit_log(image_id, created_at DESC);
