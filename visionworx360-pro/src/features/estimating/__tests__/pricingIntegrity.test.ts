import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import {
  assessDetailedIntegrity,
  isFinalEstimateStatus,
} from "@/domains/estimating";
import {
  findBallparkSnapshot,
  preserveBallparkHistory,
  readBallparkSummary,
} from "../services/ballparkSummary";

/**
 * Regression: Garage Conversion ballpark ($34.5k / $38,809 / $43k) converted to
 * Detailed, then scope re-approved, presented ~$7k as the estimate. Two defects:
 * the detailed preliminary range destroyed the saved ballpark band, and a mostly
 * unpriced detailed estimate was presented as a credible total.
 */

const GARAGE_BALLPARK = {
  kind: "ballpark",
  mode: "ballpark",
  currency: "USD",
  confidence: "high",
  savedAt: "2026-08-05T21:22:12.687Z",
  band: { low: 34500, expected: 38809.02, high: 43000 },
};

const DETAILED_RANGE = {
  currency: "USD",
  calculatedAt: "2026-08-07T12:57:34.380Z",
  tiers: [{ tier: "good", low: 5200, mid: 7355.87, high: 11500 }],
};

const line = (cost: number) => ({
  laborHours: 0,
  laborRate: 0,
  materialCost: cost,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
});

describe("A. ballpark history survives conversion and later scope approval", () => {
  it("carries the saved band forward when a detailed range is written over it", () => {
    const merged = preserveBallparkHistory(GARAGE_BALLPARK, DETAILED_RANGE);
    const summary = readBallparkSummary(merged);
    expect(summary).toEqual(
      expect.objectContaining({ low: 34500, expected: 38809.02, high: 43000 }),
    );
    expect(findBallparkSnapshot(merged)).toEqual(GARAGE_BALLPARK);
  });

  it("does not lose the band when the detailed range is saved twice", () => {
    const once = preserveBallparkHistory(GARAGE_BALLPARK, DETAILED_RANGE);
    const twice = preserveBallparkHistory(once, { ...DETAILED_RANGE, tiers: [] });
    expect(readBallparkSummary(twice)?.expected).toBe(38809.02);
  });

  it("still lets the contractor explicitly replace the ballpark band", () => {
    const replaced = preserveBallparkHistory(GARAGE_BALLPARK, {
      ...GARAGE_BALLPARK,
      band: { low: 40000, expected: 45000, high: 50000 },
    });
    expect(readBallparkSummary(replaced)?.low).toBe(40000);
    /* The envelope holds exactly one ballpark slot: the replacement wins. */
    expect(readBallparkSummary((replaced as Record<string, unknown>).ballpark)?.low).toBe(40000);

  });

  it("preserves the band server-side on every estimate update", () => {
    const fn = readFileSync("src/features/estimating/services/estimating.functions.ts", "utf8");
    expect(fn).toMatch(/preserveBallparkHistory\(existing\.range_snapshot, data\.rangeSnapshot\)/);
  });
});

describe("B/C/D. scope sync after conversion is additive, never destructive", () => {
  const fn = readFileSync("src/features/estimating/services/estimating.functions.ts", "utf8");
  /** The newest migration that defines the sync function. */
  const sql = readdirSync("supabase/migrations")
    .sort()
    .map((f) => readFileSync(`supabase/migrations/${f}`, "utf8"))
    .filter((text) => text.includes("sync_estimate_from_scope(_estimate_id"))
    .at(-1)!;

  it("re-approving scope only imports scope items with no line yet", () => {
    const body = sql.slice(sql.indexOf("sync_estimate_from_scope(_estimate_id"));
    expect(body).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM public\.estimate_line_items/);
    expect(body).not.toMatch(/DELETE FROM public\.estimate_line_items/);
  });

  it("conversion reuses that additive sync instead of rebuilding the estimate", () => {
    const handler = fn.slice(
      fn.indexOf("convertEstimateToDetailed"),
      fn.indexOf("archiveEstimate ="),
    );
    expect(handler).toMatch(/sync_estimate_from_scope/);
    expect(handler).not.toMatch(/from\("estimate_line_items"\)[\s\S]{0,120}\.delete\(/);
  });
});

describe("E. a materially incomplete detailed estimate is not final", () => {
  it("flags the reproduced Garage Conversion state", () => {
    const lines = [...Array(9).fill(line(770)), ...Array(21).fill(line(0))];
    const integrity = assessDetailedIntegrity({
      lines,
      grandTotal: 6941,
      ballpark: { low: 34500, expected: 38809.02, high: 43000 },
    });
    expect(integrity.isIncomplete).toBe(true);
    expect(integrity.unpricedLines).toBe(21);
    expect(integrity.reasons).toContain("unpriced_lines");
    expect(integrity.reasons).toContain("below_ballpark");
  });

  it("accepts a genuinely refined estimate that moved below the ballpark", () => {
    const integrity = assessDetailedIntegrity({
      lines: Array(30).fill(line(500)),
      grandTotal: 15000,
      ballpark: { low: 34500, expected: 38809.02, high: 43000 },
    });
    expect(integrity.isIncomplete).toBe(false);
  });

  it("treats an empty detailed estimate as incomplete", () => {
    expect(assessDetailedIntegrity({ lines: [], grandTotal: 0 }).reasons).toContain("no_lines");
  });

  it("blocks ready/approved/sent server-side while pricing is incomplete", () => {
    const fn = readFileSync("src/features/estimating/services/estimating.functions.ts", "utf8");
    const handler = fn.slice(fn.indexOf("setEstimateStatus ="), fn.indexOf("updateEstimate ="));
    expect(handler).toMatch(/isFinalEstimateStatus/);
    expect(handler).toMatch(/estimate_incomplete_pricing/);
    expect(isFinalEstimateStatus("ready")).toBe(true);
    expect(isFinalEstimateStatus("draft")).toBe(false);
  });

  it("shows the incomplete warning with the ballpark reference in the UI", () => {
    const tab = readFileSync("src/features/estimating/components/EstimateTab.tsx", "utf8");
    const banner = readFileSync(
      "src/features/estimating/components/IncompletePricingBanner.tsx",
      "utf8",
    );
    expect(tab).toMatch(/pricingIncomplete/);
    expect(tab).toMatch(/IncompletePricingBanner/);
    expect(banner).toMatch(/integrity\.ballparkReference/);
    expect(banner).toMatch(/integrity\.notFinal/);
  });

  it("has EN and ES copy for the guard", () => {
    for (const locale of ["en-US", "es-US"]) {
      const json = JSON.parse(
        readFileSync(`src/i18n/locales/${locale}/estimating.json`, "utf8"),
      ) as { integrity?: Record<string, string> };
      expect(json.integrity?.title).toBeTruthy();
      expect(json.integrity?.ballparkReference).toBeTruthy();
    }
  });
});

describe("F. the same estimate id is refined, never replaced", () => {
  it("conversion never inserts another estimate row", () => {
    const fn = readFileSync("src/features/estimating/services/estimating.functions.ts", "utf8");
    const handler = fn.slice(
      fn.indexOf("convertEstimateToDetailed"),
      fn.indexOf("archiveEstimate ="),
    );
    expect(handler).toMatch(/\.eq\("id", data\.estimateId\)/);
    expect(handler).not.toMatch(/\.insert\(/);
  });
});
