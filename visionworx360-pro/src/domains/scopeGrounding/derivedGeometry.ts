import { convertBetweenUnits, unitFamily } from "@/domains/workRecognition";
import type { ResolvedWorkItem, WorkRecognitionResult } from "@/domains/workRecognition";
import { patternFor } from "@/domains/workRecognition";
import type { QuantityProvenance } from "./types";

/**
 * Bridge: catalog keyword hit -> geometry-derived quantity (ADR-059).
 *
 * The lexicon knows WHAT assembly a sentence refers to; it has no idea HOW
 * MUCH of it there is, so it falls back to a per-room catalog default. When
 * the generic work-recognition engine resolved a real quantity for the same
 * work from authoritative geometry, that number wins — for every trade, with
 * no trade-specific code in the grounding path.
 */

export interface DerivedGeometryQuantity {
  quantity: number;
  pricingQuantity: number | null;
  unitKey: string;
  provenance: QuantityProvenance;
}

function matches(item: ResolvedWorkItem, sentence: string, unitKey: string | null): boolean {
  const pattern = patternFor(item.workTypeKey);
  if (!pattern) return false;
  if (!pattern.subject.test(sentence)) return false;
  // A linear-foot assembly must not be filled with a square-foot number.
  if (unitKey && unitFamily(unitKey) !== item.family) return false;
  return true;
}

/**
 * Rule 6: geometry belongs to the clause it was stated in.
 *
 * A basement's 10 x 21 ceiling is evidence for the basement work the contractor
 * described there — it is NOT a paintable area for a fascia sentence in another
 * part of the narration. A derived quantity is only accepted when every zone it
 * used is named (or quoted) in the candidate's own sentence.
 */
function zonesTraceToSentence(
  work: WorkRecognitionResult,
  item: ResolvedWorkItem,
  sentence: string,
): boolean {
  const zoneIds = item.zoneIds ?? [];
  if (zoneIds.length === 0) return true;
  const zones = work.zones.filter((zone) => zoneIds.includes(zone.id));
  if (zones.length === 0) return true;
  const haystack = sentence.toLowerCase();
  return zones.every((zone) => {
    if (zone.evidence && haystack.includes(zone.evidence.toLowerCase())) return true;
    const noun = zone.label.toLowerCase();
    if (noun && noun !== "work area" && haystack.includes(noun)) return true;
    return zone.key !== "area" && haystack.includes(zone.key.replace(/_/g, " "));
  });
}

/**
 * The strongest geometry-derived quantity for this candidate, or null when the
 * engine had nothing better than the catalog default.
 */
export function derivedQuantityFor(
  candidate: { sentence: string; unitKey: string | null; label: string },
  work: WorkRecognitionResult,
): DerivedGeometryQuantity | null {
  const hits = work.items
    .filter((item) => !item.isAllowance && item.quantity !== null)
    .filter((item) => matches(item, `${candidate.sentence} ${candidate.label}`, candidate.unitKey))
    .filter((item) => zonesTraceToSentence(work, item, candidate.sentence))
    .sort((a, b) => b.confidence - a.confidence);

  const best = hits[0];
  if (!best || best.quantity === null) return null;


  /* The catalog line may be priced in a different unit of the same family
     (SF vs SQ vs SY). Convert exactly, or skip rather than mis-price. */
  const targetUnit = candidate.unitKey ?? best.unitKey;
  const quantity =
    targetUnit === best.unitKey
      ? best.quantity
      : convertBetweenUnits(best.quantity, best.unitKey, targetUnit);
  if (quantity === null) return null;
  const pricingQuantity =
    best.pricingQuantity === null
      ? null
      : targetUnit === best.unitKey
        ? best.pricingQuantity
        : convertBetweenUnits(best.pricingQuantity, best.unitKey, targetUnit);

  const assumptions = best.assumptions
    .filter((a) => a.affectsPrice)
    .map((a) => a.message)
    .join(" ");

  return {
    quantity,
    pricingQuantity,
    unitKey: targetUnit,
    provenance: {
      source: best.provenanceSource,
      evidence: best.provenanceEvidence,
      rationale: `${best.rationale}${assumptions ? ` ${assumptions}` : ""}`,
      isDefault: false,
    },
  };
}
