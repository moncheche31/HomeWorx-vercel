import { appConfig } from "@/lib/config/env";

type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

const SENSITIVE_KEYS = ["password", "token", "key", "secret", "authorization", "cookie"];

function scrub(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))) {
      out[k] = "[REDACTED]";
    } else {
      out[k] = v;
    }
  }
  return out;
}

function emit(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  if (appConfig.env === "production") return; // Replace with production sink later.
  const scrubbed = scrub(meta);
  const line = scrubbed ? `[${level}] ${msg}` : `[${level}] ${msg}`;

  (console[level] ?? console.log)(line, scrubbed ?? "");
}

export const logger: Logger = {
  debug: (m, meta) => emit("debug", m, meta),
  info: (m, meta) => emit("info", m, meta),
  warn: (m, meta) => emit("warn", m, meta),
  error: (m, meta) => emit("error", m, meta),
};
