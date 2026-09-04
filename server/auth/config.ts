export type AuthRegistrationMode = "closed" | "approval" | "open";

export type AuthRuntimeConfig = {
  adminBootstrapEmail: string;
  baseUrl: string;
  emailFrom: string;
  environment: "development" | "test" | "production";
  registrationMode: AuthRegistrationMode;
  resendApiKey: string | null;
  secret: string;
  trustedOrigins: string[];
};

type Environment = Record<string, string | undefined>;

const DEVELOPMENT_DEFAULTS = {
  adminBootstrapEmail: "admin@localhost.invalid",
  baseUrl: "http://127.0.0.1:5174",
  emailFrom: "Chatsim <accounts@localhost.invalid>",
  secret: "chatsim-local-development-secret-change-me"
} as const;

const REGISTRATION_MODES = new Set<AuthRegistrationMode>([
  "closed",
  "approval",
  "open"
]);

function environmentName(value: string | undefined) {
  if (value === "production" || value === "test") {
    return value;
  }

  return "development";
}

function requiredProductionValue(
  environment: Environment,
  name: string,
  isProduction: boolean
) {
  const value = environment[name]?.trim();

  if (!value && isProduction) {
    throw new Error(`${name} is required in production.`);
  }

  return value;
}

function normalizeEmail(value: string, name: string) {
  const email = value.trim().toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`${name} must be a valid email address.`);
  }

  return email;
}

function validateEmailFrom(value: string) {
  const match = value.match(/^(?:[^<>]+<)?([^<>\s]+@[^<>\s]+)>?$/);

  if (!match) {
    throw new Error("AUTH_EMAIL_FROM must contain a valid email address.");
  }

  normalizeEmail(match[1], "AUTH_EMAIL_FROM");
  return value;
}

export function readAuthRuntimeConfig(
  environment: Environment = process.env
): AuthRuntimeConfig {
  const runtimeEnvironment = environmentName(environment.NODE_ENV);
  const isProduction = runtimeEnvironment === "production";
  const registrationMode =
    environment.AUTH_REGISTRATION_MODE?.trim() || "closed";

  if (!REGISTRATION_MODES.has(registrationMode as AuthRegistrationMode)) {
    throw new Error(
      "AUTH_REGISTRATION_MODE must be closed, approval, or open."
    );
  }

  const secret =
    requiredProductionValue(environment, "BETTER_AUTH_SECRET", isProduction) ??
    DEVELOPMENT_DEFAULTS.secret;
  const configuredUrl =
    requiredProductionValue(environment, "BETTER_AUTH_URL", isProduction) ??
    DEVELOPMENT_DEFAULTS.baseUrl;
  const resendApiKey =
    requiredProductionValue(environment, "RESEND_API_KEY", isProduction) ?? null;
  const emailFrom =
    requiredProductionValue(environment, "AUTH_EMAIL_FROM", isProduction) ??
    DEVELOPMENT_DEFAULTS.emailFrom;
  const adminBootstrapEmail =
    requiredProductionValue(
      environment,
      "ADMIN_BOOTSTRAP_EMAIL",
      isProduction
    ) ?? DEVELOPMENT_DEFAULTS.adminBootstrapEmail;

  if (secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be at least 32 characters.");
  }

  let publicUrl: URL;

  try {
    publicUrl = new URL(configuredUrl);
  } catch {
    throw new Error("BETTER_AUTH_URL must be an absolute URL.");
  }

  if (isProduction && publicUrl.protocol !== "https:") {
    throw new Error("BETTER_AUTH_URL must use HTTPS in production.");
  }

  if (
    publicUrl.username ||
    publicUrl.password ||
    publicUrl.search ||
    publicUrl.hash ||
    !["", "/"].includes(publicUrl.pathname)
  ) {
    throw new Error("BETTER_AUTH_URL must be an origin without a path.");
  }

  const baseUrl = publicUrl.origin;

  return {
    adminBootstrapEmail: normalizeEmail(
      adminBootstrapEmail,
      "ADMIN_BOOTSTRAP_EMAIL"
    ),
    baseUrl,
    emailFrom: validateEmailFrom(emailFrom),
    environment: runtimeEnvironment,
    registrationMode: registrationMode as AuthRegistrationMode,
    resendApiKey,
    secret,
    trustedOrigins: [baseUrl]
  };
}
