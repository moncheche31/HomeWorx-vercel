/**
 * Workspace-wide estimating REASONING audit and safe backfill.
 *
 * Runs the canonical calculation model (`domains/estimating/canonicalLine`)
 * over every estimate line the caller can see, classes each contradiction, and
 * — only where the line's own evidence proves the corrected value — writes the
 * canonical numbers back. Contractor-confirmed values are never touched.
 *
 * `dryRun` reports without writing.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

import {
  auditEstimateReasoning,
  type EstimateContext,
  type RawLine,
  type ReasoningCode,
} from "@/domains/estimating/canonicalLine";
import { planLineRepair, summarizePlan, type RepairPlanEntry } from "@/domains/estimating/reasoningRepair";
import { buildPreliminaryBridge, type BridgeDriver } from "@/domains/estimating/preliminaryBridge";
import type { EngineLineInput } from "@/domains/estimating/engine/types";
import { pricingStrategyOf } from "@/domains/estimating/pricingStrategy";
import { BALLPARK_ENGINE_VERSION, ballparkSnapshotVersion } from "@/domains/ballpark/engineVersion";
import { readBallparkSummary, findBallparkSnapshot } from "./ballparkSummary";

export const auditReasoningSchema = z.object({
  estimateId: z.string().uuid().optional(),
  dryRun: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export interface ReasoningAuditReport {
  dryRun: boolean;
  estimatesScanned: number;
  linesScanned: number;
  repaired: number;
  flagged: number;
  preserved: number;
  byCode: Record<string, number>;
  entries: (RepairPlanEntry & { estimateId: string })[];
}

type SB = {
  from: (t: string) => any;
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export function toRawLine(row: Record<string, unknown>): RawLine {
  const provenance = (row.pricing_provenance as Record<string, unknown> | null) ?? null;
  return {
    id: String(row.id),
    description: (row.description as string | null) ?? null,
    tradeKey: (row.trade_key as string | null) ?? null,
    quantity: n(row.quantity),
    unitKey: (row.unit_key as string | null) ?? null,
    isQuantityPlaceholder: (row.is_quantity_placeholder as boolean | null) ?? null,
    quantityBasis: (row.quantity_basis as string | null) ?? null,
    quantityReviewedAt: (row.quantity_reviewed_at as string | null) ?? null,
    quantitySourceMeasurementId: (row.quantity_source_measurement_id as string | null) ?? null,
    laborHours: n(row.labor_hours),
    laborHoursPerUnit: row.labor_hours_per_unit == null ? null : n(row.labor_hours_per_unit),
    laborHoursSetup: n(row.labor_hours_setup),
    laborHoursBasis: (row.labor_hours_basis as string | null) ?? null,
    costBasis: (row.cost_basis as string | null) ?? null,
    laborHoursConfirmedAt: (row.labor_hours_confirmed_at as string | null) ?? null,
    productivityUnitKey:
      (provenance?.["unitKey"] as string | undefined) ??
      (provenance?.["productivityUnit"] as string | undefined) ??
      null,
    laborRate: n(row.labor_rate),
    materialCost: n(row.material_cost),
    wasteFactorPct: n((provenance?.["wasteFactorPct"] as number | undefined) ?? 0),
    equipmentCost: n(row.equipment_cost),
    subcontractorCost: n(row.subcontractor_cost),
    otherCost: n(row.other_cost),
    laborTotal: row.labor_total == null ? null : n(row.labor_total),
    materialTotal: row.material_total == null ? null : n(row.material_total),
    equipmentTotal: row.equipment_total == null ? null : n(row.equipment_total),
    subcontractorTotal: row.subcontractor_total == null ? null : n(row.subcontractor_total),
    otherTotal: row.other_total == null ? null : n(row.other_total),
    directCost: row.direct_cost == null ? null : n(row.direct_cost),
    overheadPct: n(row.overhead_pct),
    profitPct: n(row.profit_pct),
    contingencyPct: n(row.contingency_pct),
    pricingSource: (row.pricing_source as string | null) ?? null,
    isPriceOverridden: (row.is_price_overridden as boolean | null) ?? null,
    pricedAt: (row.priced_at as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
    provenance,
  };
}

export function estimateContextOf(estimate: Record<string, unknown>): EstimateContext {
  return {
    laborRate: estimate.default_labor_rate == null ? null : n(estimate.default_labor_rate),
    pricingMethod:
      n(estimate.target_gross_margin_pct) > 0 ? "target_gross_margin" : "overhead_profit",
    contingencyPct: n(estimate.default_contingency_pct),
    taxRatePct: n(estimate.tax_rate),
    inputsChangedAt: null,
  };
}

export const auditEstimateReasoningFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => auditReasoningSchema.parse(d))
  .handler(async ({ data, context }): Promise<ReasoningAuditReport> => {
    const sb = context.supabase as unknown as SB;
    const { data: orgData, error: orgErr } = await sb.rpc("current_active_organization_id");
    if (orgErr) throw new Error("No active organization");
    const org = orgData as string | null;
    if (!org) throw new Error("No active organization");

    let estimateQuery = sb.from("estimates").select("*").eq("organization_id", org);
    if (data.estimateId) estimateQuery = estimateQuery.eq("id", data.estimateId);
    const { data: estimates, error: estErr } = await estimateQuery.limit(data.limit ?? 200);
    if (estErr) throw new Error("Failed to load estimates");

    const rows = (estimates as Record<string, unknown>[]) ?? [];
    const entries: (RepairPlanEntry & { estimateId: string })[] = [];
    const byCode: Record<string, number> = {};
    let linesScanned = 0;

    for (const estimate of rows) {
      const estimateId = String(estimate.id);
      const { data: lineRows } = await sb
        .from("estimate_line_items")
        .select("*")
        .eq("estimate_id", estimateId)
        .is("archived_at", null);
      const raws = ((lineRows as Record<string, unknown>[]) ?? []).map(toRawLine);
      if (raws.length === 0) continue;
      linesScanned += raws.length;

      const audit = auditEstimateReasoning(raws, estimateContextOf(estimate));
      for (const f of audit.findings) byCode[f.code] = (byCode[f.code] ?? 0) + 1;

      for (const line of audit.lines) {
        const raw = raws.find((r) => r.id === line.id)!;
        const plan = planLineRepair(line, raw);
        if (plan.action === "preserved" && plan.codes.length === 0) continue;
        entries.push({ ...plan, estimateId });

        if (!data.dryRun && Object.keys(plan.patch).length > 0) {
          await sb.from("estimate_line_items").update(plan.patch).eq("id", line.id);
        }
      }
    }

    const summary = summarizePlan(entries);
    return {
      dryRun: data.dryRun ?? false,
      estimatesScanned: rows.length,
      linesScanned,
      repaired: summary.repaired,
      flagged: summary.flagged,
      preserved: summary.preserved,
      byCode: byCode as Record<ReasoningCode, number>,
      entries,
    };
  });

/* ------------------------------------------------------------------ *
 * Preliminary -> Final reconciliation
 * ------------------------------------------------------------------ */

export const reconcilePricingSchema = z.object({
  estimateId: z.string().uuid().optional(),
  dryRun: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export interface PricingReconciliationEntry {
  estimateId: string;
  projectId: string | null;
  preliminary: number | null;
  low: number | null;
  high: number | null;
  final: number;
  delta: number;
  reconciles: boolean;
  preliminaryIsCurrent: boolean;
  drivers: BridgeDriver[];
}

export interface PricingReconciliationReport {
  dryRun: boolean;
  estimatesScanned: number;
  reconciled: number;
  explained: number;
  unexplained: number;
  staleBands: number;
  entries: PricingReconciliationEntry[];
}

/**
 * Recomputes every estimate's canonical final selling price, compares it to the
 * band the customer was actually shown, and persists an itemized reconciliation
 * on the estimate. Never edits prices, scope or contractor settings — it only
 * explains. Generic over every project and trade.
 */
export const reconcileEstimatePricingFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reconcilePricingSchema.parse(d))
  .handler(async ({ data, context }): Promise<PricingReconciliationReport> => {
    const sb = context.supabase as unknown as SB;
    const { data: orgData, error: orgErr } = await sb.rpc("current_active_organization_id");
    if (orgErr) throw new Error("No active organization");
    const org = orgData as string | null;
    if (!org) throw new Error("No active organization");

    let query = sb.from("estimates").select("*").eq("organization_id", org);
    if (data.estimateId) query = query.eq("id", data.estimateId);
    const { data: estimates, error } = await query.limit(data.limit ?? 200);
    if (error) throw new Error("Failed to load estimates");

    const rows = (estimates as Record<string, unknown>[]) ?? [];
    const entries: PricingReconciliationEntry[] = [];

    for (const estimate of rows) {
      const estimateId = String(estimate.id);
      /* Strict project isolation: lines are read by this estimate id only. */
      const { data: lineRows } = await sb
        .from("estimate_line_items")
        .select("*")
        .eq("estimate_id", estimateId)
        .is("archived_at", null);

      const lines: EngineLineInput[] = ((lineRows as Record<string, unknown>[]) ?? []).map(
        (row) => {
          const raw = toRawLine(row);
          return {
            id: raw.id,
            description: raw.description ?? raw.id,
            groupLabel: (row.section_label as string | null) ?? null,
            quantity: raw.quantity,
            unitKey: raw.unitKey ?? null,
            laborHours: raw.laborHours ?? null,
            laborHoursPerUnit: raw.laborHoursPerUnit ?? null,
            crewSize: 1,
            laborRate: raw.laborRate ?? 0,
            materialCost: raw.materialCost ?? 0,
            equipmentCost: raw.equipmentCost ?? 0,
            subcontractorCost: raw.subcontractorCost ?? 0,
            otherCost: raw.otherCost ?? 0,
            wasteFactorPct: raw.wasteFactorPct ?? 0,
            overheadPct: raw.overheadPct ?? 0,
            profitPct: raw.profitPct ?? 0,
            contingencyPct: raw.contingencyPct ?? 0,
            isTaxable: Boolean(row.is_taxable),
          } as EngineLineInput;
        },
      );

      const band = readBallparkSummary(estimate.range_snapshot ?? null);
      const snap = findBallparkSnapshot(estimate.range_snapshot ?? null) as Record<
        string,
        unknown
      > | null;

      const bridge = buildPreliminaryBridge({
        preliminary: band
          ? {
              /* The value the contractor actually selected inside the band. */
              sellingPrice: band.selected,
              bandPosition: band.selectedPosition,
              low: band.low,
              high: band.high,
              savedAt: (snap?.savedAt as string | null) ?? null,
              engineVersion: ballparkSnapshotVersion(snap),
              needsReview: snap?.needsReview === true,
              laborRate:
                (snap?.labor as Record<string, unknown> | undefined)?.["laborRate"] == null
                  ? null
                  : n((snap?.labor as Record<string, unknown>)["laborRate"]),
              tasks: Array.isArray((snap?.labor as Record<string, unknown> | undefined)?.["tasks"])
                ? ((snap?.labor as Record<string, unknown>)["tasks"] as Record<string, unknown>[]).map(
                    (t) => ({
                      key: (t.id as string | null) ?? null,
                      description: (t.description as string | null) ?? null,
                      quantity: t.quantity == null ? null : n(t.quantity),
                      unitKey: (t.unitKey as string | null) ?? null,
                      totalHours: t.adjustedHours == null ? null : n(t.adjustedHours),
                      laborRate: t.laborRate == null ? null : n(t.laborRate),
                    }),
                  )
                : null,
            }
          : null,
        lines,
        config: {
          currency: (estimate.currency as string | null) ?? "USD",
          taxRatePct: n(estimate.tax_rate),
        },
        strategy: pricingStrategyOf({
          pricingMethod: estimate.pricing_method,
          targetGrossMarginPct: estimate.target_gross_margin_pct,
          defaultOverheadPct: estimate.default_overhead_pct,
          defaultProfitPct: estimate.default_profit_pct,
        }),
        laborRate: estimate.default_labor_rate == null ? null : n(estimate.default_labor_rate),
        currentEngineVersion: BALLPARK_ENGINE_VERSION,
      });

      entries.push({
        estimateId,
        projectId: (estimate.project_id as string | null) ?? null,
        preliminary: band?.selected ?? null,
        low: band?.low ?? null,
        high: band?.high ?? null,
        final: bridge.final.sellingPrice,
        delta: bridge.delta,
        reconciles: bridge.snapshot.reconciles,
        preliminaryIsCurrent: bridge.preliminaryIsCurrent,
        drivers: bridge.snapshot.deltaDrivers,
      });

      if (!data.dryRun) {
        await sb
          .from("estimates")
          .update({ reconciliation_snapshot: bridge.snapshot as never })
          .eq("id", estimateId);
      }
    }

    return {
      dryRun: data.dryRun ?? false,
      estimatesScanned: rows.length,
      reconciled: entries.filter((e) => e.reconciles).length,
      explained: entries.filter(
        (e) => !e.reconciles && !e.drivers.some((d) => d.code === "unexplained"),
      ).length,
      unexplained: entries.filter((e) => e.drivers.some((d) => d.code === "unexplained")).length,
      staleBands: entries.filter((e) => !e.preliminaryIsCurrent).length,
      entries,
    };
  });
