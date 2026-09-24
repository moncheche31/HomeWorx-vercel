import { describe, it, expect } from "vitest";
import {
  loginSchema,
  registerSchema,
  isPasswordStrong,
  checkPassword,
  PASSWORD_MIN,
} from "./schemas";

describe("loginSchema", () => {
  it("requires email and password", () => {
    const r = loginSchema.safeParse({ email: "", password: "" });
    expect(r.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const r = loginSchema.safeParse({ email: "not-an-email", password: "anything" });
    expect(r.success).toBe(false);
  });

  it("trims email but never touches password", () => {
    const r = loginSchema.safeParse({ email: "  a@b.co ", password: "  keep-spaces  " });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe("a@b.co");
      expect(r.data.password).toBe("  keep-spaces  ");
    }
  });
});

describe("password rules", () => {
  it(`enforces min ${PASSWORD_MIN} chars, upper, lower, number, symbol`, () => {
    expect(isPasswordStrong("short1!A")).toBe(false); // too short
    expect(isPasswordStrong("alllowercase1!")).toBe(false); // no upper
    expect(isPasswordStrong("ALLUPPERCASE1!")).toBe(false); // no lower
    expect(isPasswordStrong("NoNumbers!!")).toBe(false); // no digit
    expect(isPasswordStrong("NoSymbols123X")).toBe(false); // no symbol
    expect(isPasswordStrong("StrongPass1!")).toBe(true);
  });

  it("checkPassword reports each rule individually", () => {
    const c = checkPassword("Abcdefghij1!");
    expect(c).toEqual({
      length: true,
      uppercase: true,
      lowercase: true,
      number: true,
      symbol: true,
    });
  });
});

describe("registerSchema", () => {
  const good = {
    firstName: "María",
    lastName: "Núñez-Ortíz",
    email: "maria@example.com",
    password: "StrongPass1!",
    confirmPassword: "StrongPass1!",
    acceptTerms: true,
  };

  it("accepts accented Spanish names", () => {
    expect(registerSchema.safeParse(good).success).toBe(true);
  });

  it("rejects names with disallowed characters (digits/symbols)", () => {
    const r = registerSchema.safeParse({ ...good, firstName: "Bob123" });
    expect(r.success).toBe(false);
  });

  it("requires accepted terms", () => {
    const r = registerSchema.safeParse({ ...good, acceptTerms: false });
    expect(r.success).toBe(false);
  });

  it("rejects weak passwords with `weak_password`", () => {
    const r = registerSchema.safeParse({
      ...good,
      password: "weakpass",
      confirmPassword: "weakpass",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const pwErr = r.error.issues.find((i) => i.path[0] === "password");
      expect(pwErr?.message).toBe("weak_password");
    }
  });

  it("rejects mismatched confirmPassword", () => {
    const r = registerSchema.safeParse({ ...good, confirmPassword: "Different1!" });
    expect(r.success).toBe(false);
    if (!r.success) {
      const err = r.error.issues.find((i) => i.path[0] === "confirmPassword");
      expect(err?.message).toBe("password_mismatch");
    }
  });

  it("requires valid email", () => {
    expect(registerSchema.safeParse({ ...good, email: "nope" }).success).toBe(false);
  });
});
