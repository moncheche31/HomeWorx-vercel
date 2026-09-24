/**
 * Ballpark scaling regression: a size must never be priced as a count.
 *
 * The Garage Conversion ballpark exploded to $454,350.43 expected
 * ($285,500–$650,000) against a credible saved band of $34,500–$43,000.
 * The whole gap came from one scope line, `Vanity 60" double sink`, whose
 * quantity was parsed from the vanity's *width in inches* and then priced as
 * sixty full bathroom fixture sets: 60 × ($4,200 material + 26 h × $65) =
 * $353,400 of the $375,496 direct cost — 94% of the estimate from one line,
 * a ~10x inflation of the real garage scope.
 */
import { describe, expect, it } from "vitest";
import { detectQuantity } from "@/domains/voiceCapture";
import { recalculateBallparkFromScope, type RecalcScopeItem } from "@/domains/ballpark/scopeRecalc";
import { SAMPLE_PRICEBOOK } from "@/domains/ballpark/pricebook";

const item = (id: string, title: string, quantity: number | null, unitKey: string | null): RecalcScopeItem => ({
  id,
  title,
  quantity,
  unitKey,
  isIncluded: true,
});

/** The real garage scope, as stored, including the poisoned vanity line. */
const GARAGE_SCOPE: RecalcScopeItem[] = [
  item("floor", "Frame an approximately 16' x 18' platform floor", 288, "square_foot"),
  item("doors", "Install interior doors and trim", null, null),
  item("win1", "Move and reframe 1 garage window", 1, "each"),
  item("win2", "Remove and reframe 1 large egress window", 1, "each"),
  item("elec", "New circuits, outlets, lighting", null, "each"),
  item("plumb", "Install rough plumbing for bathroom fixtures", null, "each"),
  item("bath", "Shower tile", null, "each"),
];
const POISONED = item("vanity", 'Vanity 60" double sink', 60, "each");

describe("size-vs-count parsing", () => {
  it("never reads an inch dimension as a quantity", () => {
    expect(detectQuantity('Vanity 60" double sink').quantity).toBeNull();
    expect(detectQuantity("Vanity 60” double sink").quantity).toBeNull();
    expect(detectQuantity("Install 36 inch vanity").quantity).toBeNull();
    expect(detectQuantity('Frame 16\' x 18\' platform with 3/4" Advantech').quantity).toBeNull();
  });

  it("still reads real counts and real measured quantities", () => {
    expect(detectQuantity("Install 3 interior doors").quantity).toBe(3);
    expect(detectQuantity("Frame partition walls 60 linear feet").quantity).toBe(60);
    expect(detectQuantity("Add six recessed lights").quantity).toBe(6);
    expect(detectQuantity("Install 288 square feet of flooring").quantity).toBe(288);
  });
});

describe("implausible counts cannot inflate a ballpark", () => {
  it("refuses to price sixty full bathroom fixture sets on one line", () => {
    const res = recalculateBallparkFromScope([POISONED])!;
    expect(res).toBeNull();
  });

  it("reports the rejected count instead of silently dropping or pricing it", () => {
    const res = recalculateBallparkFromScope([...GARAGE_SCOPE, POISONED])!;
    const flagged = res.unpriceable.find((u) => u.itemId === "vanity")!;
    expect(flagged).toMatchObject({ reason: "implausibleQuantity", quantity: 60, maxPlausible: 4 });
    expect(res.confidence).not.toBe("high");
  });

  it("keeps a realistic garage scope within an order of magnitude of the credible band", () => {
    const res = recalculateBallparkFromScope([...GARAGE_SCOPE, POISONED])!;
    const credibleExpected = 38809.02;
    expect(res.band.expected).toBeLessThan(credibleExpected * 3);
    expect(res.band.high).toBeLessThan(650000 / 10);
    /* The one bad line contributed 94% before the fix; it contributes 0 now. */
    expect(res.band.expected).toBeLessThan(454350.43 / 10);
  });

  it("adding the poisoned line cannot change the priced total at all", () => {
    const clean = recalculateBallparkFromScope(GARAGE_SCOPE)!;
    const withPoison = recalculateBallparkFromScope([...GARAGE_SCOPE, POISONED])!;
    expect(withPoison.pricedCount).toBe(clean.pricedCount);
    expect(withPoison.band.expected).toBe(clean.band.expected);
  });

  it("prices a plausible count normally, so the cap is not a blanket block", () => {
    const two = recalculateBallparkFromScope([item("b", "Install rough plumbing for bathroom fixtures", 2, "each")])!;
    const one = recalculateBallparkFromScope([item("b", "Install rough plumbing for bathroom fixtures", 1, "each")])!;
    expect(two.pricedCount).toBe(1);
    expect(two.band.expected).toBeGreaterThan(one.band.expected);
  });

  it("caps every high-cost each item in the pricebook", () => {
    for (const key of ["bath.full_fixtures", "bath.half_fixtures", "plumbing.major", "electrical.panel"]) {
      const e = SAMPLE_PRICEBOOK.get(key)!;
      expect(e.maxPlausibleCount).toBeGreaterThan(0);
      expect(e.maxPlausibleCount!).toBeLessThanOrEqual(4);
    }
  });
});

describe("unit and percent integrity of the priced line", () => {
  it("treats percentages as percentages, not multipliers (no 10x from markup)", () => {
    const base = recalculateBallparkFromScope(GARAGE_SCOPE, { overheadPct: 0, profitPct: 0 })!;
    const marked = recalculateBallparkFromScope(GARAGE_SCOPE, { overheadPct: 10, profitPct: 10 })!;
    const ratio = marked.band.expected / base.band.expected;
    expect(ratio).toBeGreaterThan(1.2);
    expect(ratio).toBeLessThan(1.25);
  });

  it("keeps dollars in dollars: a single door line matches its hand calculation", () => {
    const door = SAMPLE_PRICEBOOK.get("door.interior")!;
    /*
     * Raw unit math: small-job mobilization / service-call economics are a
     * SELL-price layer and are switched off here so the hand calculation of a
     * single line stays comparable.
     */
    const res = recalculateBallparkFromScope([item("d", "Install interior door", 1, "each")], {
      overheadPct: 0,
      profitPct: 0,
      contingencyPct: 0,
      smallJobEconomics: false,
    })!;
    const hand = door.laborHoursPerUnit * SAMPLE_PRICEBOOK.laborRate + door.materialCostPerUnit;
    /* Whole-dollar money policy: the band is the hand calculation, rounded. */
    expect(res.band.expected).toBe(Math.round(hand));
    expect(res.band.expected).toBeLessThan(1000);
  });

  it("scales linearly with quantity — no duplicate multiplier", () => {
    const one = recalculateBallparkFromScope([item("f", "Install finished flooring", 100, "square_foot")], { smallJobEconomics: false })!;
    const ten = recalculateBallparkFromScope([item("f", "Install finished flooring", 1000, "square_foot")], { smallJobEconomics: false })!;
    expect(ten.band.expected / one.band.expected).toBeCloseTo(10, 1);
  });

  it("widening can never approach an order of magnitude", () => {
    const noise = Array.from({ length: 40 }, (_, i) => item(`u${i}`, "Install quartz countertops", null, "square_foot"));
    const res = recalculateBallparkFromScope([...GARAGE_SCOPE, ...noise])!;
    expect(res.widenPct).toBeLessThanOrEqual(30);
    expect(res.band.high).toBeLessThan(res.band.expected * 2);
  });
});
