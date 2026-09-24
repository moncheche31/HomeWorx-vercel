/**
 * Ballpark question priority — "infer first, ask second".
 *
 * A ballpark earns its speed by refusing to interrogate. A question is only
 * worth a contractor's attention when:
 *
 *   1. it belongs to BALLPARK mode at all (stud counts, receptacle counts,
 *      beam specification and trim LF belong to the detailed estimate);
 *   2. the answer cannot reasonably be inferred from evidence already in the
 *      project (dimensions, plans, photos, video, notes, prior answers);
 *   3. the answer could MATERIALLY move the range — tracked here as an
 *      expected impact on the expected value.
 *
 * Everything filtered out is not lost: it stays a disclosed assumption the
 * contractor can review and correct.
 *
 * Pure module — no React, no IO, no i18n.
 */

import { BALLPARK_QUESTION_BUDGET, selectBallparkClarifications } from "@/domains/estimating/modes";

/** Below this expected swing, asking costs more than assuming. */
export const MIN_QUESTION_IMPACT_PCT = 4;

export type BallparkQuestionTopic =
  | "dimensions"
  | "ceilingHeight"
  | "bathroomType"
  | "showerConfig"
  | "finishTier"
  | "flooringCategory"
  | "wallChanges"
  | "structural"
  | "plumbingRelocation"
  | "electricalHvac"
  | "siteConditions"
  | "other";

/**
 * Typical percentage swing in the expected value when the topic is unknown.
 * Calibrated from the residential assemblies, not guessed per project: these
 * are the levers that actually reprice a remodel.
 */
export const TOPIC_IMPACT_PCT: Record<BallparkQuestionTopic, number> = {
  dimensions: 35,
  structural: 22,
  bathroomType: 18,
  plumbingRelocation: 15,
  finishTier: 14,
  wallChanges: 12,
  showerConfig: 11,
  flooringCategory: 8,
  ceilingHeight: 7,
  electricalHvac: 7,
  siteConditions: 6,
  other: 3,
};

/**
 * Question subjects that belong to the detailed estimate. Asking these in
 * ballpark mode is the failure mode this module exists to prevent.
 */
const DETAILED_ONLY_PATTERNS: RegExp[] = [
  /\bstud (count|spacing)\b/i,
  /\bhow many studs\b/i,
  /\bexact (quantity|count|length|hours|price|cost)\b/i,
  /\b(receptacle|outlet|switch)s? count\b/i,
  /\bhow many (receptacles|outlets|switches|screws|fasteners|nails)\b/i,
  /\btrim (lf|linear feet)\b/i,
  /\blinear feet of (trim|baseboard|casing)\b/i,
  /\b(beam|header) (size|span|engineering|specification|spec)\b/i,
  /\blabor hours\b/i,
  /\bfasteners?\b/i,
  /\bsku\b/i,
  /\bmodel number\b/i,
  /\bvendor quote\b/i,
  /\bsheet count\b/i,
];

export function isDetailedOnlyQuestion(subject: string): boolean {
  return DETAILED_ONLY_PATTERNS.some((re) => re.test(subject));
}

export interface BallparkQuestionCandidate {
  id: string;
  /** Human/prompt text or key — used only for the detailed-only guard. */
  subject: string;
  topic: BallparkQuestionTopic;
  /**
   * True when project evidence (plan, photo, video, notes, geometry, prior
   * answer) already answers this well enough to assume it.
   */
  inferable?: boolean;
  /** How the value was inferred; surfaced as a disclosed assumption. */
  inferredFrom?: string;
  /** Override the topic's calibrated swing for this project. */
  impactPct?: number;
}

export type QuestionDropReason =
  | "detailed-only"
  | "inferable"
  | "low-impact"
  | "over-budget";

export interface PrioritizedQuestion extends BallparkQuestionCandidate {
  impactPct: number;
  /** Why this question is worth asking — auditable, not decorative. */
  reason: "material-impact";
}

export interface DroppedQuestion extends BallparkQuestionCandidate {
  impactPct: number;
  droppedBecause: QuestionDropReason;
}

export interface QuestionPlan {
  ask: PrioritizedQuestion[];
  /** Suppressed questions, each with the reason — becomes the assumption list. */
  dropped: DroppedQuestion[];
  budget: number;
}

export function questionImpactPct(candidate: BallparkQuestionCandidate): number {
  const override = candidate.impactPct;
  if (typeof override === "number" && Number.isFinite(override)) return Math.max(0, override);
  return TOPIC_IMPACT_PCT[candidate.topic] ?? TOPIC_IMPACT_PCT.other;
}

/**
 * Turn every question the interview *could* ask into the small batch it
 * *should* ask. Prefers zero questions: when evidence covers the high-impact
 * topics, nothing is surfaced at all.
 */
export function planBallparkQuestions(
  candidates: readonly BallparkQuestionCandidate[],
  options: { budget?: number; minImpactPct?: number } = {},
): QuestionPlan {
  const budget = options.budget ?? BALLPARK_QUESTION_BUDGET;
  const minImpact = options.minImpactPct ?? MIN_QUESTION_IMPACT_PCT;

  const dropped: DroppedQuestion[] = [];
  const keepers: PrioritizedQuestion[] = [];

  for (const candidate of candidates) {
    const impactPct = questionImpactPct(candidate);
    if (isDetailedOnlyQuestion(candidate.subject)) {
      dropped.push({ ...candidate, impactPct, droppedBecause: "detailed-only" });
      continue;
    }
    if (candidate.inferable) {
      dropped.push({ ...candidate, impactPct, droppedBecause: "inferable" });
      continue;
    }
    if (impactPct < minImpact) {
      dropped.push({ ...candidate, impactPct, droppedBecause: "low-impact" });
      continue;
    }
    keepers.push({ ...candidate, impactPct, reason: "material-impact" });
  }

  /* Highest expected swing first; stable for equal impact. */
  const ranked = keepers
    .map((q, index) => ({ q, index }))
    .sort((a, b) => b.q.impactPct - a.q.impactPct || a.index - b.index)
    .map((entry) => entry.q);

  const ask = selectBallparkClarifications(ranked, budget);
  for (const overflow of ranked.slice(ask.length)) {
    dropped.push({ ...overflow, droppedBecause: "over-budget" });
  }

  return { ask, dropped, budget };
}
