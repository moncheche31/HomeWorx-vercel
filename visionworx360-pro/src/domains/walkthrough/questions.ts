import type { VoiceDraftItem } from "@/domains/voiceCapture";
import type { WalkthroughAnswer, WalkthroughQuestion, WalkthroughQuestionOption } from "./types";

/**
 * Deterministic missing-information prompts.
 *
 * Only asks what smart defaults cannot resolve. Category, subcategory, trade,
 * section and unit are never asked when the parser or Knowledge Base can
 * provide a reasonable default — those stay editable in Advanced Edit.
 */

const COUNTABLE_UNITS = new Set(["each", "sheet", "allowance", "lump_sum"]);
const SIZE_HINTS = /\b(vanity|shower|tub|window|door|cabinet|counter|ducha|ventana|puerta)\b/i;

function optionSet(values: string[], prefix: string): WalkthroughQuestionOption[] {
  return values.map((value) => ({ value, label: `${prefix}.${value}` }));
}

export function buildQuestions(
  drafts: VoiceDraftItem[],
  opts: { rooms?: Array<{ id: string | null; name: string }> } = {},
): WalkthroughQuestion[] {
  const rooms = opts.rooms ?? [];
  const questions: WalkthroughQuestion[] = [];

  for (const draft of drafts) {
    if (draft.status === "rejected") continue;
    const subject = draft.title;

    // Which Knowledge Base match is correct? (ambiguous lexical match)
    if (!draft.assemblyKey && draft.matches.length > 1) {
      questions.push({
        id: `${draft.id}:match`,
        draftId: draft.id,
        kind: "match",
        subject,
        options: draft.matches.slice(0, 4).map((m) => ({
          value: m.assemblyKey,
          label: m.workItem,
          rawLabel: true,
        })),
        freeform: false,
      });
    }

    // Which room? Only when nothing in the transcript or context resolved one.
    if (!draft.roomId && rooms.length > 0) {
      questions.push({
        id: `${draft.id}:room`,
        draftId: draft.id,
        kind: "room",
        subject,
        options: rooms
          .filter((r) => r.id)
          .slice(0, 8)
          .map((r) => ({ value: r.id as string, label: r.name, rawLabel: true })),
        freeform: false,
      });
    }

    // Remove and replace, or install new?
    if (!draft.actionKey) {
      questions.push({
        id: `${draft.id}:action`,
        draftId: draft.id,
        kind: "action",
        subject,
        options: optionSet(["replace", "install", "remove", "repair"], "questions.options.action"),
        freeform: false,
      });
    }

    // How many?
    if (draft.quantity === null && (!draft.unitKey || COUNTABLE_UNITS.has(draft.unitKey))) {
      questions.push({
        id: `${draft.id}:quantity`,
        draftId: draft.id,
        kind: "quantity",
        subject,
        options: [1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n), rawLabel: true })),
        freeform: true,
      });
    }

    // What size? Only for items that clearly reference a sized product.
    if (draft.measurements.length === 0 && SIZE_HINTS.test(draft.sourceText || draft.title)) {
      questions.push({
        id: `${draft.id}:size`,
        draftId: draft.id,
        kind: "size",
        subject,
        options: [],
        freeform: true,
      });
    }

    // Labor only or labor and materials?
    if (draft.confidence !== "high") {
      questions.push({
        id: `${draft.id}:laborScope`,
        draftId: draft.id,
        kind: "laborScope",
        subject,
        options: optionSet(["labor_only", "labor_materials"], "questions.options.laborScope"),
        freeform: false,
      });
    }

    // Is this product an allowance?
    if (draft.unitKey === "allowance" || /allowance|alcance|presupuesto/i.test(draft.sourceText)) {
      questions.push({
        id: `${draft.id}:allowance`,
        draftId: draft.id,
        kind: "allowance",
        subject,
        options: optionSet(["yes", "no"], "questions.options.allowance"),
        freeform: false,
      });
    }
  }

  return questions;
}

/** Apply one answer to its draft. Pure — returns a patch, never mutates. */
export function answerToPatch(
  question: WalkthroughQuestion,
  answer: WalkthroughAnswer,
  draft: VoiceDraftItem,
): Partial<VoiceDraftItem> {
  if (answer.status !== "answered") {
    return answer.status === "later" || answer.status === "unsure" ? { needsReview: true } : {};
  }
  const value = answer.value;
  switch (question.kind) {
    case "quantity": {
      const n = Number(value);
      return Number.isFinite(n) && n > 0 ? { quantity: n, unitKey: draft.unitKey ?? "each" } : {};
    }
    case "size": {
      const raw = String(value).trim();
      if (!raw) return {};
      return {
        measurements: [...draft.measurements, { raw, kind: "size", values: [], unit: "unknown" }],
      };
    }
    case "room": {
      return { roomId: String(value) };
    }
    case "action": {
      return { actionKey: String(value) };
    }
    case "match": {
      const match = draft.matches.find((m) => m.assemblyKey === String(value));
      if (!match) return {};
      return {
        assemblyKey: match.assemblyKey,
        title: draft.title || match.workItem,
        tradeKey: match.tradeKey,
        categoryKey: match.categoryKey,
        subcategoryKey: match.subcategoryKey,
        unitKey: draft.unitKey ?? match.unitKey,
        origin: "knowledge_base",
        needsReview: false,
      };
    }
    case "laborScope": {
      return { unitKey: draft.unitKey ?? (value === "labor_only" ? "hour" : draft.unitKey) };
    }
    case "allowance": {
      return value === "yes" ? { unitKey: "allowance" } : {};
    }
    default:
      return {};
  }
}

/** Apply an answer map to a draft list. Pure. */
export function applyAnswers(
  drafts: VoiceDraftItem[],
  questions: WalkthroughQuestion[],
  answers: Record<string, WalkthroughAnswer>,
): VoiceDraftItem[] {
  let next = drafts;
  for (const question of questions) {
    const answer = answers[question.id];
    if (!answer) continue;
    next = next.map((d) =>
      d.id === question.draftId ? { ...d, ...answerToPatch(question, answer, d) } : d,
    );
  }
  return next;
}

/** Questions still unanswered — drives the "unresolved questions" counter. */
export function unresolvedQuestions(
  questions: WalkthroughQuestion[],
  answers: Record<string, WalkthroughAnswer>,
): WalkthroughQuestion[] {
  return questions.filter((q) => !answers[q.id]);
}
