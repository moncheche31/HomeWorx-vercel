import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertBackendAllowed,
  devServerConfigProblems,
  isLegacyProductionBackend,
  legacyProductionBlockReason,
} from "@/lib/config/backendSafety";
import { readBrowserPublicEnv, requirePublicEnv, resolvePublicConfig, validateEnv } from "@/lib/config/env";

/*
 * Fail-closed backend selection (Lovable exit, Phase 2A).
 * The legacy Lovable production project ref below is a TEST FIXTURE: the guard
 * itself only stores a hash of the host, so nothing ships in the bundles.
 */
const LEGACY_PRODUCTION_REF = "lwybxokduogiewxciecq";
const LEGACY_PRODUCTION_URL = `https://${LEGACY_PRODUCTION_REF}.supabase.co`;
const DEV_URL = "https://dev-project.supabase.co";
const KEY = "sb_publishable_dev_placeholder";

const devConfig = {
  VITE_SUPABASE_URL: DEV_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: KEY,
  VITE_APP_ENV: "development",
};

describe("A. missing Supabase URL fails closed", () => {
  const raw = { ...devConfig, VITE_SUPABASE_URL: undefined };

  it("is rejected by validation and never becomes ready", () => {
    const result = validateEnv(raw, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain("VITE_SUPABASE_URL");
    expect(resolvePublicConfig(raw).state).toBe("failed");
  });

  it("prevents a client from being created", () => {
    expect(() => requirePublicEnv(raw)).toThrow("VITE_SUPABASE_URL");
  });

  it("stops the dev server", () => {
    expect(devServerConfigProblems({ VITE_SUPABASE_PUBLISHABLE_KEY: KEY })).toContain(
      "VITE_SUPABASE_URL is not set",
    );
  });
});

describe("B. missing Supabase key fails closed", () => {
  const raw = { ...devConfig, VITE_SUPABASE_PUBLISHABLE_KEY: undefined };

  it("is rejected by validation and never becomes ready", () => {
    const result = validateEnv(raw, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.missing).toContain("VITE_SUPABASE_PUBLISHABLE_KEY");
    expect(resolvePublicConfig(raw).state).toBe("failed");
  });

  it("prevents a client from being created", () => {
    expect(() => requirePublicEnv(raw)).toThrow("VITE_SUPABASE_PUBLISHABLE_KEY");
  });

  it("stops the dev server", () => {
    expect(devServerConfigProblems({ VITE_SUPABASE_URL: DEV_URL })).toContain(
      "VITE_SUPABASE_PUBLISHABLE_KEY is not set",
    );
  });

  it("treats a blank value as missing", () => {
    expect(devServerConfigProblems({ VITE_SUPABASE_URL: DEV_URL, VITE_SUPABASE_PUBLISHABLE_KEY: "  " })).toContain(
      "VITE_SUPABASE_PUBLISHABLE_KEY is not set",
    );
  });
});

describe("C. development cannot select Lovable production", () => {
  it("recognises the legacy production project (and only it)", () => {
    expect(isLegacyProductionBackend(LEGACY_PRODUCTION_URL)).toBe(true);
    expect(isLegacyProductionBackend(`${LEGACY_PRODUCTION_URL}/rest/v1`)).toBe(true);
    expect(isLegacyProductionBackend(`postgres://postgres:pw@db.${LEGACY_PRODUCTION_REF}.supabase.co:5432/postgres`)).toBe(true);
    expect(
      isLegacyProductionBackend(`postgres://postgres.${LEGACY_PRODUCTION_REF}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`),
    ).toBe(true);
    expect(isLegacyProductionBackend("postgres://postgres.other-ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres")).toBe(false);
    expect(isLegacyProductionBackend(DEV_URL)).toBe(false);
    expect(isLegacyProductionBackend(undefined)).toBe(false);
  });

  it.each(["development", "staging", undefined])("blocks VITE_APP_ENV=%s", (appEnv) => {
    const result = validateEnv(
      { ...devConfig, VITE_SUPABASE_URL: LEGACY_PRODUCTION_URL, VITE_APP_ENV: appEnv },
      false,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.missing).toEqual(["VITE_SUPABASE_URL"]);
      expect(result.message).toMatch(/legacy Lovable production/);
    }
  });

  it("stops the dev server for the browser or the server URL", () => {
    expect(
      devServerConfigProblems({ ...devConfig, VITE_SUPABASE_URL: LEGACY_PRODUCTION_URL }).join("\n"),
    ).toMatch(/VITE_SUPABASE_URL: Refusing the legacy Lovable production/);
    expect(
      devServerConfigProblems({ ...devConfig, SUPABASE_URL: LEGACY_PRODUCTION_URL }).join("\n"),
    ).toMatch(/SUPABASE_URL: Refusing the legacy Lovable production/);
  });

  it("stops server-side clients built from process.env", () => {
    expect(() => assertBackendAllowed(LEGACY_PRODUCTION_URL, { VITE_APP_ENV: "development" })).toThrow(
      /legacy Lovable production/,
    );
    expect(() => assertBackendAllowed(LEGACY_PRODUCTION_URL, {})).toThrow(/legacy Lovable production/);
  });
});

describe("D. tests cannot select Lovable production", () => {
  it("blocks it in a test run even when VITE_APP_ENV=production", () => {
    expect(
      legacyProductionBlockReason({ url: LEGACY_PRODUCTION_URL, appEnv: "production", isTestRun: true }),
    ).toMatch(/test run/);
    expect(() =>
      assertBackendAllowed(LEGACY_PRODUCTION_URL, { VITE_APP_ENV: "production", VITEST: "true" }),
    ).toThrow(/test run/);
  });

  it("detects this vitest process as a test run by default", () => {
    const result = validateEnv({ ...devConfig, VITE_SUPABASE_URL: LEGACY_PRODUCTION_URL, VITE_APP_ENV: "production" });
    expect(result.ok).toBe(false);
    expect(() => assertBackendAllowed(LEGACY_PRODUCTION_URL)).toThrow(/test run/);
  });

  it("resolves no backend from ambient configuration unless one was supplied, and never production", () => {
    const ambient = readBrowserPublicEnv().VITE_SUPABASE_URL;
    expect(isLegacyProductionBackend(ambient)).toBe(false);
  });
});

describe("E. explicit valid development configuration is accepted", () => {
  it("validates and resolves to ready", () => {
    expect(validateEnv(devConfig, false).ok).toBe(true);
    expect(validateEnv(devConfig, true).ok).toBe(true);
    expect(resolvePublicConfig(devConfig).state).toBe("ready");
    expect(requirePublicEnv(devConfig).VITE_SUPABASE_URL).toBe(DEV_URL);
  });

  it("lets the dev server start and server clients connect", () => {
    expect(devServerConfigProblems({ ...devConfig, SUPABASE_URL: DEV_URL })).toEqual([]);
    expect(() => assertBackendAllowed(DEV_URL, { VITE_APP_ENV: "development" })).not.toThrow();
  });

  it("allows production only when chosen explicitly, outside tests", () => {
    expect(
      legacyProductionBlockReason({ url: LEGACY_PRODUCTION_URL, appEnv: "production", isTestRun: false }),
    ).toBeNull();
  });
});

describe("F. no production credentials are compiled into the app", () => {
  const root = process.cwd();
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|tsx|js|mjs|json)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });

  it("removed the managed production fallback module", () => {
    expect(existsSync(join(root, "src/lib/config/managed-public-config.ts"))).toBe(false);
  });

  it("contains no legacy production project ref or real publishable key in shipped source", () => {
    const offenders = sourceFiles(join(root, "src")).filter((path) => {
      const text = readFileSync(path, "utf8");
      return text.includes(LEGACY_PRODUCTION_REF) || /sb_publishable_[A-Za-z0-9]{16,}/.test(text);
    });
    expect(offenders.map((path) => relative(root, path))).toEqual([]);
  });
});
