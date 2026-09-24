/**
 * CONSTRUCTION DEPENDENCY RULES.
 *
 * A short, explicit, human-authored table: "this narrated condition implies a
 * well-established construction requirement — ask about it before the scope is
 * finalized." It is deliberately NOT an AI prompt asking what might be missing;
 * an invented dependency is exactly the failure this table exists to avoid.
 *
 * A rule earns a place here only when the dependency is universally true in
 * residential construction, not a judgment call. Each rule asks; it never
 * silently assumes an answer and never silently adds work.
 *
 * Today the table holds exactly one proven rule. Expand one at a time.
 */

export interface ConstructionDependencyRule {
  id: string;
  /** Question topic id used by the narrative question surface. */
  topic: string;
  priority: number;
  answerType: "choice";
  options: string[];
  /** The narrated condition that raises the dependency. */
  condition: RegExp;
  /** Wording that already settles it, in either direction. */
  addressed: RegExp;
  /** Why the question exists — shown in the audit trail, never as scope. */
  requirement: string;
}

export const CONSTRUCTION_DEPENDENCY_RULES: readonly ConstructionDependencyRule[] = [
  {
    id: "load_bearing_wall",
    topic: "structural_wall",
    /* Above every product/finish decision: it can add a beam and a temporary
       shoring operation, and it gates whether the opening is even feasible. */
    priority: 105,
    answerType: "choice",
    options: ["load_bearing", "non_load_bearing", "unknown"],
    /* Removing/opening a wall. Requires BOTH the action and the wall — a beam
       mentioned on its own is not a wall removal. */
    condition:
      /\b(remov\w*|demo\w*|tear\w*\s+(?:out|down)|tak\w*\s+(?:out|down)|pull\w*\s+(?:out|down)|knock\w*\s+(?:out|down)|open\w*\s+up|cut\w*\s+(?:an?\s+)?opening)\b[^.]{0,60}\bwalls?\b|\bwalls?\b[^.]{0,60}\b(is|are|being|to be|gets?|getting)\s+(remov\w*|demo\w*|taken\s+(?:out|down)|torn\s+(?:out|down)|open\w*\s+up)\b/i,
    /* Either answer settles it, as does any structural provision already named. */
    addressed:
      /\b(load[-\s]?bearing|non[-\s]?bearing|bearing wall|non[-\s]?structural|structural engineer|engineered beam|\blvl\b|glulam|flush beam|drop beam|structural (?:beam|header)|new (?:beam|header)|install\w* (?:a )?(?:beam|header))\b/i,
    requirement:
      "Removing a wall requires knowing whether it carries load; if it does, a beam/header and temporary shoring must be in the scope.",
  },
];

export interface DependencyDetection {
  rule: ConstructionDependencyRule;
}

/**
 * Dependencies raised by this narration and NOT already addressed in it.
 * Pure and deterministic — same text always yields the same list.
 */
export function detectConstructionDependencies(text: string | null | undefined): DependencyDetection[] {
  const haystack = String(text ?? "");
  if (!haystack.trim()) return [];
  return CONSTRUCTION_DEPENDENCY_RULES.filter(
    (rule) => rule.condition.test(haystack) && !rule.addressed.test(haystack),
  ).map((rule) => ({ rule }));
}
