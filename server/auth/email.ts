export type AuthEmailKind = "approval" | "password-reset" | "verification";

export type TransactionalEmail = {
  html: string;
  idempotencyKey: string;
  kind: AuthEmailKind;
  subject: string;
  text: string;
  to: string;
};

export interface TransactionalEmailSender {
  send(message: TransactionalEmail): Promise<void>;
}

type ResendLike = {
  emails: {
    send(
      payload: {
        from: string;
        html: string;
        subject: string;
        text: string;
        to: string;
      },
      options: { idempotencyKey: string }
    ): Promise<{
      data: { id: string } | null;
      error: { message: string; name: string } | null;
    }>;
  };
};

export class EmailDeliveryError extends Error {
  readonly code: string;

  constructor(code: string) {
    super("Transactional email delivery failed.");
    this.code = code;
    this.name = "EmailDeliveryError";
  }
}

export class ResendEmailSender implements TransactionalEmailSender {
  constructor(
    private readonly resend: ResendLike,
    private readonly from: string
  ) {}

  async send(message: TransactionalEmail) {
    const result = await this.resend.emails.send(
      {
        from: this.from,
        html: message.html,
        subject: message.subject,
        text: message.text,
        to: message.to
      },
      { idempotencyKey: message.idempotencyKey }
    );

    if (result.error) {
      throw new EmailDeliveryError(result.error.name || "RESEND_ERROR");
    }
  }
}

export class InMemoryEmailSender implements TransactionalEmailSender {
  readonly messages: TransactionalEmail[] = [];
  private nextError: Error | null = null;
  private readonly pending = new Set<Promise<void>>();

  failNext(error: Error) {
    this.nextError = error;
  }

  send(message: TransactionalEmail) {
    const operation = Promise.resolve().then(() => {
      const error = this.nextError;
      this.nextError = null;

      if (error) {
        throw error;
      }

      this.messages.push({ ...message });
    });

    this.pending.add(operation);
    void operation
      .finally(() => this.pending.delete(operation))
      .catch(() => undefined);
    return operation;
  }

  async settle() {
    await Promise.allSettled([...this.pending]);
    await Promise.resolve();
  }
}

type AuthEmailFailureLog = {
  emailKind: AuthEmailKind;
  errorCode: string;
  errorName: string;
  event: "auth_email_delivery_failed";
  idempotencyKey: string;
};

export function queueTransactionalEmail(
  sender: TransactionalEmailSender,
  message: TransactionalEmail,
  logFailure: (entry: AuthEmailFailureLog) => void = (entry) =>
    console.error(entry)
) {
  void sender.send(message).catch((error: unknown) => {
    logFailure({
      emailKind: message.kind,
      errorCode:
        error instanceof EmailDeliveryError
          ? error.code
          : "EMAIL_DELIVERY_FAILED",
      errorName: error instanceof Error ? error.name : "UnknownError",
      event: "auth_email_delivery_failed",
      idempotencyKey: message.idempotencyKey
    });
  });
}

export function queueApprovalEmail(
  sender: TransactionalEmailSender,
  input: { accountUrl: string; authUserId: string; to: string }
) {
  const digest = createHash("sha256")
    .update(`approval:${input.authUserId}`)
    .digest("hex");

  queueTransactionalEmail(sender, {
    html: `<h1>Your Chatsim account is approved</h1><p><a href="${input.accountUrl}">Open your account</a></p>`,
    idempotencyKey: `chatsim-approval-${digest}`,
    kind: "approval",
    subject: "Your Chatsim account is approved",
    text: `Your Chatsim account is approved.\n\n${input.accountUrl}`,
    to: input.to
  });
}
import { createHash } from "node:crypto";
