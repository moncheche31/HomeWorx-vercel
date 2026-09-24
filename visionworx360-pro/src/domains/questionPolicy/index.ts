/**
 * UNIVERSAL question-priority policy.
 *
 * Every surface that can put a question in front of a contractor — the quick
 * ballpark interview, the Scope of Work clarifications, remote-vision photo
 * questions, handyman task prompts — routes its candidates through this one
 * module. Before this existed each generator carried its own private cap
 * (`MAX_QUESTIONS = 5` here, `BALLPARK_QUESTION_BUDGET` there) and its own
 * idea of what was worth asking, so a ballpark could be interrogated by three
 * different question sets that repeated each other.
 *
 * The policy is trade-agnostic and classifies each candidate into one tier:
 *
 *   A. `critical`  — materially price-changing and not inferable. ASK during
 *                    ballpark.
 *   B. `assumable` — useful but defensibly assumable from evidence or a
 *                    standard allowance. Becomes a DISCLOSED ASSUMPTION the
 *                    contractor can correct; never interrupts.
 *   C. `detailed`  — production/takeoff detail, or a trade-assignment review.
 *                    DEFERRED to the detailed estimate.
 *   D. `minor`     — not price-significant. Never asked.
 *
 * Budget: ballpark targets a short interview but is not hard-capped at a magic
 * number. Up to `BALLPARK_QUESTION_TARGET` high-impact questions are asked
 * freely; beyond that, only genuinely high-impact unknowns are allowed through,
 * and never more than `BALLPARK_QUESTION_MAX`. Everything trimmed becomes an
 * assumption, so accuracy is preserved without questionnaire bloat.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import type { EstimatingMode } from "@/domains/estimating/modes";
import {
  MIN_QUESTION_IMPACT_PCT,
  TOPIC_IMPACT_PCT,
  isDetailedOnlyQuestion,
  type BallparkQuestionTopic,
} from "@/domains/ballpark/questionPriority";

/** Comfortable interview length for an ordinary project. */
export const BALLPARK_QUESTION_TARGET = 5;

/**
 * Hard ceiling. A genuinely complex remodel may exceed the target, but every
 * extra question must clear `HIGH_IMPACT_OVERRIDE_PCT` to earn its slot.
 */
export const BALLPARK_QUESTION_MAX = 10;

/** Swing required for a question to be asked beyond the target. */
export const HIGH_IMPACT_OVERRIDE_PCT = 15;

export type QuestionTier = "critical" | "assumable" | "detailed" | "minor";

/** Why a candidate did not make it into the ballpark interview. */
export type QuestionDisposition =
  | "ask"
  | "assume"
  | "defer"
  | "omit"
  | "duplicate";

export interface UniversalQuestionCandidate {
  id: string;
  /** Prompt text or i18n key. Used for the detailed-only guard and dedupe. */
  subject: string;
  /** Calibrated impact bucket. Defaults to `other` (low impact). */
  topic?: BallparkQuestionTopic;
  /** Explicit expected swing on the expected value, overriding the topic. */
  impactPct?: number;
  /** Evidence in THIS project already answers it well enough to assume. */
  inferable?: boolean;
  /** How it was inferred — surfaced with the disclosed assumption. */
  inferredFrom?: string;
  /**
   * Trade classification review ("keep as Electrical / move to Finish
   * Carpentry"). Never a ballpark question: provisional classification is
   * enough to organize costs, and the decision belongs to detailed review.
   */
  isTradeAssignment?: boolean;
  /** Caller already knows this is production detail. */
  detailOnly?: boolean;
  /** Explicit identity for dedupe; defaults to normalized topic + subject. */
  dedupeKey?: string;
  /** Free-form passthrough so callers can map results back to their own type. */
  source?: string;
}

export interface ClassifiedQuestion<T extends UniversalQuestionCandidate = UniversalQuestionCandidate> {
  candidate: T;
  tier: QuestionTier;
  impactPct: number;
  disposition: QuestionDisposition;
}

export interface QuestionPolicyPlan<T extends UniversalQuestionCandidate = UniversalQuestionCandidate> {
  /** Ask now, highest impact first. */
  ask: T[];
  /** Price with a disclosed, correctable assumption instead of asking. */
  assume: T[];
  /** Belongs to detailed review (includes every trade-assignment question). */
  defer: T[];
  /** Not price-significant; never shown. */
  omit: T[];
  /** Suppressed as a rephrasing of a question already in the plan. */
  duplicates: T[];
  /** Full audit trail, in input order. */
  classified: ClassifiedQuestion<T>[];
  target: number;
  max: number;
}

const STOPWORDS = new Set([
  "the", "a", "an", "of", "is", "are", "do", "does", "did", "you", "your",
  "will", "be", "to", "for", "in", "on", "at", "and", "or", "any", "this",
  "that", "these", "those", "there", "it", "we", "what", "which", "how",
  "please", "should", "was", "were", "have", "has", "my", "our", "their",
]);

/**
 * Two questions are the same question when they reduce to the same content
 * words. "Is the wall load bearing?" and "Are these walls load-bearing?" must
 * never both be asked.
 */
export function questionDedupeKey(candidate: UniversalQuestionCandidate): string {
  if (candidate.dedupeKey) return candidate.dedupeKey.trim().toLowerCase();
  const words = candidate.subject
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/(ies)$/, "y").replace(/(?<=[a-z]{3})s$/, ""))
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
  const normalized = [...new Set(words)].sort().join(" ");
  return normalized || candidate.id.toLowerCase();
}

export function questionImpact(candidate: UniversalQuestionCandidate): number {
  const override = candidate.impactPct;
  if (typeof override === "number" && Number.isFinite(override)) return Math.max(0, override);
  return TOPIC_IMPACT_PCT[candidate.topic ?? "other"] ?? TOPIC_IMPACT_PCT.other;
}

/**
 * Tier A/B/C/D for one candidate. Deterministic and mode-independent: the mode
 * decides what to DO with a tier, not what the tier is.
 */
export function classifyQuestionTier(
  candidate: UniversalQuestionCandidate,
  impactPct: number = questionImpact(candidate),
): QuestionTier {
  if (candidate.isTradeAssignment) return "detailed";
  if (candidate.detailOnly || isDetailedOnlyQuestion(candidate.subject)) return "detailed";
  if (impactPct < MIN_QUESTION_IMPACT_PCT) return "minor";
  if (candidate.inferable) return "assumable";
  return "critical";
}

export interface QuestionPolicyOptions {
  mode?: EstimatingMode;
  /** Comfortable question count before the high-impact bar applies. */
  target?: number;
  /** Absolute ceiling. */
  max?: number;
  /** Swing required to exceed the target. */
  highImpactPct?: number;
}

/**
 * Turn every question a surface COULD ask into the short list it SHOULD ask.
 *
 * In `detailed` mode nothing is deferred and no budget applies: that is the
 * mode whose job is granular review. In `ballpark` mode the plan is ranked by
 * expected price swing, deduped, budgeted, and everything trimmed is returned
 * as an assumption or a deferral rather than being lost.
 */
export function planQuestions<T extends UniversalQuestionCandidate>(
  candidates: readonly T[],
  options: QuestionPolicyOptions = {},
): QuestionPolicyPlan<T> {
  const mode: EstimatingMode = options.mode ?? "ballpark";
  const target = options.target ?? BALLPARK_QUESTION_TARGET;
  const max = options.max ?? BALLPARK_QUESTION_MAX;
  const highImpact = options.highImpactPct ?? HIGH_IMPACT_OVERRIDE_PCT;

  const classified: ClassifiedQuestion<T>[] = [];
  const seen = new Set<string>();
  const duplicates: T[] = [];
  const assume: T[] = [];
  const defer: T[] = [];
  const omit: T[] = [];
  const askable: { candidate: T; impactPct: number; index: number }[] = [];

  candidates.forEach((candidate, index) => {
    const impactPct = questionImpact(candidate);
    const key = questionDedupeKey(candidate);
    if (seen.has(key)) {
      duplicates.push(candidate);
      classified.push({ candidate, tier: classifyQuestionTier(candidate, impactPct), impactPct, disposition: "duplicate" });
      return;
    }
    seen.add(key);

    const tier = classifyQuestionTier(candidate, impactPct);

    /* Detailed mode reviews everything except pure noise. */
    if (mode === "detailed") {
      if (tier === "minor") {
        omit.push(candidate);
        classified.push({ candidate, tier, impactPct, disposition: "omit" });
        return;
      }
      askable.push({ candidate, impactPct, index });
      classified.push({ candidate, tier, impactPct, disposition: "ask" });
      return;
    }

    if (tier === "detailed") {
      defer.push(candidate);
      classified.push({ candidate, tier, impactPct, disposition: "defer" });
      return;
    }
    if (tier === "assumable") {
      assume.push(candidate);
      classified.push({ candidate, tier, impactPct, disposition: "assume" });
      return;
    }
    if (tier === "minor") {
      omit.push(candidate);
      classified.push({ candidate, tier, impactPct, disposition: "omit" });
      return;
    }
    askable.push({ candidate, impactPct, index });
    classified.push({ candidate, tier, impactPct, disposition: "ask" });
  });

  if (mode === "detailed") {
    return {
      ask: askable.map((e) => e.candidate),
      assume, defer, omit, duplicates, classified,
      target, max,
    };
  }

  const ranked = [...askable].sort((a, b) => b.impactPct - a.impactPct || a.index - b.index);
  const ask: T[] = [];
  for (const entry of ranked) {
    const withinTarget = ask.length < target;
    const earnsExtraSlot = ask.length < max && entry.impactPct >= highImpact;
    if (withinTarget || earnsExtraSlot) {
      ask.push(entry.candidate);
      continue;
    }
    /* Over budget is never lost — it prices as a disclosed assumption. */
    assume.push(entry.candidate);
    const record = classified.find((c) => c.candidate === entry.candidate);
    if (record) record.disposition = "assume";
  }

  return { ask, assume, defer, omit, duplicates, classified, target, max };
}

/** True when a ballpark stayed within its promise of being fast to answer. */
export function withinQuestionBudget(count: number, max: number = BALLPARK_QUESTION_MAX): boolean {
  return count <= max;
}
