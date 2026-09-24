import { describe, expect, it } from "vitest";
import { recalculateBallparkFromScope, type RecalcScopeItem } from "@/domains/ballpark/scopeRecalc";

const scope = (over: Partial<RecalcScopeItem>): RecalcScopeItem => ({
  id: "a",
  title: "Frame partition walls",
  quantity: 40,
  unitKey: "linear_foot",
  isIncluded: true,
  ...over,
});

describe("recalculateBallparkFromScope", () => {
  it("prices the structured scope into a band", () => {
    const res = recalculateBallparkFromScope([scope({})]);
    expect(res).not.toBeNull();
    expect(res!.pricedCount).toBe(1);
    expect(res!.band.low).toBeLessThanOrEqual(res!.band.expected);
    expect(res!.band.expected).toBeLessThanOrEqual(res!.band.high);
  });

  it("grows the band when scope is added", () => {
    const before = recalculateBallparkFromScope([scope({})])!;
    const after = recalculateBallparkFromScope([
      scope({}),
      scope({ id: "b", title: "Install interior door", quantity: 2, unitKey: "each" }),
    ])!;
    expect(after.band.expected).toBeGreaterThan(before.band.expected);
  });

  it("shrinks the band when scope is excluded, without deleting anything", () => {
    const full = recalculateBallparkFromScope([
      scope({}),
      scope({ id: "b", title: "Install interior door", quantity: 2, unitKey: "each" }),
    ])!;
    const reduced = recalculateBallparkFromScope([
      scope({}),
      scope({ id: "b", title: "Install interior door", quantity: 2, unitKey: "each", isIncluded: false }),
    ])!;
    expect(reduced.band.expected).toBeLessThan(full.band.expected);
  });

  it("reports scope it cannot price instead of dropping it silently", () => {
    const res = recalculateBallparkFromScope([
      scope({}),
      scope({ id: "c", title: "Fabricate custom stained glass dome", quantity: 30, unitKey: "square_foot" }),
    ])!;
    expect(res.unpriceable.map((u) => u.itemId)).toEqual(["c"]);
    expect(res.unpriceable[0]!.reason).toBe("noMapping");
  });

  it("flags a missing measurement rather than inventing one", () => {
    const res = recalculateBallparkFromScope([
      scope({}),
      scope({ id: "d", title: "New flooring", quantity: null, unitKey: "square_foot" }),
    ])!;
    expect(res.unpriceable[0]).toMatchObject({ itemId: "d", reason: "noQuantity" });
  });

  it("assumes a count of one only for each-based work, and widens the band for it", () => {
    const res = recalculateBallparkFromScope([
      scope({ id: "e", title: "Install interior door", quantity: null, unitKey: "each" }),
    ])!;
    expect(res.assumedCount).toBe(1);
    expect(res.widenPct).toBeGreaterThan(0);
    expect(res.confidence).not.toBe("high");
  });

  it("returns null when nothing at all can be priced, so the saved band survives", () => {
    expect(
      recalculateBallparkFromScope([scope({ id: "f", title: "Fabricate custom stained glass dome" })]),
    ).toBeNull();
  });
});
