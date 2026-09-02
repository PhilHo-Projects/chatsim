-- Generated from the Better Auth 1.7.2 PostgreSQL schema, then tightened with
-- Chatsim's username, role, and account-approval invariants.
CREATE TABLE auth_user (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN NOT NULL DEFAULT FALSE,
  image TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  username TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL DEFAULT 'user',
  banned BOOLEAN NOT NULL DEFAULT FALSE,
  "banReason" TEXT,
  "banExpires" TIMESTAMPTZ,
  "approvalStatus" TEXT NOT NULL DEFAULT 'pending',
  CONSTRAINT auth_user_username_check
    CHECK (username ~ '^[a-z0-9_-]{3,32}$'),
  CONSTRAINT auth_user_role_check
    CHECK (role IN ('admin', 'user')),
  CONSTRAINT auth_user_approval_status_check
    CHECK ("approvalStatus" IN ('pending', 'approved', 'rejected'))
);

CREATE TABLE auth_session (
  id TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  token TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  "impersonatedBy" TEXT
);

CREATE INDEX auth_session_userId_idx ON auth_session("userId");
CREATE INDEX auth_session_expiresAt_idx ON auth_session("expiresAt");

CREATE TABLE auth_account (
  id TEXT PRIMARY KEY,
  issuer TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMPTZ,
  "refreshTokenExpiresAt" TIMESTAMPTZ,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL
);

CREATE INDEX auth_account_userId_idx ON auth_account("userId");
CREATE UNIQUE INDEX auth_account_issuer_accountId_uidx
  ON auth_account(issuer, "accountId");

CREATE TABLE auth_verification (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX auth_verification_identifier_idx
  ON auth_verification(identifier);

CREATE TABLE auth_rate_limit (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  count INTEGER NOT NULL,
  "lastRequest" BIGINT NOT NULL
);

ALTER TABLE users ADD COLUMN auth_user_id TEXT
  REFERENCES auth_user(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX users_auth_user_id_uidx
  ON users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE TABLE auth_abuse_limit (
  scope TEXT NOT NULL
    CHECK (
      scope IN (
        'sign_in_identifier',
        'sign_in_ip',
        'sign_up_ip',
        'verification_identifier',
        'verification_ip',
        'reset_identifier',
        'reset_ip'
      )
    ),
  subject_hash CHAR(64) NOT NULL
    CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (scope, subject_hash)
);

CREATE INDEX auth_abuse_limit_updated_at_idx
  ON auth_abuse_limit(updated_at);

CREATE TABLE auth_account_action_audit (
  id TEXT PRIMARY KEY,
  actor_auth_user_id TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
  target_auth_user_id TEXT REFERENCES auth_user(id) ON DELETE SET NULL,
  target_identifier_hash CHAR(64)
    CHECK (
      target_identifier_hash IS NULL
      OR target_identifier_hash ~ '^[a-f0-9]{64}$'
    ),
  action TEXT NOT NULL
    CHECK (
      action IN (
        'registered',
        'email_verified',
        'profile_provisioned',
        'approved',
        'rejected',
        'disabled',
        'enabled',
        'sessions_revoked',
        'password_reset',
        'admin_bootstrapped'
      )
    ),
  details JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX auth_account_action_audit_target_idx
  ON auth_account_action_audit(target_auth_user_id, created_at DESC);

CREATE INDEX auth_account_action_audit_actor_idx
  ON auth_account_action_audit(actor_auth_user_id, created_at DESC);
