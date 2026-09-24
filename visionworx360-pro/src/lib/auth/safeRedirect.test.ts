import { describe, it, expect } from "vitest";
import { sanitizeRedirect } from "@/lib/auth/safeRedirect";

describe("sanitizeRedirect", () => {
  it("accepts same-origin relative paths", () => {
    expect(sanitizeRedirect("/app/dashboard")).toBe("/app/dashboard");
  });
  it("rejects protocol-relative", () => {
    expect(sanitizeRedirect("//evil.example.com/pwn")).toBe("/app");
  });
  it("rejects absolute URLs", () => {
    expect(sanitizeRedirect("https://evil.example.com")).toBe("/app");
  });
  it("rejects javascript: scheme injection", () => {
    expect(sanitizeRedirect("/javascript:alert(1)")).toBe("/app");
  });
  it("returns fallback on empty", () => {
    expect(sanitizeRedirect(undefined)).toBe("/app");
    expect(sanitizeRedirect(null)).toBe("/app");
    expect(sanitizeRedirect("")).toBe("/app");
  });
});
