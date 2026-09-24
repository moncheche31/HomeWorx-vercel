/**
 * Module 013 — presentation modes.
 *
 * Contractor mode shows the technical recommendation and why it was raised.
 * Customer mode is reassurance-first prose: no estimating terminology, no
 * "you forgot", no confidence codes, no internal keys.
 */
import { resolveDecision } from "./review";
import type {
  CopilotDecisionMap,
  CopilotLocale,
  CopilotPresentation,
  CopilotRecommendation,
  CopilotReview,
} from "./types";

/** Words that must never reach a customer-facing string. */
const FORBIDDEN_CUSTOMER_TERMS = [
  "markup",
  "overhead",
  "margin",
  "labor rate",
  "waste factor",
  "line item",
  "allowance",
  "upsell",
  "forgot",
  "missing",
  "contingency",
  "olvid",
  "margen",
  "sobrecosto",
  "desperdicio",
];

export function containsInternalTerms(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_CUSTOMER_TERMS.some((term) => lower.includes(term));
}

const HEADINGS: Record<CopilotLocale, { included: string; options: string }> = {
  "en-US": {
    included: "What's included to protect your home",
    options: "Options you may want to consider",
  },
  "es-US": {
    included: "Lo que incluimos para proteger su casa",
    options: "Opciones que puede considerar",
  },
};

export function toCustomerPresentation(
  review: CopilotReview,
  decisions: CopilotDecisionMap,
): CopilotPresentation {
  const locale = review.locale;
  const accepted = review.recommendations.filter(
    (rec) => resolveDecision(rec, decisions) === "accepted",
  );

  const included = accepted.filter(
    (rec) => rec.sectionKey === "standard_items" || rec.sectionKey === "missing_scope",
  );
  const options = accepted.filter(
    (rec) => rec.sectionKey === "upsell" || rec.sectionKey === "value_engineering",
  );

  const lines: string[] = [];
  if (included.length > 0) {
    lines.push(HEADINGS[locale].included);
    for (const rec of included) lines.push(`${rec.customerLabel}. ${rec.customerRationale}`);
  }
  if (options.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(HEADINGS[locale].options);
    for (const rec of options) lines.push(`${rec.customerLabel}. ${rec.customerRationale}`);
  }

  return { mode: "customer", lines };
}

export function toContractorPresentation(
  review: CopilotReview,
  decisions: CopilotDecisionMap,
): CopilotPresentation {
  const lines = review.recommendations.map(
    (rec: CopilotRecommendation) =>
      `[${rec.confidence}] ${rec.label} — ${rec.rationale} (${resolveDecision(rec, decisions)})`,
  );
  return { mode: "contractor", lines };
}
