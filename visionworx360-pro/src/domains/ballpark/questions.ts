/**
 * The Quick Ballpark interview schema.
 *
 * Data-driven on purpose: adding a project type means adding a question array,
 * never new component code. Conditions are declarative so the runner can walk
 * the list without knowing what a garage conversion is.
 */

import type {
  BallparkAnswers,
  BallparkInterviewSchema,
  BallparkOption,
  BallparkQuestion,
} from "./types";

const opt = (
  value: string,
  labelKey: string,
  en: string[],
  es: string[],
): BallparkOption => ({ value, labelKey, match: { "en-US": en, "es-US": es } });

const YES_NO_UNSURE: BallparkOption[] = [
  opt("yes", "options.yes", ["yes", "yeah", "yep", "correct", "affirmative"], ["si", "claro", "correcto"]),
  opt("no", "options.no", ["no", "nope", "negative"], ["no", "nada"]),
  opt("unsure", "options.unsure", ["unsure", "not sure", "dont know", "do not know", "maybe"], ["no se", "no estoy seguro", "quiza", "tal vez"]),
];

const EXTENT: BallparkOption[] = [
  opt("none", "options.none", ["none", "no walls", "nothing", "zero"], ["ninguna", "nada", "cero"]),
  opt("light", "options.light", ["light", "a little", "minimal", "one wall"], ["poca", "ligera", "minima"]),
  opt("moderate", "options.moderate", ["moderate", "medium", "average", "some"], ["moderada", "media", "algo"]),
  opt("extensive", "options.extensive", ["extensive", "a lot", "lots", "heavy", "full"], ["extensa", "mucha", "bastante"]),
];

/**
 * GARAGE CONVERSION quick ballpark — an archetype-specific question LIBRARY,
 * never a universal question set.
 *
 * Surfaces must always pass it through the current-project scope filter
 * (`schemaForScope` / `buildCurrentProjectScopeContext`). A question in here
 * only reaches a contractor when the CURRENT project's admitted scope declares
 * its domain (and, for surface-level rules, names the thing being worked on).
 */
export const GARAGE_CONVERSION_SCHEMA: BallparkInterviewSchema = {
  key: "quick_ballpark_v1",
  titleKey: "schema.quickBallpark",

  questions: [
    {
      id: "lengthFt",
      kind: "dimension",
      promptKey: "q.lengthFt.prompt",
      hintKey: "q.lengthFt.hint",
      unit: "ft",
      acceptsPair: { lengthId: "lengthFt", widthId: "widthFt" },
      /* Ballpark is not a takeoff: an unknown room dimension becomes a
         disclosed footprint allowance (see derive.ts) instead of a hard stop. */
      allowUnknown: true,
    },
    {
      id: "widthFt",
      kind: "dimension",
      promptKey: "q.widthFt.prompt",
      hintKey: "q.widthFt.hint",
      unit: "ft",
      allowUnknown: true,
    },

    {
      id: "ceilingHeightFt",
      kind: "dimension",
      promptKey: "q.ceilingHeightFt.prompt",
      hintKey: "q.ceilingHeightFt.hint",
      unit: "ft",
      defaultValue: 8,
      allowUnknown: true,
    },
    {
      id: "useOfSpace",
      kind: "text",
      promptKey: "q.useOfSpace.prompt",
      hintKey: "q.useOfSpace.hint",
      allowUnknown: true,
    },
    {
      id: "bathroom",
      kind: "choice",
      promptKey: "q.bathroom.prompt",
      options: [
        opt("none", "options.bath.none", ["none", "no bathroom", "no bath"], ["ninguno", "sin bano"]),
        opt("half", "options.bath.half", ["half", "half bath", "powder"], ["medio", "medio bano"]),
        opt("full", "options.bath.full", ["full", "full bath", "shower", "complete"], ["completo", "bano completo", "ducha"]),
      ],
      allowUnknown: true,
    },
    {
      id: "closet",
      kind: "choice",
      promptKey: "q.closet.prompt",
      options: [
        opt("none", "options.closet.none", ["none", "no closet"], ["ninguno", "sin closet"]),
        opt("small", "options.closet.small", ["small", "little"], ["pequeno", "chico"]),
        opt("standard", "options.closet.standard", ["standard", "normal", "regular"], ["estandar", "normal"]),
        opt("large", "options.closet.large", ["large", "big", "walk in", "walk-in"], ["grande", "vestidor"]),
      ],
      allowUnknown: true,
    },
    {
      id: "partitions",
      kind: "choice",
      promptKey: "q.partitions.prompt",
      hintKey: "q.partitions.hint",
      options: EXTENT,
      allowUnknown: true,
    },
    {
      id: "partitionLfKnown",
      kind: "dimension",
      promptKey: "q.partitionLfKnown.prompt",
      hintKey: "q.partitionLfKnown.hint",
      unit: "ft",
      allowUnknown: true,
      optional: true,
      condition: { questionId: "partitions", notEquals: ["none"] },

    },
    {
      id: "raisedFloor",
      kind: "choice",
      promptKey: "q.raisedFloor.prompt",
      hintKey: "q.raisedFloor.hint",
      options: YES_NO_UNSURE,
      allowUnknown: true,
    },
    {
      id: "insulationWalls",
      kind: "choice",
      promptKey: "q.insulationWalls.prompt",
      options: YES_NO_UNSURE,
      allowUnknown: true,
    },
    {
      id: "insulationCeiling",
      kind: "choice",
      promptKey: "q.insulationCeiling.prompt",
      options: YES_NO_UNSURE,
      allowUnknown: true,
    },
    {
      id: "insulationFloor",
      kind: "choice",
      promptKey: "q.insulationFloor.prompt",
      options: YES_NO_UNSURE,
      allowUnknown: true,
      condition: { questionId: "raisedFloor", notEquals: ["no"] },
    },
    {
      id: "drywall",
      kind: "choice",
      promptKey: "q.drywall.prompt",
      options: [
        opt("walls_and_ceiling", "options.drywall.wallsAndCeiling", ["walls and ceiling", "everything", "all"], ["paredes y techo", "todo"]),
        opt("walls_only", "options.drywall.wallsOnly", ["walls only", "just walls", "walls"], ["solo paredes", "paredes"]),
        opt("none", "options.drywall.none", ["none", "no drywall"], ["ninguno", "sin tablaroca"]),
      ],
      allowUnknown: true,
    },
    {
      id: "flooringQuality",
      kind: "choice",
      promptKey: "q.flooringQuality.prompt",
      options: [
        opt("basic", "options.quality.basic", ["basic", "builder", "cheap", "economy"], ["basico", "economico"]),
        opt("mid", "options.quality.mid", ["mid", "mid range", "midrange", "middle", "standard"], ["medio", "intermedio", "estandar"]),
        opt("premium", "options.quality.premium", ["premium", "high end", "top", "luxury"], ["premium", "alta gama", "lujo"]),
        opt("none", "options.quality.noFlooring", ["none", "no flooring", "keep existing"], ["ninguno", "sin piso"]),
      ],
      allowUnknown: true,
    },
    {
      id: "plumbing",
      kind: "choice",
      promptKey: "q.plumbing.prompt",
      hintKey: "q.plumbing.hint",
      options: [
        opt("none", "options.plumbing.none", ["none", "no plumbing"], ["ninguna", "sin plomeria"]),
        opt("nearby", "options.plumbing.nearby", ["nearby", "close", "adjacent", "short"], ["cerca", "cercana"]),
        opt("moderate", "options.plumbing.moderate", ["moderate", "medium"], ["moderada", "media"]),
        opt("major", "options.plumbing.major", ["major", "big", "long run", "complex"], ["mayor", "grande", "compleja"]),
      ],
      allowUnknown: true,
    },
    {
      id: "electrical",
      kind: "choice",
      promptKey: "q.electrical.prompt",
      options: [
        opt("basic", "options.electrical.basic", ["basic", "extension", "extend", "simple"], ["basico", "extension", "simple"]),
        opt("moderate", "options.electrical.moderate", ["moderate", "new circuits", "circuits"], ["moderado", "circuitos"]),
        opt("panel", "options.electrical.panel", ["panel", "sub panel", "subpanel", "service"], ["panel", "subpanel", "servicio"]),
      ],
      allowUnknown: true,
    },
    {
      id: "newDoors",
      kind: "count",
      promptKey: "q.newDoors.prompt",
      unit: "each",
      defaultValue: 1,
      allowUnknown: true,
    },
    {
      id: "newWindows",
      kind: "count",
      promptKey: "q.newWindows.prompt",
      unit: "each",
      defaultValue: 1,
      allowUnknown: true,
    },
    {
      id: "finishLevel",
      kind: "choice",
      promptKey: "q.finishLevel.prompt",
      options: [
        opt("basic", "options.quality.basic", ["basic", "builder", "economy"], ["basico", "economico"]),
        opt("standard", "options.quality.standard", ["standard", "normal", "typical"], ["estandar", "normal"]),
        opt("premium", "options.quality.premium", ["premium", "high end", "luxury"], ["premium", "alta gama", "lujo"]),
      ],
      allowUnknown: true,
    },
  ],
};

/**
 * Backwards-compatible alias. The garage schema is the candidate library used
 * by the on-site intake path; it is ALWAYS scope-filtered before display.
 */
export const QUICK_BALLPARK_SCHEMA = GARAGE_CONVERSION_SCHEMA;

/** Does the declarative condition on this question hold for these answers? */
export function isQuestionVisible(
  question: BallparkQuestion,
  answers: BallparkAnswers,
): boolean {
  const condition = question.condition;
  if (!condition) return true;
  const answer = answers[condition.questionId];
  /* An unanswered / unknown dependency keeps the dependent question hidden
     rather than guessing which branch the contractor is on. */
  if (!answer || answer.status !== "answered") return false;
  const value = String(answer.value ?? "");
  if (condition.equals) return condition.equals.includes(value);
  if (condition.notEquals) return !condition.notEquals.includes(value);
  return true;
}

/** The questions actually asked, in order, for the current answers. */
export function visibleQuestions(
  schema: BallparkInterviewSchema,
  answers: BallparkAnswers,
): BallparkQuestion[] {
  return schema.questions.filter((q) => isQuestionVisible(q, answers));
}
