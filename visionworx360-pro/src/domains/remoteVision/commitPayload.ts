/**
 * Photos/Video intake -> canonical estimate commit payload.
 *
 * Pure mapping only: the approved grounded scope and the selected ballpark
 * scenario become the same canonical shape the walkthrough and described
 * intakes produce, so a single commit service can persist all three.
 */

import {
  confidenceBand,
  type CanonicalEstimateCommit,
  type CanonicalScopeItemInput,
} from "@/domains/estimating/estimateCommit";
import type { GroundedScope, GroundedScopeItem } from "@/domains/scopeGrounding/types";
import { evaluatePricingGuard, PricingUnresolvedError } from "./pricingGuard";
import type { AllowanceScopeFeature, Assumption, EstimateScenario } from "./types";

export interface RemoteVisionCommitPayloadInput {
  projectId: string;
  grounded: GroundedScope | GroundedScopeItem[] | null;
  removedFeatureKeys?: string[];
  scenario: EstimateScenario | null;
  assumptions?: Assumption[];
  narrativeText?: string | null;
  intakeText?: string | null;
  replay?: Record<string, unknown> | null;
}

/** Quantities the contractor stated, measured or overrode are facts. */
const CONFIRMED_SOURCES = new Set<string>([
  "spoken_measurement",
  "typed_measurement",
  "drawing",
  "contractor_override",
  "component_arithmetic",
]);

/**
 * Feature key -> canonical trade. Scope items carry the trade so every
 * downstream surface (measurement fields, ballpark questions, pricing) derives
 * the SAME work domains from structured rows instead of guessing from titles.
 */
const TRADE_BY_FEATURE_PREFIX: Array<[RegExp, string]> = [
  /*
   * Order matters: the first match wins. Demolition, structure and finish
   * carpentry were missing entirely, so wall/closet demo, beams, posts and
   * built-ins committed with a NULL trade and nothing downstream could price
   * or measure them.
   */
  [/^(demolition|demo)\./, "demolition"],
  [/wall_removal|closet_removal/, "demolition"],
  [/^(structural|beam|post|column)/, "framing"],
  [/^deck/, "framing"],
  [/^trim|^millwork|^casework/, "finish_carpentry"],
  [/^roofing/, "roofing"],
  [/^(siding|gutters|fence|landscaping)/, "exterior"],
  [/^concrete/, "sitework_concrete"],
  [/^tile/, "tile"],
  [/^(hvac|mechanical\.hvac)/, "hvac"],
  [/^appliance/, "specialty"],
  [/^(fixture|mechanical\.plumbing)/, "plumbing"],
  [/^(lighting|mechanical\.electrical)/, "electrical"],
  [/^cabinet/, "cabinetry"],
  [/^countertop/, "countertops"],
  [/^floor/, "flooring"],
  [/^drywall/, "drywall"],
  [/^paint/, "painting"],
  [/^insulation/, "insulation"],
  [/^(mechanical\.outlet|electrical)/, "electrical"],
  [/^plumb/, "plumbing"],
  [/^(door|window|opening)/, "doors_windows"],
  [/^(framing|partition)/, "framing"],
];

export function tradeForFeatureKey(featureKey: string | null | undefined): string | null {
  const key = (featureKey ?? "").toLowerCase();
  if (!key) return null;
  for (const [pattern, trade] of TRADE_BY_FEATURE_PREFIX) {
    if (pattern.test(key)) return trade;
  }
  return null;
}

/** Explicit work first, then the incidental work it requires. */
export function flattenGroundedItems(
  grounded: GroundedScope | GroundedScopeItem[] | null,
): GroundedScopeItem[] {
  if (!grounded) return [];
  if (Array.isArray(grounded)) return grounded;
  return [...grounded.explicit, ...grounded.incidental];
}

/**
 * Allowance quantities the BALLPARK actually priced with.
 *
 * WHY THIS EXISTS: the ballpark prices unmeasured work (roofing SF, siding SF,
 * landscaping SF, ...) from a published standard allowance, but the grounded
 * scope item keeps `quantity: null` because nobody measured it. Committing the
 * null meant every one of those lines landed as a `quantity 1` placeholder,
 * `resolution_status: 'unresolved'`, and the canonical cost function — which
 * sums resolved lines only — dropped them. A $76k ballpark saved as $1k.
 *
 * The allowance quantity is therefore committed alongside the scope item,
 * marked `assumed` (never contractor authority) with an auditable basis note,
 * so it prices AND still shows as an assumption needing review.
 */
export function groundedToCanonicalItems(
  grounded: GroundedScope | GroundedScopeItem[] | null,
  removedFeatureKeys: string[] = [],
  allowanceFeatures: AllowanceScopeFeature[] = [],
): CanonicalScopeItemInput[] {
  const removed = new Set(removedFeatureKeys);
  const allowanceByKey = new Map(allowanceFeatures.map((a) => [a.featureKey, a]));
  return flattenGroundedItems(grounded)
    .filter((item) => !removed.has(item.featureKey))
    .map((item) => {
      const stated = item.pricingQuantity ?? item.quantity ?? null;
      const allowance = stated == null || stated <= 0 ? allowanceByKey.get(item.featureKey) : undefined;
      const confirmed = CONFIRMED_SOURCES.has(item.provenance?.source ?? "");
      return {
        key: item.featureKey || item.id,
        title: item.label,
        tradeKey: tradeForFeatureKey(item.featureKey),
        quantity: item.quantity ?? allowance?.quantity ?? null,
        pricingQuantity: item.pricingQuantity ?? allowance?.quantity ?? null,
        unitKey: item.unitKey ?? allowance?.unitKey ?? null,
        description: item.detail ?? item.reason ?? null,
        internalNotes: item.evidence ?? null,
        /* Only contractor-stated / measured scope is treated as confirmed. */
        confirmed,
        quantityBasis: allowance ? ("assumed" as const) : undefined,
        quantityBasisNote: allowance
          ? `Ballpark standard allowance (${allowance.basisKey ?? "standard"}): ${allowance.quantity} ${allowance.unitKey}. Assumed size — confirm before issuing.`
          : undefined,
      };
    });
}


/**
 * "All of these will be labor-only quotes" is a PRICING INSTRUCTION, not a note.
 * It survives intake as a hard mode so materials are never billed to the
 * customer on a job the contractor quoted labor-only.
 */
const LABOR_ONLY =
  /\blabor[\s-]?only\b|\blabour[\s-]?only\b|\bonly\s+(the\s+)?labor\b|\bs[oó]lo\s+mano\s+de\s+obra\b/i;

export function detectPricingModeFromNarrative(
  text: string | null | undefined,
): "labor_only" | null {
  return LABOR_ONLY.test(text ?? "") ? "labor_only" : null;
}

export function buildRemoteVisionCommit(
  input: RemoteVisionCommitPayloadInput,
): CanonicalEstimateCommit {
  /*
   * A committed estimate must always carry a band. When the contractor never
   * explicitly picked a level, the conservative Economy scenario from the same
   * replay is committed rather than leaving `range_snapshot` null — a null
   * snapshot is what made the estimate page fall back to generic derivation.
   */
  const replayScenarios = Array.isArray((input.replay as { scenarios?: unknown } | null)?.scenarios)
    ? ((input.replay as { scenarios: EstimateScenario[] }).scenarios)
    : [];
  const scenario =
    input.scenario ??
    replayScenarios.find((s) => String(s.level) === "economy") ??
    replayScenarios[0] ??
    null;
  const items = groundedToCanonicalItems(
    input.grounded,
    input.removedFeatureKeys,
    scenario?.allowanceFeatures ?? [],
  );
  /*
   * INVARIANT: recognized priceable scope is never committed with a $0 – $0
   * band. Commit is refused so the contractor resolves pricing instead of
   * persisting a fake zero estimate.
   */
  const guard = evaluatePricingGuard({ scenario, priceableScopeCount: items.length });
  if (guard.blocked) throw new PricingUnresolvedError(guard);

  return {
    projectId: input.projectId,
    intakeSource: "photos_video",
    items,
    ballpark: scenario
      ? {
          level: String(scenario.level),
          low: scenario.costLow,
          high: scenario.costHigh,
          confidence: confidenceBand(scenario.confidence),
          laborHours: scenario.laborHours ?? null,
          crewHours: scenario.breakdown?.crewHours ?? null,
          durationDays: scenario.durationDays ?? null,
          breakdown: scenario.breakdown ?? null,
        }
      : null,
    assumptions: (input.assumptions ?? []).map((a) => ({
      id: a.id,
      topic: a.topic,
      selectedKey: a.selectedKey,
      isAutomatic: a.isAutomatic,
      basis: a.basis,
    })),
    narrativeText: input.narrativeText ?? null,
    provenance: input.replay ?? null,
    pricingMode: detectPricingModeFromNarrative(input.narrativeText),
  };
}

/**
 * Recovery path: rebuild the canonical commit from a stored Remote Vision
 * replay.
 *
 * Approval writes an authoritative replay (`__remoteVisionReplay`) alongside
 * the narrative. When a commit happened before the shared bridge existed — or
 * failed midway — the project can end up with an approved narrative, an intact
 * replay and NO structured scope. The replay is the same data the intake
 * approved, so it can be replayed into the canonical payload verbatim.
 */
export function commitFromReplay(
  projectId: string,
  replay: unknown,
  options: { level?: string | null } = {},
): CanonicalEstimateCommit | null {
  const parsed =
    typeof replay === "string"
      ? (() => {
          try {
            return JSON.parse(replay) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : (replay as Record<string, unknown> | null);
  if (!parsed || typeof parsed !== "object") return null;

  const grounded = (parsed.grounded ?? null) as GroundedScope | GroundedScopeItem[] | null;
  const removed = Array.isArray(parsed.removedFeatureKeys)
    ? (parsed.removedFeatureKeys as string[])
    : [];
  const scenarios = Array.isArray(parsed.scenarios)
    ? (parsed.scenarios as unknown as EstimateScenario[])
    : [];
  const wanted = options.level ?? null;
  const scenario =
    (wanted ? scenarios.find((s) => String(s.level) === wanted) : null) ??
    scenarios.find((s) => String(s.level) === "economy") ??
    scenarios[0] ??
    null;
  const items = groundedToCanonicalItems(
    grounded,
    removed,
    scenario?.allowanceFeatures ?? [],
  );
  if (items.length === 0) return null;

  return buildRemoteVisionCommit({
    projectId,
    grounded,
    removedFeatureKeys: removed,
    scenario,
    assumptions: Array.isArray(parsed.assumptions) ? (parsed.assumptions as Assumption[]) : [],
    narrativeText: typeof parsed.intakeText === "string" ? parsed.intakeText : null,
    replay: parsed,
  });
}
