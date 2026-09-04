import { createHmac } from "node:crypto";
import type { Pool } from "pg";

export type AuthAbuseScope =
  | "reset_identifier"
  | "reset_ip"
  | "sign_in_identifier"
  | "sign_in_ip"
  | "sign_up_ip"
  | "verification_identifier"
  | "verification_ip";

type LimitRow = {
  attempt_count: number;
  window_started_at: Date;
};

const LONGEST_LIMIT_WINDOW_SECONDS = 60 * 60;

export class AuthAbuseLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Too many authentication attempts. Try again later.");
    this.name = "AuthAbuseLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class PersistentAuthAbuseLimiter {
  private readonly now: () => Date;
  private readonly secret: string;

  constructor(
    private readonly pool: Pool,
    options: { now?: () => Date; secret: string }
  ) {
    this.now = options.now ?? (() => new Date());
    this.secret = options.secret;
  }

  private hash(scope: AuthAbuseScope, subject: string) {
    return createHmac("sha256", this.secret)
      .update(`${scope}:${subject.trim().toLowerCase()}`)
      .digest("hex");
  }

  private retryAfter(windowStartedAt: Date, windowSeconds: number) {
    const remaining =
      windowStartedAt.getTime() + windowSeconds * 1000 - this.now().getTime();
    return Math.max(1, Math.ceil(remaining / 1000));
  }

  async check(
    scope: AuthAbuseScope,
    subject: string,
    maxAttempts: number,
    windowSeconds: number
  ) {
    const result = await this.pool.query<LimitRow>(
      `SELECT attempt_count, window_started_at
       FROM auth_abuse_limit
       WHERE scope = $1 AND subject_hash = $2`,
      [scope, this.hash(scope, subject)]
    );
    const row = result.rows[0];

    const isWindowActive =
      row &&
      this.now().getTime() <
        row.window_started_at.getTime() + windowSeconds * 1000;

    if (row && row.attempt_count >= maxAttempts && isWindowActive) {
      throw new AuthAbuseLimitError(
        this.retryAfter(row.window_started_at, windowSeconds)
      );
    }
  }

  async record(
    scope: AuthAbuseScope,
    subject: string,
    windowSeconds: number
  ) {
    await this.upsert(scope, subject, windowSeconds);
  }

  async consume(
    scope: AuthAbuseScope,
    subject: string,
    maxAttempts: number,
    windowSeconds: number
  ) {
    const row = await this.upsert(scope, subject, windowSeconds);

    if (row.attempt_count > maxAttempts) {
      throw new AuthAbuseLimitError(
        this.retryAfter(row.window_started_at, windowSeconds)
      );
    }
  }

  async reset(scope: AuthAbuseScope, subject: string) {
    await this.pool.query(
      `DELETE FROM auth_abuse_limit
       WHERE scope = $1 AND subject_hash = $2`,
      [scope, this.hash(scope, subject)]
    );
  }

  private async upsert(
    scope: AuthAbuseScope,
    subject: string,
    windowSeconds: number
  ) {
    const timestamp = this.now();
    await this.pool.query(
      `DELETE FROM auth_abuse_limit
       WHERE updated_at < $1::timestamptz - make_interval(secs => $2)`,
      [timestamp, LONGEST_LIMIT_WINDOW_SECONDS]
    );
    const result = await this.pool.query<LimitRow>(
      `INSERT INTO auth_abuse_limit (
         scope, subject_hash, attempt_count, window_started_at, updated_at
       )
       VALUES ($1, $2, 1, $3, $3)
       ON CONFLICT (scope, subject_hash) DO UPDATE
       SET attempt_count = CASE
             WHEN auth_abuse_limit.window_started_at
                    <= $3::timestamptz - make_interval(secs => $4)
               THEN 1
             ELSE auth_abuse_limit.attempt_count + 1
           END,
           window_started_at = CASE
             WHEN auth_abuse_limit.window_started_at
                    <= $3::timestamptz - make_interval(secs => $4)
               THEN $3
             ELSE auth_abuse_limit.window_started_at
           END,
           updated_at = $3
       RETURNING attempt_count, window_started_at`,
      [scope, this.hash(scope, subject), timestamp, windowSeconds]
    );

    return result.rows[0];
  }
}
