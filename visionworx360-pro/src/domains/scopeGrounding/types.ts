/**
 * Scope grounding contracts (ADR-057).
 *
 * The estimator must never price work the contractor did not ask for. This
 * domain separates three concepts that were previously collapsed into one
 * "detected feature" list:
 *
 *   EXPLICIT   — the contractor said it. Authoritative. Priceable.
 *   INCIDENTAL — directly required BY an explicit item, with a traceable
 *                reason pointing at that item. Priceable.
 *   OBSERVATION— seen (photo/video/keyword) but never requested. NOT priced;
 *                surfaced for review or turned into a clarification question.
 *
 * Every priced quantity carries provenance so a contractor can answer
 * "why this quantity?" without reading code.
 */

export type ScopeClass = "explicit" | "incidental" | "observation" | "excluded";

/** Where a number came from. `assembly_default` is the weakest source. */
export type QuantitySource =
  | "spoken_measurement"
  | "typed_measurement"
  | "drawing"
  | "component_arithmetic"
  | "derived_from_scope"
  | "photo_inference"
  | "assembly_default"
  /**
   * No honest quantity exists yet (custom casework, un-engineered structural
   * members). The line prices as a labelled ballpark allowance that always
   * needs contractor review — it is never presented as a measurement.
   */
  | "ballpark_allowance"
  | "contractor_override";

export interface QuantityProvenance {
  source: QuantitySource;
  /** Verbatim phrase, drawing reference or rule that produced the number. */
  evidence: string | null;
  /** Plain-language explanation shown behind "Why this quantity?". */
  rationale: string;
  /** True when nothing measurable backed the number. */
  isDefault: boolean;
}

export interface GroundedScopeItem {
  id: string;
  featureKey: string;
  label: string;
  scopeClass: ScopeClass;
  /** Exact geometry as stated. Never rounded. */
  quantity: number | null;
  /**
   * Ballpark pricing quantity — linear feet rounded UP to the next whole foot.
   * Pricing uses this; geometry and every display use `quantity`.
   */
  pricingQuantity?: number | null;
  unitKey: string | null;
  /** For incidental work: the explicit item id that requires it. */
  requiredBy?: string | null;
  /** Why this item is here at all. */
  reason: string;
  evidence: string | null;
  /** Reconciled component-level detail (cabinet makeup, etc.), when known. */
  detail?: string | null;
  provenance: QuantityProvenance;

}

export interface ScopeObservation {
  id: string;
  label: string;
  /** Why it was not priced. */
  reason: string;
  evidence: string | null;
  /** Optional concise question to ask instead of silently pricing it. */
  question?: string | null;
}

export interface ScopeExclusion {
  id: string;
  label: string;
  evidence: string | null;
}

export interface DimensionFact {
  id: string;
  /** What was measured, e.g. "wall". */
  subject: string;
  inches: number;
  /** `7' 10"` */
  display: string;
  feet: number;
  evidence: string;
  source: QuantitySource;
}

export interface ScopeClarification {
  id: string;
  topic: string;
  message: string;
  evidence: string | null;
}

export interface GroundedScope {
  explicit: GroundedScopeItem[];
  incidental: GroundedScopeItem[];
  observations: ScopeObservation[];
  exclusions: ScopeExclusion[];
  dimensions: DimensionFact[];
  clarifications: ScopeClarification[];
  /** Keyword hits that were rejected, kept for the internal trace. */
  rejected: Array<{ featureKey: string; evidence: string; reason: string }>;
  /** How many rooms per-room defaults were multiplied by, and why. */
  roomScaling: {
    roomCount: number;
    rooms: string[];
    multiplier: number;
    evidence: string | null;
  };
}

/* --------------------------------------------------------- sanity gate */

export type SanityFindingKind =
  | "unit_conversion_explosion"
  | "exceeds_known_dimension"
  | "unrelated_trade"
  | "missing_provenance"
  | "duplicate_quantity"
  | "entity_mismatch"
  | "unresolved_dimension"
  /** A material quantity nothing measured backs — must be confirmed, not assumed. */
  | "unconfirmed_default";

export interface SanityFinding {
  id: string;
  kind: SanityFindingKind;
  severity: "blocker" | "warning";
  message: string;
  itemIds: string[];
}

export interface SanityReport {
  findings: SanityFinding[];
  /** True when pricing must stop and the contractor must be asked. */
  blocked: boolean;
}
