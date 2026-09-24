/**
 * Preliminary -> Final bridge.
 *
 * ONE place decides whether a saved preliminary band still reconciles with the
 * estimate's canonical selling price, and — when it does not — names every
 * driver of the difference. Nothing here re-implements cost math: the final
 * value always comes from `canonicalSellingPrice`, the preliminary value always
 * comes from the saved band that was actually shown to the customer.
 *
 * Trade-agnostic and pure: no React, no Supabase, no i18n, no IO.
 */

import type { EngineLineInput, EstimateEngineConfig } from "./engine/types";
import type { PricingStrategy } from "./pricingStrategy";
import { roundMoney as money } from "./money";
import {
  canonicalSellingPrice,
  buildReconciliationSnapshot,
  type PreliminaryLevel,
  type ReconciliationSnapshot,
} from "./preliminaryLevels";
import {
  DEFAULT_BALLPARK_BAND_POSITION,
  type BallparkBandPosition,
} from "./ballparkPosition";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/** Every reason a preliminary and a final are allowed to disagree. */
export type BridgeDriverCode =
  | "no_preliminary"
  | "no_detailed_scope"
  | "preliminary_snapshot_stale"
  | "preliminary_needs_review"
  | "pricing_method_changed"
  | "target_margin_changed"
  | "overhead_or_profit_changed"
  | "labor_rate_changed"
  | "tax_changed"
  | "scope_added"
  | "scope_removed"
  | "quantity_changed"
  | "labor_hours_changed"
  | "preliminary_inputs_not_recorded"
  | "residual_cost_difference"
  | "unexplained";

export interface BridgeDriver {
  code: BridgeDriverCode;
  detail?: string;
  amount?: number;
}

/** What the customer was shown, and under which settings. */
export interface PreliminaryRecord {
  sellingPrice: number | null;
  low?: number | null;
  high?: number | null;
  savedAt?: string | null;
  /** Snapshot engine version; below current means the conclusions are stale. */
  engineVersion?: number | null;
  needsReview?: boolean | null;
  level?: PreliminaryLevel;
  /**
   * Where inside the band the contractor actually sold. Distinct from `level`
   * (finish/allowance quality): this is the PRICE POSITION.
   */
  bandPosition?: BallparkBandPosition;
  /** Pricing settings in force when the band was saved, when recorded. */
  strategy?: PricingStrategy | null;
  laborRate?: number | null;
  taxRatePct?: number | null;
  /** Subjects and quantities the band was priced from, when recorded. */
  subjectIds?: string[] | null;
  quantities?: Record<string, number> | null;
  /**
   * The labor tasks the band was priced from, when the snapshot recorded them.
   * Matched to the current lines by description so a band saved before the
   * detailed lines existed can still be attributed.
   */
  tasks?: PreliminaryTask[] | null;
}

/** One labor-bearing subject as the preliminary priced it. */
export interface PreliminaryTask {
  key?: string | null;
  description?: string | null;
  quantity?: number | null;
  unitKey?: string | null;
  totalHours?: number | null;
  laborRate?: number | null;
}

const normalizeKey = (v: string | null | undefined): string =>
  String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");

export interface BridgeInput {
  preliminary: PreliminaryRecord | null;
  /** Current detailed lines. Empty means there is no final number yet. */
  lines: EngineLineInput[];
  config: EstimateEngineConfig;
  strategy: PricingStrategy | null | undefined;
  laborRate?: number | null;
  /** Current engine version, so a stale band cannot pass as current. */
  currentEngineVersion?: number;
  now?: () => Date;
}

export interface BridgeResult {
  snapshot: ReconciliationSnapshot & { deltaDrivers: BridgeDriver[] };
  /** Convenience: the canonical final numbers this bridge priced. */
  final: { sellingPrice: number; directCost: number; laborHours: number };
  /** True when the preliminary may still be presented as current. */
  preliminaryIsCurrent: boolean;
  delta: number;
}

function settingsDrivers(prelim: PreliminaryRecord, input: BridgeInput): BridgeDriver[] {
  const drivers: BridgeDriver[] = [];
  const before = prelim.strategy;
  const after = input.strategy;
  if (before && after) {
    if (before.method !== after.method) {
      drivers.push({
        code: "pricing_method_changed",
        detail: `${before.method} -> ${after.method}`,
      });
    } else if (after.method === "target_gross_margin") {
      if (round2(before.targetGrossMarginPct) !== round2(after.targetGrossMarginPct)) {
        drivers.push({
          code: "target_margin_changed",
          detail: `${round2(before.targetGrossMarginPct)}% -> ${round2(after.targetGrossMarginPct)}%`,
        });
      }
    } else if (
      round2(before.overheadPct) !== round2(after.overheadPct) ||
      round2(before.profitPct) !== round2(after.profitPct)
    ) {
      drivers.push({
        code: "overhead_or_profit_changed",
        detail: `${round2(before.overheadPct)}/${round2(before.profitPct)} -> ${round2(after.overheadPct)}/${round2(after.profitPct)}`,
      });
    }
  }
  if (
    prelim.laborRate != null &&
    input.laborRate != null &&
    round2(prelim.laborRate) !== round2(input.laborRate)
  ) {
    drivers.push({
      code: "labor_rate_changed",
      detail: `${round2(prelim.laborRate)} -> ${round2(input.laborRate)}`,
    });
  }
  const taxBefore = prelim.taxRatePct;
  const taxAfter = input.config.taxRatePct;
  if (taxBefore != null && taxAfter != null && round2(taxBefore) !== round2(taxAfter)) {
    drivers.push({ code: "tax_changed", detail: `${round2(taxBefore)}% -> ${round2(taxAfter)}%` });
  }
  return drivers;
}

/**
 * Attribution from the band's own task evidence: which subjects moved, whether
 * their quantities, hours or rates changed, and what money is left over. A
 * residual is reported as a residual — never as "nothing changed".
 */
function taskDrivers(tasks: PreliminaryTask[], lines: EngineLineInput[]): BridgeDriver[] {
  const drivers: BridgeDriver[] = [];
  const byDesc = new Map<string, EngineLineInput>();
  for (const l of lines) byDesc.set(normalizeKey(l.description ?? l.id), l);

  const matched: { task: PreliminaryTask; line: EngineLineInput }[] = [];
  const missing: PreliminaryTask[] = [];
  for (const t of tasks) {
    const line = byDesc.get(normalizeKey(t.description));
    if (line) matched.push({ task: t, line });
    else missing.push(t);
  }
  const matchedIds = new Set(matched.map((m) => m.line.id));
  const added = lines.filter((l) => !matchedIds.has(l.id));

  if (missing.length > 0) {
    drivers.push({
      code: "scope_removed",
      amount: missing.length,
      detail: missing.map((t) => t.description ?? t.key ?? "?").slice(0, 8).join(", "),
    });
  }
  if (added.length > 0) {
    drivers.push({
      code: "scope_added",
      amount: added.length,
      detail: added.map((l) => l.description ?? l.id).slice(0, 8).join(", "),
    });
  }

  let qtyChanged = 0;
  let hoursDelta = 0;
  let rateChanged = 0;
  for (const { task, line } of matched) {
    if (task.quantity != null && round2(task.quantity) !== round2(line.quantity)) qtyChanged += 1;
    const finalHours =
      line.laborHours != null
        ? line.laborHours
        : (line.laborHoursPerUnit ?? 0) * line.quantity;
    if (task.totalHours != null) hoursDelta += round2(finalHours - task.totalHours);
    if (
      task.laborRate != null &&
      line.laborRate != null &&
      round2(task.laborRate) !== round2(line.laborRate)
    ) {
      rateChanged += 1;
    }
  }
  if (qtyChanged > 0) drivers.push({ code: "quantity_changed", amount: qtyChanged });
  if (Math.abs(hoursDelta) >= 0.05) {
    drivers.push({ code: "labor_hours_changed", amount: round2(hoursDelta) });
  }
  if (rateChanged > 0) {
    drivers.push({
      code: "labor_rate_changed",
      amount: rateChanged,
      detail: "Line labor rates differ from the rate the preliminary was priced at.",
    });
  }
  return drivers;
}

/** Split the leftover money into labor versus everything else, so the residual is readable. */
function residualDetail(prelim: PreliminaryRecord, lines: EngineLineInput[]): string | undefined {
  const tasks = prelim.tasks ?? [];
  if (tasks.length === 0) return undefined;
  const prelimLabor = tasks.reduce(
    (sum, t) => sum + (t.totalHours ?? 0) * (t.laborRate ?? prelim.laborRate ?? 0),
    0,
  );
  const finalLabor = lines.reduce((sum, l) => {
    const hours = l.laborHours != null ? l.laborHours : (l.laborHoursPerUnit ?? 0) * l.quantity;
    return sum + hours * (l.laborRate ?? 0);
  }, 0);
  const finalNonLabor = lines.reduce(
    (sum, l) =>
      sum +
      (l.materialCost ?? 0) * (l.quantity || 0) +
      (l.equipmentCost ?? 0) +
      (l.subcontractorCost ?? 0) +
      (l.otherCost ?? 0),
    0,
  );
  return `Labor cost ${round2(prelimLabor)} -> ${round2(finalLabor)}; non-labor direct cost now ${round2(finalNonLabor)}.`;
}

function scopeDrivers(prelim: PreliminaryRecord, lines: EngineLineInput[]): BridgeDriver[] {
  const drivers: BridgeDriver[] = [];
  if (!prelim.subjectIds || prelim.subjectIds.length === 0) return drivers;
  const before = new Set(prelim.subjectIds);
  const after = new Set(lines.map((l) => l.id));
  const added = [...after].filter((id) => !before.has(id));
  const removed = [...before].filter((id) => !after.has(id));
  if (added.length > 0) drivers.push({ code: "scope_added", amount: added.length });
  if (removed.length > 0) drivers.push({ code: "scope_removed", amount: removed.length });

  if (prelim.quantities) {
    let changed = 0;
    for (const line of lines) {
      const was = prelim.quantities[line.id];
      if (was != null && round2(was) !== round2(line.quantity)) changed += 1;
    }
    if (changed > 0) drivers.push({ code: "quantity_changed", amount: changed });
  }
  return drivers;
}

/**
 * Decide whether the saved preliminary still reconciles with the canonical
 * final selling price, and produce the audit record either way.
 */
export function buildPreliminaryBridge(input: BridgeInput): BridgeResult {
  const final = canonicalSellingPrice(input.lines, input.config, input.strategy);
  const prelim = input.preliminary;
  const drivers: BridgeDriver[] = [];

  const stale =
    prelim != null &&
    input.currentEngineVersion != null &&
    (prelim.engineVersion ?? 1) < input.currentEngineVersion;

  if (prelim == null || prelim.sellingPrice == null || !(prelim.sellingPrice > 0)) {
    drivers.push({
      code: "no_preliminary",
      detail: "No saved preliminary band to reconcile against.",
    });
  } else {
    if (stale) {
      drivers.push({
        code: "preliminary_snapshot_stale",
        detail: `Band was produced by engine v${prelim.engineVersion ?? 1}; current engine is v${input.currentEngineVersion}. It must be recomputed before it is presented as current.`,
      });
    }
    if (prelim.needsReview) {
      drivers.push({
        code: "preliminary_needs_review",
        detail: "The saved band is already flagged for contractor review.",
      });
    }
  }

  if (input.lines.length === 0) {
    drivers.push({
      code: "no_detailed_scope",
      detail: "No detailed lines exist yet, so there is no final selling price to compare.",
    });
  } else if (prelim != null) {
    drivers.push(...settingsDrivers(prelim, input));
    drivers.push(...scopeDrivers(prelim, input.lines));
    if (prelim.tasks && prelim.tasks.length > 0) {
      drivers.push(...taskDrivers(prelim.tasks, input.lines));
    }
  }

  const preliminaryValue = prelim?.sellingPrice ?? 0;
  const delta = money(final.sellingPrice - preliminaryValue);
  const tolerance = Math.max(1, Math.abs(preliminaryValue) * 0.005);

  if (
    prelim != null &&
    input.lines.length > 0 &&
    Math.abs(delta) > tolerance &&
    drivers.length === 0
  ) {
    /*
     * Nothing in the band records what it was priced from. That is missing
     * evidence, not proof of an engine defect — say so plainly instead of
     * either hiding the gap or crying "unexplained".
     */
    const hasEvidence =
      (prelim.tasks?.length ?? 0) > 0 ||
      (prelim.subjectIds?.length ?? 0) > 0 ||
      prelim.strategy != null;
    drivers.push(
      hasEvidence
        ? { code: "unexplained", amount: delta }
        : {
            code: "preliminary_inputs_not_recorded",
            amount: delta,
            detail:
              "The saved band does not record the scope, quantities or pricing settings it was priced from, so the difference cannot be attributed line by line. Recompute the preliminary to re-establish the audit trail.",
          },
    );
  } else if (prelim != null && input.lines.length > 0 && Math.abs(delta) > tolerance) {
    drivers.push({
      code: "residual_cost_difference",
      amount: delta,
      detail: residualDetail(prelim, input.lines),
    });
  }

  const snapshot = buildReconciliationSnapshot({
    selectedLevel: prelim?.level ?? "recommended",
    selectedBandPosition: prelim?.bandPosition ?? DEFAULT_BALLPARK_BAND_POSITION,
    preliminary: { sellingPrice: money(preliminaryValue), directCost: 0, laborHours: 0 },
    final,
    pricingSnapshot: {
      method: input.strategy?.method ?? "overhead_profit",
      targetGrossMarginPct: input.strategy?.targetGrossMarginPct ?? 0,
      overheadPct: input.strategy?.method === "target_gross_margin" ? 0 : (input.strategy?.overheadPct ?? 0),
      profitPct: input.strategy?.method === "target_gross_margin" ? 0 : (input.strategy?.profitPct ?? 0),
      taxRatePct: input.config.taxRatePct ?? 0,
      currency: input.config.currency,
    },
    deltaDrivers: drivers,
    now: input.now,
  }) as ReconciliationSnapshot & { deltaDrivers: BridgeDriver[] };

  return {
    snapshot,
    final,
    preliminaryIsCurrent: prelim != null && !stale && prelim.needsReview !== true,
    delta: money(final.sellingPrice - preliminaryValue),
  };
}
