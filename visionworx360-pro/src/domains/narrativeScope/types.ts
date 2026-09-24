/**
 * Module 010B — Narrative Scope of Work contracts.
 *
 * Pure, UI-free, deterministic. This layer NEVER calculates costs and never
 * writes data: it renders the existing scope records (Modules 005/006) as
 * contractor- and customer-readable prose, and detects the few missing
 * decisions worth asking about. The estimating engine (Module 008) remains the
 * single source of truth for all math.
 */

export type NarrativeLocale = "en-US" | "es-US";

/** Minimal projection of a scope item the narrative layer needs. */
export interface NarrativeSourceItem {
  id: string;
  title: string;
  actionKey: string | null;
  quantity: number | null;
  unitKey: string | null;
  materialSelection: string | null;
  /**
   * Component-level detail the estimator already reconciled (e.g. the cabinet
   * bank's base/upper makeup). Rendered as a clause on the scope sentence so
   * the contractor's own specifics survive into the scope of work.
   */
  detail?: string | null;
  customerNotes: string | null;

  roomId: string | null;
  sectionId: string;
  isIncluded: boolean;
  isClientVisible: boolean;
  confidenceStatus: string | null;
  sortOrder: number;
}

export interface NarrativeSourceSection {
  id: string;
  name: string;
  roomId: string | null;
  sortOrder: number;
}

export interface NarrativeSourceRoom {
  id: string;
  name: string;
}

export interface NarrativeInput {
  projectName: string;
  sections: NarrativeSourceSection[];
  items: NarrativeSourceItem[];
  rooms: NarrativeSourceRoom[];
  locale: NarrativeLocale;
  /** Answers to generated questions, keyed by question id. */
  answers?: Record<string, string>;
  /** Customer-facing rendering hides internal-only items. */
  audience?: "contractor" | "customer";
}

export interface NarrativeLine {
  /** Stable key so edits and answers survive regeneration. */
  key: string;
  itemId: string | null;
  text: string;
}

export interface NarrativeGroup {
  key: string;
  title: string;
  lines: NarrativeLine[];
}

export interface NarrativeDocument {
  title: string;
  groups: NarrativeGroup[];
  closing: string;
  /** Flat plain-text rendering (used for editing and proposals). */
  text: string;
}

export type NarrativeQuestionKind =
  | "decision"
  | "selection"
  | "confirm";

export type NarrativeAnswerType = "choice" | "yesno" | "text";

export interface NarrativeQuestionOption {
  value: string;
  labelKey: string;
}

export interface NarrativeQuestion {
  id: string;
  /** Stable decision topic (or "customer_decision" for item-level flags). */
  topic: string;
  itemId: string | null;
  kind: NarrativeQuestionKind;
  /** i18n key for the prompt. */
  promptKey: string;
  /** Plain subject (the scope item title) — empty for topic questions. */
  subject: string;
  answerType: NarrativeAnswerType;
  options: NarrativeQuestionOption[];
  /** Higher = more scope/cost impact. Drives ranking and the display cap. */
  priority: number;
  /** Substantive answers change the work; wording answers do not. */
  substantive: boolean;
}

/** Everything the detector reconciles against before asking anything. */
export interface NarrativeQuestionSpecInput {
  items: NarrativeSourceItem[];
  answers?: Record<string, string>;
  narrativeText?: string;
  projectName?: string;
  /**
   * Estimating level being prepared. Ballpark keeps the interview short and
   * defers production detail; detailed reviews everything.
   */
  mode?: "ballpark" | "detailed";
  /** True when project measurements/geometry are persisted. */
  hasGeometry?: boolean;
  /** Persisted project geometry, resolved through the canonical fact layer. */
  geometry?: {
    lengthFt?: number | null;
    widthFt?: number | null;
    ceilingHeightFt?: number | null;
    interiorPartitionLf?: number | null;
    openings?: unknown[] | null;
  } | null;
  /** Persisted ballpark interview answers, so both paths share known facts. */
  ballparkAnswers?: Record<string, { status?: string; value?: unknown } | undefined> | null;
}
