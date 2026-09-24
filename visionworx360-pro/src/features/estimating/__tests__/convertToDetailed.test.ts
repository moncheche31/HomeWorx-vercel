import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const fn = readFileSync("src/features/estimating/services/estimating.functions.ts", "utf8");
const card = readFileSync("src/features/estimating/components/BallparkRangeCard.tsx", "utf8");
const dialog = readFileSync("src/features/estimating/components/ConvertToDetailedDialog.tsx", "utf8");

describe("ballpark -> detailed conversion", () => {
  it("converts in place instead of creating another estimate", () => {
    expect(fn).toMatch(/convertEstimateToDetailed/);
    expect(fn).toMatch(/\.update\(\{ intake_mode: "detailed" \}\)/);
    // No insert into estimates anywhere in the conversion handler.
    const handler = fn.slice(fn.indexOf("convertEstimateToDetailed"), fn.indexOf("archiveEstimate ="));
    expect(handler).not.toMatch(/from\("estimates"\)\s*\n?\s*\.insert/);
  });

  it("is idempotent for an already detailed estimate", () => {
    expect(fn).toMatch(/if \(existing\.intake_mode === "detailed"\)/);
    expect(fn).toMatch(/\.eq\("intake_mode", "ballpark"\)/);
  });

  it("keeps the original ballpark range in the audit trail", () => {
    expect(fn).toMatch(/converted_to_detailed/);
    expect(fn).toMatch(/ballparkRange: existing\.range_snapshot/);
  });

  it("keeps locked, issued and archived estimates read-only", () => {
    const handler = fn.slice(fn.indexOf("convertEstimateToDetailed"));
    expect(handler).toMatch(/estimate_locked/);
    expect(handler).toMatch(/archived_at != null/);
  });

  it("offers the conversion behind a confirmation dialog in More options", () => {
    expect(card).toMatch(/convert\.action/);
    expect(card).toMatch(/ConvertToDetailedDialog/);
    expect(dialog).toMatch(/convert\.title/);
    expect(dialog).toMatch(/convert\.bodyHistory/);
  });
});

/**
 * BOUNDARY GUARDS added after the Aug 24 conversion audit: one confirmed CTA,
 * one conversion path, and a canonical band refresh after the scope seed.
 */
describe("conversion boundary (audit follow-up)", () => {
  const tab = readFileSync("src/features/estimating/components/EstimateTab.tsx", "utf8");

  it("refreshes the canonical band after seeding scope lines", () => {
    const handler = fn.slice(
      fn.indexOf("export const convertEstimateToDetailed"),
      fn.indexOf("export const archiveEstimate"),
    );
    expect(handler).toMatch(/refreshCanonicalBandAfterLineChange/);
    // Both the first conversion and the resume-safe top-up refresh the band.
    expect(handler.match(/refreshCanonicalBandAfterLineChange/g) ?? []).toHaveLength(2);
  });

  it("blocks a bare ballpark -> detailed mode flip outside the conversion path", () => {
    expect(fn).toMatch(/use_convert_to_detailed/);
  });

  it("keeps exactly one convert CTA, and it is confirmed", () => {
    expect(card.match(/data-testid="ballpark-build-detailed"/g) ?? []).toHaveLength(1);
    expect(card).not.toMatch(/data-testid="ballpark-convert-primary"/);
    expect(tab).not.toMatch(/ballpark-convert-footer/);
  });

  it("tells the contractor when the saved band is stale after conversion", () => {
    expect(tab).toMatch(/needsCanonicalRefresh/);
    expect(tab).toMatch(/estimate-band-stale/);
  });
});
