import { describe, it, expect } from "vitest";
import { maskEmail } from "./maskEmail";

describe("maskEmail", () => {
  it("returns empty string on null/undefined", () => {
    expect(maskEmail(null)).toBe("");
    expect(maskEmail(undefined)).toBe("");
    expect(maskEmail("")).toBe("");
  });

  it("masks the middle of the local part", () => {
    const m = maskEmail("maria@example.com");
    expect(m.endsWith("@example.com")).toBe(true);
    expect(m.startsWith("ma")).toBe(true);
    expect(m).toContain("•");
    expect(m).not.toContain("aria");
  });

  it("still hides local part for very short usernames", () => {
    const m = maskEmail("ab@x.co");
    expect(m).toContain("•");
    expect(m).not.toBe("ab@x.co");
  });

  it("handles missing @ safely", () => {
    expect(maskEmail("not-an-email")).toBe("•••");
  });
});
