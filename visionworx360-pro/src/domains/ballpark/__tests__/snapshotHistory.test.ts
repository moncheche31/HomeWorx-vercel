import { describe, it, expect } from "vitest";
import { withBallparkHistory, stripBallparkHistory } from "@/domains/ballpark/snapshotHistory";

const scopeRecalc = {
  kind: "ballpark",
  source: "scope_recalc",
  band: { low: 29500, expected: 40933.1, high: 54000 },
  pricedCount: 23,
  originalBallpark: { band: { low: 34500, expected: 38809.02, high: 43000 } },
  previous: { band: { low: 19000, expected: 30644.73, high: 44500 } },
};

describe("ballpark snapshot history", () => {
  it("keeps an intake re-run from erasing the corrected scope band", () => {
    const intake = { kind: "ballpark", source: "intake", band: { low: 34500, expected: 38809.02, high: 43000 } };
    const merged = withBallparkHistory(intake, scopeRecalc) as Record<string, unknown>;

    expect(merged.band).toEqual(intake.band);
    /* The corrected scope band is preserved as the band this one replaced. */
    expect((merged.previous as Record<string, unknown>).band).toEqual(scopeRecalc.band);
    expect(merged.originalBallpark).toEqual(scopeRecalc.originalBallpark);
  });

  it("does not nest history chains inside history", () => {
    const merged = withBallparkHistory({ band: { low: 1, expected: 2, high: 3 } }, scopeRecalc) as Record<string, unknown>;
    const previous = merged.previous as Record<string, unknown>;
    expect(previous.previous).toBeUndefined();
    expect(previous.originalBallpark).toBeUndefined();
  });

  it("pins the replaced band as original when no history exists yet", () => {
    const first = { band: { low: 10, expected: 20, high: 30 } };
    const merged = withBallparkHistory({ band: { low: 40, expected: 50, high: 60 } }, first) as Record<string, unknown>;
    expect(merged.originalBallpark).toEqual(first);
  });

  it("returns the snapshot untouched when there is nothing to preserve", () => {
    const next = { band: { low: 1, expected: 2, high: 3 } };
    expect(withBallparkHistory(next, null)).toBe(next);
    expect(stripBallparkHistory(null)).toBeNull();
  });
});
