/**
 * PROVIDER-AGNOSTIC PRICING SOURCE LAYER.
 *
 * The estimator must never care *where* a rate came from, only that the rate
 * carries provenance. Four kinds of source implement one interface:
 *
 *   contractor_custom  the contractor's own rates / overrides (highest rank)
 *   licensed_import    a dataset the organization licensed and imported
 *   internal_curated   our own curated library (sample-grade today)
 *   market_reference   optional advisory data (never authoritative)
 *
 * NO PROPRIETARY DATA IS EMBEDDED HERE. Craftsman, RSMeans and similar
 * datasets are licensed products; this module only provides the import shape
 * so a licensed customer can load their own copy without the estimator
 * changing. Nothing in this repository scrapes or reproduces such data.
 *
 * Pure module — no React, no Supabase, no IO.
 */

import { SAMPLE_PRICEBOOK } from "@/domains/ballpark/pricebook";
import type { BallparkPricebook } from "@/domains/ballpark/types";
import { getHandymanTask } from "./tasks";
import type {
  PricingLookupContext,
  PricingNeededReason,
  PricingSource,
  TaskRate,
  TaskUnit,
} from "./types";

export interface RateResolution {
  rate: TaskRate | null;
  pricingNeeded: boolean;
  reason?: PricingNeededReason;
}

/* ------------------------------------------------------------------ *
 * Internal curated source — built on the existing pricing primitives
 * ------------------------------------------------------------------ */

/**
 * Prices a handyman task through the internal library it already references.
 * A task with no `priceRef` is intentionally unpriceable here.
 */
export function internalCuratedSource(
  pricebook: BallparkPricebook = SAMPLE_PRICEBOOK,
): PricingSource {
  return {
    id: `internal:${pricebook.key}`,
    kind: "internal_curated",
    priority: 20,
    lookup(taskId) {
      const task = getHandymanTask(taskId);
      if (!task?.priceRef) return null;
      const entry = pricebook.get(task.priceRef);
      if (!entry) return null;
      if (entry.unitKey !== task.unit) return null;
      const factor = task.priceFactor ?? 1;
      return {
        unit: task.unit,
        laborHoursPerUnit: entry.laborHoursPerUnit * factor,
        materialCostPerUnit:
          (entry.materialCostPerUnit + (entry.subcontractorCostPerUnit ?? 0)) * factor,
        provenance: {
          sourceId: `internal:${pricebook.key}`,
          kind: "internal_curated",
          market: null,
          effectiveDate: null,
          version: pricebook.key,
          confidence: "medium",
          reviewStatus: pricebook.isSampleData ? "sample" : "validated",
        },
      };
    },
  };
}

/* ------------------------------------------------------------------ *
 * Contractor-custom source
 * ------------------------------------------------------------------ */

export interface ContractorTaskRate {
  taskId: string;
  unit: TaskUnit;
  laborHoursPerUnit?: number;
  materialCostPerUnit?: number;
  /** Flat price or allowance for the whole task. */
  flatAmount?: number;
  market?: string | null;
  effectiveDate?: string | null;
}

/**
 * The contractor's own numbers. Always outranks every baseline source, and can
 * be authored as unit rate, labor hours + material, or a flat allowance.
 */
export function contractorCustomSource(
  rates: readonly ContractorTaskRate[],
  sourceId = "contractor:custom",
): PricingSource {
  const index = new Map(rates.map((r) => [r.taskId, r]));
  return {
    id: sourceId,
    kind: "contractor_custom",
    priority: 100,
    lookup(taskId) {
      const found = index.get(taskId);
      if (!found) return null;
      return {
        unit: found.unit,
        laborHoursPerUnit: found.laborHoursPerUnit ?? 0,
        materialCostPerUnit: found.materialCostPerUnit ?? 0,
        ...(found.flatAmount == null ? {} : { flatAmount: found.flatAmount }),
        provenance: {
          sourceId,
          kind: "contractor_custom",
          market: found.market ?? null,
          effectiveDate: found.effectiveDate ?? null,
          version: null,
          confidence: "high",
          reviewStatus: "contractor_supplied",
        },
      };
    },
  };
}

/* ------------------------------------------------------------------ *
 * Licensed / imported dataset source (shape only — no data ships)
 * ------------------------------------------------------------------ */

export interface ImportedRateRow {
  taskId: string;
  unit: TaskUnit;
  laborHoursPerUnit: number;
  materialCostPerUnit: number;
  market?: string | null;
  effectiveDate?: string | null;
  version?: string | null;
}

export interface ImportedDatasetOptions {
  /** Dataset identifier the organization licensed, e.g. "acme-2026-q1". */
  datasetId: string;
  kind?: Extract<PricingSource["kind"], "licensed_import" | "market_reference">;
  /** Advisory data ranks below our curated library; licensed data above it. */
  priority?: number;
  rows: readonly ImportedRateRow[];
}

export function importedDatasetSource(options: ImportedDatasetOptions): PricingSource {
  const kind = options.kind ?? "licensed_import";
  const index = new Map(options.rows.map((r) => [r.taskId, r]));
  return {
    id: `${kind}:${options.datasetId}`,
    kind,
    priority: options.priority ?? (kind === "licensed_import" ? 60 : 10),
    lookup(taskId, context: PricingLookupContext) {
      const found = index.get(taskId);
      if (!found) return null;
      if (context.market && found.market && context.market !== found.market) return null;
      return {
        unit: found.unit,
        laborHoursPerUnit: found.laborHoursPerUnit,
        materialCostPerUnit: found.materialCostPerUnit,
        provenance: {
          sourceId: `${kind}:${options.datasetId}`,
          kind,
          market: found.market ?? context.market ?? null,
          effectiveDate: found.effectiveDate ?? null,
          version: found.version ?? null,
          confidence: kind === "licensed_import" ? "high" : "low",
          reviewStatus: kind === "licensed_import" ? "imported" : "unreviewed",
        },
      };
    },
  };
}

/* ------------------------------------------------------------------ *
 * Resolution
 * ------------------------------------------------------------------ */

/** Default stack: contractor overrides on top of the curated internal library. */
export function defaultPricingSources(
  contractorRates: readonly ContractorTaskRate[] = [],
  pricebook: BallparkPricebook = SAMPLE_PRICEBOOK,
): PricingSource[] {
  const sources: PricingSource[] = [internalCuratedSource(pricebook)];
  if (contractorRates.length) sources.unshift(contractorCustomSource(contractorRates));
  return sources;
}

/**
 * Highest-priority source that can price the task wins. When nothing can, the
 * caller gets `pricingNeeded` — never a zero and never a guess.
 */
export function resolveTaskRate(
  taskId: string | null | undefined,
  sources: readonly PricingSource[],
  context: PricingLookupContext = {},
): RateResolution {
  const task = getHandymanTask(taskId);
  if (!task) return { rate: null, pricingNeeded: true, reason: "task_unrecognized" };

  const ordered = [...sources].sort((a, b) => b.priority - a.priority);
  let unitMismatch = false;

  for (const source of ordered) {
    const rate = source.lookup(task.id, context);
    if (!rate) continue;
    if (rate.unit !== task.unit && rate.flatAmount == null) {
      unitMismatch = true;
      continue;
    }
    return { rate, pricingNeeded: false };
  }

  return {
    rate: null,
    pricingNeeded: true,
    reason: unitMismatch ? "unit_mismatch" : "no_source_rate",
  };
}
