import { describe, expect, it, vi } from "vitest";

const createClient = vi.fn();

vi.mock("@supabase/supabase-js", () => ({ createClient }));

describe("configured browser client boundary", () => {
  it("does not initialize the backend client when public configuration is invalid", async () => {
    const { requirePublicEnv } = await import("@/lib/config/env");
    expect(() =>
      requirePublicEnv({
        VITE_SUPABASE_URL: "https://example.supabase.co",
        VITE_SUPABASE_PUBLISHABLE_KEY: undefined,
        VITE_APP_ENV: "test",
        VITE_APP_VERSION: "0.1.0",
      }),
    ).toThrow("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(createClient).not.toHaveBeenCalled();
  });
});
