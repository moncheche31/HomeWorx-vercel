export const CONFIDENCE_LEVELS = [
  "verified",
  "high",
  "medium",
  "low",
  "needs_confirmation",
] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];
