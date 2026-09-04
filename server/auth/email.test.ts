// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import {
  InMemoryEmailSender,
  queueApprovalEmail,
  ResendEmailSender,
  queueTransactionalEmail
} from "./email";

describe("transactional auth email", () => {
  it("records messages predictably with the in-memory sender", async () => {
    const sender = new InMemoryEmailSender();

    await sender.send({
      html: "<p>Verify</p>",
      idempotencyKey: "verify-abc",
      kind: "verification",
      subject: "Verify your Chatsim account",
      text: "Verify",
      to: "maya@example.com"
    });

    expect(sender.messages).toEqual([
      expect.objectContaining({
        idempotencyKey: "verify-abc",
        kind: "verification",
        to: "maya@example.com"
      })
    ]);
  });

  it("passes Resend an idempotency key and rejects provider errors", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ data: { id: "email-1" }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { name: "rate_limit_exceeded", message: "try later" }
      });
    const sender = new ResendEmailSender({ emails: { send } }, "from@example.com");
    const message = {
      html: "<p>Reset</p>",
      idempotencyKey: "reset-abc",
      kind: "password-reset" as const,
      subject: "Reset your Chatsim password",
      text: "Reset",
      to: "maya@example.com"
    };

    await expect(sender.send(message)).resolves.toBeUndefined();
    expect(send).toHaveBeenCalledWith(
      {
        from: "from@example.com",
        html: "<p>Reset</p>",
        subject: "Reset your Chatsim password",
        text: "Reset",
        to: "maya@example.com"
      },
      { idempotencyKey: "reset-abc" }
    );
    await expect(sender.send(message)).rejects.toMatchObject({
      code: "rate_limit_exceeded",
      name: "EmailDeliveryError"
    });
  });

  it("logs queued failures without logging the recipient or content", async () => {
    const sender = new InMemoryEmailSender();
    const logger = vi.fn();
    sender.failNext(new Error("provider included maya@example.com"));

    queueTransactionalEmail(
      sender,
      {
        html: "<p>sensitive content</p>",
        idempotencyKey: "verify-safe-key",
        kind: "verification",
        subject: "Verify",
        text: "sensitive content",
        to: "maya@example.com"
      },
      logger
    );
    await sender.settle();

    expect(logger).toHaveBeenCalledWith({
      emailKind: "verification",
      errorCode: "EMAIL_DELIVERY_FAILED",
      errorName: "Error",
      event: "auth_email_delivery_failed",
      idempotencyKey: "verify-safe-key"
    });
    expect(JSON.stringify(logger.mock.calls)).not.toContain("maya@example.com");
    expect(JSON.stringify(logger.mock.calls)).not.toContain("sensitive content");
  });

  it("queues an idempotent approval notice", async () => {
    const sender = new InMemoryEmailSender();

    queueApprovalEmail(sender, {
      accountUrl: "https://chatsim.example.com/account?approved=1",
      authUserId: "identity-approved",
      to: "maya@example.com"
    });
    await sender.settle();

    expect(sender.messages).toEqual([
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^chatsim-approval-[a-f0-9]{64}$/),
        kind: "approval",
        text: expect.stringContaining(
          "https://chatsim.example.com/account?approved=1"
        ),
        to: "maya@example.com"
      })
    ]);
  });
});
