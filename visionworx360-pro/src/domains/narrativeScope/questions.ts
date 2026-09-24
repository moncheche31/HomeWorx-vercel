import type { BallparkQuestionTopic } from "@/domains/ballpark/questionPriority";
import { detectConstructionDependencies } from "@/domains/constructionDependencies";
import { planQuestions } from "@/domains/questionPolicy";

import {
  resolveProjectFacts,
  type CanonicalProjectFacts,
} from "@/domains/projectFacts";
import type {
  NarrativeQuestion,
  NarrativeQuestionSpecInput,
  NarrativeSourceItem,
} from "./types";

/**
 * Narrative topics mapped onto the calibrated ballpark impact buckets, so the
 * clarification pass and the ballpark interview rank questions on the SAME
 * scale instead of two private notions of "priority".
 */
const NARRATIVE_TOPIC_IMPACT: Record<string, BallparkQuestionTopic | undefined> = {
  garage_door_disposition: "wallChanges",
  bath_fixture_type: "bathroomType",
  hvac_strategy: "electricalHvac",
  opening_disposition: "wallChanges",
  structural_change: "structural",
  plumbing_relocation: "plumbingRelocation",
  finish_level: "finishTier",
  flooring_type: "flooringCategory",
  ceiling_height: "ceilingHeight",
  site_access: "siteConditions",
};

/**
 * Scope clarification questions.
 *
 * These are contractor-to-homeowner decisions, NOT takeoff prompts. A question
 * only appears when the answer would change what work is included, a
 * construction method or product choice, feasibility/safety, a meaningful cost
 * band, or what the customer is promised.
 *
 * Anything a Ballpark can derive from geometry or a standard residential
 * allowance (SF, LF, sheet counts, stud counts, duct footage, fixture counts)
 * is never asked here — that belongs to the Detailed estimate.
 */

const MAX_QUESTIONS = 5;

interface Facts {
  /** Lowercased haystack of every known project fact. */
  text: string;
  hasGeometry: boolean;
  canonical: CanonicalProjectFacts;
}

interface QuestionSpec {
  topic: string;
  priority: number;
  answerType: "choice" | "yesno" | "text";
  options: string[];
  /** Is this decision even part of this project? */
  applies: (f: Facts) => boolean;
  /** Is the decision already answered by scope, narrative or geometry? */
  resolved: (f: Facts) => boolean;
  /** Substantive answers change the work; wording answers do not. */
  substantive: boolean;
}

const has = (f: Facts, re: RegExp) => re.test(f.text);

const SPECS: QuestionSpec[] = [
  {
    topic: "garage_door_disposition",
    priority: 100,
    answerType: "choice",
    options: ["keep", "remove_infill", "replace_with_window"],
    applies: (f) => has(f, /garage/),
    // Any explicit mention of the overhead/garage door means it is addressed.
    resolved: (f) => has(f, /garage (overhead |roll[- ]?up )?door|overhead door/),
    substantive: true,
  },
  {
    topic: "bath_fixture_type",
    priority: 95,
    answerType: "choice",
    options: ["shower_only", "tub_shower", "no_bath"],
    applies: (f) => has(f, /bath|shower|tub|vanity|toilet/),
    resolved: (f) => has(f, /shower|tub|bathtub/),
    substantive: true,
  },
  {
    topic: "hvac_strategy",
    priority: 92,
    answerType: "choice",
    options: ["extend_existing", "mini_split", "separate_system"],
    applies: (f) => has(f, /hvac|heat|furnace|mini.?split|air.?condition|climate|cooling/),
    resolved: (f) =>
      has(f, /extend (the )?hvac|extend hvac|mini.?split|separate (unit|system)|new furnace|new hvac/),
    substantive: true,
  },
  {
    topic: "opening_disposition",
    priority: 90,
    answerType: "choice",
    options: ["reuse", "replace", "relocate"],
    applies: (f) => has(f, /window/),
    resolved: (f) =>
      has(f, /(remov|reframe|replac|reus|relocat|mov|new|egress|close in|infill)[a-z]* [^.]{0,24}window|window[^.]{0,24}(remov|reframe|replac|reus|relocat|mov|egress)/),
    substantive: true,
  },
  /* structural_wall is no longer a loose keyword spec: it is driven by the
     explicit construction-dependency rule table (see
     src/domains/constructionDependencies). */

  {
    topic: "electrical_service",
    priority: 75,
    answerType: "choice",
    options: ["existing_panel", "subpanel", "service_upgrade", "unknown"],
    applies: (f) => has(f, /circuit|electrical|outlet|receptacle|lighting|panel/),
    resolved: (f) => has(f, /\d{2,3}\s?a(mp)?\b|subpanel|service upgrade|existing panel/),
    substantive: true,
  },
  {
    topic: "interior_door_style",
    priority: 70,
    answerType: "yesno",
    options: ["yes", "no"],
    applies: (f) => has(f, /(interior|entry|bedroom) door/),
    resolved: (f) => has(f, /match|solid.?core|hollow.?core|prehung|slab door|panel door/),
    substantive: false,
  },
  {
    topic: "bath_exhaust_venting",
    priority: 65,
    answerType: "choice",
    options: ["wall", "roof", "soffit"],
    applies: (f) => has(f, /bath|shower|toilet/),
    resolved: (f) => has(f, /exhaust|vent fan|fan vent|vented (through|to)/),
    substantive: true,
  },
  {
    topic: "flooring_selection",
    priority: 60,
    answerType: "choice",
    options: ["hardwood", "lvp", "tile", "carpet"],
    applies: (f) => has(f, /floor/),
    resolved: (f) => has(f, /hardwood|lvp|luxury vinyl|vinyl|tile|carpet|laminate|epoxy|polished concrete/),
    substantive: true,
  },
  {
    topic: "finish_level",
    priority: 40,
    answerType: "choice",
    options: ["builder", "standard", "premium"],
    applies: (f) => has(f, /paint|trim|finish/),
    resolved: (f) => has(f, /builder grade|standard finish|premium|high.?end|low.?voc|mid.?grade/),
    substantive: false,
  },
];

function buildFacts(input: NarrativeQuestionSpecInput): Facts {
  /* One canonical fact resolver for every entry point — see
     src/domains/projectFacts. This path must never grow its own fact model. */
  const canonical = resolveProjectFacts({
    items: input.items,
    narrativeText: input.narrativeText,
    projectName: input.projectName,
    narrativeAnswers: input.answers,
    priorAnswers: input.ballparkAnswers ?? null,
    geometry: input.geometry ?? null,
  });
  return {
    text: canonical.text,
    hasGeometry: !!input.hasGeometry || canonical.hasGeometry,
    canonical,
  };
}


/** Item-level decisions the contractor explicitly flagged for the customer. */
function customerDecisions(items: NarrativeSourceItem[], answered: Record<string, string>) {
  return items
    .filter(
      (i) =>
        i.isIncluded &&
        i.confidenceStatus === "customer_decision_required" &&
        !answered[`decision:${i.id}`]?.trim(),
    )
    .map<NarrativeQuestion>((item) => ({
      id: `decision:${item.id}`,
      topic: "customer_decision",
      itemId: item.id,
      kind: "decision",
      promptKey: "questions.prompt.decision",
      subject: item.title,
      answerType: "text",
      options: [],
      priority: 110,
      substantive: true,
    }));
}

/**
 * Deterministic detection of the few decisions the contractor still owes.
 * Ranked by scope/cost impact and capped so this never becomes a form.
 */
export function detectQuestions(input: NarrativeQuestionSpecInput): NarrativeQuestion[] {
  const answered = input.answers ?? {};
  const facts = buildFacts(input);

  const topicQuestions = SPECS.filter((spec) => {
    if (!spec.applies(facts)) return false;
    if (spec.resolved(facts)) return false;
    return !answered[`topic:${spec.topic}`]?.trim();
  }).map<NarrativeQuestion>((spec) => ({
    id: `topic:${spec.topic}`,
    topic: spec.topic,
    itemId: null,
    kind: spec.answerType === "yesno" ? "confirm" : "selection",
    promptKey: `questions.prompt.${spec.topic}`,
    subject: "",
    answerType: spec.answerType,
    options: spec.options.map((value) => ({
      value,
      labelKey: `questions.options.${spec.topic}.${value}`,
    })),
    priority: spec.priority,
    substantive: spec.substantive,
  }));

  /*
   * CONSTRUCTION DEPENDENCIES.
   *
   * Well-established requirements the narration implies but never settled —
   * today only "is that wall load-bearing?". Asked, never assumed: the app
   * neither skips the beam nor adds one on its own authority.
   */
  const dependencyQuestions = detectConstructionDependencies(facts.text)
    .filter(({ rule }) => !answered[`topic:${rule.topic}`]?.trim())
    .map<NarrativeQuestion>(({ rule }) => ({
      id: `topic:${rule.topic}`,
      topic: rule.topic,
      itemId: null,
      kind: "selection",
      promptKey: `questions.prompt.${rule.topic}`,
      subject: "",
      answerType: rule.answerType,
      options: rule.options.map((value) => ({
        value,
        labelKey: `questions.options.${rule.topic}.${value}`,
      })),
      priority: rule.priority,
      substantive: true,
    }));

  const candidates = [
    ...customerDecisions(input.items, answered),
    ...dependencyQuestions,
    ...topicQuestions,
  ].sort((a, b) => b.priority - a.priority);


  /*
   * Every surface routes through the ONE universal policy so a contractor
   * never gets the same question twice in different words, never gets a
   * takeoff prompt during a ballpark, and never faces an unbounded interview.
   *
   * The spec `priority` is already a calibrated 0-100 rank for these
   * decisions, so it is passed through as the impact score: ordering is
   * unchanged, and the policy contributes the dedupe and the budget. Only a
   * top-tier decision can push the interview past the comfortable length.
   */
  const plan = planQuestions(
    candidates.map((q) => ({
      id: q.id,
      subject: `${q.topic} ${q.subject}`.trim(),
      topic: NARRATIVE_TOPIC_IMPACT[q.topic],
      impactPct: q.priority,
      source: q.id,
    })),
    { mode: input.mode ?? "ballpark", target: 5, max: 8, highImpactPct: 95 },
  );

  const byId = new Map(candidates.map((q) => [q.id, q]));
  return plan.ask.map((c) => byId.get(c.id)!).filter(Boolean);
}

/**
 * The questions the contractor has ALREADY answered, so a completed
 * clarification pass can be reopened for review with the prior answers in
 * place instead of showing "nothing else to ask".
 */
export function answeredQuestions(input: NarrativeQuestionSpecInput): NarrativeQuestion[] {
  const answered = input.answers ?? {};
  if (Object.keys(answered).length === 0) return [];
  return detectQuestions({ ...input, answers: {} }).filter((q) => !!answered[q.id]?.trim());
}

/** Exposed for tests: the full ranked list before the display cap. */
export const NARRATIVE_QUESTION_TOPICS = SPECS.map((s) => s.topic);
