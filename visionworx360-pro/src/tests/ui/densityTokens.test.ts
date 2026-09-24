/**
 * Display Density must actually work on the active contractor surfaces.
 *
 * The tokens (--control-min-h, --control-min-h-sm, --density-gap,
 * --density-card-pad) exist in src/styles.css, but a hardcoded `min-h-11 /
 * min-h-12 / min-h-14` on a control overrides them, which is how Density
 * silently became a cosmetic setting. These directories are the surfaces the
 * accessibility pass covers; they must stay token-driven.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ACTIVE_SURFACES = [
  "src/features/crm",
  "src/features/narrative-scope",
  "src/features/estimating",
  "src/features/ballpark",
  "src/components/ui",
];

function hardcodedHeights(dir: string): string[] {
  const output: string = execSync(
    `grep -rn 'min-h-1[124]\\b' ${dir} --include=*.tsx || true`,
    { encoding: "utf8" },
  );
  return output
    .split("\n")
    .map((line: string) => line.trim())
    .filter((line: string) => line.length > 0);
}

describe("display density tokens", () => {
  it.each(ACTIVE_SURFACES)("uses density tokens instead of fixed heights in %s", (dir) => {
    expect(hardcodedHeights(dir)).toEqual([]);
  });

  it("keeps a 44px touch-target floor at compact density on mobile", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const compact = css.match(
      /:root\[data-density="compact"\]\s*\{[^}]*--control-min-h:\s*([\d.]+)rem/,
    );
    expect(compact, "compact density block must set --control-min-h").toBeTruthy();
    expect(Number(compact![1]) * 16).toBeGreaterThanOrEqual(44);
  });

  it("increases control height from compact to default to spacious", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");
    const read = (selector: string) => {
      const match = css.match(
        new RegExp(`${selector}\\s*\\{[^}]*--control-min-h:\\s*([\\d.]+)rem`),
      );
      return Number(match![1]);
    };
    const compact = read(':root\\[data-density="compact"\\]');
    const spacious = read(':root\\[data-density="spacious"\\]');
    expect(compact).toBeLessThan(spacious);
  });
});
