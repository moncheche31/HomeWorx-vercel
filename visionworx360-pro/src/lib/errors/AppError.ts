export type AppErrorCategory =
  | "configuration_error"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "conflict"
  | "rate_limited"
  | "offline"
  | "timeout"
  | "service_unavailable"
  | "unknown";

export interface AppError {
  category: AppErrorCategory;
  message: string;
  referenceId: string;
  cause?: unknown;
}

export function generateReferenceId(): string {
  const rand = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36);
  return `ref_${time}_${rand}`.toUpperCase();
}

const SAFE_MESSAGES: Record<AppErrorCategory, string> = {
  configuration_error: "The application is not configured correctly.",
  unauthorized: "You need to sign in to continue.",
  forbidden: "You do not have permission to perform this action.",
  not_found: "We couldn't find what you were looking for.",
  validation_error: "Some of the information provided was invalid.",
  conflict: "This action conflicts with the current state.",
  rate_limited: "Too many requests. Please wait a moment and try again.",
  offline: "You're offline. Reconnect to continue.",
  timeout: "The request took too long. Please try again.",
  service_unavailable: "The service is temporarily unavailable.",
  unknown: "Something went wrong. Please try again.",
};

export function toAppError(input: unknown): AppError {
  const referenceId = generateReferenceId();
  if (input && typeof input === "object" && "category" in input && "message" in input) {
    return input as AppError;
  }
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { category: "offline", message: SAFE_MESSAGES.offline, referenceId };
  }
  const category: AppErrorCategory = "unknown";
  return { category, message: SAFE_MESSAGES[category], referenceId, cause: input };
}

export function safeMessageFor(category: AppErrorCategory): string {
  return SAFE_MESSAGES[category];
}
