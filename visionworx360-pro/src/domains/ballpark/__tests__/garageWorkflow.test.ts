/**
 * Garage Conversion end-to-end reconciliation sequence.
 *
 * The saved $34,500–$43,000 band was quoted from, so it is HISTORY: it may be
 * shown as reference but never used as a working value again. The new active
 * band must come from the reconciled scope only — stale kitchen-remodel lines
 * archived, the 60" vanity counted as one vanity — and scope that cannot be
 * priced must be reported, not silently dropped.
 */
import { describe, expect, it } from "vitest";
import { findUnreconciledScopeItems } from "@/domains/scopeInterpretation";
import { recalculateBallparkFromScope, type RecalcScopeItem } from "@/domains/ballpark/scopeRecalc";
import { evaluateRecalcGate } from "@/domains/ballpark/recalcGate";
import {
  readBallparkBlockers,
  readBallparkSummary,
  readPriorBallpark,
} from "@/features/estimating/services/ballparkSummary";

const HISTORICAL = { low: 34500, expected: 38809.02, high: 43000 };

const NARRATIVE = [
  "Remove the existing garage partition wall.",
  "Frame an approximately 16' x 18' platform floor.",
  "Frame walls to code and insulate walls, ceiling and floor.",
  "Move and reframe 1 garage window.",
  "Remove and reframe 1 large egress window.",
  "Close in existing back garage entry door.",
  "Cut out and frame opening for a new entry door to the master bedroom.",
  "Install interior doors and trim.",
  "Install rough plumbing for bathroom fixtures.",
  'Install the vanity 60" double sink.',
  "Shower tile.",
  "New circuits, outlets, lighting.",
  "Install finished flooring.",
].join("\n");

const item = (
  id: string,
  title: string,
  quantity: number | null = null,
  unitKey: string | null = null,
): RecalcScopeItem => ({ id, title, quantity, unitKey, isIncluded: true });

/** Legacy kitchen scope that predates the garage narrative entirely. */
const STALE_KITCHEN = [
  item("k1", "Remove existing cabinets and countertops"),
  item("k2", "Disconnect and remove appliances"),
  item("k3", "Install base and wall cabinets"),
  item("k4", "Template and install countertops"),
  item("k5", "Add dedicated appliance circuits"),
  item("k6", "Install under-cabinet lighting"),
  item("k7", "Rough plumbing for sink relocation"),
];

const GARAGE = [
  item("g1", "Frame an approximately 16' x 18' platform floor", 288, "square_foot"),
  item("g2", "Move and reframe 1 garage window", 1, "each"),
  item("g3", "Remove and reframe 1 large egress window", 1, "each"),
  item("g4", "Close in existing back garage entry door", 1, "each"),
  item("g5", "Cut out and frame opening for new entry door to master bedroom", 1, "each"),
  item("g6", "Install interior doors and trim", 3, "each"),
  item("g7", "Install rough plumbing for bathroom fixtures", 1, "each"),
  item("g8", "New circuits, outlets, lighting", 1, "each"),
  item("g9", "Install finished flooring", null, "square_foot"),
];
/** As stored before the fix: the vanity's width read as a count of sixty. */
const VANITY_POISONED = item("v1", 'Vanity 60” double sink', 60, "each");
const VANITY_FIXED = item("v1", 'Vanity 60” double sink', 1, "each");

const asInterpretation = (i: RecalcScopeItem) => ({
  id: i.id,
  sectionId: "s",
  roomId: null,
  title: i.title,
  actionKey: null,
  quantity: i.quantity,
  unitKey: i.unitKey,
  materialSelection: null,
  isIncluded: i.isIncluded !== false,
});

describe("Garage Conversion: reconcile, then recalculate", () => {
  const stored = [...GARAGE, VANITY_POISONED, ...STALE_KITCHEN];

  it("identifies exactly the stale kitchen scope, and keeps every garage line", () => {
    const unresolved = findUnreconciledScopeItems({
      narrativeText: NARRATIVE,
      items: stored.map(asInterpretation),
    });
    const ids = unresolved.map((u) => u.id);
    /* Every unmistakable kitchen line is flagged... */
    for (const id of ["k1", "k2", "k3", "k4", "k5"]) expect(ids).toContain(id);
    /* ...and no garage line, nor the corrected vanity, is ever proposed for removal. */
    for (const g of [...GARAGE, VANITY_POISONED]) expect(ids).not.toContain(g.id);
  });

  it("reconciles to zero leftovers once the stale scope is archived", () => {
    const reconciled = [...GARAGE, VANITY_FIXED];
    expect(
      findUnreconciledScopeItems({
        narrativeText: NARRATIVE,
        items: reconciled.map(asInterpretation),
      }),
    ).toEqual([]);
  });

  it("produces a new band in the same order of magnitude as the history it replaces", () => {
    const res = recalculateBallparkFromScope([...GARAGE, VANITY_FIXED])!;
    expect(res).not.toBeNull();
    /*
     * HISTORICAL was captured under the retired flat labor rate. Labor now
     * prices from the NCE 2026 book baseline, which is lower, so the guard is
     * an order-of-magnitude check rather than a rate-era comparison.
     */
    expect(res.band.expected).toBeGreaterThan(HISTORICAL.expected / 4);
    expect(res.band.expected).toBeLessThan(HISTORICAL.expected * 3);
    expect(res.band.low).toBeLessThanOrEqual(res.band.expected);
    expect(res.band.expected).toBeLessThanOrEqual(res.band.high);
  });

  it("lets the integrity gate through only after reconciliation", () => {
    const candidate = recalculateBallparkFromScope([...GARAGE, VANITY_FIXED])!.band;
    /* A saved band from the same (current) engine: only reconciliation is at issue. */
    const previous = {
      low: candidate.low * 0.95,
      expected: candidate.expected * 0.95,
      high: candidate.high * 0.95,
    };
    expect(
      evaluateRecalcGate({ candidate, previous, unresolvedCount: STALE_KITCHEN.length }),
    ).toEqual({ allow: false, reason: "scopeNeedsReview" });
    expect(evaluateRecalcGate({ candidate, previous, unresolvedCount: 0 })).toEqual({
      allow: true,
    });
  });

  it("reports unpriceable scope instead of pretending the estimate is complete", () => {
    const res = recalculateBallparkFromScope([...GARAGE, VANITY_FIXED])!;
    expect(res.unpriceable.length).toBeGreaterThan(0);
    expect(res.confidence).not.toBe("high");
  });

  it("keeps the historical band readable as reference on the new snapshot", () => {
    const res = recalculateBallparkFromScope([...GARAGE, VANITY_FIXED])!;
    const historySnapshot = {
      kind: "ballpark",
      currency: "USD",
      band: HISTORICAL,
      confidence: "medium",
      savedAt: "2026-01-01T00:00:00Z",
    };
    const snapshot = {
      kind: "ballpark",
      source: "scope_recalc",
      currency: "USD",
      band: res.band,
      confidence: res.confidence,
      needsReview: false,
      unpriceable: res.unpriceable,
      savedAt: "2026-02-01T00:00:00Z",
      previous: historySnapshot,
      originalBallpark: historySnapshot,
    };

    expect(readBallparkSummary(snapshot)!.expected).toBe(res.band.expected);
    expect(readPriorBallpark(snapshot)).toMatchObject(HISTORICAL);
    expect(readBallparkBlockers(snapshot).length).toBe(res.unpriceable.length);
    /* History is reference only: it never becomes the displayed band. */
    expect(readBallparkSummary(snapshot)!.expected).not.toBe(HISTORICAL.expected);
  });
});
