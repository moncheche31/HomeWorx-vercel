import type { AuthErrorCategory, SafeAuthError } from "../types/auth";
import { generateReferenceId } from "@/lib/errors/AppError";
import { PublicEnvConfigurationError } from "@/lib/config/env";

/**
 * Maps a raw provider (Supabase) error into a safe, localized category.
 * Never surface raw provider messages to end users.
 */
export function mapAuthError(err: unknown): SafeAuthError {
  const referenceId = generateReferenceId();
  const providerCode = extractCode(err);
  const message = extractMessage(err).toLowerCase();

  const category =
    err instanceof PublicEnvConfigurationError
      ? "configuration_error"
      : classify(providerCode, message);
  return { category, referenceId, providerCode };
}

function extractCode(err: unknown): string | undefined {
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    if (typeof anyErr.code === "string") return anyErr.code;
    if (typeof anyErr.status === "number") return String(anyErr.status);
  }
  return undefined;
}

function extractMessage(err: unknown): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  return "";
}

function classify(code: string | undefined, message: string): AuthErrorCategory {
  if (!code && !message) return "unknown";

  if (message.includes("failed to fetch") || message.includes("network")) return "network_error";
  if (message.includes("rate limit") || code === "429") return "rate_limited";
  if (message.includes("service unavailable") || code === "503") return "service_unavailable";
  if (code && /^5\d\d$/.test(code)) return "service_error";
  if (
    message.includes("refresh token") ||
    message.includes("session missing") ||
    message.includes("session expired")
  ) {
    return "session_error";
  }

  if (message.includes("invalid login") || message.includes("invalid credentials")) {
    return "invalid_credentials";
  }
  if (message.includes("email not confirmed") || message.includes("not confirmed")) {
    return "email_not_confirmed";
  }
  if (
    message.includes("already registered") ||
    message.includes("already exists") ||
    message.includes("user already")
  ) {
    return "user_already_exists";
  }
  if (
    message.includes("password") &&
    (message.includes("weak") || message.includes("short") || message.includes("at least"))
  ) {
    return "weak_password";
  }
  if (message.includes("invalid email") || message.includes("email address"))
    return "invalid_email";
  if (message.includes("password reset")) return "password_reset_required";
  if (message.includes("expired")) return "expired_link";
  if (message.includes("invalid token") || message.includes("invalid link")) return "invalid_link";

  return "unknown";
}
