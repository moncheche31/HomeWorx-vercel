/**
 * SMALL-JOB ROUTING (rule 11).
 *
 * A handyman narrates a visit, not a remodel: "three little projects — fascia,
 * foam the basement ceiling, build an access door". Expanding that through
 * whole-house trade templates is how a $2,000 visit became a five-figure
 * remodel. When the narration reads as independent punch-list tasks, the
 * existing handyman decomposition path owns it.
 */

import { recognizePunchList, splitPunchList } from "@/domains/handyman";
import type { TaskInstance } from "@/domains/handyman";

/** Narration that says outright it is a set of small, separate jobs. */
const PUNCH_LIST_PHRASING =
  /\b(handyman|punch\s?list|odd jobs?|small (jobs?|repairs?|projects?)|little (jobs?|projects?)|honey ?do|service call|misc(ellaneous)? repairs?|reparaciones menores)\b/i;

/** Phrasing that means a whole-building project, never a punch list. */
const WHOLE_PROJECT_PHRASING =
  /\b(whole (house|home)|gut|full remodel|renovation|addition|new construction|convert(ing)? the (garage|basement)|master suite)\b/i;

export interface PunchListRouting {
  /** True when this narration should be decomposed as independent tasks. */
  route: boolean;
  reason: string;
  /** Independent task instances, when routing applies. */
  tasks: TaskInstance[];
  /** Task fragments the narration decomposed into. */
  fragments: string[];
}

export function routePunchList(text: string): PunchListRouting {
  const source = String(text ?? "");
  const fragments = splitPunchList(source);

  if (WHOLE_PROJECT_PHRASING.test(source)) {
    return {
      route: false,
      reason: "The narration describes a whole-project scope, not a punch list.",
      tasks: [],
      fragments,
    };
  }
  if (!PUNCH_LIST_PHRASING.test(source)) {
    return {
      route: false,
      reason: "The narration does not read as independent small tasks.",
      tasks: [],
      fragments,
    };
  }

  const tasks = recognizePunchList(source);
  return {
    route: true,
    reason:
      "The contractor described independent small tasks, so each one is priced on its own instead of through whole-house trade templates.",
    tasks,
    fragments,
  };
}
