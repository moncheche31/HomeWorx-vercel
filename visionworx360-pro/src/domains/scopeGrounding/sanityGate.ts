import { formatInches } from "@/domains/measurement";
import { inchesToFeet } from "./measure";
import type { GroundedScope, GroundedScopeItem, SanityFinding, SanityReport } from "./types";

/**
 * Pre-pricing sanity gate.
 *
 * The estimator must refuse to emit a ridiculous number. Anything that cannot
 * be reconciled with what the contractor actually said stops pricing and asks
 * instead.
 */

export interface SanityContext {
  /** Longest known dimension for the work area, in inches. */
  knownRunInches?: number | null;
  /** Trade families the contractor fenced the job to, e.g. ["cabinets"]. */
  fencedFamilies?: string[];
}

/** Tolerance before a linear quantity counts as exceeding a known dimension. */
const RUN_TOLERANCE = 1.25;

/**
 * Above these quantities an unmeasured catalog default is real money and has
 * to be confirmed. Below them it is a rounding-scale allowance.
 */
const DEFAULT_CONFIRMATION_THRESHOLD: Record<string, number> = {
  square_foot: 400,
  linear_foot: 100,
  cubic_yard: 10,
  each: 10,
  hour: 40,
};

function family(featureKey: string): string {
  return featureKey.split(".")[0] ?? featureKey;
}

export function runScopeSanityGate(
  scope: GroundedScope,
  context: SanityContext = {},
): SanityReport {
  const findings: SanityFinding[] = [];
  const priced: GroundedScopeItem[] = [...scope.explicit, ...scope.incidental];
  /**
   * A dimension the contractor stated is a hard ceiling for a run, whether or
   * not the caller passes one in explicitly.
   */
  const statedRunInches = scope.dimensions.length
    ? Math.max(...scope.dimensions.map((d) => d.inches))
    : null;
  const knownInches = context.knownRunInches ?? statedRunInches;
  const knownFeet = knownInches !== null ? inchesToFeet(knownInches) : null;

  for (const item of priced) {
    if (!item.provenance || !item.provenance.source) {
      findings.push({
        id: `sanity:provenance:${item.id}`,
        kind: "missing_provenance",
        severity: "blocker",
        message: `${item.label} has no quantity source.`,
        itemIds: [item.id],
      });
      continue;
    }

    /**
     * A stated dimension is a ceiling for ANY linear run, not just cabinets.
     * The cabinets-only guard this replaced meant every other trade shipped
     * with no unit-explosion protection at all.
     */
    if (
      knownFeet !== null &&
      item.unitKey === "linear_foot" &&
      item.quantity !== null &&
      item.quantity > knownFeet * RUN_TOLERANCE
    ) {
      findings.push({
        id: `sanity:run:${item.id}`,
        kind: "exceeds_known_dimension",
        severity: "blocker",
        message: `${item.label} is priced at ${item.quantity} linear feet, but the stated wall is only ${formatInches(knownInches!)} (${knownFeet} ft). Confirm the run before pricing.`,
        itemIds: [item.id],
      });
    }

    // 94 -> 94 LF, or inches silently used as feet.
    if (
      knownInches !== null &&
      item.quantity !== null &&
      item.unitKey === "linear_foot" &&
      Math.abs(item.quantity - knownInches) < 0.5
    ) {
      findings.push({
        id: `sanity:units:${item.id}`,
        kind: "unit_conversion_explosion",
        severity: "blocker",
        message: `${item.label} uses ${item.quantity} linear feet, which is the wall measurement in INCHES. ${formatInches(knownInches)} is ${knownFeet} linear feet.`,
        itemIds: [item.id],
      });
    }
  }

  // Duplicated quantities for the same feature.
  const byKey = new Map<string, GroundedScopeItem[]>();
  for (const item of priced) {
    byKey.set(item.featureKey, [...(byKey.get(item.featureKey) ?? []), item]);
  }
  for (const [key, items] of byKey) {
    if (items.length > 1) {
      findings.push({
        id: `sanity:duplicate:${key}`,
        kind: "duplicate_quantity",
        severity: "warning",
        message: `${items[0].label} is priced ${items.length} times.`,
        itemIds: items.map((i) => i.id),
      });
    }
  }

  // Trades outside the fence the contractor set.
  const fenced = context.fencedFamilies ?? [];
  if (fenced.length > 0) {
    for (const item of scope.explicit) {
      if (fenced.includes(family(item.featureKey))) continue;
      findings.push({
        id: `sanity:fence:${item.id}`,
        kind: "unrelated_trade",
        severity: "warning",
        message: `${item.label} is outside the stated scope of this job.`,
        itemIds: [item.id],
      });
    }
  }

  /**
   * Material money resting on a catalog default. A default is a starting
   * point, not a measurement: above these thresholds it must be confirmed by
   * the contractor rather than buried in provenance metadata.
   */
  for (const item of priced) {
    if (!item.provenance?.isDefault || item.quantity === null) continue;
    const threshold = DEFAULT_CONFIRMATION_THRESHOLD[item.unitKey ?? ""];
    if (threshold === undefined || item.quantity < threshold) continue;
    findings.push({
      id: `sanity:default:${item.id}`,
      kind: "unconfirmed_default",
      severity: "warning",
      message: `${item.label} is priced at ${item.quantity} ${(item.unitKey ?? "unit").replace(/_/g, " ")} from a catalog default — nothing measured backs it. Confirm the quantity before this number goes to a customer.`,
      itemIds: [item.id],
    });
  }

  for (const clarification of scope.clarifications) {
    if (clarification.topic !== "cabinet_run" && clarification.topic !== "room_count") continue;
    findings.push({
      id: `sanity:${clarification.id}`,
      kind: "unresolved_dimension",
      severity: "warning",
      message: clarification.message,
      itemIds: [],
    });
  }

  return { findings, blocked: findings.some((f) => f.severity === "blocker") };
}
