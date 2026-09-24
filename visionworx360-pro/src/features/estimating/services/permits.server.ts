/**
 * Server-side adapters for the universal permit estimating subsystem.
 *
 * This module only TRANSLATES database rows into the pure permit domain's
 * contracts. All pricing rules live in `src/domains/permits`.
 *
 * Invariants preserved here:
 *   - permits are fees: zero labor hours, whole dollars;
 *   - contractor-entered permit fees are authoritative and never overwritten;
 *   - the valuation base excludes every permit fee, so percent-of-valuation
 *     rules can never feed themselves (no recursion);
 *   - only the CURRENT project's evidence and jurisdiction are read.
 */

import type {
  ContractorPermitEntry,
  Jurisdiction,
  PermitFeeRule,
  PermitScopeSignal,
  PermitType,
} from "@/domains/permits/types";
import { PERMIT_TYPES } from "@/domains/permits/types";

export interface PermitRuleRow {
  id: string;
  jurisdiction_scope: string;
  city: string | null;
  county: string | null;
  state: string | null;
  postal_code: string | null;
  country_code: string | null;
  permit_type: string;
  work_class: string;
  calc_method: string;
  base_amount: number | string | null;
  min_amount: number | string | null;
  max_amount: number | string | null;
  rate: number | string | null;
  low_amount: number | string | null;
  high_amount: number | string | null;
  effective_date: string;
  library_version: string;
  source_type: string;
  source_title: string;
  source_url: string | null;
  confidence: string;
  bundles: string[] | null;
  notes: string | null;
}

export interface PermitLineRow {
  id: string;
  description: string;
  trade_key: string | null;
  quantity: number | string | null;
  unit_key: string | null;
  cost_basis: string | null;
  other_cost: number | string | null;
  direct_cost: number | string | null;
  is_price_overridden: boolean | null;
  archived_at: string | null;
}

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const isPermitType = (v: string): v is PermitType =>
  (PERMIT_TYPES as readonly string[]).includes(v);

/** Map a stored fee-schedule row onto the domain rule contract. */
export function toPermitRule(row: PermitRuleRow): PermitFeeRule | null {
  if (!isPermitType(row.permit_type)) return null;
  return {
    id: row.id,
    scope: row.jurisdiction_scope as PermitFeeRule["scope"],
    jurisdiction: {
      city: row.city,
      county: row.county,
      state: row.state,
      postalCode: row.postal_code,
      countryCode: row.country_code,
    },
    permitType: row.permit_type,
    workClass: row.work_class,
    method: row.calc_method as PermitFeeRule["method"],
    base: num(row.base_amount),
    min: num(row.min_amount),
    max: num(row.max_amount),
    rate: num(row.rate),
    low: num(row.low_amount),
    high: num(row.high_amount),
    effectiveDate: row.effective_date,
    version: row.library_version,
    sourceType: row.source_type as PermitFeeRule["sourceType"],
    sourceTitle: row.source_title,
    sourceUrl: row.source_url,
    confidence: row.confidence as PermitFeeRule["confidence"],
    bundles: (row.bundles ?? []).filter(isPermitType),
    notes: row.notes,
  };
}

/** Property address → jurisdiction. `region` is the state/province column. */
export function toJurisdiction(
  property: { city: string | null; region: string | null; county: string | null; postal_code: string | null } | null,
): Jurisdiction | null {
  if (!property) return null;
  return {
    city: property.city,
    state: property.region,
    county: property.county,
    postalCode: property.postal_code,
    countryCode: "US",
  };
}

/** Scope evidence the requirement classifier reads. Permit fee lines excluded. */
export function toScopeSignals(lines: PermitLineRow[]): PermitScopeSignal[] {
  return lines
    .filter((l) => !l.archived_at && l.cost_basis !== "permit_fee")
    .map((l) => ({
      description: l.description ?? "",
      tradeKey: l.trade_key,
      quantity: num(l.quantity),
      unitKey: l.unit_key,
    }));
}

/**
 * Contractor-entered permit fees. Only an explicit override counts: a
 * system-generated permit line is a suggestion, not contractor authority.
 */
export function toContractorEntries(
  lines: PermitLineRow[],
  descriptionToType: (description: string) => PermitType,
): ContractorPermitEntry[] {
  return lines
    .filter((l) => !l.archived_at && l.cost_basis === "permit_fee" && l.is_price_overridden === true)
    .map((l) => ({
      permitType: descriptionToType(l.description ?? ""),
      amount: Math.round(num(l.other_cost) ?? 0),
      label: l.description,
    }));
}

/** Classify an existing permit line by its wording, for override matching. */
export function permitTypeFromDescription(description: string): PermitType {
  const text = ` ${String(description ?? "").toLowerCase()} `;
  if (text.includes("electric")) return "electrical";
  if (text.includes("plumb")) return "plumbing";
  if (text.includes("mechanical") || text.includes("hvac")) return "mechanical";
  if (text.includes("roof")) return "roofing";
  if (text.includes("demo")) return "demolition";
  if (text.includes("zoning") || text.includes("land use")) return "zoning";
  if (text.includes("occupancy") || text.includes("certificate")) return "occupancy";
  return "building";
}

/**
 * PRE-PERMIT construction cost base. Every permit fee is excluded so a
 * percent-of-valuation rule can never price itself.
 */
export function prePermitValuationBase(lines: PermitLineRow[]): number {
  let total = 0;
  for (const l of lines) {
    if (l.archived_at || l.cost_basis === "permit_fee") continue;
    total += num(l.direct_cost) ?? 0;
  }
  return Math.round(total);
}
