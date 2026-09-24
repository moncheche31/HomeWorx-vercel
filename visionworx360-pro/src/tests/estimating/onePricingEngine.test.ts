import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeDescription } from "@/domains/remoteVision/analyze";
import { buildAssumptions } from "@/domains/remoteVision/assumptions";
import { buildScenarios } from "@/domains/remoteVision/scenarios";
import {
  BOOK_NATIONAL_LABOR_RATE,
  NATIONAL_BASELINE_LOCATION,
  bookLaborRate,
  bookLaborRateTable,
} from "@/domains/estimating/pricing/bookLaborRates";

/**
 * PERMANENT INVARIANT — ONE PRICING ENGINE.
 *
 * Every pricing path (Estimate tab, Remote Vision intake, narrative ballpark,
 * scope recalculation) prices labor from the NCE 2026 book: published craft
 * wage times the job-site area modification factor. The retired flat company
 * rate ($85/hr) and the retired "catalog_assembly" pricing basis must never
 * reappear anywhere in `src/`.
 */

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(path);
  }
  return out;
}

describe("one pricing engine", () => {
  const files = sourceFiles("src");

  it("has no remaining catalog_assembly pricing basis", () => {
    const legacyBasis = ["catalog", "assembly"].join("_");
    const offenders = files.filter(
      (f) => !f.endsWith("onePricingEngine.test.ts") && readFileSync(f, "utf8").includes(legacyBasis),
    );
    expect(offenders).toEqual([]);
  });

  it("has no flat labor-rate fallback literal", () => {
    /* Production code only — a test may still feed a literal rate as input. */
    const offenders = files.filter((f) => {
      if (/\.test\.tsx?$/.test(f) || f.includes("/tests/") || f.includes("__tests__")) return false;
      const text = readFileSync(f, "utf8");
      return /laborRate\s*[:=]\s*8?[56]\b/.test(text) || /\?\?\s*85\s*\)/.test(text);
    });
    expect(offenders).toEqual([]);
  });

  it("prices each trade from its own book craft wage", () => {
    expect(BOOK_NATIONAL_LABOR_RATE).toBeCloseTo(45.88, 2);
    expect(bookLaborRate("plumbing", NATIONAL_BASELINE_LOCATION)).toBeCloseTo(51.49, 2);
    expect(bookLaborRate("electrical", NATIONAL_BASELINE_LOCATION)).toBeCloseTo(48.35, 2);
    /* Location factor applies to labor only, at the published percentage. */
    expect(
      bookLaborRate("electrical", { ...NATIONAL_BASELINE_LOCATION, laborPct: 20 }),
    ).toBeCloseTo(58.02, 2);
  });

  it("generates a working ballpark for a brand-new project with no job site", () => {
    const description =
      "Replace the roof, install new vinyl siding, and replace eight windows on the house.";
    const analysis = analyzeDescription({ locale: "en-US", description, media: [] });
    const assumptions = buildAssumptions(analysis, description);
    const scenarios = buildScenarios(analysis, assumptions, "en-US", {
      bookLocation: NATIONAL_BASELINE_LOCATION,
      laborRates: bookLaborRateTable(NATIONAL_BASELINE_LOCATION),
    });
    expect(scenarios.length).toBeGreaterThan(0);
    const mid = scenarios[1]!;
    expect(mid.costLow).toBeGreaterThan(0);
    expect(mid.costHigh).toBeGreaterThanOrEqual(mid.costLow);
    expect(mid.laborHours).toBeGreaterThan(0);
    for (const driver of mid.drivers) {
      if (driver.pricingBasis) expect(driver.pricingBasis).toBe("book_nce2026");
    }
  });
});
