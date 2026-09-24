import { formatInches } from "@/domains/measurement";
import { classifyEntity, detectNegation, detectScopeFence } from "./entities";
import {
  describeCabinetRun,
  reconcileCabinetRun,
  type CabinetRunReconciliation,
} from "./cabinetry";

import {
  planCabinetRuns,
  toPricingLinearFeet,
  type CabinetRunPlan,
  type CabinetVisualContext,
  type ConfirmedRunMeasurement,
} from "./cabinetRuns";
import { extractMeasurements, toDimensionFacts } from "./measure";
import { recognizeWork, type WorkRecognitionResult } from "@/domains/workRecognition";
import { derivedQuantityFor } from "./derivedGeometry";
import { detectRoomScaling } from "./rooms";
import type {
  GroundedScope,
  GroundedScopeItem,
  QuantityProvenance,
  ScopeClarification,
  ScopeExclusion,
  ScopeObservation,
} from "./types";

/**
 * A keyword hit produced by any lexicon (remote vision, walkthrough, ballpark).
 * Grounding is lexicon-agnostic on purpose: every estimator entry point can
 * pass its candidates through the same gate.
 */
export interface GroundingCandidate {
  featureKey: string;
  label: string;
  /** Sentence the keyword matched in. */
  sentence: string;
  defaultQuantity: number | null;
  /** True when the quantity was spoken/written by the contractor. */
  quantityIsStated?: boolean;
  unitKey: string | null;
  /**
   * "allowance" means the quantity can never be inferred from surrounding
   * geometry — without stated evidence it prices as a labelled allowance.
   */
  quantityBasis?: "measured" | "allowance";
  /** Non-description evidence (photo/video) is never authoritative. */
  source?: "description" | "vision" | "manual";
}

export interface GroundingInput {
  /** Everything the contractor said or typed, merged. */
  text: string;
  candidates: GroundingCandidate[];
  /**
   * Durable contractor-confirmed measurements. These OUTRANK anything the
   * transcript parser can recover for the same subject.
   */
  confirmedMeasurements?: ConfirmedRunMeasurement[];
  /** Photo/rendering context. Supports the run; never sets a dimension. */
  visual?: CabinetVisualContext;
  /** Label for the derived upper-cabinet line, for localized callers. */
  upperCabinetLabel?: string;
}

/** Feature key of the derived upper-cabinet run. */
export const UPPER_CABINET_FEATURE_KEY = "cabinets.upper";

/** 25" nominal countertop depth, in feet. */
const COUNTERTOP_DEPTH_FT = 25 / 12;

/** The surface a stated area applies to (ceiling/floor/deck). */
const STATED_SURFACE = /\b(ceiling|floor|deck|underside|basement ceiling)\b/i;

/** "that basement measures approximately 10 feet by 21 feet" -> 210 SF. */
function statedFootprintArea(text: string): { area: number; evidence: string } | null {
  const match =
    /(\d+(?:\.\d+)?)\s*(?:feet|foot|ft|')\s*(?:by|x|×)\s*(\d+(?:\.\d+)?)\s*(?:feet|foot|ft|')?/i.exec(
      text ?? "",
    );
  if (!match) return null;
  const length = Number(match[1]);
  const width = Number(match[2]);
  if (!Number.isFinite(length) || !Number.isFinite(width) || length <= 0 || width <= 0) return null;
  return { area: Math.round(length * width), evidence: match[0].trim() };
}

/** Components whose linear run a local paint line inherits. */
const PAINT_HOST_KEYS = ["fascia.replace", "trim.replace", "siding.replace"];


interface GroundedQuantity {
  quantity: number | null;
  /** Ballpark pricing quantity (rounded up). Geometry stays exact. */
  pricingQuantity?: number | null;
  unitKey: string | null;
  provenance: QuantityProvenance;
  scopeClass?: GroundedScopeItem["scopeClass"];
  requiredBy?: string | null;
  reason?: string;
}

/**
 * Quantity grounding rules. Each one must be able to explain itself; if it
 * cannot, the item comes back with NO quantity and is flagged for review.
 * A catalog default is never silently promoted into a priced quantity.
 */
function groundQuantity(
  candidate: GroundingCandidate,
  plan: CabinetRunPlan,
  text: string,
  work: WorkRecognitionResult,
): GroundedQuantity {

  const sentence = candidate.sentence;
  const run = plan.reconciliation;
  const baseRun = plan.base;

  /*
   * The overall run is the quantity. Component widths only get to say whether
   * the run reconciles — they never replace it.
   */
  if (candidate.featureKey === "cabinets.replace" && baseRun) {
    const detail =
      run.baseTotalInches > 0
        ? ` Component widths total ${formatInches(run.baseTotalInches)}.`
        : "";
    return {
      quantity: baseRun.exactFeet,
      pricingQuantity: baseRun.pricingFeet,
      unitKey: "linear_foot",
      provenance: {
        source: baseRun.source,
        evidence: baseRun.evidence,
        rationale: `Base cabinet run taken from the stated overall run ${baseRun.display} (${baseRun.exactFeet} linear feet, priced at ${baseRun.pricingFeet} LF).${detail}`,
        isDefault: false,
      },
    };
  }

  /* An upper-cabinet keyword hit is priced on the UPPER run, not the base one. */
  if (candidate.featureKey === UPPER_CABINET_FEATURE_KEY && plan.upper) {
    const upper = plan.upper;
    return {
      quantity: upper.exactFeet,
      pricingQuantity: upper.pricingFeet,
      unitKey: "linear_foot",
      provenance: {
        source: upper.source,
        evidence: upper.evidence,
        rationale:
          upper.assumption ??
          `Upper cabinet run ${upper.display} (${upper.exactFeet} linear feet, priced at ${upper.pricingFeet} LF).`,
        isDefault: false,
      },
    };
  }

  if (candidate.featureKey === "countertops.replace" && baseRun) {
    const sqft = Math.round(baseRun.exactFeet * COUNTERTOP_DEPTH_FT * 100) / 100;
    return {
      quantity: sqft,
      unitKey: "square_foot",
      provenance: {
        source: "derived_from_scope",
        evidence: baseRun.display,
        rationale: `Countertop derived from the ${baseRun.display} base run at 25" nominal depth (${sqft} sq ft).`,
        isDefault: false,
      },
    };
  }

  if (candidate.featureKey === "trim.replace" && /couple pieces|few pieces/i.test(text)) {
    return {
      quantity: 8,
      unitKey: "linear_foot",
      provenance: {
        source: "component_arithmetic",
        evidence: sentence,
        rationale:
          "Contractor stated a couple of pieces of baseboard only — allowed 8 linear feet, not a full room of trim.",
        isDefault: false,
      },
      scopeClass: "incidental",
      requiredBy: "feature:cabinets.replace",
      reason: "Baseboard must come off where the new cabinets land.",
    };
  }

  if (
    (candidate.featureKey === "mechanical.electrical" ||
      candidate.featureKey === "mechanical.outlet_relocate") &&
    /\b(move|moved|relocat|rais)/i.test(sentence)
  ) {
    const count = /\b(one|1|a single)\b/i.test(sentence) ? 1 : null;
    return {
      quantity: count ?? candidate.defaultQuantity,
      unitKey: "each",
      provenance: {
        source: "spoken_measurement",
        evidence: sentence,
        rationale: "Device count taken from the contractor's own sentence.",
        isDefault: false,
      },
    };
  }

  /*
   * Geometry the contractor actually established beats any catalog default,
   * for every trade. The generic engine already applied the one authority
   * hierarchy (confirmed measurement > stated number > derived geometry >
   * media > allowance), so only a non-default result reaches here.
   */
  /*
   * Allowance work (custom casework) has no derivable geometry. Borrowing a
   * neighbouring measurement here is how a "26 foot LVL" once became 26 linear
   * feet of bookcases, so allowance lines keep their allowance run and are
   * flagged for review instead.
   */
  if (candidate.quantityBasis === "allowance" && !candidate.quantityIsStated) {
    return {
      quantity: candidate.defaultQuantity,
      unitKey: candidate.unitKey,
      provenance: {
        source: "ballpark_allowance",
        evidence: sentence,
        rationale:
          `Custom work with no stated dimensions: priced as a ballpark allowance of ` +
          `${candidate.defaultQuantity ?? 0} ${candidate.unitKey ?? "unit"}. Confirm the real size, species and finish before final pricing.`,
        isDefault: true,
      },
    };
  }

  /*
   * A number the contractor SAID for this scope outranks any derivation. It is
   * authoritative and is never room-scaled or re-derived: "900 square feet of
   * paint" stays 900 sf, "26 foot LVL" stays 26 ft.
   */
  if (candidate.quantityIsStated && candidate.defaultQuantity !== null) {
    return {
      quantity: candidate.defaultQuantity,
      unitKey: candidate.unitKey,
      provenance: {
        source: "spoken_measurement",
        evidence: sentence,
        rationale: "Quantity stated by the contractor.",
        isDefault: false,
      },
    };
  }

  /*
   * SURFACE INSULATION ON A STATED FOOTPRINT. "rigid foam on the basement
   * ceiling, that basement measures 10 by 21" is 210 SF of ceiling insulation —
   * the stated footprint of the surface named, never a per-room catalog default
   * and never a wall assembly.
   */
  if (candidate.featureKey.startsWith("insulation") && candidate.unitKey === "square_foot") {
    const surface = STATED_SURFACE.exec(`${sentence} ${text}`);
    const footprint = statedFootprintArea(text);
    if (surface && footprint) {
      return {
        quantity: footprint.area,
        unitKey: "square_foot",
        provenance: {
          source: "component_arithmetic",
          evidence: footprint.evidence,
          rationale: `Insulation area taken from the stated ${surface[0].toLowerCase()} footprint ${footprint.evidence} = ${footprint.area} square feet.`,
          isDefault: false,
        },
      };
    }
  }


  const derived = derivedQuantityFor(
    { sentence, unitKey: candidate.unitKey, label: candidate.label },
    work,
  );
  if (derived) {
    return {
      quantity: derived.quantity,
      pricingQuantity: derived.pricingQuantity,
      unitKey: derived.unitKey,
      provenance: derived.provenance,
    };
  }

  /**
   * Rule 8: a catalog default is NEVER promoted into a committed quantity just
   * because a rule matched. The work itself was admitted from contractor
   * intent, so the item survives — but with NO quantity, flagged for review,
   * instead of a fabricated per-room number (or that number multiplied by a
   * room count, which is how "insulation" became 1,800 SF).
   *
   * Allowance work keeps its disclosed allowance; that branch runs above.
   */
  return {
    quantity: null,
    unitKey: candidate.unitKey,
    provenance: {
      source: "assembly_default",
      evidence: sentence,
      rationale:
        "The contractor requested this work but stated no measurable quantity, and none could be derived from this project's geometry. Confirm the quantity before pricing — no catalog default was applied.",
      isDefault: true,
    },
  };
}


const EXCLUSION_LABELS: Array<{ match: RegExp; label: string }> = [
  { match: /\bpermit/i, label: "Permits" },
  { match: /\bdemo(lition)?\b/i, label: "Demolition" },
  { match: /\bpaint/i, label: "Painting" },
  { match: /\bfloor(ing)?\b/i, label: "Flooring" },
  { match: /\bplumb/i, label: "Plumbing" },
  { match: /\bdoor/i, label: "Doors" },
];

/**
 * Turn raw keyword hits into a grounded scope: what is included, what is
 * incidental, what is only an observation, and what the contractor ruled out.
 */
export function groundScope(input: GroundingInput): GroundedScope {
  const text = input.text ?? "";
  const plan = planCabinetRuns({
    text,
    confirmedMeasurements: input.confirmedMeasurements,
    visual: input.visual,
  });
  const run = plan.reconciliation;
  const scaling = detectRoomScaling(text);
  const work = recognizeWork({
    text,
    confirmedMeasurements: (input.confirmedMeasurements ?? []).map((m) => ({
      label: m.label ?? m.subject ?? "",
      subject: m.subject ?? null,
      inches: m.inches,
      status: m.status ?? "confirmed",
      rawText: m.rawText ?? m.display ?? null,
    })),
  });
  const explicit: GroundedScopeItem[] = [];
  const incidental: GroundedScopeItem[] = [];
  const observations: ScopeObservation[] = [];
  const exclusions: ScopeExclusion[] = [];
  const clarifications: ScopeClarification[] = [];
  const rejected: GroundedScope["rejected"] = [];

  /* ------------------------------------------------------ exclusions */
  for (const sentence of text.split(/(?<=[.!?;\n])\s+/)) {
    const trimmed = sentence.trim();
    if (!trimmed) continue;
    const negation = detectNegation(trimmed);
    if (!negation.negated) continue;
    for (const spec of EXCLUSION_LABELS) {
      if (!spec.match.test(trimmed)) continue;
      if (negation.exceptClause && spec.match.test(negation.exceptClause)) continue;
      if (exclusions.some((e) => e.label === spec.label)) continue;
      exclusions.push({ id: `excluded:${spec.label.toLowerCase()}`, label: spec.label, evidence: trimmed });
    }
  }
  const excludedLabels = new Set(exclusions.map((e) => e.label));

  /* ------------------------------------------------------ candidates */
  for (const candidate of input.candidates) {
    const verdict = classifyEntity(candidate.featureKey, candidate.sentence, text);
    if (!verdict.admit) {
      rejected.push({
        featureKey: candidate.featureKey,
        evidence: candidate.sentence,
        reason: verdict.reason,
      });
      if (verdict.question) {
        observations.push({
          id: `observation:${candidate.featureKey}`,
          label: candidate.label,
          reason: verdict.reason,
          evidence: candidate.sentence,
          question: verdict.question,
        });
      }
      continue;
    }

    // Vision/photo evidence can describe conditions but never adds scope.
    if (candidate.source === "vision") {
      observations.push({
        id: `observation:${candidate.featureKey}`,
        label: candidate.label,
        reason: "Seen in the uploaded media but not requested by the contractor.",
        evidence: candidate.sentence,
        question: `Should ${candidate.label.toLowerCase()} be included in this estimate?`,
      });
      continue;
    }

    const grounded = groundQuantity(candidate, plan, text, work);
    const item: GroundedScopeItem = {
      id: `feature:${candidate.featureKey}`,
      featureKey: candidate.featureKey,
      label: candidate.label,
      scopeClass: grounded.scopeClass ?? "explicit",
      quantity: grounded.quantity,
      pricingQuantity:
        grounded.pricingQuantity ??
        (grounded.unitKey === "linear_foot" && grounded.quantity !== null
          ? toPricingLinearFeet(grounded.quantity)
          : grounded.quantity),
      unitKey: grounded.unitKey,
      requiredBy: grounded.requiredBy ?? null,
      reason: grounded.reason ?? verdict.reason,
      evidence: candidate.sentence,
      provenance: grounded.provenance,
      detail:
        candidate.featureKey === "cabinets.replace" ? describeCabinetRun(run) : null,
    };


    if (item.scopeClass === "incidental") incidental.push(item);
    else explicit.push(item);
  }

  /* ------------------------------------------- upper cabinetry, separately */
  const hasBaseCabinets = explicit.some((i) => i.featureKey === "cabinets.replace");
  if (hasBaseCabinets && plan.upper && !explicit.some((i) => i.featureKey === UPPER_CABINET_FEATURE_KEY)) {
    const upper = plan.upper;
    explicit.push({
      id: `feature:${UPPER_CABINET_FEATURE_KEY}`,
      featureKey: UPPER_CABINET_FEATURE_KEY,
      label: input.upperCabinetLabel ?? "Upper cabinetry",
      scopeClass: "explicit",
      quantity: upper.exactFeet,
      pricingQuantity: upper.pricingFeet,
      unitKey: "linear_foot",
      requiredBy: null,
      reason: "Upper cabinetry is priced on its own run, never folded into the base line.",
      evidence: upper.evidence,
      provenance: {
        source: upper.source,
        evidence: upper.evidence,
        rationale:
          upper.assumption ??
          `Upper run stated by the contractor: ${upper.display} (${upper.exactFeet} linear feet, priced at ${upper.pricingFeet} LF).`,
        isDefault: false,
      },
      detail: describeCabinetRun(run),
    });
  }

  /* ------------------------------------------- local paint inherits its host */
  /*
   * "The fascia will be painted" is paint ON THE FASCIA: it takes the fascia's
   * own linear run, never a room's wall/ceiling square footage.
   */
  const localPaint = explicit.find((i) => i.featureKey === "paint.component");
  if (localPaint && localPaint.quantity == null) {
    const host = explicit.find(
      (i) => PAINT_HOST_KEYS.includes(i.featureKey) && i.unitKey === "linear_foot" && i.quantity != null,
    );
    if (host) {
      localPaint.quantity = host.quantity;
      localPaint.pricingQuantity = host.pricingQuantity ?? host.quantity;
      localPaint.unitKey = "linear_foot";
      localPaint.provenance = {
        source: "component_arithmetic",
        evidence: host.evidence ?? localPaint.evidence,
        rationale: `Paint priced on the ${host.label.toLowerCase()} run the contractor stated (${host.quantity} linear feet). Local paint never expands to room surfaces.`,
        isDefault: false,
      };
    }
  }

  /* --------------------------------------------------- clarifications */
  clarifications.push(...plan.clarifications);


  const fence = detectScopeFence(text);
  if (fence) {
    clarifications.push({
      id: "clarify:scope_fence",
      topic: "scope_fence",
      message: `Contractor limited the job: "${fence}". Nothing outside that was priced.`,
      evidence: fence,
    });
  }

  if (scaling.multiplier > 1) {
    clarifications.push({
      id: "clarify:room_scaling",
      topic: "room_count",
      message: `The contractor described work in ${scaling.multiplier} areas (${scaling.rooms.join(", ")}). Quantities are taken from stated measurements only — confirm the areas that still need dimensions.`,

      evidence: scaling.evidence,
    });
  }

  return {
    explicit: explicit.filter((i) => !excludedLabels.has(labelFamily(i.featureKey))),
    incidental,
    observations,
    exclusions,
    dimensions: toDimensionFacts(extractMeasurements(text)),
    clarifications,
    rejected,
    roomScaling: {
      roomCount: scaling.roomCount,
      rooms: scaling.rooms,
      multiplier: scaling.multiplier,
      evidence: scaling.evidence,
    },
  };
}

function labelFamily(featureKey: string): string {
  if (featureKey.startsWith("flooring")) return "Flooring";
  if (featureKey.startsWith("doors")) return "Doors";
  if (featureKey.startsWith("paint")) return "Painting";
  if (featureKey.startsWith("structural")) return "Demolition";
  if (featureKey.startsWith("mechanical.plumbing")) return "Plumbing";
  if (featureKey.startsWith("mechanical.electrical")) return "Electrical";
  if (featureKey.startsWith("mechanical.outlet")) return "Electrical";
  if (featureKey.startsWith("trim")) return "Trim";
  if (featureKey.startsWith("permit")) return "Permits";
  return featureKey;
}

export { reconcileCabinetRun };
export type { CabinetRunReconciliation };
