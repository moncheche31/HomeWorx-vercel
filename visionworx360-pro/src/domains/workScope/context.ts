/**
 * CURRENT PROJECT SCOPE CONTEXT — the one place every estimating surface asks
 * "what is this job, and what may I therefore ask?".
 *
 * Hard rules encoded here:
 *  - Nothing is inherited. The context is a pure function of the CURRENT
 *    project's evidence; there is no module-level cache, no defaults from a
 *    previous job, no "last used" schema.
 *  - Precedence: structured scope items > approved grounded/replay/narrative >
 *    project name (a weak hint only, and never on its own a pricing driver).
 *  - Nothing generic leaks in. With no evidence at all the context is EMPTY:
 *    zero questions, zero measurement fields. An empty context asks the
 *    contractor to describe the work, it does not fall back to a garage.
 */

import type { BallparkInterviewSchema, BallparkQuestion } from "@/domains/ballpark/types";
import {
  classifyWorkDomains,
  corroboratedDomains,
  normalizeSignalText,
  type DomainEvidence,
  type ScopeSignal,
  type WorkDomain,
} from "./taxonomy";
import {
  catalogQuestionsForDomains,
  isQuestionRelevant,
  measurementFieldsForDomains,
  questionRule,
  toBallparkQuestion,
  type EstimatingLever,
  type MeasurementFieldId,
} from "./catalog";

export interface ScopeItemEvidence {
  id?: string | null;
  key?: string | null;
  title?: string | null;
  tradeKey?: string | null;
  categoryKey?: string | null;
  description?: string | null;
  quantity?: number | null;
  unitKey?: string | null;
}

export interface ProjectEvidence {
  projectId: string | null;
  /** Highest precedence: structured, approved scope rows. */
  scopeItems?: ScopeItemEvidence[];
  /** Approved wording from Photos/Video or Describe intake. */
  narrativeText?: string | null;
  /** Grounded / replay items recovered from an approved intake. */
  groundedItems?: ScopeItemEvidence[];
  /**
   * What the contractor SAID during a walkthrough or video narration.
   * Instruction-grade, like the written narrative: still gated on action +
   * object, so "here's the old lawn" opens nothing.
   */
  spokenNarration?: string | null;
  /**
   * What was SEEN in project media (photo/video/rendering analysis). Context
   * only: an observation may corroborate stated scope, never create it.
   */
  visualObservations?: string[];
  /** Weak hint ONLY. Never the primary estimator. */
  projectName?: string | null;
  /** Facts already resolved (answers, measurements, confirmed quantities). */
  knownFacts?: Record<string, unknown>;
}

export interface QuestionProvenance {
  questionId: string;
  domain: WorkDomain | "any";
  affects: EstimatingLever[];
  reason: string;
  /** The current-project evidence that put this question in play. */
  evidence: string;
}

export interface MeasurementProvenance {
  field: MeasurementFieldId;
  domain: WorkDomain;
  affects: EstimatingLever[];
  reason: string;
  evidence: string;
}

export interface KnownQuantity {
  id: string;
  title: string;
  quantity: number | null;
  unitKey: string | null;
}

/**
 * The ONLY fallback allowed when current evidence cannot classify the work.
 * We ask what the job is; we never borrow another trade's interview.
 */
export const SCOPE_CLARIFIER_QUESTION: BallparkQuestion = {
  id: "scopeClarifier",
  kind: "text",
  promptKey: "q.scopeClarifier.prompt",
  hintKey: "q.scopeClarifier.hint",
};

export interface CurrentProjectScopeContext {
  projectId: string | null;
  signals: ScopeSignal[];
  /** Corroborated work domains — the only ones allowed to drive the app. */
  domains: WorkDomain[];
  /** Single prose mentions kept for provenance but never acted on. */
  weakDomains: WorkDomain[];
  domainEvidence: DomainEvidence[];
  /** Interview questions the current scope justifies, in schema order. */
  questions: BallparkQuestion[];
  questionProvenance: QuestionProvenance[];
  measurementFields: MeasurementFieldId[];
  measurementProvenance: MeasurementProvenance[];
  knownQuantities: KnownQuantity[];
  /** In-scope drivers still unresolved: the only legitimate unknowns. */
  unresolved: BallparkQuestion[];
  /** True when the project has no usable scope evidence yet. */
  isEmpty: boolean;
  /** True when the single broad clarifier is standing in for an interview. */
  needsScopeClarifier: boolean;
}

function schemaQuestionSignature(questions: readonly BallparkQuestion[]): string {
  const text = questions.map((question) => question.id).join("|");
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function itemsToSignals(
  items: ScopeItemEvidence[] | undefined,
  source: ScopeSignal["source"],
): ScopeSignal[] {
  return (items ?? []).map((item) => ({
    key: item.key,
    title: item.title,
    tradeKey: item.tradeKey,
    categoryKey: item.categoryKey,
    description: item.description,
    source,
  }));
}

/** Approved narrative -> one signal per meaningful line. */
export function signalsFromNarrative(
  text: string | null | undefined,
  source: ScopeSignal["source"] = "narrative",
): ScopeSignal[] {
  if (!text) return [];
  return text
    .split(/\r?\n|(?<=[.;])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 2)
    .map((line) => ({ title: line, source }));
}

/**
 * A project NAME is a weak hint: it is only consulted when there is no other
 * evidence, and it can never contribute a pricing quantity on its own.
 */
function nameHintSignals(name: string | null | undefined): ScopeSignal[] {
  if (!name) return [];
  return [{ title: name, source: "project_name" }];
}

export function isFactKnown(facts: Record<string, unknown> | null | undefined, id: string): boolean {
  if (!facts) return false;
  const value = facts[id];
  if (value == null || value === "" || value === "unsure") return false;
  if (typeof value === "object") {
    const record = value as { status?: string; value?: unknown };
    return (
      record.status === "answered" &&
      record.value != null &&
      record.value !== "" &&
      record.value !== "unsure"
    );
  }
  return true;
}

/**
 * Build the context. `baseSchema` supplies the wording/options for questions
 * that already exist in the quick interview; catalog questions are appended
 * for domains the base schema never covered (planting, structure, built-ins…).
 */
export function buildCurrentProjectScopeContext(
  evidence: ProjectEvidence,
  baseSchema?: BallparkInterviewSchema,
): CurrentProjectScopeContext {
  const structured = itemsToSignals(evidence.scopeItems, "scope_item");
  const grounded = itemsToSignals(evidence.groundedItems, "grounded");
  const narrative = signalsFromNarrative(evidence.narrativeText);
  const spoken = signalsFromNarrative(evidence.spokenNarration, "spoken_narration");
  /* Media observations: kept for provenance, never instruction-grade. */
  const observed: ScopeSignal[] = (evidence.visualObservations ?? [])
    .map((text) => (typeof text === "string" ? text.trim() : ""))
    .filter((text) => text.length > 2)
    .map((text) => ({ title: text, source: "visual_observation" as const }));

  /* Precedence: structured scope, then approved intake, then (weakly) name. */
  const stated = [...structured, ...grounded, ...narrative, ...spoken];
  const primary = stated.length > 0 ? [...stated, ...observed] : observed;
  const signals = primary.length > 0 ? primary : nameHintSignals(evidence.projectName);

  /*
   * ADMITTED SCOPE DECIDES THE INTERVIEW. Once the scope-admission gate has
   * produced structured/grounded items, raw narration is provenance only: it
   * must not open another trade's questions. "That's a plumbing chase" is how a
   * fascia/insulation punch list inherited pipe material, rough-in access and
   * fixture-count questions it had no business asking.
   */
  const admitted = [...structured, ...grounded];
  const questionSignals = admitted.length > 0 ? admitted : signals;

  const domainEvidence = classifyWorkDomains(questionSignals);
  /*
   * Only CORROBORATED domains drive questions, measurements and pricing. A
   * domain matched once, in prose only, is remembered as a weak hint and
   * suppressed: "using mid grade materials" must not open site grading, and
   * "receptacles at counters" must not open countertop work.
   */
  const domains = corroboratedDomains(domainEvidence);
  const weakDomains = domainEvidence
    .filter((e) => e.strength === "weak" && !domains.includes(e.domain))
    .map((e) => e.domain);
  /*
   * Only STATED evidence contributes the free-text used by question and
   * measurement relevance. Otherwise a photo of a yard would text-match its way
   * into landscaping questions on a bookcase job.
   */
  const scopeText = questionSignals
    .filter((signal) => signal.source !== "visual_observation")
    .map(normalizeSignalText)
    .join(" ");

  const evidenceFor = (domainList: WorkDomain[]): string => {
    const hit = domainEvidence.find((e) => domainList.includes(e.domain));
    return hit ? hit.evidence : domainEvidence[0]?.evidence ?? "";
  };

  const baseQuestions = (baseSchema?.questions ?? []).filter((question) =>
    isQuestionRelevant(question.id, domains, scopeText),
  );
  const baseIds = new Set(baseQuestions.map((q) => q.id));
  const catalogQuestions = catalogQuestionsForDomains(domains, scopeText)
    .filter((def) => !baseIds.has(def.id))
    .map(toBallparkQuestion);

  const classified = [...baseQuestions, ...catalogQuestions];
  /*
   * The clarifier exists for UNIDENTIFIED work only. Fully understood scope with
   * every driver already stated (56 LF of fascia, a 210 SF ceiling, one access
   * door) correctly asks NOTHING — asking "what is the job?" then would be a
   * regression, not diligence.
   */
  const needsScopeClarifier = domains.length === 0;
  const questions = needsScopeClarifier ? [SCOPE_CLARIFIER_QUESTION] : classified;

  const questionProvenance: QuestionProvenance[] = questions.map((question) => {
    if (question.id === SCOPE_CLARIFIER_QUESTION.id) {
      return {
        questionId: question.id,
        domain: "any" as const,
        affects: ["feasibility" as EstimatingLever],
        reason: "Current evidence does not identify the work yet; ask what the job is.",
        evidence: signals[0]?.title ?? "",
      };
    }
    const rule = questionRule(question.id);
    return {
      questionId: question.id,
      domain: rule && rule.domains.length > 0 ? rule.domains.find((d) => domains.includes(d)) ?? rule.domains[0] : "any",
      affects: rule?.affects ?? [],
      reason: rule?.reason ?? "",
      evidence: rule ? evidenceFor(rule.domains) : "",
    };
  });

  const measurementFields = measurementFieldsForDomains(domains, scopeText);
  const measurementProvenance: MeasurementProvenance[] = measurementFields.map((field) => {
    const rule = questionRule(field) ?? null;
    const domain = domains.find((d) => rule?.domains.includes(d)) ?? domains[0];
    return {
      field,
      domain,
      affects: rule?.affects ?? ["quantity"],
      reason: rule?.reason ?? "",
      evidence: evidenceFor(rule?.domains ?? domains),
    };
  });

  const knownQuantities: KnownQuantity[] = (evidence.scopeItems ?? [])
    .filter((item) => typeof item.quantity === "number" && (item.quantity ?? 0) > 0)
    .map((item, index) => ({
      id: item.id ?? item.key ?? `item-${index}`,
      title: item.title ?? "",
      quantity: item.quantity ?? null,
      unitKey: item.unitKey ?? null,
    }));

  const unresolved = questions.filter(
    (question) => !isFactKnown(evidence.knownFacts, question.id),
  );

  return {
    projectId: evidence.projectId,
    signals,
    domains,
    weakDomains,
    domainEvidence,
    questions,
    questionProvenance,
    measurementFields,
    measurementProvenance,
    knownQuantities,
    unresolved,
    isEmpty: domains.length === 0,
    needsScopeClarifier,
  };
}

/** The interview schema this project deserves — nothing more. */
export function schemaFromContext(
  context: CurrentProjectScopeContext,
  baseSchema: BallparkInterviewSchema,
): BallparkInterviewSchema {
  if (context.questions.length === baseSchema.questions.length) return baseSchema;
  return {
    ...baseSchema,
    key: `${baseSchema.key}.scoped.${schemaQuestionSignature(context.questions)}`,
    questions: context.questions,
  };
}
