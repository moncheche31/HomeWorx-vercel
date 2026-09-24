/**
 * Versioned stale-ballpark refresh.
 *
 * A saved ballpark snapshot is the output of one specific engine. When the
 * engine learns to price work it used to report as an unpriced blocker, an
 * editable snapshot from the older engine must be recomputed the next time the
 * contractor opens the estimate — with no manual scope edit, no recalc loop,
 * and no mutation of issued documents.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  BALLPARK_ENGINE_VERSION,
  ballparkSnapshotVersion,
  isBallparkSnapshotStale,
} from "@/domains/ballpark/engineVersion";
import { evaluateRecalcGate } from "@/domains/ballpark/recalcGate";
import { recalculateBallparkFromScope, assumptionKey, type RecalcScopeItem } from "@/domains/ballpark/scopeRecalc";
import {
  countProvisionalAllowances,
  readBallparkBlockers,
  readBallparkSummary,
} from "@/features/estimating/services/ballparkSummary";

const source = readFileSync("src/features/estimating/services/estimating.functions.ts", "utf8");

const item = (id: string, title: string, over: Partial<RecalcScopeItem> = {}): RecalcScopeItem => ({
  id,
  title,
  quantity: null,
  unitKey: null,
  isIncluded: true,
  ...over,
});

/** The exact four lines the live Master Suite ballpark reported as unpriced. */
const LEGACY_BLOCKERS = [
  item("p", "Building permit"),
  item("g", "GFCI / AFCI protection"),
  item("l", "LVL beam and posts"),
  item("t", "Transitions and thresholds"),
];

describe("ballpark engine version", () => {
  it("treats an unstamped legacy snapshot as stale", () => {
    const legacy = { kind: "ballpark", band: { low: 1, expected: 2, high: 3 } };
    expect(ballparkSnapshotVersion(legacy)).toBe(1);
    expect(isBallparkSnapshotStale(legacy)).toBe(true);
  });

  it("never rewrites a snapshot already at the current version", () => {
    const current = { kind: "ballpark", engineVersion: BALLPARK_ENGINE_VERSION };
    expect(isBallparkSnapshotStale(current)).toBe(false);
    expect(isBallparkSnapshotStale({ kind: "ballpark", engineVersion: BALLPARK_ENGINE_VERSION + 1 })).toBe(false);
  });

  it("has nothing to refresh when there is no snapshot at all", () => {
    expect(isBallparkSnapshotStale(null)).toBe(false);
  });

  it("lets an engine upgrade through the divergence gate", () => {
    const input = {
      candidate: { low: 900, expected: 1000, high: 1200 },
      previous: { low: 90, expected: 100, high: 120 },
      unresolvedCount: 3,
      unpriceableCount: 4,
    };
    expect(evaluateRecalcGate(input).allow).toBe(false);
    expect(evaluateRecalcGate({ ...input, engineUpgrade: true }).allow).toBe(true);
    expect(evaluateRecalcGate({ ...input, engineUpgrade: true, candidate: null }).allow).toBe(false);
  });
});

describe("stale refresh on open", () => {
  it("only auto-refreshes editable, non-archived, ballpark-mode estimates", () => {
    const guard = source.slice(
      source.indexOf("async function refreshStaleBallparkEngine"),
      source.indexOf("async function loadBallparkGeometry"),
    );
    expect(guard).toContain('est.intake_mode !== "ballpark"');
    expect(guard).toContain("est.archived_at != null");
    expect(guard).toContain("isReadOnly(");
    expect(guard).toContain("isBallparkSnapshotStale(");
    expect(guard).toContain("engineUpgrade: true");
  });

  it("runs from the single-estimate read path so reopening is enough", () => {
    const handler = source.slice(
      source.indexOf("export const getEstimate ="),
      source.indexOf("export const listEstimateLines ="),
    );
    expect(handler).toContain("refreshStaleBallparkEngine(");
  });

  it("stamps the current engine version on every persisted refresh", () => {
    expect(source).toContain("engineVersion: BALLPARK_ENGINE_VERSION");
  });

  it("replaces legacy blockers with disclosed provisional allowances", () => {
    const result = recalculateBallparkFromScope(LEGACY_BLOCKERS)!;
    const snapshot = {
      kind: "ballpark",
      engineVersion: BALLPARK_ENGINE_VERSION,
      band: result.band,
      currency: result.currency,
      confidence: result.confidence,
      assumptions: result.assumptions,
      unpriceable: result.unpriceable,
    };
    expect(readBallparkBlockers(snapshot)).toHaveLength(0);
    expect(countProvisionalAllowances(snapshot)).toBe(6);
    expect(readBallparkSummary(snapshot)!.expected).toBeGreaterThan(0);
    expect(isBallparkSnapshotStale(snapshot)).toBe(false);
  });

  it("preserves contractor overrides and explicit quantities across a refresh", () => {
    const base = recalculateBallparkFromScope(LEGACY_BLOCKERS)!;
    const target = base.assumptions.find((a) => a.itemKey === "permits.allowance")!;
    const refreshed = recalculateBallparkFromScope(
      [...LEGACY_BLOCKERS, item("e", "GFCI / AFCI protection", { quantity: 2, unitKey: "each" })],
      { assumptionOverrides: { [assumptionKey(target.itemId, target.itemKey)]: 3 } },
    )!;
    expect(refreshed.assumptions.find((a) => a.itemKey === "permits.allowance")!.quantity).toBe(3);
    const explicit = refreshed.assumptions.find((a) => a.itemId === "e")!;
    expect(explicit.quantity).toBe(2);
    expect(explicit.source).toBe("explicit");
  });

  it("carries contractor overrides forward into the persisted snapshot", () => {
    const refresh = source.slice(
      source.indexOf("async function refreshBallparkFromScope"),
      source.indexOf("/** The contractor-current Scope of Work prose"),
    );
    expect(refresh).toContain("readAssumptionOverrides(est.range_snapshot");
    expect(refresh).toContain("assumptionOverrides,");
    expect(refresh).toContain("est.locked_at != null || est.superseded_by_id != null");
  });
});
