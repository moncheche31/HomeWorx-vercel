/**
 * FEATURE -> CANONICAL ASSEMBLY RESOLUTION (general, not per-project).
 *
 * Root cause this module removes: preliminary pricing resolved an assembly
 * through an eight-case `switch`. Every other recognized feature — wall demo,
 * closet demo, structural beams and posts, built-in casework, drywall, paint,
 * roofing, siding, decks, HVAC, appliances, doors, windows — returned `null`,
 * was skipped by the scenario builder, and the whole preliminary estimate
 * collapsed to `tasks: []` / `$0 – $0` even though the scope was recognized.
 *
 * The catalog already prices all of that work. The mapping below is the single
 * declarative bridge between the intake lexicon's feature keys and the
 * canonical catalog keys, so adding a lexicon rule now requires nothing more
 * than one line here (and the absence of a line is a *visible* unresolved
 * state, never a silent zero).
 *
 * Pure module: no React, no IO.
 */

import { SAMPLE_PRICEBOOK } from "@/domains/ballpark/pricebook";
import { canonicalForBallparkKey } from "@/domains/estimating/pricing/canonicalAssemblies";
import { unitFamily, type FallbackUnitFamily } from "@/domains/estimating/genericTradeFallback";
import type { BallparkPriceEntry } from "@/domains/ballpark/types";

/**
 * Intake feature key -> canonical catalog key.
 *
 * Every entry must be a real key in the canonical catalog; a typo is caught by
 * `featureAssembly` tests rather than degrading silently into $0.
 */
export const FEATURE_ASSEMBLY_MAP: Record<string, string> = {
  /* Demolition and structure. */
  "structural.wall_removal": "demolition.wall",
  "demolition.closet_removal": "demolition.wall",
  "structural.lvl_beam": "structural.beam_lvl",
  "structural.column": "structural.post",

  /* Carpentry and cabinetry. */
  "trim.builtin_casework": "trim.bookcase",
  "cabinets.replace": "kitchen.cabinets_base",
  "cabinets.upper": "kitchen.cabinets_wall",
  "cabinets.island": "kitchen.island",
  "trim.replace": "trim.base",
  /* Exterior trim runs (fascia, soffit, shadow board) price as exterior trim. */
  "fascia.replace": "siding.soffit_fascia",
  /* Deck-edge / PVC / vinyl trim boards are exterior trim, never baseboard. */
  "trim.exterior": "siding.soffit_fascia",

  /* Site-built access panels / small purpose-built casework. */
  "carpentry.access_panel": "carpentry.access_panel",
  "carpentry.opening_infill": "carpentry.opening_infill",
  /* Small admitted repairs with no specific assembly. */
  "handyman.general": "handyman.general",

  /* Surfaces and finishes. */
  "countertops.replace": "kitchen.countertop",
  "flooring.replace": "flooring.mid",
  "paint.interior": "paint.walls_ceiling",
  /* Painting confined to a named component (fascia, door, trim) runs linear. */
  "paint.component": "paint.trim",
  "drywall.replace": "drywall.hang_finish",
  "insulation.install": "insulation.walls",
  "tile.wet_area": "tile.wall",

  /*
   * Openings. Windows carry TWO price subjects because the mix matters: a
   * paired/double unit is materially more money than a single, so a contractor
   * count of "24 windows, 9 of them doubles" prices as 15 singles + 9 doubles
   * rather than one blended per-unit rate.
   */
  "windows.replace": "window.replacement",
  "windows.replace.double": "window.replacement_double",
  "doors.replace": "door.interior",
  "doors.exterior.replace": "door.exterior",

  /* Mechanical, electrical, plumbing. */
  "lighting.recessed": "electrical.recessed_light",
  "mechanical.electrical": "electrical.moderate",
  "mechanical.outlet_relocate": "electrical.device.relocate",
  "mechanical.plumbing": "plumbing.moderate",
  "mechanical.hvac": "hvac.extension",
  "fixtures.replace": "bath.vanity",
  "appliances.install": "kitchen.appliance_install",

  /* Exterior and site. */
  "roofing.replace": "roofing.shingle_replace",
  "roofing.metal.replace": "roofing.metal_standing_seam",
  "gutters.replace": "gutters.install",
  "siding.replace": "siding.install",
  /* "New deck/porch" is a rebuild: framing AND decking, not framing alone. */
  "deck.build": "deck.rebuild",
  /* Railing is priced separately: the deck assembly is framing + decking only. */
  "deck.railing": "deck.railing",
  "fence.install": "fence.install",
  "landscaping.install": "landscaping.install",
  "concrete.flatwork": "concrete.flatwork",
};

/** Why a feature could not be resolved to a priced catalog assembly. */
export type AssemblyRefusal =
  /** No catalog key is mapped for this feature key. */
  | "no_mapping"
  /** The mapped key is not in the catalog (catalog regression). */
  | "missing_assembly"
  /**
   * The feature's quantity is a count but the assembly is sold by a measured
   * unit, so no defensible quantity exists. Never guessed.
   */
  | "unit_incompatible";

export interface ResolvedAssembly {
  itemKey: string;
  entry: BallparkPriceEntry;
  /** Quantity in the ASSEMBLY's unit, derived without inventing evidence. */
  quantity: number;
  featureFamily: FallbackUnitFamily;
  assemblyFamily: FallbackUnitFamily;
  /**
   * True when the stated quantity is a SIZE (26 linear feet) but the assembly
   * is counted, so the assembly count is 1 and the size stays as evidence.
   * This is what stops "26 foot LVL" from becoming 26 beam assemblies.
   */
  sizeCollapsedToOne: boolean;
  /**
   * Where the rate came from. `canonical_registry` is the shared authority the
   * detailed estimate also uses; `illustrative_pricebook` is the disclosed
   * placeholder rate used only where the canonical catalog has no coverage yet.
   */
  rateSource: "canonical_registry" | "illustrative_pricebook";
}


export interface AssemblyFeatureInput {
  featureKey: string;
  unitKey?: string | null;
  quantity?: number | null;
  pricingQuantity?: number | null;
}

/** Catalog key for a feature, allowing an assumption-driven override. */
export function assemblyKeyForFeature(
  featureKey: string,
  override?: string | null,
): string | null {
  if (override) return override;
  return FEATURE_ASSEMBLY_MAP[featureKey] ?? null;
}

/**
 * Resolve one recognized feature onto a catalog assembly with a defensible
 * quantity, or explain why it cannot be resolved.
 */
export function resolveFeatureAssembly(
  feature: AssemblyFeatureInput,
  options: { assemblyKeyOverride?: string | null } = {},
): { resolved: ResolvedAssembly | null; refusal: AssemblyRefusal | null } {
  const itemKey = assemblyKeyForFeature(feature.featureKey, options.assemblyKeyOverride);
  if (!itemKey) return { resolved: null, refusal: "no_mapping" };

  /*
   * RATE AUTHORITY: the canonical registry the detailed estimate prices from
   * comes first, so preliminary and detailed can never disagree about what the
   * same subject costs. The illustrative pricebook is only a disclosed
   * fallback for subjects the canonical catalog does not cover yet.
   */
  const fallbackEntry = SAMPLE_PRICEBOOK.get(itemKey);
  const canonical = canonicalForBallparkKey(itemKey);
  const rateSource: ResolvedAssembly["rateSource"] = canonical
    ? "canonical_registry"
    : "illustrative_pricebook";
  const entry: BallparkPriceEntry | null | undefined = canonical
    ? {
        itemKey,
        unitKey: canonical.unitKey as BallparkPriceEntry["unitKey"],
        laborHoursPerUnit: canonical.laborHoursPerUnit,
        materialCostPerUnit: canonical.materialCostPerUnit,
        subcontractorCostPerUnit: fallbackEntry?.subcontractorCostPerUnit ?? 0,
        ...(fallbackEntry?.maxPlausibleCount == null
          ? {}
          : { maxPlausibleCount: fallbackEntry.maxPlausibleCount }),
      }
    : fallbackEntry;
  if (!entry) return { resolved: null, refusal: "missing_assembly" };

  const stated = Number(feature.pricingQuantity ?? feature.quantity ?? 0);
  const quantity = Number.isFinite(stated) && stated > 0 ? stated : 1;
  const featureFamily = unitFamily(feature.unitKey);
  const assemblyFamily = unitFamily(entry.unitKey);

  if (featureFamily === assemblyFamily) {
    return {
      resolved: {
        itemKey,
        entry,
        quantity,
        featureFamily,
        assemblyFamily,
        sizeCollapsedToOne: false,
        rateSource,
      },
      refusal: null,
    };
  }

  /*
   * Measured size against a counted assembly: ONE assembly, and the size is
   * carried forward as geometry evidence rather than multiplied.
   */
  if (assemblyFamily === "count") {
    return {
      resolved: {
        itemKey,
        entry,
        quantity: 1,
        featureFamily,
        assemblyFamily,
        sizeCollapsedToOne: featureFamily !== "count",
        rateSource,
      },
      refusal: null,
    };
  }


  /*
   * A bare count against a measured assembly has no defensible size. Refuse —
   * the caller surfaces it for review instead of inventing square footage.
   */
  return { resolved: null, refusal: "unit_incompatible" };
}
