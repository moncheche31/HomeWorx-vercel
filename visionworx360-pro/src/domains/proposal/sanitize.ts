/**
 * Module 014 — customer-language guard.
 *
 * Customer Mode must never expose estimating terminology, confidence scores,
 * labor hours, profit, assumptions or Knowledge Base references.
 */
import type { ProposalLocale } from "./types";

export const FORBIDDEN_CUSTOMER_TERMS = [
  "markup",
  "overhead",
  "margin",
  "profit",
  "labor rate",
  "labor hour",
  "labour hour",
  "man hour",
  "waste factor",
  "line item",
  "unit cost",
  "burden",
  "contingency",
  "confidence",
  "assumption",
  "knowledge base",
  "assembly",
  "takeoff",
  "internal note",
  "forgot",
  // Spanish
  "margen",
  "sobrecosto",
  "desperdicio",
  "costo unitario",
  "horas de mano de obra",
  "ganancia",
  "suposicion",
  "suposición",
  "base de conocimiento",
  "nota interna",
];

export function containsInternalTerms(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_CUSTOMER_TERMS.some((term) => lower.includes(term));
}

/**
 * Drops any line that carries internal terminology. Used for customer mode
 * only — contractor preview keeps everything.
 */
export function stripInternalLines(lines: string[]): string[] {
  return lines.filter((line) => !containsInternalTerms(line));
}

const INTERNAL_PREFIX = /^(internal|nota interna|interno)\s*[:\-]/i;

export function isInternalLine(line: string, _locale: ProposalLocale): boolean {
  return INTERNAL_PREFIX.test(line.trim()) || containsInternalTerms(line);
}
