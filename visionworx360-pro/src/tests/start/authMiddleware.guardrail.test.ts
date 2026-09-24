import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * PERMANENT GUARDRAIL — do not relax.
 *
 * `attachConfiguredAuth` (src/lib/supabase/auth-attacher.ts) is the ONLY
 * supported bearer/auth function middleware. It builds its Supabase client
 * from the RUNTIME public configuration, which is the only source available
 * in the Lovable Preview bundle.
 *
 * The generated `attachSupabaseAuth` (src/integrations/supabase/auth-attacher.ts)
 * resolves its client from build-time `import.meta.env`, which is absent in
 * the preview bundle. Registering it — alone or alongside the configured
 * attacher — makes EVERY server function reject, producing the recurring
 * "We couldn't load your workspace." regression.
 */
const rawSource = readFileSync(resolve(process.cwd(), "src/start.ts"), "utf8");
// Comments may legitimately explain WHY the generated attacher is banned.
const source = rawSource
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

function functionMiddlewareArray(): string {
  const match = source.match(/functionMiddleware:\s*\[([^\]]*)\]/);
  expect(match, "src/start.ts must declare a functionMiddleware array").toBeTruthy();
  return match![1];
}

describe("src/start.ts auth middleware guardrail", () => {
  it("never imports the generated build-time attacher", () => {
    expect(source).not.toMatch(/@\/integrations\/supabase\/auth-attacher/);
    expect(source).not.toMatch(/integrations\/supabase\/auth-attacher/);
  });

  it("never imports the generated attacher even in raw source (code lines only)", () => {
    const codeLines = rawSource
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
    expect(codeLines.some((line) => /integrations\/supabase\/auth-attacher/.test(line))).toBe(false);
    expect(codeLines.some((line) => /attachSupabaseAuth/.test(line))).toBe(false);
  });

  it("never registers attachSupabaseAuth", () => {
    expect(source).not.toMatch(/attachSupabaseAuth/);
  });

  it("registers exactly one auth/bearer attacher in functionMiddleware", () => {
    const entries = functionMiddlewareArray()
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    const attachers = entries.filter((e) => /auth|attach|bearer|token/i.test(e));
    expect(attachers).toEqual(["attachConfiguredAuth"]);
    expect(entries.length).toBe(1);
  });

  it("references attachConfiguredAuth exactly twice (import + registration)", () => {
    const occurrences = source.match(/attachConfiguredAuth/g) ?? [];
    expect(occurrences.length).toBe(2);
  });


  it("declares functionMiddleware as exactly [attachConfiguredAuth]", () => {
    expect(functionMiddlewareArray().trim()).toBe("attachConfiguredAuth");
  });

  it("imports the bearer attacher only from the runtime-configured module", () => {
    const attacherImports = source.match(/^import .*auth-attacher.*$/gm) ?? [];
    expect(attacherImports).toEqual([
      'import { attachConfiguredAuth } from "@/lib/supabase/auth-attacher";',
    ]);
  });

  it("is the only module that configures functionMiddleware", () => {
    const output: string = execSync(
      "grep -rl 'functionMiddleware' src --include=*.ts --include=*.tsx || true",
      { encoding: "utf8" },
    );
    const hits = output
      .split("\n")
      .map((line: string) => line.trim())
      .filter(
        (line: string) =>
          line.length > 0 &&
          !line.includes("__tests__") &&
          !line.includes("/tests/") &&
          // Auto-generated integration files only mention it in doc comments.
          !line.startsWith("src/integrations/"),
      );
    expect(hits).toEqual(["src/start.ts"]);
  });
});

