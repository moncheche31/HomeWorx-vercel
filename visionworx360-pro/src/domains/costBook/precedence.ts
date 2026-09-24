/**
 * Cost Book precedence resolution.
 *
 * ONE rule, applied per field:
 *   contractor manual line cost
 *     > this-estimate override
 *     > company Cost Book override
 *     > jurisdiction schedule (permits)
 *     > VisionWorx catalog baseline
 *
 * The baseline is NEVER mutated or discarded: every layer is kept so the
 * contractor can see what VisionWorx uses, what their company uses, what this
 * estimate uses, and which one is actually in effect.
 *
 * Pure module — no React, no IO.
 */

import {
  COST_BOOK_PRECEDENCE,
  type CostBookField,
  type CostBookSource,
  type CostBookValues,
  type EffectiveValue,
  type EffectiveValueMap,
} from "./types";

const COST_BOOK_FIELDS: readonly CostBookField[] = [
  "hoursPerUnit",
  "setupHours",
  "minTaskHours",
  "laborRate",
  "materialUnitCost",
  "wasteFactor",
  "crewSize",
  "equipmentCost",
  "otherCost",
  "directUnitCost",
] as const;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export interface PrecedenceLayers {
  /** VisionWorx catalog baseline — always present for KB-priced tasks. */
  catalogBaseline?: CostBookValues | null;
  /** Verified local schedule (permit fee schedules today). */
  jurisdiction?: CostBookValues | null;
  /** Organization Cost Book default. */
  companyOverride?: CostBookValues | null;
  /** Override scoped to this estimate only. */
  estimateOverride?: CostBookValues | null;
  /** Contractor typed the number directly on the line — always authoritative. */
  lineManual?: CostBookValues | null;
}

const layerFor = (layers: PrecedenceLayers, source: CostBookSource): CostBookValues | null => {
  switch (source) {
    case "line_manual":
      return layers.lineManual ?? null;
    case "estimate_override":
      return layers.estimateOverride ?? null;
    case "company_override":
      return layers.companyOverride ?? null;
    case "jurisdiction":
      return layers.jurisdiction ?? null;
    case "catalog_baseline":
      return layers.catalogBaseline ?? null;
    default:
      return null;
  }
};

/** Resolve one field across every layer, keeping the full stack for display. */
export function resolveField(field: CostBookField, layers: PrecedenceLayers): EffectiveValue {
  const stack: EffectiveValue["stack"] = [];
  let winner: { source: CostBookSource; value: number | null } | null = null;

  for (const source of COST_BOOK_PRECEDENCE) {
    const value = num(layerFor(layers, source)?.[field]);
    if (value === null) continue;
    stack.push({ source, value });
    if (!winner) winner = { source, value };
  }

  return {
    field,
    value: winner?.value ?? null,
    source: winner?.source ?? "none",
    stack,
  };
}

/** Resolve every Cost Book field. */
export function resolveEffectiveValues(layers: PrecedenceLayers): EffectiveValueMap {
  const out: EffectiveValueMap = {};
  for (const field of COST_BOOK_FIELDS) out[field] = resolveField(field, layers);
  return out;
}

/** Flatten to the plain values the pricing engine consumes. */
export function effectiveValues(layers: PrecedenceLayers): CostBookValues {
  const resolved = resolveEffectiveValues(layers);
  const out: CostBookValues = {};
  for (const field of COST_BOOK_FIELDS) {
    const v = resolved[field]?.value ?? null;
    if (v !== null) out[field] = v;
  }
  return out;
}

/** Per-field source labels, for stamping provenance onto the line. */
export function effectiveSources(
  layers: PrecedenceLayers,
): Partial<Record<CostBookField, CostBookSource>> {
  const resolved = resolveEffectiveValues(layers);
  const out: Partial<Record<CostBookField, CostBookSource>> = {};
  for (const field of COST_BOOK_FIELDS) {
    const source = resolved[field]?.source ?? "none";
    if (source !== "none") out[field] = source;
  }
  return out;
}

/**
 * The next source that takes effect when the given layer is reset. Used by the
 * revert controls so the contractor knows exactly what they fall back to.
 */
export function nextSourceAfterReset(
  field: CostBookField,
  layers: PrecedenceLayers,
  resetting: CostBookSource,
): CostBookSource {
  const stripped: PrecedenceLayers = { ...layers };
  if (resetting === "estimate_override") stripped.estimateOverride = null;
  if (resetting === "company_override") stripped.companyOverride = null;
  if (resetting === "line_manual") stripped.lineManual = null;
  return resolveField(field, stripped).source;
}

export { COST_BOOK_FIELDS };
