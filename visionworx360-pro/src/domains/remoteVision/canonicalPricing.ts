import { calculateEngineLine, type EngineLineInput } from "@/domains/estimating";
import {
  TIER_MATERIAL_FACTOR,
  isTierSensitive,
  type FinishTier,
} from "@/domains/ballpark/pricebook";
import {
  fallbackLaborHours,
  resolveGenericTradeFallback,
  unitFamily,
} from "@/domains/estimating/genericTradeFallback";
import { normalizeTradeKey } from "@/domains/estimating/tradeTaxonomy";
import {
  bookLaborRate,
  type BookPricingLocation,
} from "@/domains/estimating/pricing/bookLaborRates";
import { resolveFeatureAssembly, type AssemblyRefusal } from "./featureAssembly";
import { ballparkAllowanceFor } from "./ballparkAllowance";
import type { StructureScale } from "./projectScale";
import { featureRequiresSpecReview } from "./lexicon";

import type { Assumption, DetectedFeatureBase, EstimateLevel } from "./types";

export interface CanonicalScenarioLine {
  featureKey: string;
  assemblyKey: string;
  label: string;
  total: number;
  laborHours: number;
  crewHours: number;
  /* Internal cost split — the engine already produced these numbers. */
  laborCost: number;
  materialCost: number;
  otherCost: number;
  overhead: number;
  profit: number;
  contingency: number;
  tax: number;
  laborRate: number;
  crewSize: number;
  quantity: number;
  unitKey: string;
  tradeKey: string;
  /** Where the money came from — book (NCE 2026) assembly or trade allowance. */
  pricingBasis: "book_nce2026" | "generic_trade_allowance";
  /** True when the money is an allowance the contractor must review. */
  needsReview: boolean;
  /**
   * How the QUANTITY was obtained. "ballpark_allowance" means the contractor
   * never stated a size and the ballpark substituted a published standard
   * allowance — always flagged, never presented as confirmed.
   */
  quantityBasis?: "stated" | "ballpark_allowance";
  /** Which published rule of thumb supplied the allowance quantity. */
  allowanceBasisKey?: "standard_cabinet" | "cabinet_run" | "standard" | "whole_structure" | null;
  /** Stated size preserved when a counted assembly could not consume it. */
  sizeEvidence?: { quantity: number; unitKey: string } | null;
}


/** A recognized feature that could not be priced at all. Never a silent $0. */
export interface UnpricedFeature {
  featureKey: string;
  label: string;
  reason: AssemblyRefusal | "no-quantity" | "no-trade" | "fee-basis";
}

const LEVEL_TIER: Record<EstimateLevel, FinishTier> = {
  economy: "value",
  mid_range: "standard",
  premium: "premium",
};

function countertopAssembly(assumptions: Assumption[]): string | null {
  const material = assumptions.find((a) => a.topic === "countertop_material")?.selectedKey;
  return material === "laminate" ? "kitchen.countertop_laminate" : null;
}

/**
 * Assumption-driven catalog overrides. Everything else resolves through the
 * general FEATURE_ASSEMBLY_MAP, so a new lexicon rule needs no code here.
 */
function assemblyOverride(feature: DetectedFeatureBase, assumptions: Assumption[]): string | null {
  if (feature.featureKey === "countertops.replace") return countertopAssembly(assumptions);
  return null;
}

/** Canonical trade for the internal contractor rollup. */
export function tradeKeyFor(featureKey: string): string {
  const key = featureKey.toLowerCase();
  if (key.startsWith("demolition.") || /wall_removal|closet_removal/.test(key)) return "demolition";
  if (key.startsWith("structural.") || key.startsWith("framing.") || key.startsWith("deck.")) {
    return "framing";
  }
  if (key.startsWith("cabinets.") || key.startsWith("trim.") || key.startsWith("carpentry.")) {
    return "finish_carpentry";
  }

  if (key.startsWith("countertops.") || key.startsWith("appliances.")) return "specialty";
  if (key.startsWith("mechanical.hvac")) return "hvac";
  if (key.startsWith("mechanical.plumbing") || key.startsWith("fixtures.")) return "plumbing";
  if (key.startsWith("mechanical.") || key.startsWith("lighting.")) return "electrical";
  if (key.startsWith("flooring.")) return "flooring";
  if (key.startsWith("tile.")) return "tile";
  if (key.startsWith("paint")) return "painting";
  if (key.startsWith("drywall.")) return "drywall";
  if (key.startsWith("insulation.")) return "insulation";
  if (key.startsWith("roofing.")) return "roofing";
  if (key.startsWith("fascia.") || key.startsWith("soffit.")) return "roofing";
  if (
    key.startsWith("siding.") ||
    key.startsWith("gutters.") ||
    key.startsWith("fence.") ||
    key.startsWith("landscaping.")
  ) {
    return "exterior";
  }
  if (key.startsWith("concrete.")) return "sitework_concrete";
  if (key.startsWith("doors.") || key.startsWith("windows.")) return "finish_carpentry";
  if (key.startsWith("handyman.") || key.startsWith("general.")) return "general_conditions";
  return "unassigned";
}

function laminateQuantity(quantity: number): number {
  /* Laminate is sold by linear foot of run; convert a stated area once. */
  return Math.max(1, Math.ceil((quantity / (25 / 12)) * 100) / 100);
}

function componentFactors(feature: DetectedFeatureBase): { labor: number; material: number } {
  const detail = feature.detail?.toLowerCase() ?? "";
  if (!detail || !feature.featureKey.startsWith("cabinets.")) return { labor: 1, material: 1 };
  let labor = 1;
  let material = 1;
  if (/glass/.test(detail)) {
    labor += 0.08;
    material += 0.12;
  }
  if (/wine|bread/.test(detail)) {
    labor += 0.08;
    material += 0.1;
  }
  if (/filler/.test(detail)) labor += 0.04;
  return { labor, material };
}

/**
 * Plies stated by the contractor for a beam ("double LVL") are a real material
 * and handling difference, not a count of beams. Bounded to what was said.
 */
function beamPlies(feature: DetectedFeatureBase): number {
  if (feature.featureKey !== "structural.lvl_beam") return 1;
  const text = `${feature.evidence ?? ""} ${feature.detail ?? ""}`.toLowerCase();
  if (/\btriple\b|\bthree[- ]ply\b/.test(text)) return 3;
  if (/\bdouble\b|\btwo[- ]ply\b|\bply ?2\b/.test(text)) return 2;
  return 1;
}

function engineLine(input: {
  feature: DetectedFeatureBase;
  assemblyKey: string;
  quantity: number;
  unitKey: string;
  laborHoursPerUnit: number;
  materialCost: number;
  laborRate: number;
  crewSize: number;
  tradeKey: string;
  pricingBasis: CanonicalScenarioLine["pricingBasis"];
  needsReview: boolean;
  quantityBasis?: CanonicalScenarioLine["quantityBasis"];
  allowanceBasisKey?: CanonicalScenarioLine["allowanceBasisKey"];
  sizeEvidence?: { quantity: number; unitKey: string } | null;

}): CanonicalScenarioLine {
  const engineInput: EngineLineInput = {
    id: input.feature.id,
    description: input.feature.label,
    quantity: input.quantity,
    unitKey: input.unitKey,
    laborHours: null,
    laborHoursPerUnit: input.laborHoursPerUnit,
    crewSize: input.crewSize,
    laborRate: input.laborRate,
    materialCost: input.materialCost,
    equipmentCost: 0,
    subcontractorCost: 0,
    otherCost: 0,
    wasteFactorPct: 0,
    overheadPct: 10,
    profitPct: 10,
    contingencyPct: 0,
    isTaxable: false,
  };
  const result = calculateEngineLine(engineInput, { currency: "USD", taxRatePct: 0 });
  return {
    featureKey: input.feature.featureKey,
    assemblyKey: input.assemblyKey,
    label: input.feature.label,
    total: result.total,
    laborHours: result.laborHours,
    crewHours: result.crewHours,
    laborCost: result.laborTotal,
    materialCost: result.materialTotal + result.productTotal,
    otherCost: result.equipmentTotal + result.subcontractorTotal + result.otherTotal,
    overhead: result.overhead,
    profit: result.profit,
    contingency: result.contingency,
    tax: result.tax,
    laborRate: input.laborRate,
    crewSize: input.crewSize,
    quantity: input.quantity,
    unitKey: input.unitKey,
    tradeKey: input.tradeKey,
    pricingBasis: input.pricingBasis,
    needsReview: input.needsReview,
    quantityBasis: input.quantityBasis ?? "stated",
    allowanceBasisKey: input.allowanceBasisKey ?? null,
    sizeEvidence: input.sizeEvidence ?? null,
  };

}

/**
 * Price ONE recognized feature. The contract of this function is the fix:
 *
 *   - a mapped catalog assembly is priced from the canonical catalog, OR
 *   - recognized work with a usable quantity and trade is priced from a
 *     documented generic trade allowance and flagged for review, OR
 *   - the feature is returned as EXPLICITLY UNPRICED.
 *
 * It never returns "nothing", which is what previously became $0.
 *
 * `mode` decides what happens to work with NO stated size:
 *   - "detailed" (default): unpriced / Needs Review. A detailed estimate must
 *     never contain an unconfirmed guess.
 *   - "ballpark": priced from the published standard allowance for that work,
 *     flagged `quantityBasis: "ballpark_allowance"` + `needsReview`.
 */
export function priceFeature(
  inputFeature: DetectedFeatureBase,
  assumptions: Assumption[],
  level: EstimateLevel,
  options: {
    /**
     * Job-site book location. Absent / unconfirmed resolves to the flagged
     * national baseline — never a flat company rate.
     */
    bookLocation?: BookPricingLocation | null;
    /** Precomputed trade -> book rate table (same book, same location). */
    laborRates?: Readonly<Record<string, number>> | null;
    mode?: "ballpark" | "detailed";
    /** Whole-building scale for unmeasured exterior work. */
    scale?: StructureScale | null;
  } = {},
): { line: CanonicalScenarioLine | null; unpriced: UnpricedFeature | null } {
  const mode = options.mode ?? "detailed";
  const tierFactor = TIER_MATERIAL_FACTOR[LEVEL_TIER[level]];
  const tradeKey = normalizeTradeKey(tradeKeyFor(inputFeature.featureKey));
  /*
   * ONE PRICING ENGINE. Labor is always the published NCE 2026 craft wage for
   * this trade, adjusted by the job-site area modification factor. There is no
   * flat company rate and no sample-pricebook fallback in this path.
   */
  const tableRate = Number(options.laborRates?.[tradeKey]);
  const laborRate =
    Number.isFinite(tableRate) && tableRate > 0
      ? tableRate
      : bookLaborRate(tradeKey, options.bookLocation ?? null);
  const crewSize = inputFeature.featureKey.startsWith("cabinets.") ? 2 : 1;

  /*
   * EVIDENCE-FIRST QUANTITY GATE.
   *
   * A measured feature (linear / area / volume) whose quantity was never
   * resolved has NO defensible number. It must never be silently priced as
   * "1 unit" — that produced an absurdly low range that contradicted its own
   * provenance note.
   *
   * In DETAILED mode it stays explicitly unpriced (Needs Review).
   * In BALLPARK mode — a rough band by definition — it is priced from the
   * canonical published allowance for that kind of work and carries an
   * explicit assumed-quantity flag, so the number is disclosed, never silent.
   */
  const statedQuantity = Number(inputFeature.pricingQuantity ?? inputFeature.quantity ?? 0);
  const hasResolvedQuantity = Number.isFinite(statedQuantity) && statedQuantity > 0;
  const needsAllowance = !hasResolvedQuantity && unitFamily(inputFeature.unitKey) !== "count";
  const allowance = needsAllowance && mode === "ballpark"
    ? ballparkAllowanceFor(inputFeature.featureKey, inputFeature.unitKey, {
        label: inputFeature.label,
        evidence: (inputFeature as { evidence?: string | null }).evidence ?? null,
        scale: options.scale ?? null,
      })
    : null;
  const allowanceQuantity = allowance?.quantity ?? null;


  if (needsAllowance && !allowanceQuantity) {
    return {
      line: null,
      unpriced: {
        featureKey: inputFeature.featureKey,
        label: inputFeature.label,
        reason: "no-quantity",
      },
    };
  }

  const usedBallparkAllowance = Boolean(allowanceQuantity);
  const feature: DetectedFeatureBase = usedBallparkAllowance
    ? {
        ...inputFeature,
        quantity: allowanceQuantity as number,
        pricingQuantity: allowanceQuantity as number,
      }
    : inputFeature;

  /*
   * An allowance quantity or a member whose specs are still unknown is a
   * legitimate priced line, but it is never presented as settled truth: it
   * always carries Needs Review so the contractor confirms before issuing.
   */
  const allowanceReview =
    usedBallparkAllowance ||
    feature.provenance?.source === "ballpark_allowance" ||
    /*
     * ANY quantity the contractor did not state is an assumption, including a
     * catalog/allowance default and a room-scaled default. Such a line prices —
     * it must never vanish into $0 — but it can never be presented as settled
     * truth, so it always carries Needs Review.
     */
    feature.provenance?.isDefault === true ||
    featureRequiresSpecReview(feature.featureKey);

  const quantityBasis: CanonicalScenarioLine["quantityBasis"] = usedBallparkAllowance
    ? "ballpark_allowance"
    : "stated";
  const allowanceBasisKey = usedBallparkAllowance ? allowance?.basisKey ?? "standard" : null;


  const { resolved, refusal } = resolveFeatureAssembly(feature, {
    assemblyKeyOverride: assemblyOverride(feature, assumptions),
  });

  if (resolved) {
    const component = componentFactors(feature);
    const plies = beamPlies(feature);
    const isLaminate = resolved.itemKey === "kitchen.countertop_laminate";
    const quantity = isLaminate ? laminateQuantity(resolved.quantity) : resolved.quantity;
    const tier = isTierSensitive(resolved.itemKey) ? tierFactor : 1;
    return {
      line: engineLine({
        feature,
        assemblyKey: isLaminate ? "countertops.laminate.install" : resolved.itemKey,
        quantity,
        unitKey: resolved.entry.unitKey,
        /* Extra plies add handling, not a second full install. */
        laborHoursPerUnit:
          resolved.entry.laborHoursPerUnit * component.labor * (1 + (plies - 1) * 0.25),
        materialCost: resolved.entry.materialCostPerUnit * tier * component.material * plies,
        laborRate,
        crewSize,
        tradeKey,
        pricingBasis: "book_nce2026",
        needsReview: allowanceReview,
        quantityBasis,
        allowanceBasisKey,


        sizeEvidence:
          resolved.sizeCollapsedToOne && feature.unitKey
            ? { quantity: Number(feature.pricingQuantity ?? feature.quantity ?? 0), unitKey: feature.unitKey }
            : null,
      }),
      unpriced: null,
    };
  }

  /*
   * No catalog assembly. Recognized work still has to carry defensible,
   * reviewable money — or be visibly unpriced.
   */
  const quantity = Number(feature.pricingQuantity ?? feature.quantity ?? 0);
  const fallback = resolveGenericTradeFallback({
    description: feature.label,
    tradeKey,
    quantity: quantity > 0 ? quantity : 1,
    unitKey: feature.unitKey,
    laborRate,
  });
  if (!fallback.pricing) {
    return {
      line: null,
      unpriced: {
        featureKey: feature.featureKey,
        label: feature.label,
        reason: fallback.refusal ?? refusal ?? "no_mapping",
      },
    };
  }

  const qty = quantity > 0 ? quantity : 1;
  const family = unitFamily(feature.unitKey);
  return {
    line: engineLine({
      feature,
      assemblyKey: `generic.${fallback.pricing.tradeKey}.${family}`,
      quantity: qty,
      unitKey: feature.unitKey ?? "each",
      laborHoursPerUnit: fallbackLaborHours(qty, fallback.pricing.laborHoursPerUnit) / qty,
      materialCost: fallback.pricing.materialCost,
      laborRate: fallback.pricing.laborRate,
      crewSize,
      tradeKey: fallback.pricing.tradeKey,
      pricingBasis: "generic_trade_allowance",
      needsReview: true,
      quantityBasis,
      allowanceBasisKey,

    }),
    unpriced: null,
  };
}

/**
 * Backwards-compatible wrapper. Prefer `priceFeature`, which also reports the
 * features it could not price.
 */
export function priceCanonicalFeature(
  feature: DetectedFeatureBase,
  assumptions: Assumption[],
  level: EstimateLevel,
): CanonicalScenarioLine | null {
  return priceFeature(feature, assumptions, level).line;
}
