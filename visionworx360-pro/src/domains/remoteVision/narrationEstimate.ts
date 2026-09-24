/**
 * NARRATION -> ESTIMATE BRIDGE (pure).
 *
 * A project whose scope exists only as spoken narration used to reach the
 * Estimate tab with no structured scope at all. The ballpark interview then
 * priced nothing and the contractor saw $0 for a job he had fully described.
 *
 * This module replays the SAME deterministic recognition/pricing pipeline the
 * Remote Vision screen uses (analyze -> assumptions -> scenarios -> canonical
 * commit) from nothing but the narration text plus the job-site book location.
 * No new pricing math lives here: it composes the existing engine so the
 * recovered estimate is identical to the one the intake screen would produce.
 */

import { analyzeDescription } from "./analyze";
import { buildAssumptions } from "./assumptions";
import { buildScenarios } from "./scenarios";
import { buildRemoteVisionCommit } from "./commitPayload";
import type { EstimateScenario, RemoteVisionLocale, VisionAnalysisResult } from "./types";
import type { CanonicalEstimateCommit } from "@/domains/estimating/estimateCommit";
import type { BookPricingLocation } from "@/domains/estimating/pricing/bookLaborRates";

export interface NarrationEstimateInput {
  projectId: string;
  /** Everything the contractor said about this job. */
  text: string;
  locale?: RemoteVisionLocale;
  bookLocation?: BookPricingLocation;
  laborRates?: Record<string, number>;
  /** Scenario level to commit; Remote Vision defaults to the conservative one. */
  level?: string | null;
  /** Narrative shown on the project; falls back to the raw narration. */
  narrativeText?: string | null;
}

export interface NarrationEstimateResult {
  analysis: VisionAnalysisResult;
  scenarios: EstimateScenario[];
  scenario: EstimateScenario | null;
  commit: CanonicalEstimateCommit;
}

/**
 * Returns null when the narration contains no recognizable priceable work —
 * the caller must leave the estimate alone rather than invent a band.
 */
export function estimateFromNarration(
  input: NarrationEstimateInput,
): NarrationEstimateResult | null {
  const text = (input.text ?? "").trim();
  if (!text) return null;

  const locale = input.locale ?? "en-US";
  const analysis = analyzeDescription({
    locale,
    description: text,
    media: [],
  } as never);

  const assumptions = buildAssumptions(analysis, text, {});
  const scenarios = buildScenarios(analysis, assumptions, locale, {
    ...(input.bookLocation ? { bookLocation: input.bookLocation } : {}),
    ...(input.laborRates ? { laborRates: input.laborRates } : {}),
  } as never);

  const wanted = input.level ?? null;
  const scenario =
    (wanted ? scenarios.find((s) => String(s.level) === wanted) : null) ??
    scenarios.find((s) => String(s.level) === "economy") ??
    scenarios[0] ??
    null;
  if (!scenario) return null;

  /* Throws PricingUnresolvedError when recognized scope cannot be priced —
     the caller surfaces that instead of persisting a fake zero. */
  const commit = buildRemoteVisionCommit({
    projectId: input.projectId,
    grounded: analysis.grounded ?? null,
    scenario,
    assumptions,
    narrativeText: input.narrativeText ?? text,
    replay: {
      version: 1,
      intakeText: text,
      grounded: analysis.grounded ?? null,
      assumptions,
      scenarios,
      recoveredFrom: "narration",
    },
  });

  return { analysis, scenarios, scenario, commit };
}
