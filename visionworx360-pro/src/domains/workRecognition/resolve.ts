import { feetFromInches } from "@/domains/measurement";
import type { WorkPattern } from "./patterns";
import {
  recognizeCandidates,
  detectExclusions,
  statedLengthForSubject,
  type WorkCandidate,
} from "./recognize";
import {
  extractZones,
  floorArea,
  perimeter,
  roofArea,
  volumeCubicYards,
  wallArea,
  withWaste,
} from "./geometry";
import { convertBetweenUnits, roundPricingQuantity } from "./units";
import type {
  ConfirmedMeasurement,
  ResolvedQuantity,
  ResolvedWorkItem,
  WorkAssumption,
  WorkRecognitionInput,
  WorkRecognitionResult,
  ZoneGeometry,
} from "./types";

/**
 * The single quantity authority hierarchy, applied identically to every trade.
 *
 *   confirmed measurement  >  contractor-stated number  >  derived geometry
 *   >  media evidence  >  industry allowance
 *
 * A weaker source is only consulted when every stronger source is silent, and
 * whichever source wins is recorded on the item so the UI can show it.
 */

const CONFIDENCE: Record<string, number> = {
  typed_measurement: 0.95,
  spoken_measurement: 0.85,
  drawing: 0.9,
  derived_from_scope: 0.7,
  photo_inference: 0.5,
  assembly_default: 0.3,
  component_arithmetic: 0.75,
  contractor_override: 1,
};

const round2 = (n: number) => Math.round(n * 100) / 100;

function confirmedFor(
  pattern: WorkPattern,
  measurements: ConfirmedMeasurement[],
): ConfirmedMeasurement | null {
  const usable = measurements.filter((m) => m.status === "confirmed" && m.inches > 0);
  return (
    usable.find((m) => pattern.subject.test(`${m.subject ?? ""} ${m.label}`)) ?? null
  );
}

function zonesFor(pattern: WorkPattern, zones: ZoneGeometry[]): ZoneGeometry[] {
  if (!zones.length) return [];
  if (pattern.zoneKeys?.length) {
    const scoped = zones.filter((z) => pattern.zoneKeys!.includes(z.key));
    if (scoped.length) return scoped;
    // A pattern scoped to `deck` still prices from the one area the
    // contractor gave when no named deck zone exists.
    return zones.length === 1 ? zones : [];
  }
  return zones;
}

function sum(values: Array<number | null>): number | null {
  const usable = values.filter((v): v is number => typeof v === "number" && v > 0);
  return usable.length ? round2(usable.reduce((a, b) => a + b, 0)) : null;
}

interface DerivationOutcome {
  quantity: number | null;
  zoneIds: string[];
  rationale: string;
  assumptions: WorkAssumption[];
}

function derive(
  pattern: WorkPattern,
  zones: ZoneGeometry[],
  statedCountValue: number | null,
  statedLengthFt: number | null = null,
): DerivationOutcome {
  const scoped = zonesFor(pattern, zones);
  const ids = scoped.map((z) => z.id);
  const assumptions: WorkAssumption[] = [];
  const zoneLabel = scoped.map((z) => z.label).join(" + ") || "the work area";

  switch (pattern.derivation) {
    case "floor_area":
    case "ceiling_area":
    case "surface_area": {
      const quantity = sum(scoped.map(floorArea));
      return {
        quantity,
        zoneIds: ids,
        rationale: quantity
          ? `Area computed from the dimensions stated for ${zoneLabel}.`
          : "No area was stated for this work.",
        assumptions,
      };
    }
    case "wall_area": {
      const parts = scoped.map((zone) => wallArea(zone));
      const quantity = sum(parts.map((p) => p?.areaSf ?? null));
      const assumedHeight = parts.find((p) => p?.heightAssumed);
      if (assumedHeight) {
        assumptions.push({
          id: "ceiling-height",
          message: `${assumedHeight.heightFt}' ceiling height assumed — confirm if different.`,
          affectsPrice: true,
        });
      }
      if (quantity) {
        assumptions.push({
          id: "opening-deduction",
          message: `${Math.round((parts.find((p) => p)?.allowancePct ?? 0.1) * 100)}% deducted for doors and windows.`,
          affectsPrice: true,
        });
      }
      if (quantity === null && pattern.houseAreaRatio) {
        /* Whole-house ballpark with only a floor area: use the documented
           industry ratio as a VISIBLE assumption, never a hidden constant. */
        const floor = sum(scoped.map(floorArea));
        if (floor !== null) {
          assumptions.push({
            id: "house-area-ratio",
            message: `Surface area estimated at ${pattern.houseAreaRatio}x the ${floor} sq ft floor area (industry-typical whole-house ratio) — measure rooms for an exact number.`,
            affectsPrice: true,
          });
          return {
            quantity: round2(floor * pattern.houseAreaRatio),
            zoneIds: ids,
            rationale: `Whole-house ratio applied to ${zoneLabel}: ${floor} sq ft x ${pattern.houseAreaRatio}.`,
            assumptions,
          };
        }
      }
      return {
        quantity,
        zoneIds: ids,
        rationale: quantity
          ? `Wall area from the perimeter and ceiling height of ${zoneLabel}.`
          : "Wall area needs room dimensions, not just a floor area.",
        assumptions,
      };
    }
    case "perimeter": {
      const quantity = sum(scoped.map(perimeter));
      return {
        quantity,
        zoneIds: ids,
        rationale: quantity
          ? `Perimeter of ${zoneLabel} from its stated dimensions.`
          : "No perimeter could be derived.",
        assumptions,
      };
    }
    case "roof_area": {
      const parts = scoped.map(roofArea);
      const quantity = sum(parts.map((p) => p?.areaSf ?? null));
      if (parts.some((p) => p?.derived)) {
        assumptions.push({
          id: "roof-pitch",
          message: "Roof area derived from the footprint at a typical 6/12 pitch.",
          affectsPrice: true,
        });
      }
      return {
        quantity,
        zoneIds: ids,
        rationale: quantity ? "Roof area from the stated footprint." : "No roof area stated.",
        assumptions,
      };
    }
    case "volume": {
      const area = sum(scoped.map(floorArea));
      if (area === null) {
        return { quantity: null, zoneIds: ids, rationale: "No slab area stated.", assumptions };
      }
      assumptions.push({
        id: "slab-thickness",
        message: '4" thickness assumed for concrete volume.',
        affectsPrice: true,
      });
      return {
        quantity: volumeCubicYards(area, 4),
        zoneIds: ids,
        rationale: `Volume from ${area} sq ft at 4" thick.`,
        assumptions,
      };
    }
    case "stated_count": {
      if (statedCountValue) {
        return {
          quantity: statedCountValue,
          zoneIds: [],
          rationale: "Count stated by the contractor.",
          assumptions,
        };
      }
      return { quantity: null, zoneIds: [], rationale: "No count stated.", assumptions };
    }
    case "run_length": {
      if (statedLengthFt) {
        return {
          quantity: statedLengthFt,
          zoneIds: [],
          rationale: "Run length stated by the contractor.",
          assumptions,
        };
      }
      return { quantity: null, zoneIds: ids, rationale: "No run length stated.", assumptions };
    }
    case "none":
    default:
      return { quantity: null, zoneIds: ids, rationale: "No geometry available.", assumptions };
  }
}

function resolveQuantity(
  candidate: WorkCandidate,
  zones: ZoneGeometry[],
  measurements: ConfirmedMeasurement[],
  mediaCount: number | null,
  fallbackLengthFt: number | null = null,
): { resolved: ResolvedQuantity; zoneIds: string[]; assumptions: WorkAssumption[] } {
  const { pattern } = candidate;
  const finish = (
    quantity: number | null,
    source: ResolvedQuantity["source"],
    evidence: string | null,
    rationale: string,
    isDefault: boolean,
  ): ResolvedQuantity => {
    const waste = pattern.wastePct ?? 0;
    /* Derivations work in the base unit (SF/FT/EA); the estimate is expressed
       in the unit the trade actually buys and sells in (SQ for roofing,
       SY for carpet). Conversion is exact; only pricing rounds. */
    const converted =
      quantity === null || pattern.unitKey === pattern.baseUnitKey
        ? quantity
        : (convertBetweenUnits(quantity, pattern.baseUnitKey, pattern.unitKey) ?? quantity);
    const exact = converted === null ? null : round2(converted);
    const priced =
      exact === null
        ? null
        : roundPricingQuantity(waste ? withWaste(exact, waste) : exact, pattern.family);
    return {
      quantity: exact,
      pricingQuantity: priced,
      unitKey: pattern.unitKey,
      family: pattern.family,
      source,
      evidence,
      rationale,
      isDefault,
      confidence: exact === null ? 0 : (CONFIDENCE[source] ?? 0.5),
    };
  };

  /* 1 — durable, contractor-confirmed measurement outranks everything. */
  const confirmed = confirmedFor(pattern, measurements);
  if (confirmed && (pattern.family === "length" || pattern.derivation === "run_length")) {
    const feet = round2(feetFromInches(confirmed.inches));
    return {
      resolved: finish(
        feet,
        "typed_measurement",
        confirmed.rawText ?? confirmed.label,
        `Confirmed project measurement: ${confirmed.label}.`,
        false,
      ),
      zoneIds: [],
      assumptions: [],
    };
  }

  /* 2 — a number the contractor stated in this very clause. */
  if (candidate.statedCount && ["count", "opening", "fixture", "circuit_device"].includes(pattern.family)) {
    return {
      resolved: finish(
        candidate.statedCount,
        "spoken_measurement",
        candidate.clause,
        "Count stated by the contractor.",
        false,
      ),
      zoneIds: [],
      assumptions: [],
    };
  }

  /* 3 — derived from authoritative geometry. */
  const derived = derive(
    pattern,
    zones,
    candidate.statedCount,
    candidate.statedLengthFt ?? fallbackLengthFt,
  );
  if (derived.quantity !== null) {
    const geometrySource = zones.some((z) => z.source === "typed_measurement")
      ? "derived_from_scope"
      : "derived_from_scope";
    return {
      resolved: finish(
        derived.quantity,
        geometrySource,
        zones.find((z) => derived.zoneIds.includes(z.id))?.evidence ?? candidate.clause,
        derived.rationale,
        false,
      ),
      zoneIds: derived.zoneIds,
      assumptions: derived.assumptions,
    };
  }

  /* 4 — media evidence: contextual only, never overrides 1-3. */
  if (mediaCount && mediaCount > 0) {
    return {
      resolved: finish(
        mediaCount,
        "photo_inference",
        "Visible in the uploaded media",
        "Counted from the uploaded photos — confirm before sending.",
        false,
      ),
      zoneIds: [],
      assumptions: [
        {
          id: "media-count",
          message: "Quantity came from photo evidence, not a stated measurement.",
          affectsPrice: true,
        },
      ],
    };
  }

  /* 5 — industry allowance, always disclosed. */
  if (pattern.allowance) {
    return {
      resolved: finish(
        pattern.allowance.quantity,
        "assembly_default",
        null,
        pattern.allowance.note,
        true,
      ),
      zoneIds: [],
      assumptions: [
        { id: "allowance", message: pattern.allowance.note, affectsPrice: true },
      ],
    };
  }

  return {
    resolved: finish(null, "assembly_default", null, derived.rationale, true),
    zoneIds: derived.zoneIds,
    assumptions: [],
  };
}

/**
 * Strongest candidate per work type: a stated action always beats a mention.
 *
 * A bare mention ("a 10x14 deck rebuild in the same place") must NEVER displace
 * a clause where the contractor actually stated the verb, even if a number sits
 * next to the subject. Losing that ordering is how an explicitly-sized deck fell
 * back to an observation with no quantity while its own perimeter still priced.
 *
 * Among actioned clauses a constructive verb outranks a removal one, so the
 * primary assembly resolves against the work being built rather than the demo.
 */
function pickCandidates(candidates: WorkCandidate[]): Map<string, WorkCandidate> {
  const best = new Map<string, WorkCandidate>();
  for (const candidate of candidates) {
    const key = candidate.pattern.workTypeKey;
    const current = best.get(key);
    if (!current) {
      best.set(key, candidate);
      continue;
    }
    if (current.isObservationOnly !== candidate.isObservationOnly) {
      if (!candidate.isObservationOnly) best.set(key, candidate);
      continue;
    }
    if (candidate.isObservationOnly) {
      if (current.statedCount === null && candidate.statedCount !== null) {
        best.set(key, candidate);
      }
      continue;
    }
    const better =
      (current.action.action === "remove" && candidate.action.action !== "remove") ||
      (current.statedCount === null &&
        candidate.statedCount !== null &&
        current.action.action === candidate.action.action);
    if (better) best.set(key, candidate);
  }
  return best;

}

export function recognizeWork(input: WorkRecognitionInput): WorkRecognitionResult {
  const text = input.text ?? "";
  const parsedZones = extractZones(text);
  /* Confirmed project zones outrank anything parsed from the transcript. */
  const zones = input.zones?.length
    ? [...input.zones, ...parsedZones.filter((p) => !input.zones!.some((z) => z.key === p.key))]
    : parsedZones;

  const exclusions = detectExclusions(text);
  const measurements = input.confirmedMeasurements ?? [];
  const candidates = pickCandidates(recognizeCandidates(text));

  const items: ResolvedWorkItem[] = [];
  const suppressed: WorkRecognitionResult["suppressed"] = [];
  const observations: WorkRecognitionResult["observations"] = [];
  const clarifications: WorkRecognitionResult["clarifications"] = [];

  for (const [workTypeKey, candidate] of candidates) {
    const { pattern } = candidate;

    const exclusion = exclusions.find((e) =>
      e.suppresses.some((prefix) => workTypeKey.startsWith(prefix)),
    );
    if (exclusion) {
      suppressed.push({ workTypeKey, exclusionId: exclusion.id, evidence: exclusion.evidence });
      continue;
    }

    if (candidate.isObservationOnly) {
      observations.push({ workTypeKey, label: pattern.label, evidence: candidate.clause });
      continue;
    }

    const media = (input.media ?? []).filter((m) => m.workTypeKey === workTypeKey);
    const mediaCount = media.find((m) => typeof m.count === "number")?.count ?? null;
    const { resolved, zoneIds, assumptions } = resolveQuantity(
      candidate,
      zones,
      measurements,
      mediaCount,
      /*
       * A one-off built-in is often described as "a bookcase, 10 feet wide":
       * the overall dimension lands in the next clause but still governs — as
       * long as that clause is ABOUT this subject. A length spoken about a
       * different assembly ("26 foot LVL") is never this line's quantity.
       */
      statedLengthForSubject(text, pattern.subject),
    );

    const allAssumptions = [...assumptions];
    if (pattern.standingAssumption) {
      allAssumptions.unshift({
        id: `${workTypeKey}:standing`,
        message: pattern.standingAssumption,
        affectsPrice: false,
      });
    }
    if (pattern.wastePct && resolved.quantity !== null) {
      allAssumptions.push({
        id: `${workTypeKey}:waste`,
        message: `${Math.round(pattern.wastePct * 100)}% waste added to the priced quantity; the measured quantity stays exact.`,
        affectsPrice: true,
      });
    }

    /* High-impact trade question: asked once, only when the transcript has
       not already answered it. Low-impact unknowns ride on a visible
       assumption instead of costing the contractor a question. */
    const clarification = pattern.standard.clarification;
    if (
      clarification &&
      (clarification.impact === "high" || resolved.isDefault) &&
      !(clarification.answeredWhen?.test(text) ?? false)
    ) {
      clarifications.push({
        id: `${workTypeKey}:${clarification.id}`,
        message: clarification.question,
        evidence: candidate.clause,
      });
    }

    if (resolved.quantity === null || resolved.isDefault) {
      clarifications.push({
        id: `${workTypeKey}:quantity`,
        message:
          resolved.quantity === null
            ? `How much ${pattern.label.toLowerCase()} is involved?`
            : `${pattern.label} is priced on an assumption — confirm the quantity.`,
        evidence: candidate.clause,
      });
    }

    items.push({
      id: `work:${workTypeKey}`,
      workTypeKey,
      label: pattern.label,
      trade: pattern.trade,
      action: candidate.action.action,
      actionEvidence: candidate.action.evidence || candidate.clause,
      quantity: resolved.quantity,
      pricingQuantity: resolved.pricingQuantity,
      unitKey: resolved.unitKey,
      family: resolved.family,
      provenanceSource: resolved.source,
      provenanceEvidence: resolved.evidence,
      rationale: resolved.rationale,
      confidence: resolved.confidence,
      assumptions: allAssumptions,
      exclusions: exclusions.map((e) => e.id),
      zoneIds,
      measurementIds: measurements.filter((m) => m.id).map((m) => m.id!),
      mediaIds: media.map((m) => m.mediaId),
      isAllowance: resolved.isDefault,
    });
  }

  return { items, zones, exclusions, suppressed, observations, clarifications };
}
