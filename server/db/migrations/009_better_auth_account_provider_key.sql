-- Better Auth 1.7.3+ writes account identity as providerId + accountId.
-- Keep legacy issuer values for rollback.
ALTER TABLE auth_account ALTER COLUMN issuer DROP NOT NULL;
DROP INDEX auth_account_issuer_accountId_uidx;
CREATE UNIQUE INDEX auth_account_providerId_accountId_uidx
  ON auth_account("providerId", "accountId");
