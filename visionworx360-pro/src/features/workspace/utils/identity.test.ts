import { describe, it, expect } from "vitest";
import { computeInitials, resolveDisplayName } from "./identity";
import type { AuthUser } from "@/features/auth/types/auth";

const authUser = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: "u1",
  email: "michael@example.com",
  firstName: "Michael",
  lastName: "Cadorette",
  preferredLocale: "en-US",
  ...over,
});

describe("resolveDisplayName", () => {
  it("uses profile.displayName first", () => {
    expect(
      resolveDisplayName(
        authUser(),
        { displayName: "Mike C.", firstName: "X", lastName: "Y" },
        "User",
      ),
    ).toBe("Mike C.");
  });

  it("falls back to profile first+last", () => {
    expect(resolveDisplayName(authUser(), { firstName: "Ana", lastName: "López" }, "User")).toBe(
      "Ana López",
    );
  });

  it("falls back to auth metadata name", () => {
    expect(resolveDisplayName(authUser(), null, "User")).toBe("Michael Cadorette");
  });

  it("falls back to safe email local part (never full email)", () => {
    const name = resolveDisplayName(authUser({ firstName: null, lastName: null }), null, "User");
    expect(name).toBe("michael");
    expect(name).not.toContain("@");
  });

  it("falls back to the localized generic label when nothing is available", () => {
    expect(
      resolveDisplayName(
        authUser({ firstName: null, lastName: null, email: null }),
        null,
        "Usuario",
      ),
    ).toBe("Usuario");
  });
});

describe("computeInitials", () => {
  it("returns MC for Michael Cadorette", () => {
    expect(computeInitials("Michael Cadorette")).toBe("MC");
  });

  it("handles accented multi-part names", () => {
    expect(computeInitials("Ana María López")).toBe("AL");
  });

  it("handles hyphenated names", () => {
    expect(computeInitials("Jean-Luc Picard")).toBe("JP");
  });

  it("returns a single initial for a single name", () => {
    expect(computeInitials("Solo")).toBe("S");
  });

  it("returns the fallback for empty input", () => {
    expect(computeInitials("", "?")).toBe("?");
    expect(computeInitials(null)).toBe("?");
  });

  it("never returns AR for the signed-in user", () => {
    expect(computeInitials("Michael Cadorette")).not.toBe("AR");
  });
});
