// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readAuthRuntimeConfig } from "./config";

const productionEnvironment = {
  ADMIN_BOOTSTRAP_EMAIL: "Admin@Example.com",
  AUTH_EMAIL_FROM: "Chatsim <accounts@updates.example.com>",
  AUTH_REGISTRATION_MODE: "approval",
  BETTER_AUTH_SECRET: "a-production-secret-that-is-at-least-32-characters",
  BETTER_AUTH_URL: "https://chatsim.example.com/",
  NODE_ENV: "production",
  RESEND_API_KEY: "re_test_key"
};

describe("auth runtime configuration", () => {
  it("normalizes and validates production auth settings", () => {
    expect(readAuthRuntimeConfig(productionEnvironment)).toEqual({
      adminBootstrapEmail: "admin@example.com",
      baseUrl: "https://chatsim.example.com",
      emailFrom: "Chatsim <accounts@updates.example.com>",
      environment: "production",
      registrationMode: "approval",
      resendApiKey: "re_test_key",
      secret: "a-production-secret-that-is-at-least-32-characters",
      trustedOrigins: ["https://chatsim.example.com"]
    });
  });

  it.each([
    "ADMIN_BOOTSTRAP_EMAIL",
    "AUTH_EMAIL_FROM",
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "RESEND_API_KEY"
  ])("rejects production without %s", (name) => {
    expect(() =>
      readAuthRuntimeConfig({ ...productionEnvironment, [name]: undefined })
    ).toThrow(`${name} is required in production`);
  });

  it("rejects an unknown registration mode", () => {
    expect(() =>
      readAuthRuntimeConfig({
        ...productionEnvironment,
        AUTH_REGISTRATION_MODE: "sometimes"
      })
    ).toThrow("AUTH_REGISTRATION_MODE must be closed, approval, or open");
  });

  it("requires an HTTPS public URL in production", () => {
    expect(() =>
      readAuthRuntimeConfig({
        ...productionEnvironment,
        BETTER_AUTH_URL: "http://chatsim.example.com"
      })
    ).toThrow("BETTER_AUTH_URL must use HTTPS in production");
  });

  it("uses closed, non-delivering development defaults", () => {
    expect(readAuthRuntimeConfig({ NODE_ENV: "development" })).toEqual({
      adminBootstrapEmail: "admin@localhost.invalid",
      baseUrl: "http://127.0.0.1:5174",
      emailFrom: "Chatsim <accounts@localhost.invalid>",
      environment: "development",
      registrationMode: "closed",
      resendApiKey: null,
      secret: "chatsim-local-development-secret-change-me",
      trustedOrigins: ["http://127.0.0.1:5174"]
    });
  });
});
