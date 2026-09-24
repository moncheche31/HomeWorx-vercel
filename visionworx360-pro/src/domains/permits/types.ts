/**
 * UNIVERSAL PERMIT ESTIMATING SUBSYSTEM — contracts.
 *
 * Permits and inspection fees are DIRECT COSTS, never labor tasks. Every value
 * produced by this domain therefore carries `laborHours: 0` and whole-dollar
 * money (see `src/domains/estimating/money.ts`).
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

export const PERMIT_TYPES = [
  "building",
  "electrical",
  "plumbing",
  "mechanical",
  "roofing",
  "demolition",
  "zoning",
  "occupancy",
] as const;

export type PermitType = (typeof PERMIT_TYPES)[number];

/** How a fee schedule computes the fee. */
export const PERMIT_CALC_METHODS = [
  "flat",
  "range_allowance",
  "percent_of_valuation",
  "per_fixture",
  "per_device",
  "per_sqft",
  "tiered",
] as const;

export type PermitCalcMethod = (typeof PERMIT_CALC_METHODS)[number];

/** Most specific first. Mirrors the pricing hierarchy. */
export const JURISDICTION_SCOPES = ["city", "county", "state", "national"] as const;
export type JurisdictionScope = (typeof JURISDICTION_SCOPES)[number];

/** Where the authoritative number came from. */
export type PermitSourceType = "contractor" | "municipal" | "state" | "national_benchmark";

export type PermitConfidence = "verified" | "high" | "medium" | "low" | "needs_confirmation";

/** Likelihood that a permit of this type is required at all. */
export type PermitLikelihood = "likely" | "possible" | "not_likely";

export interface Jurisdiction {
  city?: string | null;
  county?: string | null;
  state?: string | null;
  postalCode?: string | null;
  countryCode?: string | null;
}

/**
 * One row of a permit fee library. National 2026 benchmark rows and verified
 * municipal schedules share this shape so the resolver has one code path.
 */
export interface PermitFeeRule {
  id: string;
  scope: JurisdictionScope;
  jurisdiction: Jurisdiction;
  permitType: PermitType;
  /** Work class the rule applies to, e.g. `kitchen_remodel`, `any`. */
  workClass: string;
  method: PermitCalcMethod;
  /** Flat / base amount in whole dollars. */
  base?: number | null;
  min?: number | null;
  max?: number | null;
  /**
   * Per-unit rate: dollars per fixture / device / sqft, or PERCENT for
   * `percent_of_valuation` (e.g. 1.25 = 1.25% of valuation).
   */
  rate?: number | null;
  /** Low / high band for `range_allowance`. */
  low?: number | null;
  high?: number | null;
  effectiveDate: string;
  /** Library version. National benchmark rows are versioned research, not constants. */
  version: string;
  sourceType: PermitSourceType;
  sourceTitle: string;
  sourceUrl?: string | null;
  confidence: PermitConfidence;
  /** Permit types this permit already covers (master-permit bundling). */
  bundles?: PermitType[];
  notes?: string | null;
}

/** Signals the requirement classifier reads. Current project only. */
export interface PermitScopeSignal {
  /** Scope / estimate line description. */
  description: string;
  tradeKey?: string | null;
  /** Fixture / device / window counts when known. */
  quantity?: number | null;
  unitKey?: string | null;
}

export interface PermitRequirementInput {
  signals: PermitScopeSignal[];
  /** Optional project class hint, e.g. `garage_conversion`, `kitchen_remodel`. */
  projectClass?: string | null;
  jurisdiction?: Jurisdiction | null;
  /** Pre-permit construction cost base used by valuation rules. */
  valuationBase?: number | null;
}

export interface PermitCandidate {
  permitType: PermitType;
  likelihood: PermitLikelihood;
  /** Scope phrases that triggered this candidate. */
  drivers: string[];
  /** Work class used to select a fee rule. */
  workClass: string;
  /** Counted evidence for per-fixture / per-device / per-window rules. */
  countedUnits?: number | null;
}

export interface PermitRequirementResult {
  candidates: PermitCandidate[];
  /** True when nothing in scope suggests a permit. */
  none: boolean;
  /** Always true unless a verified local rule set the requirement. */
  needsJurisdictionConfirmation: boolean;
}

/** A resolved, priceable permit component. Zero labor, whole dollars. */
export interface PermitFeeComponent {
  permitType: PermitType;
  workClass: string;
  amount: number;
  low: number;
  high: number;
  /** Permits absorbed by this one (never priced separately). */
  bundledTypes: PermitType[];
  likelihood: PermitLikelihood;
  method: PermitCalcMethod;
  sourceType: PermitSourceType;
  sourceTitle: string;
  sourceUrl?: string | null;
  sourceVersion: string;
  effectiveDate: string;
  jurisdictionScope: JurisdictionScope;
  confidence: PermitConfidence;
  /** Fees never carry labor. Always 0. */
  laborHours: 0;
  /** Fees are direct costs. */
  costBasis: "permit_fee";
  needsLocalVerification: boolean;
  notes?: string | null;
}

export interface PermitPlan {
  components: PermitFeeComponent[];
  total: number;
  low: number;
  high: number;
  /** Permit types dropped because a master permit already covers them. */
  suppressed: { permitType: PermitType; coveredBy: PermitType }[];
  /** True when every component came from a contractor entry. */
  contractorOverride: boolean;
  /** True when any component is still a national fallback. */
  usesNationalFallback: boolean;
  needsJurisdictionConfirmation: boolean;
  /** Valuation base actually used by percent rules (pre-permit). */
  valuationBase: number;
}

/** A permit fee the contractor already entered. Always authoritative. */
export interface ContractorPermitEntry {
  permitType: PermitType;
  amount: number;
  label?: string | null;
  /** When set, the contractor explicitly excluded this permit type. */
  excluded?: boolean;
}
