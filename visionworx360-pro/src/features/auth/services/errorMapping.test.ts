import { describe, it, expect } from "vitest";
import { mapAuthError } from "@/features/auth/services/errorMapping";
import { PublicEnvConfigurationError } from "@/lib/config/env";

describe("mapAuthError", () => {
  it("classifies invalid credentials", () => {
    const r = mapAuthError({ message: "Invalid login credentials" });
    expect(r.category).toBe("invalid_credentials");
    expect(r.referenceId).toBeTruthy();
  });
  it("classifies rate limit by status", () => {
    expect(mapAuthError({ status: 429, message: "" }).category).toBe("rate_limited");
  });
  it("classifies unconfirmed email", () => {
    expect(mapAuthError({ message: "Email not confirmed" }).category).toBe("email_not_confirmed");
  });
  it("classifies duplicate signup", () => {
    expect(mapAuthError({ message: "User already registered" }).category).toBe(
      "user_already_exists",
    );
  });
  it("classifies weak password", () => {
    expect(mapAuthError({ message: "Password should be at least 6 characters" }).category).toBe(
      "weak_password",
    );
  });
  it("classifies network error", () => {
    expect(mapAuthError(new Error("Failed to fetch")).category).toBe("network_error");
  });
  it("classifies missing public configuration", () => {
    expect(
      mapAuthError(new PublicEnvConfigurationError(["VITE_SUPABASE_URL"])).category,
    ).toBe("configuration_error");
  });
  it("classifies backend service errors", () => {
    expect(mapAuthError({ status: 500, message: "Internal error" }).category).toBe(
      "service_error",
    );
  });
  it("classifies session errors", () => {
    expect(mapAuthError(new Error("Refresh token is invalid")).category).toBe("session_error");
  });
  it("falls back to unknown", () => {
    expect(mapAuthError({}).category).toBe("unknown");
  });
  it("never returns provider message directly", () => {
    const r = mapAuthError({ message: "raw supabase details" });
    expect(Object.values(r)).not.toContain("raw supabase details");
  });
});
