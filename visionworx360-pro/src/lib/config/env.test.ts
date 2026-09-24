import { describe, expect, it } from "vitest";
import { requirePublicEnv, resolvePublicConfig, validateEnv } from "@/lib/config/env";

const valid = {
  VITE_SUPABASE_URL: "https://example.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  VITE_APP_ENV: "test",
  VITE_APP_VERSION: "0.1.0",
};

describe("public environment validation", () => {
  it("accepts the required public backend configuration", () => {
    expect(validateEnv(valid).ok).toBe(true);
  });

  it.each(["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"] as const)(
    "reports %s when absent",
    (key) => {
      const raw = { ...valid, [key]: undefined };
      const result = validateEnv(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.missing).toContain(key);
    },
  );

  it("resolves valid browser configuration to ready", () => {
    const result = resolvePublicConfig(valid);
    expect(result.state).toBe("ready");
    expect(result.fingerprint).toMatch(/^[a-f0-9]{8}$/);
  });

  it("ends in failed and identifies an absent key", () => {
    const result = resolvePublicConfig({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: undefined });
    expect(result.state).toBe("failed");
    if (result.state === "failed") {
      expect(result.missing).toEqual(["VITE_SUPABASE_PUBLISHABLE_KEY"]);
    }
  });

  it("prevents client access when configuration is absent", () => {
    expect(() =>
      requirePublicEnv({ ...valid, VITE_SUPABASE_URL: undefined }),
    ).toThrow("VITE_SUPABASE_URL");
  });
});
