/**
 * Narrative ↔ structured scope reconciliation.
 *
 * A sentence-level diff of two narratives only sees what the contractor typed
 * *this time*. It cannot see legacy structured scope that predates the current
 * narrative entirely — for example kitchen-remodel line items still marked
 * included on a project whose Scope of Work now describes a garage conversion.
 *
 * That leftover scope is what silently poisons ballpark recalculation, so it is
 * detected here as an explicit, reviewable mismatch. Nothing is ever deleted:
 * reconciliation only ever proposes an *exclusion* the contractor must confirm.
 *
 * Pure: no React, no network, no i18n.
 */

import { subjectFor } from "./subjects";
import { sentences, similarity } from "./text";
import type { InterpretationScopeItem, ProposedScopeChange } from "./interpret";

export interface UnreconciledScopeItem {
  id: string;
  title: string;
  /** `notInNarrative` = included scope the current narrative never describes. */
  reason: "notInNarrative";
}

/** A scope title is considered described when a sentence overlaps this much. */
const SUPPORT_THRESHOLD = 0.34;

export interface ReconcileInput {
  /** The contractor-current narrative (approved text preferred, else edited). */
  narrativeText: string;
  items: readonly InterpretationScopeItem[];
}

/**
 * Included scope items the current narrative does not describe.
 * An empty narrative reconciles to nothing: absence of prose is not evidence.
 */
export function findUnreconciledScopeItems(input: ReconcileInput): UnreconciledScopeItem[] {
  const lines = sentences(input.narrativeText ?? "");
  if (lines.length === 0) return [];

  const lineSubjects = new Set(
    lines.map((s) => subjectFor(s)?.key).filter((k): k is string => Boolean(k)),
  );

  const out: UnreconciledScopeItem[] = [];
  for (const item of input.items) {
    if (item.isIncluded === false) continue;
    const subjectKey = subjectFor(item.title)?.key ?? null;
    if (subjectKey && lineSubjects.has(subjectKey)) continue;
    const supported = lines.some((s) => similarity(s, item.title) >= SUPPORT_THRESHOLD);
    if (supported) continue;
    out.push({ id: item.id, title: item.title, reason: "notInNarrative" });
  }
  return out;
}

/**
 * Turn unreconciled leftovers into reviewable removal proposals so they appear
 * in "Review scope changes" alongside the sentence-level diff.
 */
export function buildOrphanRemovals(
  input: ReconcileInput,
  options: { idFactory?: (index: number) => string; skipItemIds?: readonly string[] } = {},
): ProposedScopeChange[] {
  const idFactory = options.idFactory ?? ((i: number) => `scope-orphan-${i}`);
  const skip = new Set(options.skipItemIds ?? []);
  return findUnreconciledScopeItems(input)
    .filter((o) => !skip.has(o.id))
    .map((orphan, index) => {
      const subject = subjectFor(orphan.title);
      return {
        id: idFactory(index),
        kind: "remove" as const,
        confidence: "medium" as const,
        requiresReview: true,
        sourceText: orphan.title,
        title: orphan.title,
        targetItemId: orphan.id,
        subjectKey: subject?.key ?? null,
        tradeKey: subject?.tradeKey ?? null,
        categoryKey: subject?.categoryKey ?? null,
        subcategoryKey: subject?.subcategoryKey ?? null,
        actionKey: null,
        quantity: null,
        unitKey: null,
        needsPricing: false,
        reasonKeys: ["notInNarrative"],
      };
    });
}
