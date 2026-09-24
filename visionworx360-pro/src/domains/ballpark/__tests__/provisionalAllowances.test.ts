/**
 * Ballpark provisional-allowance fallbacks.
 *
 * Routine remodeling uncertainty (permit fee schedules, code-required circuit
 * protection, structural sizing, floor transitions) must produce a credible,
 * disclosed allowance instead of an unpriced "Incomplete" scope line — and it
 * must do so without asking the contractor an engineering questionnaire.
 */
import { describe, expect, it } from "vitest";
import {
  countProvisionalAllowances,
  readBallparkAssumptions,
  readBallparkBlockers,
} from "@/features/estimating/services/ballparkSummary";
import { recalculateBallparkFromScope, type RecalcScopeItem } from "@/domains/ballpark/scopeRecalc";
import en from "@/i18n/locales/en-US/estimating.json";
import es from "@/i18n/locales/es-US/estimating.json";

const item = (id: string, title: string, over: Partial<RecalcScopeItem> = {}): RecalcScopeItem => ({
  id,
  title,
  quantity: null,
  unitKey: null,
  isIncluded: true,
  ...over,
});

/** The four lines that were unpriced on the Master Suite regression project. */
const REGRESSION = [
  item("p", "Building permit"),
  item("g", "GFCI / AFCI protection"),
  item("l", "LVL beam and posts"),
  item("t", "Transitions and thresholds"),
];

describe("ballpark provisional allowances", () => {
  it("prices a permit line as an estimated permit allowance", () => {
    const res = recalculateBallparkFromScope([item("p", "Building permit")])!;
    expect(res.unpriceable).toHaveLength(0);
    const a = res.assumptions.find((x) => x.itemKey === "permits.allowance")!;
    expect(a.provisional).toBe(true);
    expect(a.basisKey).toBe("permitAllowance");
    expect(res.band.expected).toBeGreaterThan(0);
  });

  it("prices GFCI/AFCI protection from typical remodel context, with no code survey", () => {
    const res = recalculateBallparkFromScope([item("g", "GFCI / AFCI protection")])!;
    expect(res.unpriceable).toHaveLength(0);
    const a = res.assumptions.find((x) => x.itemKey === "electrical.protection")!;
    expect(a.provisional).toBe(true);
    expect(a.quantity).toBeGreaterThan(1);
  });

  it("prices an LVL beam, its posts and the engineering detail as primitives", () => {
    const res = recalculateBallparkFromScope([item("l", "LVL beam and posts")])!;
    expect(res.unpriceable).toHaveLength(0);
    const keys = res.assumptions.map((a) => a.itemKey);
    expect(keys).toContain("structural.beam_lvl");
    expect(keys).toContain("structural.post");
    expect(keys).toContain("structural.engineering");
    expect(res.assumptions.every((a) => a.provisional)).toBe(true);
  });

  it("prices transitions and thresholds from a standard allowance", () => {
    const res = recalculateBallparkFromScope([item("t", "Transitions and thresholds")])!;
    expect(res.unpriceable).toHaveLength(0);
    const a = res.assumptions.find((x) => x.itemKey === "trim.transitions")!;
    expect(a.provisional).toBe(true);
  });

  it("completes the regression scope with disclosed allowances and no blockers", () => {
    const res = recalculateBallparkFromScope(REGRESSION)!;
    expect(res.unpriceable).toHaveLength(0);
    expect(res.provisionalCount).toBe(6);
    expect(res.pricedCount).toBe(6);
    expect(res.band.low).toBeGreaterThan(0);
  });

  it("never reports complete when a scope line truly has no price or fallback", () => {
    const res = recalculateBallparkFromScope([
      ...REGRESSION,
      item("x", "Install decorative koi pond"),
    ])!;
    expect(res.unpriceable.map((u) => u.itemId)).toEqual(["x"]);
  });

  it("keeps a contractor-entered quantity authoritative over the allowance", () => {
    const res = recalculateBallparkFromScope([
      item("g", "GFCI / AFCI protection", { quantity: 2, unitKey: "each" }),
    ])!;
    const a = res.assumptions.find((x) => x.itemKey === "electrical.protection")!;
    expect(a.quantity).toBe(2);
    expect(a.source).toBe("explicit");
    expect(a.provisional).toBeUndefined();
  });

  it("surfaces the completion state through the snapshot readers", () => {
    const res = recalculateBallparkFromScope(REGRESSION)!;
    const snapshot = {
      kind: "ballpark",
      band: res.band,
      currency: res.currency,
      confidence: res.confidence,
      assumptions: res.assumptions,
      unpriceable: res.unpriceable,
    };
    expect(readBallparkBlockers(snapshot)).toHaveLength(0);
    expect(countProvisionalAllowances(snapshot)).toBe(6);
    expect(readBallparkAssumptions(snapshot).every((a) => a.provisional)).toBe(true);
  });

  it("keeps English and Spanish copy at parity", () => {
    const keys = [
      "completeTitle",
      "completeBody",
      "completeAllowances",
      "completeAllowances_other",
      "provisionalNote",
    ] as const;
    const enCard = en.ballparkCard as Record<string, unknown>;
    const esCard = es.ballparkCard as Record<string, unknown>;
    for (const k of keys) {
      expect(typeof enCard[k]).toBe("string");
      expect(typeof esCard[k]).toBe("string");
    }
    const basis = ["permitAllowance", "protectionAllowance", "structuralAllowance", "transitionAllowance"];
    for (const k of basis) {
      expect(typeof (enCard.basis as Record<string, unknown>)[k]).toBe("string");
      expect(typeof (esCard.basis as Record<string, unknown>)[k]).toBe("string");
    }
  });
});
