/**
 * PUNCH-LIST DECOMPOSITION.
 *
 * A handyman narrates a visit, not a project: "replace the toilet, fix two
 * cabinet doors, patch three drywall holes, replace the porch handrail and
 * change four switches". That is five independent scope items with five
 * independent quantities, priced independently and invoiced once.
 *
 * This module splits the narration, extracts quantities and maps each fragment
 * onto a canonical task id from the library. It never invents a task: an
 * unmatched fragment comes back with `taskId: null` so the UI can ask instead
 * of the engine guessing.
 *
 * Pure module — no React, no Supabase, no IO.
 */

import { HANDYMAN_TASKS, normalizeTaskText } from "./tasks";
import type { TaskInstance } from "./types";

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, dozen: 12,
  couple: 2, pair: 2, few: 3, several: 3,
  un: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, doce: 12, varios: 3, varias: 3,
};

const SPLIT_PATTERN =
  /\s*(?:[;\n\r]|,\s*(?:and|y|then|also|plus)?\s*|\.\s+|\s+and then\s+|\s+then\s+|\s+also\s+|\s+plus\s+|\s+\+\s+|\s+and\s+(?=(?:replace|repair|fix|install|patch|paint|change|swap|adjust|hang|mount|seal|caulk|remove|reemplaz|repar|instal|pintar|cambiar|ajustar|sellar)))/i;

/** Split a narration into candidate task fragments. */
export function splitPunchList(narration: string): string[] {
  return String(narration ?? "")
    .split(SPLIT_PATTERN)
    .map((part) => part.trim())
    .filter((part) => normalizeTaskText(part).length > 2);
}

interface QuantityRead {
  quantity: number | null;
  /** Fragment text with the quantity token removed for matching. */
  rest: string;
}

function readQuantity(fragment: string): QuantityRead {
  const normalized = normalizeTaskText(fragment);
  const digit = normalized.match(/\b(\d+(?:\.\d+)?)\b/);
  if (digit) {
    const value = Number(digit[1]);
    if (Number.isFinite(value) && value > 0) {
      return { quantity: value, rest: normalized.replace(digit[0], " ").replace(/\s+/g, " ").trim() };
    }
  }
  for (const [word, value] of Object.entries(WORD_NUMBERS)) {
    const re = new RegExp(`\\b${word}\\b`);
    if (re.test(normalized) && word !== "a" && word !== "an") {
      return { quantity: value, rest: normalized.replace(re, " ").replace(/\s+/g, " ").trim() };
    }
  }
  return { quantity: null, rest: normalized };
}

/** Best-matching task for one fragment. Longest alias hit wins. */
export function matchTask(fragment: string): { taskId: string; aliasLength: number } | null {
  const text = normalizeTaskText(fragment);
  if (!text) return null;

  let best: { taskId: string; aliasLength: number } | null = null;
  for (const task of HANDYMAN_TASKS) {
    const candidates = [
      ...task.aliases,
      normalizeTaskText(task.label["en-US"]),
      normalizeTaskText(task.label["es-US"]),
    ];
    for (const raw of candidates) {
      const alias = normalizeTaskText(raw);
      if (!alias || alias.length < 3) continue;
      if (!text.includes(alias)) continue;
      if (!best || alias.length > best.aliasLength) {
        best = { taskId: task.id, aliasLength: alias.length };
      }
    }
  }
  return best;
}

/**
 * Decompose a narration into distinct, independently priceable task instances.
 * Quantities stated in the narration win; otherwise the library's typical
 * quantity is used and flagged as not stated.
 */
export function recognizePunchList(narration: string): TaskInstance[] {
  const fragments = splitPunchList(narration);
  const instances: TaskInstance[] = [];

  for (const fragment of fragments) {
    const { quantity, rest } = readQuantity(fragment);
    const match = matchTask(rest) ?? matchTask(fragment);
    if (!match) {
      instances.push({
        taskId: null,
        quantity: quantity ?? 1,
        unit: null,
        sourceText: fragment,
        quantityStated: quantity != null,
      });
      continue;
    }
    const task = HANDYMAN_TASKS.find((t) => t.id === match.taskId)!;
    const stated = quantity != null;
    /* A stated count only overrides a measured unit when the unit is countable. */
    const useStated = stated && (task.unit === "each" || task.unit === "hour");
    instances.push({
      taskId: task.id,
      quantity: useStated ? quantity! : task.typicalQuantity ?? 1,
      unit: task.unit,
      sourceText: fragment,
      quantityStated: useStated,
    });
  }

  return instances;
}
