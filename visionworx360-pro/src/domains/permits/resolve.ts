/**
 * PERMIT PRICING RESOLVER.
 *
 * Priority order, most authoritative first:
 *   1. Contractor-entered fee / override.
 *   2. Verified local (city) jurisdiction rule for that jurisdiction+version.
 *   3. County, then state rule.
 *   4. National 2026 benchmark fallback.
 *
 * A contractor entry is NEVER overwritten silently. Bundling suppresses trade
 * permits already covered by a master permit, so no double counting.
 *
 * CIRCULARITY: valuation-based rules use the PRE-PERMIT construction cost base
 * passed in by the caller. The permit result is then added as other direct cost
 * and selling-price economics are re-run exactly once. This module never reads
 * its own output.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import { roundMoney as money } from "../estimating/money";
import {
  DEFAULT_VALUATION_PCT,
  NATIONAL_PERMIT_RULES,
  PERMIT_LIBRARY_EFFECTIVE_DATE,
  PERMIT_LIBRARY_VERSION,
  VALUATION_PCT_MAX,
  VALUATION_PCT_MIN,
  VALUATION_STRATEGY_THRESHOLD,
} from "./benchmarks2026";
import { classifyPermitRequirements } from "./requirement";
import type {
  ContractorPermitEntry,
  Jurisdiction,
  JurisdictionScope,
  PermitCandidate,
  PermitFeeComponent,
  PermitFeeRule,
  PermitPlan,
  PermitRequirementInput,
  PermitType,
} from "./types";

const SCOPE_RANK: Record<JurisdictionScope, number> = {
  city: 0,
  county: 1,
  state: 2,
  national: 3,
};

const eq = (a?: string | null, b?: string | null) =>
  !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** True when a rule's jurisdiction actually applies to this project location. */
export function ruleAppliesTo(rule: PermitFeeRule, j: Jurisdiction | null | undefined): boolean {
  if (rule.scope === "national") return true;
  if (!j) return false;
  if (rule.scope === "city") {
    if (rule.jurisdiction.postalCode && j.postalCode) {
      if (rule.jurisdiction.postalCode.trim() !== j.postalCode.trim()) return false;
    }
    return eq(rule.jurisdiction.city, j.city) && (!rule.jurisdiction.state || eq(rule.jurisdiction.state, j.state));
  }
  if (rule.scope === "county") return eq(rule.jurisdiction.county, j.county);
  return eq(rule.jurisdiction.state, j.state);
}

/** Most specific applicable, active rule for a permit type + work class. */
export function selectRule(
  rules: PermitFeeRule[],
  jurisdiction: Jurisdiction | null | undefined,
  permitType: PermitType,
  workClass: string,
): PermitFeeRule | null {
  const matches = rules
    .filter((r) => r.permitType === permitType)
    .filter((r) => r.workClass === workClass || r.workClass === "any")
    .filter((r) => ruleAppliesTo(r, jurisdiction))
    .sort((a, b) => {
      const s = SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope];
      if (s !== 0) return s;
      /* Exact work class beats `any`, then newest effective date wins. */
      const exact = (a.workClass === workClass ? 0 : 1) - (b.workClass === workClass ? 0 : 1);
      if (exact !== 0) return exact;
      return String(b.effectiveDate).localeCompare(String(a.effectiveDate));
    });
  return matches[0] ?? null;
}

const clamp = (value: number, min?: number | null, max?: number | null) => {
  let v = value;
  if (min != null && v < min) v = min;
  if (max != null && v > max) v = max;
  return v;
};

/** Compute amount/low/high for one rule. Whole dollars only. */
export function computeRuleAmount(
  rule: PermitFeeRule,
  ctx: { countedUnits?: number | null; valuationBase?: number; squareFeet?: number | null },
): { amount: number; low: number; high: number } {
  const units = Math.max(0, Number(ctx.countedUnits ?? 0));
  switch (rule.method) {
    case "flat": {
      const v = clamp(Number(rule.base ?? 0), rule.min, rule.max);
      return { amount: money(v), low: money(v), high: money(v) };
    }
    case "range_allowance": {
      const low = Number(rule.low ?? rule.base ?? 0);
      const high = Number(rule.high ?? rule.base ?? low);
      const mid = clamp((low + high) / 2, rule.min, rule.max);
      return { amount: money(mid), low: money(low), high: money(high) };
    }
    case "per_fixture":
    case "per_device": {
      const base = Number(rule.base ?? 0);
      const rate = Number(rule.rate ?? 0);
      /* No counted evidence: fall back to the guardrail minimum, not a guess. */
      const raw = units > 0 ? base + rate * units : (rule.min ?? base);
      const amount = clamp(raw, rule.min, rule.max);
      return {
        amount: money(amount),
        low: money(clamp(rule.min ?? amount, rule.min, rule.max)),
        high: money(clamp(units > 0 ? amount : (rule.max ?? amount), rule.min, rule.max)),
      };
    }
    case "per_sqft": {
      const sf = Math.max(0, Number(ctx.squareFeet ?? 0));
      const raw = Number(rule.base ?? 0) + Number(rule.rate ?? 0) * sf;
      const amount = clamp(raw, rule.min, rule.max);
      return { amount: money(amount), low: money(amount), high: money(amount) };
    }
    case "percent_of_valuation": {
      const valuation = Math.max(0, Number(ctx.valuationBase ?? 0));
      const pct = Number(rule.rate ?? DEFAULT_VALUATION_PCT);
      const amount = clamp((valuation * pct) / 100, rule.min, rule.max);
      const low = clamp((valuation * VALUATION_PCT_MIN) / 100, rule.min, rule.max);
      const high = clamp((valuation * VALUATION_PCT_MAX) / 100, rule.min, rule.max);
      return { amount: money(amount), low: money(low), high: money(high) };
    }
    case "tiered":
    default: {
      const v = clamp(Number(rule.base ?? 0), rule.min, rule.max);
      return { amount: money(v), low: money(rule.low ?? v), high: money(rule.high ?? v) };
    }
  }
}

export interface ResolvePermitsInput extends PermitRequirementInput {
  /** Jurisdiction + national rules available to this project. */
  rules?: PermitFeeRule[];
  /** Contractor-entered fees / exclusions. Always authoritative. */
  contractorEntries?: ContractorPermitEntry[];
  /** Include `possible` candidates as priced allowances (ballpark behaviour). */
  includePossible?: boolean;
  /**
   * PRE-PERMIT construction cost base for valuation rules. Must NOT include any
   * permit fee — that is what keeps the math non-recursive.
   */
  valuationBase?: number | null;
  squareFeet?: number | null;
}

const contractorComponent = (
  entry: ContractorPermitEntry,
  workClass: string,
): PermitFeeComponent => ({
  permitType: entry.permitType,
  workClass,
  amount: money(entry.amount),
  low: money(entry.amount),
  high: money(entry.amount),
  bundledTypes: [],
  likelihood: "likely",
  method: "flat",
  sourceType: "contractor",
  sourceTitle: entry.label?.trim() || "Contractor-entered permit fee",
  sourceUrl: null,
  sourceVersion: "contractor",
  effectiveDate: PERMIT_LIBRARY_EFFECTIVE_DATE,
  jurisdictionScope: "city",
  confidence: "verified",
  laborHours: 0,
  costBasis: "permit_fee",
  needsLocalVerification: false,
  notes: null,
});

/**
 * Resolve the full permit plan for ONE project. Never reads other projects and
 * never mixes jurisdictions: only rules whose jurisdiction matches are used.
 */
export function resolvePermitPlan(input: ResolvePermitsInput): PermitPlan {
  const rules = [...(input.rules ?? []), ...NATIONAL_PERMIT_RULES];
  const jurisdiction = input.jurisdiction ?? null;
  const entries = input.contractorEntries ?? [];
  const requirement = classifyPermitRequirements(input);

  const valuationBase = Math.max(0, Number(input.valuationBase ?? 0));
  const includePossible = input.includePossible ?? true;

  /* Candidate set: contractor entries always participate, even if scope is quiet. */
  const candidates: PermitCandidate[] = requirement.candidates.filter(
    (c) => c.likelihood === "likely" || includePossible,
  );
  for (const e of entries) {
    if (e.excluded) continue;
    if (!candidates.some((c) => c.permitType === e.permitType)) {
      candidates.push({
        permitType: e.permitType,
        workClass: "any",
        likelihood: "likely",
        drivers: ["contractor entry"],
        countedUnits: null,
      });
    }
  }

  /* Large jobs prefer the valuation strategy over a flat class allowance. */
  const useValuation = valuationBase >= VALUATION_STRATEGY_THRESHOLD;
  if (useValuation) {
    const building = candidates.find((c) => c.permitType === "building");
    if (building) building.workClass = "whole_home_renovation";
  }

  const components: PermitFeeComponent[] = [];
  const excluded = new Set(entries.filter((e) => e.excluded).map((e) => e.permitType));

  for (const candidate of candidates) {
    if (excluded.has(candidate.permitType)) continue;

    const entry = entries.find((e) => e.permitType === candidate.permitType && !e.excluded);
    if (entry) {
      /* A contractor master-permit entry keeps the bundling of its fee rule so
         trade permits it covers are still suppressed. */
      const bundleRule = selectRule(rules, jurisdiction, candidate.permitType, candidate.workClass);
      components.push({
        ...contractorComponent(entry, candidate.workClass),
        bundledTypes: bundleRule?.bundles ?? [],
      });
      continue;
    }


    const rule = selectRule(rules, jurisdiction, candidate.permitType, candidate.workClass);
    if (!rule) continue;

    const computed = computeRuleAmount(rule, {
      countedUnits: candidate.countedUnits,
      valuationBase,
      squareFeet: input.squareFeet,
    });
    if (computed.amount <= 0 && computed.high <= 0) continue;

    components.push({
      permitType: rule.permitType,
      workClass: candidate.workClass,
      amount: computed.amount,
      low: computed.low,
      high: computed.high,
      bundledTypes: rule.bundles ?? [],
      likelihood: candidate.likelihood,
      method: rule.method,
      sourceType: rule.sourceType,
      sourceTitle: rule.sourceTitle,
      sourceUrl: rule.sourceUrl ?? null,
      sourceVersion: rule.version,
      effectiveDate: rule.effectiveDate,
      jurisdictionScope: rule.scope,
      confidence: rule.confidence,
      laborHours: 0,
      costBasis: "permit_fee",
      needsLocalVerification: rule.sourceType === "national_benchmark",
      notes: rule.notes ?? null,
    });
  }

  /* --- Bundling: a master permit absorbs the trade permits it covers. --- */
  const suppressed: PermitPlan["suppressed"] = [];
  const masters = components.filter((c) => (c.bundledTypes ?? []).length > 0);
  const kept = components.filter((c) => {
    const master = masters.find(
      (m) => m !== c && m.bundledTypes.includes(c.permitType) && c.sourceType !== "contractor",
    );
    if (master) {
      suppressed.push({ permitType: c.permitType, coveredBy: master.permitType });
      return false;
    }
    return true;
  });

  /* Occupancy / certificate fees are needs-review, never auto-priced. */
  const priced = kept.filter((c) => c.permitType !== "occupancy");
  const total = money(priced.reduce((sum, c) => sum + c.amount, 0));
  const low = money(priced.reduce((sum, c) => sum + c.low, 0));
  const high = money(priced.reduce((sum, c) => sum + c.high, 0));

  return {
    components: kept,
    total,
    low,
    high,
    suppressed,
    contractorOverride: kept.length > 0 && kept.every((c) => c.sourceType === "contractor"),
    usesNationalFallback: kept.some((c) => c.sourceType === "national_benchmark"),
    needsJurisdictionConfirmation: kept.some((c) => c.needsLocalVerification),
    valuationBase,
  };
}

/**
 * Re-run selling-price economics ONCE with the permit fee added as other direct
 * cost. `sellingPriceOf` must be a pure function of a cost base; it is called
 * exactly twice (pre-permit valuation, then final) so there is no recursion.
 */
export function applyPermitToEconomics(input: {
  prePermitCost: number;
  plan: PermitPlan;
  sellingPriceOf: (jobCost: number) => number;
}): { jobCost: number; permitCost: number; sellingPrice: number } {
  const permitCost = money(input.plan.total);
  const jobCost = money(input.prePermitCost + permitCost);
  return { jobCost, permitCost, sellingPrice: money(input.sellingPriceOf(jobCost)) };
}

export { PERMIT_LIBRARY_VERSION };

/** True when every monetary value in the plan is whole dollars and labor is 0. */
export function isWholeDollarPlan(plan: PermitPlan): boolean {
  const ints = [plan.total, plan.low, plan.high];
  for (const c of plan.components) {
    ints.push(c.amount, c.low, c.high);
    if (c.laborHours !== 0) return false;
  }
  return ints.every((v) => Number.isInteger(v));
}
