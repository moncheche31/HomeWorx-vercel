/**
 * Scope review must get SHORTER as the contractor answers it.
 *
 * The old failure: acknowledgements lived in React state keyed to the whole
 * scope fingerprint, so answering one finding (which edits an item) changed
 * the fingerprint and silently discarded every other answer. These tests pin
 * the durable behaviour: decisions are keyed to the issue subject, survive
 * unrelated scope edits, and re-open only when THAT item materially changes.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateScopeApproval,
  isFindingDecided,
  openFindings,
  validateScope,
  type ScopeDecisionRecord,
  type ScopeValidationItem,
} from "@/domains/scopeValidation";
import { suggestTradeFromText } from "@/domains/estimating/tradeTaxonomy";

const scope = (): ScopeValidationItem[] => [
  { id: "a", title: "Install shower tile", tradeKey: "framing" },
  { id: "b", title: "Install kitchen cabinets", tradeKey: "painting" },
  { id: "c", title: "Install LVL beam", tradeKey: "framing", laborHours: 0, isLaborBearing: true },
];

const tradeFinding = (items: ScopeValidationItem[], id: string) =>
  validateScope(items).findings.find(
    (f) => f.kind === "suspicious_trade" && f.itemIds.includes(id),
  )!;

describe("scope review decisions are durable", () => {
  it("keeps the same subject key across re-validation runs", () => {
    const first = tradeFinding(scope(), "a");
    const second = tradeFinding(scope(), "a");
    expect(first.subjectKey).toBe(second.subjectKey);
    expect(first.subjectFingerprint).toBe(second.subjectFingerprint);
  });

  it("does not re-open an answered finding when a DIFFERENT item is edited", () => {
    const before = tradeFinding(scope(), "a");
    const decisions: ScopeDecisionRecord[] = [
      { subjectKey: before.subjectKey, subjectFingerprint: before.subjectFingerprint, decision: "kept" },
    ];
    const edited = scope().map((i) => (i.id === "b" ? { ...i, tradeKey: "finish_carpentry" } : i));
    const after = validateScope(edited);
    expect(openFindings(after, decisions).some((f) => f.itemIds.includes("a"))).toBe(false);
  });

  it("shrinks the open list as each finding is answered", () => {
    const report = validateScope(scope());
    const decisions: ScopeDecisionRecord[] = [];
    let remaining = report.findings.length;
    expect(remaining).toBeGreaterThan(1);
    for (const f of report.findings) {
      decisions.push({
        subjectKey: f.subjectKey,
        subjectFingerprint: f.subjectFingerprint,
        decision: "kept",
      });
      const next = openFindings(report, decisions).length;
      expect(next).toBeLessThan(remaining);
      remaining = next;
    }
    expect(remaining).toBe(0);
    expect(evaluateScopeApproval(report, { decisions }).canApprove).toBe(true);
  });

  it("honours a contractor pick that disagrees with the suggestion", () => {
    const items = scope();
    const before = tradeFinding(items, "a");
    expect(before.suggestedTradeKey).toBe("tile");
    const decisions: ScopeDecisionRecord[] = [
      {
        subjectKey: before.subjectKey,
        subjectFingerprint: before.subjectFingerprint,
        decision: "reassigned",
        decidedTradeKey: "painting",
      },
    ];
    const moved = items.map((i) => (i.id === "a" ? { ...i, tradeKey: "painting" } : i));
    const after = validateScope(moved);
    const still = after.findings.find((f) => f.itemIds.includes("a") && f.kind === "suspicious_trade");
    expect(still).toBeTruthy();
    expect(isFindingDecided(still!, decisions)).toBe(true);
  });

  it("re-opens the question when THAT item is materially edited", () => {
    const items = scope();
    const before = tradeFinding(items, "a");
    const decisions: ScopeDecisionRecord[] = [
      { subjectKey: before.subjectKey, subjectFingerprint: before.subjectFingerprint, decision: "kept" },
    ];
    const retitled = items.map((i) => (i.id === "a" ? { ...i, title: "Install shower pan tile" } : i));
    const after = tradeFinding(retitled, "a");
    expect(isFindingDecided(after, decisions)).toBe(false);
  });
});

describe("duplicate detection uses identity, not titles alone", () => {
  it("does not call two differently-sized platform floors a duplicate", () => {
    const report = validateScope([
      { id: "1", title: "Frame 15.5 x 18 platform floor", quantity: 279, unitKey: "square_foot" },
      { id: "2", title: "Frame 12 x 14 platform floor", quantity: 168, unitKey: "square_foot" },
    ]);
    expect(report.findings.some((f) => f.kind === "duplicate")).toBe(false);
  });

  it("still flags the same work entered twice", () => {
    const report = validateScope([
      { id: "1", title: "Frame 15.5 x 18 platform floor", quantity: 279, unitKey: "square_foot" },
      { id: "2", title: "Frame 15.5 x 18 platform floor", quantity: 279, unitKey: "square_foot" },
    ]);
    expect(report.findings.some((f) => f.kind === "duplicate")).toBe(true);
  });

  it("flags two items imported from the same source row even when reworded", () => {
    const report = validateScope([
      { id: "1", title: "Frame platform floor", originRef: "walkthrough:step-4" },
      { id: "2", title: "Build raised floor deck", originRef: "walkthrough:step-4" },
    ]);
    expect(report.findings.some((f) => f.kind === "duplicate")).toBe(true);
  });

  it("classifies framing a platform floor as framing, not flooring", () => {
    expect(suggestTradeFromText("Frame an approximately 15.5' x 18' platform floor")).toBe(
      "framing",
    );
  });
});
