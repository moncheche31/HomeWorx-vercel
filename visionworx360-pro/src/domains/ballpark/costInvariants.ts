/**
 * COST-BASIS INVARIANTS FOR THE SCOPE PRICING PATH.
 *
 * The detailed estimate enforces these in the database (triggers on
 * `estimate_line_items`). The scope-driven ballpark path was bypassing them
 * entirely, which is how a permit line carried 2 hours of carpenter labor and
 * structural engineering was billed at the company labor rate.
 *
 * Two invariants, applied to every engine line the scope pricer produces:
 *
 *  1. PERMITS AND FEES CARRY ZERO LABOR. A jurisdiction fee is a direct cost.
 *     Any labor money the pricebook attached to it becomes an "other" direct
 *     cost so the money survives while the hours do not.
 *  2. PROFESSIONAL SERVICES ARE NOT TRADE LABOR. Engineering, design, drafting
 *     and inspection reports are subcontract / other direct costs, never hours
 *     at the company carpenter rate.
 *
 * Pure module: no React, no Supabase, no i18n, no IO.
 */

import type { EngineLineInput } from "@/domains/estimating";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/** Pricebook / assembly key prefixes that are pure fees. */
export const FEE_KEY_PREFIXES = ["permits.", "permit.", "fees.", "inspection."];

/** Pricebook / assembly key prefixes that are professional services. */
export const PROFESSIONAL_KEY_PREFIXES = [
  "structural.engineering",
  "engineering.",
  "design.",
  "architect",
  "drafting",
];

const FEE_TEXT = /\b(permit|permits|permitting|inspection fee|impact fee|plan check)\b/i;
const PROFESSIONAL_TEXT = /\b(engineer|engineering|architect|architectural|structural calc\w*|drafting|design fee|title 24)\b/i;

const matchesPrefix = (key: string, prefixes: readonly string[]) =>
  prefixes.some((p) => key.startsWith(p));

export type CostInvariantKind = "fee" | "professional" | null;

/**
 * Classify a scope-priced line. `itemKey` is authoritative; the description is
 * only consulted when the key says nothing useful.
 */
export function classifyCostInvariant(input: {
  itemKey?: string | null;
  description?: string | null;
}): CostInvariantKind {
  const key = String(input.itemKey ?? "").toLowerCase();
  if (key && matchesPrefix(key, FEE_KEY_PREFIXES)) return "fee";
  if (key && matchesPrefix(key, PROFESSIONAL_KEY_PREFIXES)) return "professional";

  const text = String(input.description ?? "");
  if (PROFESSIONAL_TEXT.test(text)) return "professional";
  if (FEE_TEXT.test(text)) return "fee";
  return null;
}

export interface InvariantAppliedLine {
  line: EngineLineInput;
  kind: CostInvariantKind;
  /** Labor money that was reclassified as a direct cost, if any. */
  reclassifiedAmount: number;
}

/**
 * Apply the invariants to one line.
 *
 * The line's own hourly value is converted to money BEFORE the hours are
 * zeroed, so a permit allowance keeps its dollars and loses its hours.
 */
export function applyCostInvariant(
  line: EngineLineInput,
  itemKey?: string | null,
): InvariantAppliedLine {
  const kind = classifyCostInvariant({ itemKey, description: line.description });
  if (!kind) return { line, kind: null, reclassifiedAmount: 0 };

  const perUnitHours =
    line.laborHoursPerUnit != null
      ? Number(line.laborHoursPerUnit)
      : line.laborHours != null && line.quantity > 0
        ? Number(line.laborHours) / line.quantity
        : 0;
  const laborMoneyPerUnit = round2(Math.max(0, perUnitHours) * Number(line.laborRate ?? 0));

  const target = kind === "fee" ? "otherCost" : "subcontractorCost";
  const next: EngineLineInput = {
    ...line,
    laborHours: 0,
    laborHoursPerUnit: null,
    productionRate: null,
    [target]: round2(Number(line[target] ?? 0) + laborMoneyPerUnit),
  } as EngineLineInput;

  return {
    line: next,
    kind,
    reclassifiedAmount: round2(laborMoneyPerUnit * Math.max(0, line.quantity)),
  };
}

export interface CostInvariantReport {
  lines: EngineLineInput[];
  /** Line ids forced to zero labor because they are fees. */
  feeLineIds: string[];
  /** Line ids moved off trade labor because they are professional services. */
  professionalLineIds: string[];
  reclassifiedAmount: number;
}

/**
 * Apply the invariants across a whole scope-priced line set.
 * `keyOf` maps a line id to its pricebook key (`"<itemId>:<itemKey>"` by
 * default in the scope pricer).
 */
export function applyCostInvariants(
  lines: readonly EngineLineInput[],
  keyOf: (line: EngineLineInput) => string | null = (line) =>
    line.id.includes(":") ? line.id.slice(line.id.indexOf(":") + 1) : null,
): CostInvariantReport {
  const out: EngineLineInput[] = [];
  const feeLineIds: string[] = [];
  const professionalLineIds: string[] = [];
  let reclassifiedAmount = 0;

  for (const line of lines) {
    const applied = applyCostInvariant(line, keyOf(line));
    out.push(applied.line);
    if (applied.kind === "fee") feeLineIds.push(line.id);
    if (applied.kind === "professional") professionalLineIds.push(line.id);
    reclassifiedAmount += applied.reclassifiedAmount;
  }

  return { lines: out, feeLineIds, professionalLineIds, reclassifiedAmount: round2(reclassifiedAmount) };
}
