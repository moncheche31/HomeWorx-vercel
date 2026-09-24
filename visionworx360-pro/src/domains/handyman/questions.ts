/**
 * SMART QUESTION POLICY FOR SMALL JOBS.
 *
 * Same philosophy as the structural work: infer what is safe to infer, then
 * ask only what materially moves scope, feasibility or price. A normal
 * handyman visit should need zero to three questions — if uncertainty remains
 * and a disclosed allowance covers it responsibly, that beats a questionnaire.
 *
 * Every question here is traceable to a task actually in the current visit, so
 * a toilet swap can never surface a garage or kitchen-remodel question.
 *
 * Pure module — no React, no Supabase, no IO.
 */

import { getHandymanTask } from "./tasks";
import type { HandymanText, TaskInstance } from "./types";

export interface HandymanQuestion {
  id: string;
  prompt: HandymanText;
  options?: HandymanText[];
  /** Higher asks first. Only cost-significant questions score high. */
  impact: number;
  /** When true, an explicit allowance can stand in for the answer. */
  allowanceFallback: boolean;
}

const q = (
  id: string,
  prompt: [string, string],
  impact: number,
  allowanceFallback: boolean,
  options: Array<[string, string]> = [],
): HandymanQuestion => ({
  id,
  prompt: { "en-US": prompt[0], "es-US": prompt[1] },
  impact,
  allowanceFallback,
  ...(options.length
    ? { options: options.map(([en, es]) => ({ "en-US": en, "es-US": es })) }
    : {}),
});

export const HANDYMAN_QUESTIONS: readonly HandymanQuestion[] = [
  q("supplyResponsibility",
    ["Who supplies the fixture — you or the homeowner?", "¿Quién suministra el accesorio: usted o el cliente?"],
    90, true,
    [["I supply it", "Yo lo suministro"], ["Owner supplies", "El cliente lo suministra"], ["Include an allowance", "Incluir una asignación"]]),
  q("flooringMaterialArea",
    ["What flooring material, and roughly how many square feet?", "¿Qué material de piso y aproximadamente cuántos pies cuadrados?"],
    88, true),
  q("patchSizeTexture",
    ["How large are the patches, and is there a texture to match?", "¿De qué tamaño son los resanes y hay textura que igualar?"],
    80, true,
    [["Small (under 1 sf)", "Pequeño (menos de 1 pc)"], ["Medium (1–4 sf)", "Mediano (1–4 pc)"], ["Large (over 4 sf)", "Grande (más de 4 pc)"]]),
  q("deckBoardMaterial",
    ["What decking material, and about how many boards?", "¿Qué material de terraza y cuántas tablas aproximadamente?"],
    78, true),
  q("paintMatching",
    ["Should we paint the repaired area, and is matching paint available?", "¿Pintamos el área reparada y hay pintura para igualar?"],
    70, true,
    [["Paint the patch only", "Solo el área reparada"], ["Paint the full wall", "Pared completa"], ["No painting", "Sin pintura"]]),
  q("hiddenDamage",
    ["Is there any known water or hidden damage behind this?", "¿Hay daño por agua o daño oculto conocido detrás?"],
    68, true,
    [["None known", "Ninguno conocido"], ["Yes", "Sí"], ["Unknown — include an allowance", "Desconocido — incluir asignación"]]),
  q("fixtureBoxRating",
    ["Is the existing box rated for a fan?", "¿La caja existente está aprobada para ventilador?"],
    60, true),
];

const BY_ID = new Map(HANDYMAN_QUESTIONS.map((item) => [item.id, item]));

export function getHandymanQuestion(id: string): HandymanQuestion | null {
  return BY_ID.get(id) ?? null;
}

/** Ballpark budget. More than this and it stopped being a quick quote. */
export const HANDYMAN_QUESTION_BUDGET = 3;

export interface QuestionSelectionOptions {
  /** Question ids already answered for this project. Never re-asked. */
  answered?: readonly string[];
  budget?: number;
}

/**
 * Rank the questions traceable to the current visit and return at most the
 * budget. Nothing untraceable can be returned: a question must belong to a
 * task actually present in this punch list.
 */
export function selectHandymanQuestions(
  instances: readonly TaskInstance[],
  options: QuestionSelectionOptions = {},
): string[] {
  const answered = new Set(options.answered ?? []);
  const budget = options.budget ?? HANDYMAN_QUESTION_BUDGET;
  const candidates = new Map<string, number>();

  for (const instance of instances) {
    const task = getHandymanTask(instance.taskId);
    if (!task) continue;
    for (const id of task.questions ?? []) {
      if (answered.has(id)) continue;
      const question = BY_ID.get(id);
      if (!question) continue;
      /* A question repeated by several tasks matters more, but never doubles. */
      const prior = candidates.get(id) ?? 0;
      candidates.set(id, Math.max(prior, question.impact) + (prior ? 2 : 0));
    }
  }

  return [...candidates.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, budget))
    .map(([id]) => id);
}
