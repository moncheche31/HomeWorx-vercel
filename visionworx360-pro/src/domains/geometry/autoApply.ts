/**
 * WHICH derived quantities may be applied WITHOUT asking.
 *
 * Propagation proposes a quantity for every line geometry can drive. Only a
 * subset is safe to write automatically when an estimate is opened:
 *
 *  - the line must still be carrying a PLACEHOLDER quantity (the `1` an import
 *    writes when the scope row had no measurement). A 288 sq ft floor priced
 *    as 1 sq ft is a defect, not a contractor decision;
 *  - the contractor must not have reviewed, overridden or hand-priced it;
 *  - the derived number must actually differ from what is stored.
 *
 * Everything else stays a proposal the contractor applies deliberately.
 *
 * Pure module — no React, no Supabase, no IO.
 */

import type { DerivedLineQuantity, PropagationPlan } from "./propagate";
import { isDefectiveMeasuredQuantity, type LineLike } from "./dependencies";

export { isDefectiveMeasuredQuantity };

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

export function autoApplicableDerivations(
  plan: Pick<PropagationPlan, "derived">,
  lines: readonly LineLike[],
): DerivedLineQuantity[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  return plan.derived.filter((d) => {
    const line = byId.get(d.lineId);
    if (!line) return false;
    if (line.archivedAt) return false;
    if (line.isPriceOverridden) return false;
    const defective = isDefectiveMeasuredQuantity(line);
    if (line.quantityReviewedAt && !defective) return false;
    if (!line.isQuantityPlaceholder && !defective) return false;
    if (typeof line.quantity === "number" && near(line.quantity, d.quantity)) {
      return line.unitKey !== d.unitKey;
    }
    return true;
  });
}


/** Human-readable derivation for a line, e.g. "16 × 18 = 288 sq ft + 10% waste". */
export function derivationSummary(derived: DerivedLineQuantity): string {
  const waste = derived.provenance.wastePct;
  const base = derived.formula;
  return waste ? `${base} (+${waste}% waste)` : base;
}
