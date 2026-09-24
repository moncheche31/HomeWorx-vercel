/**
 * Preliminary -> Final bridge regression matrix.
 *
 * The universal matrix already proves `canonicalSellingPrice` is the only
 * selling-price formula. This suite proves the PRESENTATION path a contractor
 * actually sees — the ballpark/range band — centres on that same canonical
 * value for every trade, that low/high are uncertainty bounds around it rather
 * than a second formula, and that a legitimate input change surfaces as an
 * itemized reconciliation delta instead of silent drift.
 *
 * Trade-agnostic by construction: no kitchen constants, no labor-hour
 * thresholds, no per-job special cases.
 */

import { describe, it, expect } from "vitest";
import {
  buildEstimateRange,
  normalizeAssumptions,
  type EngineLineInput,
  type EstimateEngineConfig,
} from "@/domains/estimating";
import {
  canonicalSellingPrice,
  buildPreliminaryLevels,
  buildReconciliationSnapshot,
} from "@/domains/estimating/preliminaryLevels";
import { reconcilePreliminaryToFinal } from "@/domains/estimating/reconciliation";
import { normalizeLine, recomputeForQuantity } from "@/domains/estimating/canonicalLine";
import { finalizeBallparkBand } from "@/domains/ballpark/plausibility";
import { isBallparkSnapshotStale, BALLPARK_ENGINE_VERSION } from "@/domains/ballpark/engineVersion";
import { convertBetweenUnits } from "@/domains/workRecognition/units";
import { buildPreliminaryBridge } from "@/domains/estimating/preliminaryBridge";

const line = (over: Partial<EngineLineInput> & { id: string }): EngineLineInput => ({
  description: over.id,
  groupLabel: "group.general",
  quantity: 1,
  unitKey: "each",
  laborHours: null,
  laborHoursPerUnit: null,
  crewSize: 1,
  laborRate: 65,
  materialCost: 0,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  wasteFactorPct: 0,
  overheadPct: 10,
  profitPct: 10,
  contingencyPct: 0,
  isTaxable: false,
  ...over,
});

/** The six trades the pilot must not get wrong. */
const TRADES: { name: string; lines: EngineLineInput[] }[] = [
  {
    name: "kitchen cabinets",
    lines: [
      line({ id: "kc1", quantity: 18, unitKey: "each", materialCost: 305, laborHoursPerUnit: 0.9 }),
      line({ id: "kc2", quantity: 26, unitKey: "linear_foot", materialCost: 58, laborHoursPerUnit: 0.35 }),
    ],
  },
  {
    name: "garage conversion",
    lines: [
      line({ id: "gc1", quantity: 1039, unitKey: "square_foot", materialCost: 1.15, laborHoursPerUnit: 0.018 }),
      line({ id: "gc2", quantity: 279, unitKey: "square_foot", materialCost: 6.4, laborHoursPerUnit: 0.05 }),
    ],
  },
  {
    name: "bathroom",
    lines: [
      line({ id: "ba1", quantity: 64, unitKey: "square_foot", materialCost: 9.2, laborHoursPerUnit: 0.14 }),
      line({ id: "ba2", quantity: 1, unitKey: "each", materialCost: 480, laborHours: 4 }),
    ],
  },
  {
    name: "handyman small repair",
    lines: [line({ id: "hr1", quantity: 1, unitKey: "each", materialCost: 35, laborHours: 1.5 })],
  },
  {
    name: "roofing",
    lines: [line({ id: "rf1", quantity: 24, unitKey: "roofing_square", materialCost: 210, laborHoursPerUnit: 2 })],
  },
  {
    name: "exterior site concrete",
    lines: [line({ id: "cc1", quantity: 14, unitKey: "cubic_yard", materialCost: 205, laborHoursPerUnit: 1.4 })],
  },
];

const CONFIG: EstimateEngineConfig = { currency: "USD", taxRatePct: 0 };
const OP = { method: "overhead_profit" as const, overheadPct: 10, profitPct: 10, targetGrossMarginPct: 0 };
const TGM = { method: "target_gross_margin" as const, overheadPct: 0, profitPct: 0, targetGrossMarginPct: 35 };

const band = (lines: EngineLineInput[], strategy: typeof OP | typeof TGM) => {
  const range = buildEstimateRange(
    lines,
    { ...CONFIG, pricingStrategy: strategy },
    normalizeAssumptions({ tier: "better" }),
    { ungroupedLabel: "group.other" },
  );
  return finalizeBallparkBand(
    { low: range.selected.base.low, expected: range.selected.mid, high: range.selected.base.high },
    { hasDimensions: true, hasFinishTier: true, pricedCount: lines.length, allowanceCount: 0 },
  );
};

describe("preliminary band centres on the canonical selling price", () => {
  for (const { name, lines } of TRADES) {
    for (const strategy of [OP, TGM]) {
      it(`${name} / ${strategy.method}: as-illustrated === final selling price`, () => {
        const final = canonicalSellingPrice(lines, CONFIG, strategy);
        const presented = band(lines, strategy);
        expect(presented.expected).toBeCloseTo(final.sellingPrice, 2);
      });

      it(`${name} / ${strategy.method}: low/high bracket the canonical value`, () => {
        const final = canonicalSellingPrice(lines, CONFIG, strategy);
        const presented = band(lines, strategy);
        expect(presented.low).toBeLessThanOrEqual(final.sellingPrice);
        expect(presented.high).toBeGreaterThanOrEqual(final.sellingPrice);
        /* Bounds are uncertainty, never a different cost model. */
        expect(presented.high).toBeGreaterThan(presented.low);
      });

      it(`${name} / ${strategy.method}: recommended level equals the final estimate`, () => {
        const levels = buildPreliminaryLevels(lines, CONFIG, strategy);
        const final = canonicalSellingPrice(lines, CONFIG, strategy);
        expect(levels.levels.recommended.sellingPrice).toBeCloseTo(final.sellingPrice, 2);
        expect(levels.levels.economy.sellingPrice).toBeLessThan(levels.levels.recommended.sellingPrice);
        expect(levels.levels.premium.sellingPrice).toBeGreaterThan(levels.levels.recommended.sellingPrice);
        /* Quality tiers move COST, they never re-mark-up the price. */
        expect(levels.pricingSnapshot.method).toBe(strategy.method);
      });
    }
  }
});

describe("pricing method mutual exclusivity across both paths", () => {
  it("target gross margin suppresses overhead/profit in preliminary and final alike", () => {
    const lines = TRADES[1]!.lines;
    const levels = buildPreliminaryLevels(lines, CONFIG, TGM);
    expect(levels.pricingSnapshot.overheadPct).toBe(0);
    expect(levels.pricingSnapshot.profitPct).toBe(0);
    const op = canonicalSellingPrice(lines, CONFIG, OP).sellingPrice;
    const tgm = canonicalSellingPrice(lines, CONFIG, TGM).sellingPrice;
    expect(op).not.toBeCloseTo(tgm, 2);
    /* And neither path double-applies: price is monotonic in the margin. */
    const tighter = canonicalSellingPrice(lines, CONFIG, { ...TGM, targetGrossMarginPct: 20 }).sellingPrice;
    expect(tighter).toBeLessThan(tgm);
  });
});

describe("labor hour semantics: per-unit productivity vs total hours", () => {
  it("derived hours scale with quantity; contractor totals never do", () => {
    const derived = recomputeForQuantity(
      { id: "d1", quantity: 100, unitKey: "square_foot", laborHoursPerUnit: 0.02, laborRate: 65 },
      250,
    );
    expect(derived.totalLaborHours).toBeCloseTo(5, 6);

    const confirmed = recomputeForQuantity(
      {
        id: "d2",
        quantity: 1,
        unitKey: "each",
        laborHours: 0.1,
        laborHoursBasis: "contractor",
        laborRate: 65,
      },
      40,
    );
    /* A deliberate contractor entry survives a quantity change, on the quarter-hour grid. */
    expect(confirmed.totalLaborHours).toBe(0.25);
    expect(confirmed.isLaborContractorOwned).toBe(true);
  });

  it("a per-unit rate stored as a total is a semantic finding, not a magnitude one", () => {
    const suspect = normalizeLine({
      id: "s1",
      quantity: 1039,
      unitKey: "square_foot",
      laborHours: 0.011,
      laborHoursPerUnit: 0.011,
      laborRate: 65,
    });
    expect(suspect.findings.some((f) => f.code === "per_unit_hours_stored_as_total")).toBe(true);

    /* Same shape, but the contractor owns the number: left alone. */
    const owned = normalizeLine({
      id: "s2",
      quantity: 1039,
      unitKey: "square_foot",
      laborHours: 0.011,
      laborHoursPerUnit: 0.011,
      laborHoursBasis: "contractor",
      laborRate: 65,
    });
    expect(owned.totalLaborHours).toBe(0.25);
  });

  it("setup time is added once, never per unit", () => {
    const l = normalizeLine({
      id: "s3",
      quantity: 10,
      unitKey: "each",
      laborHoursPerUnit: 0.5,
      laborHoursSetup: 2,
      laborRate: 65,
    });
    expect(l.totalLaborHours).toBeCloseTo(2 + 10 * 0.5, 6);
  });
});

describe("unit semantics and conversions", () => {
  it("converts within a dimension and keeps the priced value stable", () => {
    expect(convertBetweenUnits(2400, "square_foot", "roofing_square")).toBeCloseTo(24, 6);
    const perSf = line({ id: "u1", quantity: 2400, unitKey: "square_foot", materialCost: 2.1, laborHoursPerUnit: 0.02 });
    const perSquare = line({ id: "u2", quantity: 24, unitKey: "roofing_square", materialCost: 210, laborHoursPerUnit: 2 });
    const a = canonicalSellingPrice([perSf], CONFIG, OP);
    const b = canonicalSellingPrice([perSquare], CONFIG, OP);
    expect(a.sellingPrice).toBeCloseTo(b.sellingPrice, 2);
    expect(a.laborHours).toBeCloseTo(b.laborHours, 6);
  });

  it("flags a quantity whose unit does not match its productivity unit", () => {
    const mismatch = normalizeLine({
      id: "u3",
      quantity: 120,
      unitKey: "linear_foot",
      laborHoursPerUnit: 0.02,
      productivityUnitKey: "square_foot",
      laborRate: 65,
    });
    expect(mismatch.findings.some((f) => f.code === "unit_mismatch_with_productivity")).toBe(true);
  });
});

describe("legitimate change produces an explainable delta, not drift", () => {
  it("a quantity change is itemized rather than absorbed", () => {
    const before = TRADES[2]!.lines;
    const after = before.map((l) => (l.id === "ba1" ? { ...l, quantity: 96 } : l));
    const prelim = canonicalSellingPrice(before, CONFIG, OP);
    const final = canonicalSellingPrice(after, CONFIG, OP);

    const recon = reconcilePreliminaryToFinal({
      preliminary: prelim.sellingPrice,
      final: final.sellingPrice,
      preliminaryInputs: {
        strategy: OP,
        laborRate: 65,
        taxRatePct: 0,
        subjectIds: before.map((l) => l.id),
        quantities: Object.fromEntries(before.map((l) => [l.id, l.quantity])),
      },
      finalInputs: {
        strategy: OP,
        laborRate: 65,
        taxRatePct: 0,
        subjectIds: after.map((l) => l.id),
        quantities: Object.fromEntries(after.map((l) => [l.id, l.quantity])),
      },
    });

    expect(recon.reconciles).toBe(false);
    expect(recon.isUnexplained).toBe(false);
    expect(recon.reasons.some((r) => r.code === "quantity_changed")).toBe(true);
  });

  it("an unchanged input set reconciles exactly and records no drivers", () => {
    const lines = TRADES[0]!.lines;
    const priced = canonicalSellingPrice(lines, CONFIG, TGM);
    const snapshot = buildReconciliationSnapshot({
      selectedLevel: "recommended",
      preliminary: { sellingPrice: priced.sellingPrice, directCost: priced.directCost, laborHours: priced.laborHours },
      final: { sellingPrice: priced.sellingPrice, directCost: priced.directCost, laborHours: priced.laborHours },
      pricingSnapshot: buildPreliminaryLevels(lines, CONFIG, TGM).pricingSnapshot,
    });
    expect(snapshot.reconciles).toBe(true);
    expect(snapshot.deltaDrivers).toHaveLength(0);
    expect(snapshot.internalOnly).toBe(true);
  });

  it("an unexplained gap is reported as a defect, never hidden", () => {
    const snapshot = buildReconciliationSnapshot({
      selectedLevel: "recommended",
      preliminary: { sellingPrice: 4325.76, directCost: 3200, laborHours: 40 },
      final: { sellingPrice: 9100, directCost: 7000, laborHours: 80 },
      pricingSnapshot: buildPreliminaryLevels(TRADES[3]!.lines, CONFIG, OP).pricingSnapshot,
    });
    expect(snapshot.reconciles).toBe(false);
    expect(snapshot.deltaDrivers[0]?.code).toBe("unexplained");
  });
});

describe("stale preliminary snapshots cannot pass as current", () => {
  it("an unstamped legacy snapshot reads as stale", () => {
    expect(isBallparkSnapshotStale({ band: { low: 2600, expected: 4325.76, high: 6300 } })).toBe(true);
  });

  it("a snapshot at the current engine version is current", () => {
    expect(
      isBallparkSnapshotStale({ engineVersion: BALLPARK_ENGINE_VERSION, band: { low: 1, expected: 2, high: 3 } }),
    ).toBe(false);
  });
});

describe("no cross-project contamination", () => {
  it("pricing one project's lines never reads another project's inputs", () => {
    const a = TRADES[0]!.lines;
    const b = TRADES[5]!.lines;
    const aAlone = canonicalSellingPrice(a, CONFIG, OP).sellingPrice;
    const bAlone = canonicalSellingPrice(b, CONFIG, OP).sellingPrice;
    const together = canonicalSellingPrice([...a, ...b], CONFIG, OP).sellingPrice;
    expect(together).toBeCloseTo(aAlone + bAlone, 2);
    /* Re-pricing A after B leaves A identical: no shared mutable state. */
    expect(canonicalSellingPrice(a, CONFIG, OP).sellingPrice).toBeCloseTo(aAlone, 2);
  });
});

describe("preliminary bridge: persisted, itemized explanation", () => {
  const cfg: EstimateEngineConfig = { currency: "USD", taxRatePct: 0 };

  it("identical inputs reconcile with no drivers", () => {
    const lines = TRADES[4]!.lines;
    const priced = canonicalSellingPrice(lines, cfg, OP);
    const bridge = buildPreliminaryBridge({
      preliminary: { sellingPrice: priced.sellingPrice, engineVersion: BALLPARK_ENGINE_VERSION },
      lines,
      config: cfg,
      strategy: OP,
      currentEngineVersion: BALLPARK_ENGINE_VERSION,
    });
    expect(bridge.snapshot.reconciles).toBe(true);
    expect(bridge.snapshot.deltaDrivers).toHaveLength(0);
    expect(bridge.preliminaryIsCurrent).toBe(true);
  });

  it("a stale band is reported as stale and never passes as current", () => {
    const lines = TRADES[1]!.lines;
    const priced = canonicalSellingPrice(lines, cfg, OP);
    const bridge = buildPreliminaryBridge({
      preliminary: { sellingPrice: priced.sellingPrice, engineVersion: 1 },
      lines,
      config: cfg,
      strategy: OP,
      currentEngineVersion: BALLPARK_ENGINE_VERSION,
    });
    expect(bridge.preliminaryIsCurrent).toBe(false);
    expect(bridge.snapshot.deltaDrivers.some((d) => d.code === "preliminary_snapshot_stale")).toBe(true);
  });

  it("a ballpark with no detailed lines is explained, not scored as a defect", () => {
    const bridge = buildPreliminaryBridge({
      preliminary: { sellingPrice: 4325.76, low: 2600, high: 6300, engineVersion: 1 },
      lines: [],
      config: cfg,
      strategy: OP,
      currentEngineVersion: BALLPARK_ENGINE_VERSION,
    });
    const codes = bridge.snapshot.deltaDrivers.map((d) => d.code);
    expect(codes).toContain("no_detailed_scope");
    expect(codes).not.toContain("unexplained");
  });

  it("a pricing-method switch after the preliminary is itemized", () => {
    const lines = TRADES[0]!.lines;
    const prelim = canonicalSellingPrice(lines, cfg, OP);
    const bridge = buildPreliminaryBridge({
      preliminary: {
        sellingPrice: prelim.sellingPrice,
        engineVersion: BALLPARK_ENGINE_VERSION,
        strategy: OP,
        laborRate: 65,
        taxRatePct: 0,
      },
      lines,
      config: cfg,
      strategy: TGM,
      laborRate: 65,
      currentEngineVersion: BALLPARK_ENGINE_VERSION,
    });
    expect(bridge.snapshot.reconciles).toBe(false);
    expect(bridge.snapshot.deltaDrivers.some((d) => d.code === "pricing_method_changed")).toBe(true);
    expect(bridge.snapshot.deltaDrivers.some((d) => d.code === "unexplained")).toBe(false);
  });

  it("a confirmed quantity change invalidates the preliminary and is itemized", () => {
    const before = TRADES[5]!.lines;
    const after = before.map((l) => ({ ...l, quantity: l.quantity * 2 }));
    const prelim = canonicalSellingPrice(before, cfg, OP);
    const bridge = buildPreliminaryBridge({
      preliminary: {
        sellingPrice: prelim.sellingPrice,
        engineVersion: BALLPARK_ENGINE_VERSION,
        strategy: OP,
        subjectIds: before.map((l) => l.id),
        quantities: Object.fromEntries(before.map((l) => [l.id, l.quantity])),
      },
      lines: after,
      config: cfg,
      strategy: OP,
      currentEngineVersion: BALLPARK_ENGINE_VERSION,
    });
    expect(bridge.snapshot.deltaDrivers.some((d) => d.code === "quantity_changed")).toBe(true);
    expect(bridge.final.sellingPrice).toBeCloseTo(canonicalSellingPrice(after, cfg, OP).sellingPrice, 2);
  });

  it("a genuine engine defect surfaces as unexplained", () => {
    const lines = TRADES[2]!.lines;
    const bridge = buildPreliminaryBridge({
      preliminary: { sellingPrice: 999, engineVersion: BALLPARK_ENGINE_VERSION, strategy: OP },
      lines,
      config: cfg,
      strategy: OP,
      currentEngineVersion: BALLPARK_ENGINE_VERSION,
    });
    expect(bridge.snapshot.deltaDrivers.some((d) => d.code === "unexplained")).toBe(true);
  });
});

describe("preliminary bridge: residual attribution from band evidence", () => {
  const cfg: EstimateEngineConfig = { currency: "USD", taxRatePct: 0 };

  it("a band with no recorded inputs reports missing evidence, not a defect", () => {
    const lines = TRADES[3]!.lines;
    const bridge = buildPreliminaryBridge({
      preliminary: { sellingPrice: 12345, engineVersion: BALLPARK_ENGINE_VERSION },
      lines,
      config: cfg,
      strategy: OP,
      currentEngineVersion: BALLPARK_ENGINE_VERSION,
    });
    const codes = bridge.snapshot.deltaDrivers.map((d) => d.code);
    expect(codes).toContain("preliminary_inputs_not_recorded");
    expect(codes).not.toContain("unexplained");
  });

  it("task evidence attributes removed scope, rate changes and a labeled residual", () => {
    const lines = TRADES[0]!.lines;
    const tasks = lines.map((l) => ({
      key: l.id,
      description: l.description,
      quantity: l.quantity,
      unitKey: l.unitKey,
      totalHours: l.laborHours ?? (l.laborHoursPerUnit ?? 0) * l.quantity,
      laborRate: (l.laborRate ?? 65) - 5,
    }));
    tasks.push({
      key: "non_install:mobilization",
      description: "mobilization",
      quantity: 0,
      unitKey: null,
      totalHours: 1,
      laborRate: 60,
    });
    const bridge = buildPreliminaryBridge({
      preliminary: {
        sellingPrice: canonicalSellingPrice(lines, cfg, OP).sellingPrice * 0.7,
        engineVersion: BALLPARK_ENGINE_VERSION,
        strategy: OP,
        laborRate: 60,
        tasks,
      },
      lines,
      config: cfg,
      strategy: OP,
      currentEngineVersion: BALLPARK_ENGINE_VERSION,
    });
    const codes = bridge.snapshot.deltaDrivers.map((d) => d.code);
    expect(codes).toContain("scope_removed");
    expect(codes).toContain("labor_rate_changed");
    const residual = bridge.snapshot.deltaDrivers.find((d) => d.code === "residual_cost_difference");
    expect(residual?.detail).toMatch(/Labor cost/);
    expect(codes).not.toContain("unexplained");
  });

  it("matching task evidence with identical inputs still reconciles cleanly", () => {
    const lines = TRADES[2]!.lines;
    const priced = canonicalSellingPrice(lines, cfg, OP);
    const bridge = buildPreliminaryBridge({
      preliminary: {
        sellingPrice: priced.sellingPrice,
        engineVersion: BALLPARK_ENGINE_VERSION,
        strategy: OP,
        tasks: lines.map((l) => ({
          key: l.id,
          description: l.description,
          quantity: l.quantity,
          unitKey: l.unitKey,
          totalHours: l.laborHours ?? (l.laborHoursPerUnit ?? 0) * l.quantity,
          laborRate: l.laborRate ?? null,
        })),
      },
      lines,
      config: cfg,
      strategy: OP,
      currentEngineVersion: BALLPARK_ENGINE_VERSION,
    });
    expect(bridge.snapshot.reconciles).toBe(true);
    expect(bridge.snapshot.deltaDrivers).toHaveLength(0);
  });
});
