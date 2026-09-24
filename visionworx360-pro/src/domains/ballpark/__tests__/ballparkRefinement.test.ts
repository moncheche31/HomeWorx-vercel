/**
 * Ballpark refinement loop: infer -> disclose -> correct -> recalculate.
 *
 * The ballpark never blocks on a question. It assumes, prices, and shows what
 * it assumed; the contractor then corrects any assumption that is materially
 * wrong and the band re-prices. Corrections are authoritative: they survive
 * later recalculations, they are labelled as confirmed rather than assumed, and
 * they can be reverted back to the inferred value.
 */
import { describe, expect, it } from "vitest";
import {
  assumptionKey as key,
  recalculateBallparkFromScope,
  type RecalcScopeItem,
} from "@/domains/ballpark/scopeRecalc";
import { evaluateRecalcGate } from "@/domains/ballpark/recalcGate";
import { readBallparkAssumptions } from "@/features/estimating/services/ballparkSummary";
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

const SCOPE = [item("p", "Building permit"), item("t", "Transitions and thresholds")];

describe("ballpark refinement loop", () => {
  it("prices a complete band before any contractor input", () => {
    const res = recalculateBallparkFromScope(SCOPE)!;
    expect(res.unpriceable).toHaveLength(0);
    expect(res.band.expected).toBeGreaterThan(0);
    expect(res.assumptions.every((a) => a.corrected !== true)).toBe(true);
  });

  it("applies a contractor correction and moves the band", () => {
    const base = recalculateBallparkFromScope(SCOPE)!;
    const target = base.assumptions.find((a) => a.itemKey === "trim.transitions")!;

    const refined = recalculateBallparkFromScope(SCOPE, {
      assumptionOverrides: { [key(target.itemId, target.itemKey)]: target.quantity + 4 },
    })!;

    const after = refined.assumptions.find((a) => a.itemKey === "trim.transitions")!;
    expect(after.quantity).toBe(target.quantity + 4);
    expect(after.source).toBe("contractor");
    expect(after.corrected).toBe(true);
    expect(after.inferredQuantity).toBe(target.quantity);
    expect(refined.band.expected).toBeGreaterThan(base.band.expected);
  });

  it("stops counting a corrected quantity as an assumption or an allowance", () => {
    const base = recalculateBallparkFromScope(SCOPE)!;
    const target = base.assumptions.find((a) => a.itemKey === "trim.transitions")!;
    const refined = recalculateBallparkFromScope(SCOPE, {
      assumptionOverrides: { [key(target.itemId, target.itemKey)]: 6 },
    })!;

    const after = refined.assumptions.find((a) => a.itemKey === "trim.transitions")!;
    expect(after.provisional).toBeUndefined();
    expect(refined.correctedCount).toBe(1);
    expect(refined.assumedCount).toBeLessThan(base.assumedCount);
  });

  it("re-infers nothing once corrected, and reverts cleanly when cleared", () => {
    const base = recalculateBallparkFromScope(SCOPE)!;
    const target = base.assumptions.find((a) => a.itemKey === "permits.allowance")!;
    const overrides = { [key(target.itemId, target.itemKey)]: 3 };

    /* A second pass over identical scope must keep the correction. */
    const again = recalculateBallparkFromScope(SCOPE, { assumptionOverrides: overrides })!;
    expect(again.assumptions.find((a) => a.itemKey === "permits.allowance")!.quantity).toBe(3);

    const reverted = recalculateBallparkFromScope(SCOPE, { assumptionOverrides: {} })!;
    const back = reverted.assumptions.find((a) => a.itemKey === "permits.allowance")!;
    expect(back.quantity).toBe(target.quantity);
    expect(back.corrected).toBeUndefined();
    expect(reverted.band.expected).toBeCloseTo(base.band.expected, 5);
  });

  it("keeps corrected rows visible for review with their prior inferred value", () => {
    const base = recalculateBallparkFromScope(SCOPE)!;
    const target = base.assumptions.find((a) => a.itemKey === "permits.allowance")!;
    const refined = recalculateBallparkFromScope(SCOPE, {
      assumptionOverrides: { [key(target.itemId, target.itemKey)]: 9 },
    })!;

    const views = readBallparkAssumptions({ kind: "ballpark", ...refined });
    const view = views.find((v) => v.itemKey === "permits.allowance")!;
    expect(view.corrected).toBe(true);
    expect(view.source).toBe("contractor");
    expect(view.inferredQuantity).toBe(target.quantity);
    expect(view.basisKey).toBe("contractorCorrected");
  });

  it("lets a deliberate quantity correction through the divergence gate", () => {
    const gateInput = {
      candidate: { low: 900, expected: 1000, high: 1200 },
      previous: { low: 90, expected: 100, high: 120 },
      unresolvedCount: 0,
      unpriceableCount: 0,
    };
    expect(evaluateRecalcGate(gateInput).allow).toBe(false);
    /*
     * An explicit corrected quantity is authoritative arithmetic. Merely
     * ANSWERING a clarification question is not, so it stays gated.
     */
    expect(evaluateRecalcGate({ ...gateInput, assumptionCorrection: true }).allow).toBe(true);
    expect(evaluateRecalcGate({ ...gateInput, contractorInitiated: true }).allow).toBe(false);
  });

  it("ships bilingual copy for the refinement controls", () => {
    for (const bundle of [en, es]) {
      const card = (bundle as unknown as Record<string, Record<string, Record<string, string>>>)
        .ballparkCard;
      expect(card.refine).toBeTruthy();
      expect(card.refineSave).toBeTruthy();
      expect(card.revert).toBeTruthy();
      expect(card.wasAssumed).toContain("{{quantity}}");
      expect(card.sourceBadge.contractor).toBeTruthy();
      expect(card.sourceBadge.assumed).toBeTruthy();
      expect(card.basis.contractorCorrected).toBeTruthy();
    }
  });
});
