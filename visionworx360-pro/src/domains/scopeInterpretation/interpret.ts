/**
 * Narrative Scope of Work edits → structured scope changes.
 *
 * The Scope of Work editor is a scope-editing surface, not a word processor:
 * when a contractor writes real construction changes into the prose, those
 * changes must reach the structured scope so the estimate can go stale and be
 * updated or revised.
 *
 * This module reuses the deterministic voice-capture parser (same lexicon,
 * same action keys, same quantity/unit detection) so typed edits and spoken
 * revisions travel exactly the same interpretation path.
 *
 * Pure: no React, no network, no i18n.
 */

import { detectAction, detectQuantity, detectUnit } from "@/domains/voiceCapture";
import { subjectFor, type ScopeSubject } from "./subjects";
import { norm, sentences, similarity } from "./text";

export type ScopeChangeKind = "add" | "update" | "remove";
export type ScopeChangeConfidence = "high" | "medium" | "low";

/** The structured scope the narrative is compared against. */
export interface InterpretationScopeItem {
  id: string;
  sectionId: string;
  roomId: string | null;
  title: string;
  actionKey: string | null;
  quantity: number | null;
  unitKey: string | null;
  materialSelection: string | null;
  isIncluded: boolean;
}

export interface ProposedScopeChange {
  id: string;
  kind: ScopeChangeKind;
  confidence: ScopeChangeConfidence;
  /** Removals, relocations and uncertain reads must be confirmed first. */
  requiresReview: boolean;
  sourceText: string;
  title: string;
  targetItemId: string | null;
  subjectKey: string | null;
  tradeKey: string | null;
  categoryKey: string | null;
  subcategoryKey: string | null;
  actionKey: string | null;
  quantity: number | null;
  unitKey: string | null;
  /** Nothing can price this yet — flag it, never hide it. */
  needsPricing: boolean;
  reasonKeys: string[];
}

export interface NarrativeInterpretation {
  /** True when the edit changed prose only; the estimate must not go stale. */
  isWordingOnly: boolean;
  changes: ProposedScopeChange[];
  added: ProposedScopeChange[];
  updated: ProposedScopeChange[];
  removed: ProposedScopeChange[];
  requiresReview: boolean;
}

/* ------------------------------------------------------------------ intent */

/** Verbs describing demolition *work to perform* — that is scope to add. */
const WORK_REMOVAL =
  /\b(demo|demos|demoed|demolish|demolishes|demolished|tear\s+out|tearing\s+out|rip\s+out|demoler|demolicion|demolición)\b/i;

/** Phrases that retire scope the estimate already contains (needs review). */
const SCOPE_REMOVAL =
  /\b(close\s+in|close\s+off|closing\s+in|no\s+longer|not\s+doing|omit|omitting|delete|deleting|eliminate|eliminating|drop\s+the|skip\s+the|cerrar|eliminar|omitir|ya\s+no)\b/i;

const RELOCATION = /\b(move|moving|relocate|relocating|shift|mover|reubicar)\b/i;

/* ---------------------------------------------------------------- matching */

function bestMatch(
  text: string,
  subject: ScopeSubject | null,
  items: readonly InterpretationScopeItem[],
): { item: InterpretationScopeItem; score: number } | null {
  let best: { item: InterpretationScopeItem; score: number } | null = null;
  for (const item of items) {
    const itemSubject = subjectFor(item.title);
    const sameSubject = subject != null && itemSubject != null && itemSubject.key === subject.key;
    const score = similarity(text, item.title) + (sameSubject ? 0.4 : 0);
    if (!best || score > best.score) best = { item, score };
  }
  return best && best.score >= 0.45 ? best : null;
}

/* --------------------------------------------------------------- interpret */

export interface InterpretNarrativeInput {
  priorText: string;
  nextText: string;
  items: readonly InterpretationScopeItem[];
  idFactory?: (index: number) => string;
}

/**
 * Compare the edited narrative against the prior narrative AND the current
 * structured scope, then describe what the structured scope should become.
 *
 * Nothing is applied here: removals, relocations and anything uncertain come
 * back flagged `requiresReview`, so priced work can never be silently deleted
 * on the strength of a text guess.
 */
export function interpretNarrativeEdit(input: InterpretNarrativeInput): NarrativeInterpretation {
  const idFactory = input.idFactory ?? ((i: number) => `scope-change-${i}`);
  const live = input.items.filter((i) => i.isIncluded !== false);

  const prior = sentences(input.priorText);
  const next = sentences(input.nextText);
  const priorNorm = prior.map(norm);
  const nextNorm = next.map(norm);

  /* A rewritten sentence that still says the same thing is cosmetic. */
  const isCosmetic = (sentence: string, against: string[]) =>
    against.some((other) => similarity(sentence, other) >= 0.8);

  const addedSentences = next.filter(
    (s, i) => !priorNorm.includes(nextNorm[i]!) && !isCosmetic(s, prior),
  );
  const droppedSentences = prior.filter(
    (s, i) => !nextNorm.includes(priorNorm[i]!) && !isCosmetic(s, next),
  );

  const changes: ProposedScopeChange[] = [];
  let seq = 0;

  for (const sentence of addedSentences) {
    const subject = subjectFor(sentence);
    if (!subject) continue; // prose with no construction subject: wording only

    const match = bestMatch(sentence, subject, live);
    const { quantity } = detectQuantity(sentence);
    const unitKey = detectUnit(sentence) ?? subject.unitKey;
    const isWorkRemoval = WORK_REMOVAL.test(sentence);
    const isScopeRemoval = SCOPE_REMOVAL.test(sentence) && match != null;
    const isRelocation = RELOCATION.test(sentence);
    const actionKey = isWorkRemoval ? "remove" : (detectAction(sentence) ?? "install");

    const kind: ScopeChangeKind = isScopeRemoval
      ? "remove"
      : match && !isWorkRemoval && !isRelocation
        ? "update"
        : "add";

    const reasonKeys: string[] = [];
    if (isScopeRemoval) reasonKeys.push("removalIntent");
    if (isRelocation) reasonKeys.push("relocation");
    if (quantity == null && subject.unitKey !== "each") reasonKeys.push("noQuantity");
    if (subject.ballparkItemKey == null) reasonKeys.push("noPricing");

    const confidence: ScopeChangeConfidence =
      isScopeRemoval || isRelocation
        ? "medium"
        : quantity != null || subject.unitKey === "each"
          ? "high"
          : "medium";

    changes.push({
      id: idFactory(seq++),
      kind,
      confidence,
      requiresReview: kind === "remove" || isRelocation || confidence !== "high",
      sourceText: sentence,
      title: toTitle(sentence),
      targetItemId: kind === "add" ? null : (match?.item.id ?? null),
      subjectKey: subject.key,
      tradeKey: subject.tradeKey,
      categoryKey: subject.categoryKey,
      subcategoryKey: subject.subcategoryKey,
      actionKey: isScopeRemoval ? "remove" : actionKey,
      quantity,
      unitKey: unitKey ?? null,
      needsPricing:
        subject.ballparkItemKey == null || (quantity == null && subject.unitKey !== "each"),
      reasonKeys: reasonKeys.length ? reasonKeys : ["structuralChange"],
    });
  }

  /* A sentence the contractor deleted retires the scope item it described. */
  for (const sentence of droppedSentences) {
    const subject = subjectFor(sentence);
    if (!subject) continue;
    const match = bestMatch(sentence, subject, live);
    if (!match) continue;
    if (changes.some((c) => c.targetItemId === match.item.id)) continue;
    changes.push({
      id: idFactory(seq++),
      kind: "remove",
      confidence: "medium",
      requiresReview: true,
      sourceText: sentence,
      title: match.item.title,
      targetItemId: match.item.id,
      subjectKey: subject.key,
      tradeKey: subject.tradeKey,
      categoryKey: subject.categoryKey,
      subcategoryKey: subject.subcategoryKey,
      actionKey: null,
      quantity: null,
      unitKey: null,
      needsPricing: false,
      reasonKeys: ["sentenceRemoved"],
    });
  }

  const added = changes.filter((c) => c.kind === "add");
  const updated = changes.filter((c) => c.kind === "update");
  const removed = changes.filter((c) => c.kind === "remove");

  return {
    isWordingOnly: changes.length === 0,
    changes,
    added,
    updated,
    removed,
    requiresReview: changes.some((c) => c.requiresReview),
  };
}

function toTitle(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.,;]+$/, "");
  const short = clean.length > 120 ? `${clean.slice(0, 117)}…` : clean;
  return short.charAt(0).toUpperCase() + short.slice(1);
}
