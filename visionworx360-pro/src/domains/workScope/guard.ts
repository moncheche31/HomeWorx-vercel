/**
 * CURRENT-JOB ISOLATION GUARD.
 *
 * Nothing reaches a contractor's screen — or a price — unless it can be traced
 * to the CURRENT project's scope context. This is the single enforcement point
 * for the invariant; surfaces call it instead of trusting their own filtering.
 *
 * Universal business-level items (tax, markup, overhead, profit, permits,
 * contingency, mobilization, finish level) are exempt: they apply to any job
 * and carry no trade-specific work.
 */

import type { CurrentProjectScopeContext } from "./context";
import { questionRule } from "./catalog";
import type { WorkDomain } from "./taxonomy";

/** Items that are legitimately job-agnostic. */
export const UNIVERSAL_KEYS = new Set<string>([
  "tax",
  "salesTax",
  "markup",
  "overhead",
  "profit",
  "permit",
  "permits",
  "contingency",
  "mobilization",
  "generalConditions",
  "finishLevel",
  "priceLevel",
  "scopeClarifier",
]);

export interface GuardRejection {
  kind: "question" | "measurement" | "assumption" | "line";
  id: string;
  reason: string;
}

export interface GuardResult<T> {
  allowed: T[];
  rejected: GuardRejection[];
}

export const isUniversal = (id: string): boolean => UNIVERSAL_KEYS.has(id);

/** Does the current scope context justify this id? */
export function traceToScope(
  context: Pick<CurrentProjectScopeContext, "domains" | "questionProvenance">,
  id: string,
): { ok: true; domain: WorkDomain | "any"; reason: string } | { ok: false; reason: string } {
  if (isUniversal(id)) return { ok: true, domain: "any", reason: "Universal business item." };

  const provenance = context.questionProvenance.find((p) => p.questionId === id);
  if (provenance) return { ok: true, domain: provenance.domain, reason: provenance.reason };

  const rule = questionRule(id);
  if (!rule) return { ok: false, reason: `No applicability rule declares "${id}".` };
  const domain = rule.domains.find((d) => context.domains.includes(d));
  if (!domain) {
    return {
      ok: false,
      reason: `"${id}" belongs to ${rule.domains.join("/") || "no"} work, which is not in the current scope.`,
    };
  }
  return { ok: true, domain, reason: rule.reason };
}

function guard<T>(
  context: Pick<CurrentProjectScopeContext, "domains" | "questionProvenance">,
  kind: GuardRejection["kind"],
  items: T[],
  idOf: (item: T) => string,
): GuardResult<T> {
  const allowed: T[] = [];
  const rejected: GuardRejection[] = [];
  for (const item of items) {
    const id = idOf(item);
    const trace = traceToScope(context, id);
    if (trace.ok) allowed.push(item);
    else rejected.push({ kind, id, reason: trace.reason });
  }
  return { allowed, rejected };
}

export const guardQuestions = <T extends { id: string }>(
  context: Pick<CurrentProjectScopeContext, "domains" | "questionProvenance">,
  questions: T[],
): GuardResult<T> => guard(context, "question", questions, (q) => q.id);

export const guardMeasurementFields = (
  context: Pick<CurrentProjectScopeContext, "domains" | "questionProvenance">,
  fields: string[],
): GuardResult<string> => guard(context, "measurement", fields, (f) => f);

/**
 * Assumptions are the most dangerous leak: an out-of-scope assumption is
 * silently priced. An assumption traces through the question that produced it
 * when it has one, otherwise through its own key.
 */
export const guardAssumptions = <T extends { key: string; questionId?: string | null }>(
  context: Pick<CurrentProjectScopeContext, "domains" | "questionProvenance">,
  assumptions: T[],
): GuardResult<T> =>
  guard(context, "assumption", assumptions, (a) => a.questionId ?? a.key);

/** Priced work items must map to a current work domain. */
export const guardPricedItems = <T extends { id?: string; domain?: WorkDomain | null; tradeKey?: string | null }>(
  context: Pick<CurrentProjectScopeContext, "domains" | "questionProvenance">,
  items: T[],
): GuardResult<T> => {
  const allowed: T[] = [];
  const rejected: GuardRejection[] = [];
  for (const item of items) {
    const id = item.id ?? item.tradeKey ?? "line";
    if (isUniversal(id)) {
      allowed.push(item);
      continue;
    }
    if (item.domain && !context.domains.includes(item.domain)) {
      rejected.push({
        kind: "line",
        id,
        reason: `Priced ${item.domain} work is not in the current scope.`,
      });
      continue;
    }
    allowed.push(item);
  }
  return { allowed, rejected };
};

/**
 * Development-time assertion. Rejections are a bug in a calling surface, not a
 * user error, so they are loud in dev and silently filtered in production.
 */
export function reportRejections(where: string, rejections: GuardRejection[]): void {
  if (rejections.length === 0) return;
  if (import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.error(
      `[current-job isolation] ${where} tried to show ${rejections.length} untraceable item(s):`,
      rejections,
    );
  }
}
