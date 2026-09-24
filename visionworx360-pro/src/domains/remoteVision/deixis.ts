/**
 * PHASE 2 — DEICTIC REFERENCE RESOLUTION ("that door", "the trim").
 *
 * Narration is full of pointing words. Before this module, a phrase could only
 * collide with a visual fact through a shared ontology subject key, so "that
 * door" matched EVERY door the model saw. Here a phrase binds to ONE tagged
 * object (a region) when the evidence supports exactly one reading.
 *
 * Authority is unchanged and non-negotiable: a binding adds LOCATION to a
 * contractor statement. It never creates scope, never sets a quantity, and
 * never lets a photo price anything on its own. An ambiguous phrase stays
 * unresolved rather than guessing — a wrong binding is worse than none.
 *
 * English only in this first version (per pilot decision); Spanish deictics
 * are handled in the localization pass.
 *
 * Pure module: no React, no IO.
 */

import type { VisualObservation, VisualRegion } from "./visualUnderstanding";

/** English pointing determiners that introduce a deictic noun phrase. */
const DETERMINERS = ["that", "this", "those", "these", "the"] as const;

const DETERMINER_PATTERN = new RegExp(
  `\\b(${DETERMINERS.join("|")})\\s+([a-z][a-z-]*(?:\\s+[a-z][a-z-]*){0,2})`,
  "gi",
);

/** Words that never name a physical object, so they never start a reference. */
/** Words that end a noun phrase; the head never runs past one. */
const PHRASE_TERMINATORS = new Set([
  "and",
  "or",
  "but",
  "then",
  "so",
  "with",
  "for",
  "from",
  "to",
  "in",
  "on",
  "at",
  "is",
  "are",
  "was",
  "were",
  "that",
  "this",
  "the",
]);

const STOP_NOUNS = new Set([
  "same",
  "whole",
  "entire",
  "other",
  "rest",
  "way",
  "time",
  "job",
  "project",
  "customer",
  "client",
  "price",
  "cost",
  "budget",
  "one",
  "thing",
  "area",
  "part",
  "side",
]);

export interface DeicticPhrase {
  /** Verbatim phrase as spoken, e.g. "that french door". */
  phrase: string;
  /** Determiner used ("that", "the", ...). */
  determiner: string;
  /** Head noun phrase without the determiner, lowercased. */
  head: string;
  /** Character offset of the phrase in the narration. */
  index: number;
  /** True for plural pointing words ("those", "these"). */
  plural: boolean;
}

export interface DeicticBinding {
  phrase: DeicticPhrase;
  /** The single object the phrase refers to, when unambiguous. */
  objectId: string | null;
  mediaId: string | null;
  /** Object ids that matched when the phrase is ambiguous. */
  candidateObjectIds: string[];
  /** unresolved when nothing matched, ambiguous when several did. */
  status: "bound" | "ambiguous" | "unresolved";
  /** Observation index the bound region came from. */
  observationIndex: number | null;
}

/** Extract candidate deictic noun phrases from narration, in spoken order. */
export function extractDeicticPhrases(narration: string): DeicticPhrase[] {
  const out: DeicticPhrase[] = [];
  if (!narration.trim()) return out;
  for (const match of narration.matchAll(DETERMINER_PATTERN)) {
    const determiner = (match[1] ?? "").toLowerCase();
    const words: string[] = [];
    for (const word of (match[2] ?? "").toLowerCase().trim().split(/\s+/)) {
      if (PHRASE_TERMINATORS.has(word)) break;
      words.push(word);
    }
    const head = words.join(" ");
    if (!head) continue;
    const firstWord = head.split(/\s+/)[0] ?? "";
    if (STOP_NOUNS.has(firstWord)) continue;
    out.push({
      phrase: `${determiner} ${head}`,
      determiner,
      head,
      index: match.index ?? 0,
      plural: determiner === "those" || determiner === "these",
    });
  }
  return out;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 2);
}

/** Singular/plural insensitive token overlap between a phrase and a label. */
function overlapScore(head: string, label: string): number {
  const stem = (word: string) => (word.endsWith("s") ? word.slice(0, -1) : word);
  const headTokens = tokens(head).map(stem);
  if (headTokens.length === 0) return 0;
  const labelTokens = new Set(tokens(label).map(stem));
  let hits = 0;
  for (const token of headTokens) if (labelTokens.has(token)) hits += 1;
  return hits / headTokens.length;
}

interface ScoredRegion {
  region: VisualRegion;
  observationIndex: number;
  score: number;
}

/**
 * Bind each deictic phrase in the narration to at most one tagged object.
 *
 * Matching is lexical against the region label, the observation's object text
 * and its subject key. A phrase binds only when ONE object scores best; ties
 * are reported as ambiguous so the UI can ask rather than assume.
 */
export function resolveDeicticReferences(
  narration: string,
  observations: readonly VisualObservation[],
): DeicticBinding[] {
  const phrases = extractDeicticPhrases(narration);
  if (phrases.length === 0) return [];

  const candidates: ScoredRegion[] = [];
  for (const [observationIndex, observation] of observations.entries()) {
    for (const region of observation.regions ?? []) {
      candidates.push({ region, observationIndex, score: 0 });
    }
  }

  return phrases.map((phrase) => {
    const scored = candidates
      .map((candidate) => {
        const observation = observations[candidate.observationIndex]!;
        const score = Math.max(
          overlapScore(phrase.head, candidate.region.label),
          overlapScore(phrase.head, observation.object),
          overlapScore(phrase.head, (observation.subjectKey ?? "").replace(/[._-]/g, " ")),
        );
        return { ...candidate, score };
      })
      .filter((candidate) => candidate.score >= 0.5)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return {
        phrase,
        objectId: null,
        mediaId: null,
        candidateObjectIds: [],
        status: "unresolved",
        observationIndex: null,
      };
    }

    const best = scored[0]!;
    const tied = scored.filter((candidate) => candidate.score === best.score);
    /* A plural phrase legitimately points at several objects, so it is never
       a single binding — it stays ambiguous by design. */
    if (tied.length > 1 || phrase.plural) {
      return {
        phrase,
        objectId: null,
        mediaId: null,
        candidateObjectIds: tied.map((candidate) => candidate.region.objectId),
        status: "ambiguous",
        observationIndex: null,
      };
    }

    return {
      phrase,
      objectId: best.region.objectId,
      mediaId: best.region.mediaId,
      candidateObjectIds: [best.region.objectId],
      status: "bound",
      observationIndex: best.observationIndex,
    };
  });
}

/** Every distinct tagged object across the analyzed media, in stable order. */
export function collectTaggedObjects(
  observations: readonly VisualObservation[],
): { region: VisualRegion; observationIndex: number }[] {
  const seen = new Set<string>();
  const out: { region: VisualRegion; observationIndex: number }[] = [];
  for (const [observationIndex, observation] of observations.entries()) {
    for (const region of observation.regions ?? []) {
      if (seen.has(region.objectId)) continue;
      seen.add(region.objectId);
      out.push({ region, observationIndex });
    }
  }
  return out;
}
