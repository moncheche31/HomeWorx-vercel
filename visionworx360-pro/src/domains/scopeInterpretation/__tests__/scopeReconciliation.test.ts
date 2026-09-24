import { describe, expect, it } from "vitest";
import {
  buildOrphanRemovals,
  findUnreconciledScopeItems,
  type InterpretationScopeItem,
} from "@/domains/scopeInterpretation";
import { evaluateRecalcGate } from "@/domains/ballpark/recalcGate";

const item = (id: string, title: string, isIncluded = true): InterpretationScopeItem => ({
  id,
  sectionId: "s1",
  roomId: null,
  title,
  actionKey: null,
  quantity: 1,
  unitKey: "each",
  materialSelection: null,
  isIncluded,
});

const GARAGE_NARRATIVE = [
  "Frame the garage conversion partition walls.",
  "Insulate and drywall the new garage living space.",
  "Install new flooring in the converted garage.",
].join("\n");

const LEGACY_KITCHEN = [
  item("k1", "Remove existing cabinets and countertops"),
  item("k2", "Disconnect and remove appliances"),
  item("k3", "Rough plumbing for sink relocation"),
  item("k4", "Install base and wall cabinets"),
  item("k5", "Template and install countertops"),
];

/** The protected historical Garage Conversion ballpark. */
const PROTECTED = { low: 34500, expected: 38809.02, high: 43000 };

describe("narrative ↔ structured scope reconciliation", () => {
  it("flags legacy kitchen scope the current garage narrative never describes", () => {
    const unresolved = findUnreconciledScopeItems({
      narrativeText: GARAGE_NARRATIVE,
      items: [...LEGACY_KITCHEN, item("g1", "Frame the garage conversion partition walls")],
    });
    expect(unresolved.map((u) => u.id)).toEqual(["k1", "k2", "k3", "k4", "k5"]);
    expect(unresolved[0]!.reason).toBe("notInNarrative");
  });

  it("presents leftovers as reviewable removals, never as deletions", () => {
    const removals = buildOrphanRemovals({ narrativeText: GARAGE_NARRATIVE, items: LEGACY_KITCHEN });
    expect(removals).toHaveLength(5);
    for (const change of removals) {
      expect(change.kind).toBe("remove");
      expect(change.requiresReview).toBe(true);
      expect(change.targetItemId).toBeTruthy();
      expect(change.reasonKeys).toContain("notInNarrative");
    }
  });

  it("does not propose removals for scope already excluded, or for an empty narrative", () => {
    expect(
      findUnreconciledScopeItems({ narrativeText: "", items: LEGACY_KITCHEN }),
    ).toEqual([]);
    expect(
      findUnreconciledScopeItems({
        narrativeText: GARAGE_NARRATIVE,
        items: LEGACY_KITCHEN.map((i) => ({ ...i, isIncluded: false })),
      }),
    ).toEqual([]);
  });

  it("skips items already covered by the sentence diff", () => {
    const removals = buildOrphanRemovals(
      { narrativeText: GARAGE_NARRATIVE, items: LEGACY_KITCHEN },
      { skipItemIds: ["k1", "k2"] },
    );
    expect(removals.map((r) => r.targetItemId)).toEqual(["k3", "k4", "k5"]);
  });
});

describe("ballpark recalculation integrity gate", () => {
  it("blocks replacement while unreconciled leftovers remain", () => {
    const decision = evaluateRecalcGate({
      candidate: { low: 285500, expected: 454350.43, high: 650000 },
      previous: PROTECTED,
      unresolvedCount: 5,
    });
    expect(decision).toEqual({ allow: false, reason: "scopeNeedsReview" });
  });

  it("blocks an absurdly divergent result even when scope looks reconciled", () => {
    const decision = evaluateRecalcGate({
      candidate: { low: 285500, expected: 454350.43, high: 650000 },
      previous: PROTECTED,
      unresolvedCount: 0,
    });
    expect(decision).toEqual({ allow: false, reason: "divergent" });
  });

  it("allows recalculation once scope is reconciled and the result is plausible", () => {
    expect(
      evaluateRecalcGate({
        candidate: { low: 36000, expected: 41200, high: 47000 },
        previous: PROTECTED,
        unresolvedCount: 0,
      }),
    ).toEqual({ allow: true });
  });

  it("allows a first band when there is no credible saved ballpark to protect", () => {
    expect(
      evaluateRecalcGate({ candidate: { low: 1, expected: 2, high: 3 }, previous: null, unresolvedCount: 3 }),
    ).toEqual({ allow: true });
  });

  it("never invents a band when nothing could be priced", () => {
    expect(
      evaluateRecalcGate({ candidate: null, previous: PROTECTED, unresolvedCount: 0 }),
    ).toEqual({ allow: false, reason: "noResult" });
  });

  it("leaves the protected historical band untouched in every decision", () => {
    expect(PROTECTED).toEqual({ low: 34500, expected: 38809.02, high: 43000 });
  });
});
