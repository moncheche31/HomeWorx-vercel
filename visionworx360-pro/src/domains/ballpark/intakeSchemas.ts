/**
 * Question sets for the photo and description intake paths.
 *
 * Both are deliberately short: the point is the smallest number of questions
 * that meaningfully move a preliminary range. Everything else is covered by a
 * documented allowance and reported as an assumption.
 */

import type { BallparkInterviewSchema, BallparkOption, BallparkQuestion } from "./types";
import { PHOTO_OBSERVATION_PROMPTS, OBSERVATION_PREFIX, type BallparkIntakeSource } from "./intake";
import { QUICK_BALLPARK_SCHEMA } from "./questions";

const opt = (value: string, labelKey: string, en: string[], es: string[]): BallparkOption => ({
  value,
  labelKey,
  match: { "en-US": en, "es-US": es },
});

const YES_NO_UNSURE: BallparkOption[] = [
  opt("yes", "options.yes", ["yes", "yeah", "yep"], ["si", "claro"]),
  opt("no", "options.no", ["no", "nope"], ["no"]),
  opt("unsure", "options.unsure", ["unsure", "not sure", "dont know"], ["no se", "no estoy seguro"]),
];

export const ROOM_TYPE_OPTIONS: BallparkOption[] = [
  opt("kitchen", "options.roomType.kitchen", ["kitchen"], ["cocina"]),
  opt("bathroom", "options.roomType.bathroom", ["bathroom", "bath", "powder room"], ["bano"]),
  opt("bedroom", "options.roomType.bedroom", ["bedroom", "primary bedroom"], ["recamara", "dormitorio"]),
  opt("living", "options.roomType.living", ["living room", "family room", "den"], ["sala", "estancia"]),
  opt("garage", "options.roomType.garage", ["garage", "garage conversion"], ["garaje", "cochera"]),
  opt("basement", "options.roomType.basement", ["basement", "cellar"], ["sotano"]),
  opt("other", "options.roomType.other", ["other", "something else"], ["otro"]),
];

export const SIZE_CLASS_OPTIONS: BallparkOption[] = [
  opt("small", "options.sizeClass.small", ["small", "compact", "tiny"], ["pequeno", "chico"]),
  opt("medium", "options.sizeClass.medium", ["medium", "average", "normal"], ["mediano", "normal"]),
  opt("large", "options.sizeClass.large", ["large", "big"], ["grande"]),
  opt("xlarge", "options.sizeClass.xlarge", ["extra large", "very large", "huge"], ["muy grande", "extra grande"]),
];

export const SCOPE_TYPE_OPTIONS: BallparkOption[] = [
  opt("cosmetic", "options.scopeType.cosmetic", ["cosmetic", "refresh", "paint and floors"], ["cosmetico", "refrescar"]),
  opt("full", "options.scopeType.full", ["full remodel", "gut", "full"], ["remodelacion completa", "completo"]),
  opt("conversion", "options.scopeType.conversion", ["conversion", "convert", "addition"], ["conversion", "convertir"]),
];

export const FINISH_LEVEL_OPTIONS: BallparkOption[] = [
  opt("basic", "options.quality.basic", ["basic", "builder", "economy"], ["basico", "economico"]),
  opt("standard", "options.quality.standard", ["standard", "mid range", "midrange"], ["estandar", "medio"]),
  opt("premium", "options.quality.premium", ["premium", "high end", "luxury"], ["premium", "lujo"]),
];

const CABINET_OPTIONS: BallparkOption[] = [
  opt("none", "options.cabinets.none", ["none", "keep", "no cabinets"], ["ninguno", "conservar"]),
  opt("reface", "options.cabinets.reface", ["reface", "refacing", "refinish"], ["renovar frentes", "refacing"]),
  opt("replace", "options.cabinets.replace", ["replace", "new cabinets"], ["reemplazar", "nuevos gabinetes"]),
  opt("unsure", "options.unsure", ["unsure", "not sure"], ["no se"]),
];

/** Shared opening questions for both remote paths. */
const CORE_QUESTIONS: BallparkQuestion[] = [
  {
    id: "roomType",
    kind: "choice",
    promptKey: "q.roomType.prompt",
    options: ROOM_TYPE_OPTIONS,
    allowUnknown: false,
  },
  {
    id: "sizeClass",
    kind: "choice",
    promptKey: "q.sizeClass.prompt",
    hintKey: "q.sizeClass.hint",
    options: SIZE_CLASS_OPTIONS,
    allowUnknown: true,
  },
  {
    id: "scopeType",
    kind: "choice",
    promptKey: "q.scopeType.prompt",
    options: SCOPE_TYPE_OPTIONS,
    allowUnknown: true,
  },
  {
    id: "finishLevel",
    kind: "choice",
    promptKey: "q.finishLevel.prompt",
    options: FINISH_LEVEL_OPTIONS,
    allowUnknown: true,
  },
  {
    id: "layoutChange",
    kind: "choice",
    promptKey: "q.layoutChange.prompt",
    hintKey: "q.layoutChange.hint",
    options: YES_NO_UNSURE,
    allowUnknown: true,
  },
  {
    id: "plumbingRelocation",
    kind: "choice",
    promptKey: "q.plumbingRelocation.prompt",
    options: YES_NO_UNSURE,
    allowUnknown: true,
  },
  {
    id: "wallRemoval",
    kind: "choice",
    promptKey: "q.wallRemoval.prompt",
    hintKey: "q.wallRemoval.hint",
    options: YES_NO_UNSURE,
    allowUnknown: true,
  },
];

const CABINETS_QUESTION: BallparkQuestion = {
  id: "cabinets",
  kind: "choice",
  promptKey: "q.cabinets.prompt",
  options: CABINET_OPTIONS,
  allowUnknown: true,
  condition: { questionId: "roomType", equals: ["kitchen", "bathroom"] },
};

/** Optional dimension refinements — offered, never required. */
const OPTIONAL_DIMENSIONS: BallparkQuestion[] = [
  {
    id: "lengthFt",
    kind: "dimension",
    promptKey: "q.lengthFt.prompt",
    hintKey: "q.optionalDimension.hint",
    unit: "ft",
    acceptsPair: { lengthId: "lengthFt", widthId: "widthFt" },
    allowUnknown: true,
    optional: true,
  },
  {
    id: "widthFt",
    kind: "dimension",
    promptKey: "q.widthFt.prompt",
    hintKey: "q.optionalDimension.hint",
    unit: "ft",
    allowUnknown: true,
    optional: true,
  },
];

/** Human-confirmed photo observations, asked as ordinary yes/no questions. */
export const PHOTO_OBSERVATION_QUESTIONS: BallparkQuestion[] = PHOTO_OBSERVATION_PROMPTS.map(
  (prompt) => ({
    id: `${OBSERVATION_PREFIX}${prompt.key}`,
    kind: "choice",
    promptKey: prompt.labelKey,
    options: [
      opt("yes", "options.yes", ["yes"], ["si"]),
      opt("no", "options.no", ["no"], ["no"]),
      opt("unclear", "options.unclear", ["unclear", "cant tell", "cannot tell"], ["no se ve", "no distingo"]),
    ],
    allowUnknown: true,
    optional: true,
  }),
);

export const PHOTO_BALLPARK_SCHEMA: BallparkInterviewSchema = {
  key: "photo_ballpark_v1",
  titleKey: "schema.photoBallpark",
  questions: [...CORE_QUESTIONS, CABINETS_QUESTION, ...PHOTO_OBSERVATION_QUESTIONS, ...OPTIONAL_DIMENSIONS],
};

export const DESCRIPTION_BALLPARK_SCHEMA: BallparkInterviewSchema = {
  key: "description_ballpark_v1",
  titleKey: "schema.descriptionBallpark",
  questions: [...CORE_QUESTIONS, CABINETS_QUESTION, ...OPTIONAL_DIMENSIONS],
};

/** One interview per intake path. On site still uses the full quick schema. */
export function schemaForSource(source: BallparkIntakeSource): BallparkInterviewSchema {
  if (source === "photos") return PHOTO_BALLPARK_SCHEMA;
  if (source === "description") return DESCRIPTION_BALLPARK_SCHEMA;
  return QUICK_BALLPARK_SCHEMA;
}
