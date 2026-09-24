import { BOOK_NATIONAL_LABOR_RATE } from "@/domains/estimating/pricing/bookLaborRates";
/**
 * Sample ballpark pricebook.
 *
 * DELIBERATELY ILLUSTRATIVE. These are round, national-feeling placeholder
 * numbers used so the interview can produce a shape-correct range today. They
 * are not market data and every surface that shows a number sourced from here
 * must disclose that. Licensed regional pricing implements the same
 * `BallparkPricebook` interface and replaces this module wholesale.
 */

import { canonicalForBallparkKey } from "@/domains/estimating/pricing/canonicalAssemblies";
import type { BallparkPriceEntry, BallparkPricebook } from "./types";

const entry = (
  itemKey: string,
  unitKey: BallparkPriceEntry["unitKey"],
  laborHoursPerUnit: number,
  materialCostPerUnit: number,
  subcontractorCostPerUnit = 0,
  maxPlausibleCount?: number,
): BallparkPriceEntry => ({
  itemKey,
  unitKey,
  laborHoursPerUnit,
  materialCostPerUnit,
  subcontractorCostPerUnit,
  ...(maxPlausibleCount == null ? {} : { maxPlausibleCount }),
});

/**
 * A price subject the detailed Knowledge Base also prices. The numbers come
 * from the canonical registry so ballpark and detailed can never disagree
 * about what the same work costs.
 */
const canonicalEntry = (
  ballparkKey: string,
  maxPlausibleCount?: number,
): BallparkPriceEntry => {
  const canonical = canonicalForBallparkKey(ballparkKey);
  if (!canonical) throw new Error(`No canonical assembly for ${ballparkKey}`);
  return entry(
    ballparkKey,
    canonical.unitKey as BallparkPriceEntry["unitKey"],
    canonical.laborHoursPerUnit,
    canonical.materialCostPerUnit,
    0,
    maxPlausibleCount,
  );
};

/**
 * Default sanity cap for `each` work in a single residential scope line.
 * Counts above the cap are almost always a parsed size or a decimal shift.
 */
export const DEFAULT_MAX_EACH_COUNT = 24;

/**
 * Upper bounds for measured units in a single residential scope line. These
 * exist to catch unit-conversion explosions (inches read as linear feet, for
 * example), not to limit legitimate large jobs — a line above the bound is
 * flagged for the contractor rather than silently priced.
 */
export const DEFAULT_MAX_QUANTITY: Record<string, number> = {
  linear_foot: 400,
  square_foot: 6000,
  cubic_yard: 200,
  hour: 400,
};

/** Waste is already folded into every material figure (canonical rule). */
const SAMPLE_ENTRIES: BallparkPriceEntry[] = [
  entry("framing.partition_wall", "linear_foot", 0.35, 14.5),
  entry("framing.raised_floor", "square_foot", 0.055, 7.15),
  entry("insulation.walls", "square_foot", 0.012, 1.35),
  entry("insulation.ceiling", "square_foot", 0.011, 1.55),
  entry("insulation.floor", "square_foot", 0.014, 1.65),
  entry("drywall.hang_finish", "square_foot", 0.032, 1.45),
  entry("paint.walls_ceiling", "square_foot", 0.014, 0.55),
  entry("flooring.basic", "square_foot", 0.03, 3.25),
  entry("flooring.mid", "square_foot", 0.035, 5.75),
  entry("flooring.premium", "square_foot", 0.045, 9.5),
  canonicalEntry("trim.base"),
  entry("door.interior", "each", 2.5, 285, 0, 24),
  /*
   * Site-built plumbing-chase access panel: 1x4 frame, thin plywood back,
   * hinges, paint. Priced per opening — a stated size is never a count.
   */
  entry("carpentry.access_panel", "each", 3, 65, 0, 6),
  /*
   * Closing up an existing door opening: pull the door and jamb, frame the
   * opening, drywall and tape both sides, blend the trim. Priced per opening —
   * a number spoken nearby is never a count of openings.
   */
  entry("carpentry.opening_infill", "each", 8, 140, 0, 4),
  entry("window.unit", "each", 3.5, 520, 0, 24),
  entry("electrical.basic", "each", 10, 380, 0, 24),
  entry("electrical.moderate", "each", 22, 950, 0, 4),
  entry("electrical.panel", "each", 30, 2200, 0, 2),
  entry("plumbing.nearby", "each", 12, 850, 0, 8),
  entry("plumbing.moderate", "each", 20, 1650, 0, 4),
  entry("plumbing.major", "each", 32, 3200, 0, 3),
  entry("bath.half_fixtures", "each", 14, 1850, 0, 4),
  entry("bath.full_fixtures", "each", 26, 4200, 0, 4),
  entry("closet.shelving", "linear_foot", 0.35, 22),
  /* Ballpark allowances: whole-scope subjects a ballpark never itemises. */
  entry("paint.trim", "linear_foot", 0.02, 0.35),
  entry("demolition.wall", "linear_foot", 0.15, 2),
  entry("hvac.extension", "each", 8, 950, 0, 3),
  entry("plumbing.supply_lines", "each", 4, 320, 0, 4),
  entry("bath.rough_in", "each", 16, 1200, 0, 3),
  entry("bath.vanity", "each", 6, 1450, 0, 4),
  entry("bath.shower_surround", "each", 10, 2100, 0, 3),
  entry("bath.toilet", "each", 3, 450, 0, 4),
  /*
   * Provisional allowances. Credible conservative money for work whose exact
   * extent is settled during detailed estimating: a residential permit package,
   * code-required circuit protection, a structural opening (beam + posts) and
   * floor transitions. Disclosed as allowances, never as exact prices.
   */
  entry("permits.allowance", "each", 2, 650, 0, 4),
  entry("electrical.protection", "each", 1.2, 95, 0, 24),
  entry("structural.beam_posts", "each", 14, 1250, 0, 4),
  entry("trim.transitions", "each", 0.6, 48, 0, 12),

  /* ---------------------------------------------------------------- *
   * Residential Catalog V2
   *
   * Coverage for the trades a residential remodeler actually sells. Same
   * rule as above: round, conservative, waste-inclusive placeholder money,
   * disclosed as sample data. Structure — not the numbers — is the asset.
   * ---------------------------------------------------------------- */

  /* General conditions, protection and disposal. */
  entry("general.protection", "square_foot", 0.006, 0.22),
  entry("general.cleanup", "each", 6, 120, 0, 4),
  entry("general.dumpster", "each", 1, 650, 0, 6),

  /* Demolition. */
  entry("demolition.interior_gut", "square_foot", 0.05, 0.9),
  entry("demolition.flooring", "square_foot", 0.025, 0.35),
  entry("demolition.cabinets", "linear_foot", 0.25, 3),
  entry("demolition.bath_gut", "each", 18, 450, 0, 4),

  /* Framing and structure. */
  entry("framing.exterior_wall", "linear_foot", 0.55, 26),
  entry("framing.header", "each", 3.5, 180, 0, 8),
  entry("framing.soffit", "linear_foot", 0.3, 11),
  entry("framing.furring", "square_foot", 0.02, 1.1),
  entry("stairs.build", "each", 28, 1650, 0, 3),

  /* Drywall. */
  entry("drywall.ceiling", "square_foot", 0.038, 1.55),
  entry("drywall.patch", "square_foot", 0.09, 2.4),
  entry("drywall.texture", "square_foot", 0.012, 0.32),

  /* Paint. */
  entry("paint.ceiling", "square_foot", 0.012, 0.45),
  entry("paint.doors", "each", 1.2, 38, 0, 24),
  entry("paint.cabinets", "linear_foot", 1.1, 42),
  entry("paint.exterior", "square_foot", 0.02, 0.85),

  /* Flooring and tile. */
  entry("flooring.tile", "square_foot", 0.09, 8.5),
  entry("flooring.carpet", "square_foot", 0.02, 3.4),
  entry("flooring.underlayment", "square_foot", 0.01, 0.85),
  entry("tile.wall", "square_foot", 0.11, 9.75),
  entry("tile.backsplash", "square_foot", 0.13, 12.5),

  /* Trim and carpentry. */
  entry("trim.crown", "linear_foot", 0.09, 4.6),
  entry("trim.door_casing", "each", 1.1, 62, 0, 24),
  entry("trim.shelving", "linear_foot", 0.2, 14),

  /*
   * Structural and finish-carpentry primitives. Reusable operations shared
   * with the Knowledge Base, so a structural opening prices identically in
   * ballpark and detailed mode. Shoring, engineering and built-in casework
   * are disclosed ALLOWANCES (see the canonical registry).
   */
  canonicalEntry("demolition.wall_bearing"),
  canonicalEntry("structural.shoring"),
  canonicalEntry("structural.beam_lvl"),
  canonicalEntry("structural.post", 12),
  canonicalEntry("structural.engineering", 2),
  canonicalEntry("drywall.beam_wrap"),
  canonicalEntry("trim.beam_wrap"),
  canonicalEntry("trim.column_wrap", 12),
  canonicalEntry("trim.bookcase"),
  canonicalEntry("trim.decorative"),


  /*
   * Doors and windows — raw job cost from the 2026 National Construction
   * Estimator (Craftsman Book Co.). Material is contractor-buy money; labor is
   * book craft hours and excludes overhead and profit.
   *   exterior door   fiberglass entry, avg of 6 book grades (BC@1.00 hr + $533.50)
   *   single window   double-hung vinyl Low-E 3'0"x4'0" (B1@1.00 hr + $238.00)
   *   double window   APPROXIMATION — no mulled-unit SKU in the book:
   *                   1.8x material ($428.40) and 1.5x labor (1.50 hr) of a single
   */
  entry("door.exterior", "each", 1, 533.5, 0, 12),
  entry("door.garage", "each", 7, 1850, 0, 3),
  entry("window.replacement", "each", 1, 238, 0, 40),
  entry("window.replacement_double", "each", 1.5, 428.4, 0, 40),



  /* Electrical. Device-level work mirrors the Knowledge Base exactly. */
  canonicalEntry("electrical.device", 24),
  canonicalEntry("electrical.device.relocate", 24),
  canonicalEntry("electrical.recessed_light", 24),
  canonicalEntry("electrical.fixture", 24),
  entry("electrical.ceiling_fan", "each", 2.2, 340, 0, 8),
  canonicalEntry("electrical.circuit", 12),
  entry("electrical.smoke_detector", "each", 0.7, 65, 0, 12),

  /* Plumbing. */
  entry("plumbing.water_heater", "each", 8, 1850, 0, 2),
  entry("plumbing.laundry_box", "each", 4, 260, 0, 2),
  entry("plumbing.hose_bib", "each", 2, 145, 0, 4),

  /* HVAC. */
  entry("hvac.mini_split", "each", 12, 3400, 0, 4),
  entry("hvac.bath_vent", "each", 4, 285, 0, 4),
  entry("hvac.register", "each", 1, 85, 0, 12),

  /* Bath. */
  entry("bath.waterproofing", "square_foot", 0.05, 3.4),
  entry("bath.tub", "each", 9, 1450, 0, 3),
  entry("bath.shower_door", "each", 4, 1250, 0, 3),
  entry("bath.accessories", "each", 1, 95, 0, 12),

  /* Kitchen. */
  canonicalEntry("kitchen.cabinets_base"),
  canonicalEntry("kitchen.cabinets_wall"),
  canonicalEntry("kitchen.cabinets_tall", 12),
  canonicalEntry("kitchen.cabinets_trim"),
  canonicalEntry("kitchen.cabinet_hardware", 60),
  canonicalEntry("kitchen.countertop"),
  canonicalEntry("kitchen.countertop_laminate"),
  entry("kitchen.island", "each", 10, 2600, 0, 2),
  entry("kitchen.sink_faucet", "each", 5, 780, 0, 3),
  entry("kitchen.range_hood", "each", 4, 720, 0, 2),
  entry("kitchen.appliance_install", "each", 2.5, 145, 0, 8),

  /*
   * Roofing, siding and exterior envelope — raw job cost from the 2026
   * National Construction Estimator. Labor time and material money stay
   * separate; nothing here is a blended lump sum.
   *   steel panel roof  R1@.027 hr/SF + $2.80/SF — BASIC STEEL PANEL
   *     (utility gauge, 5-V crimp/corrugated). True standing seam is not
   *     covered by the current cost data source; this is a flagged placeholder.
   *   vinyl siding      B1@.0334 hr/SF + $0.938/SF (standard .042" grade)
   *   fascia / soffit   market rate, pending a book line item
   */
  entry("roofing.shingle_replace", "square_foot", 0.035, 5.4),
  entry("roofing.metal_standing_seam", "square_foot", 0.027, 2.8),
  entry("roofing.flashing", "linear_foot", 0.12, 9.5),
  entry("gutters.install", "linear_foot", 0.09, 11),
  entry("siding.install", "square_foot", 0.0334, 0.938),
  entry("siding.soffit_fascia", "linear_foot", 0.077, 3.5),

  /* Outdoor living and site. */
  entry("deck.framing", "square_foot", 0.09, 14),
  entry("deck.decking", "square_foot", 0.07, 13.5),
  /* Full build: framing + 2x8 recycled composite decking, B1@.225 + $19.20/SF. */
  entry("deck.rebuild", "square_foot", 0.225, 19.2),
  entry("deck.railing", "linear_foot", 0.35, 62),
  entry("concrete.flatwork", "square_foot", 0.05, 9.5),

  entry("fence.install", "linear_foot", 0.3, 34),
  /* Softscape: grading, ground prep, sod/plantings and mulch, ~$8.03/SF. */
  entry("landscaping.install", "square_foot", 0.045, 4.2),


  /* Accessibility. */
  entry("accessibility.grab_bar", "each", 1, 85, 0, 12),
  entry("accessibility.ramp", "linear_foot", 0.9, 78),
  entry("accessibility.curbless_shower", "each", 16, 3200, 0, 2),

  /* ---------------------------------------------------------------- *
   * Handyman / service tasks
   *
   * Device-level and small-repair work a service contractor sells by the
   * piece. Same disclosure as everything else in this module: illustrative
   * sample money, replaced wholesale by licensed or contractor pricing.
   * ---------------------------------------------------------------- */
  entry("service.device.switch", "each", 0.4, 9, 0, 40),
  entry("service.device.receptacle", "each", 0.4, 9, 0, 40),
  entry("service.device.gfci", "each", 0.5, 26, 0, 24),
  entry("service.device.dimmer", "each", 0.45, 24, 0, 24),

  /*
   * Generic small-repair unit for admitted handyman/punch-list work the
   * catalog has no specific assembly for. Priced per visit-task so stated
   * scope is never dropped for lack of a match.
   */
  entry("handyman.general", "each", 1.5, 35, 0, 20),

  /* Restoration. */
  entry("restoration.mitigation", "square_foot", 0.06, 2.1),
];

const INDEX = new Map(SAMPLE_ENTRIES.map((e) => [e.itemKey, e]));

/** Illustrative labor rate; the organization's own rate overrides it. */
/**
 * Book national baseline labor rate (NCE 2026). Kept under the historical
 * name for call sites; it is no longer a made-up sample rate and never a flat
 * company rate — a located estimate always overrides it via withLaborRate().
 */
export const SAMPLE_LABOR_RATE = BOOK_NATIONAL_LABOR_RATE;

export const SAMPLE_PRICEBOOK: BallparkPricebook = {
  key: "sample_v1",
  isSampleData: true,
  laborRate: SAMPLE_LABOR_RATE,
  get: (itemKey: string) => INDEX.get(itemKey) ?? null,
};

/* ------------------------------------------------------------------ *
 * Book-sourcing disclosure
 *
 * The 2026 National Construction Estimator (Craftsman Book Co.) is the source
 * of truth for estimating. Entries listed here carry book-derived material
 * money and book craft hours. EVERY OTHER ENTRY IN THIS MODULE IS STILL THE
 * OLD WEB-SOURCED / ILLUSTRATIVE PLACEHOLDER and must be replaced with book
 * data before it can be treated as real pricing.
 * ------------------------------------------------------------------ */
export const BOOK_SOURCED_KEYS: ReadonlySet<string> = new Set([
  "door.exterior",
  "window.replacement",
  /* Approximation: no mulled double-unit SKU exists in the book. */
  "window.replacement_double",
  /* Basic steel panel; true standing seam is not covered by the book. */
  "roofing.metal_standing_seam",
  "siding.install",
  "deck.rebuild",
]);

/** True when this ballpark subject is priced from the 2026 NCE book. */
export function isBookSourcedPrice(itemKey: string): boolean {
  return BOOK_SOURCED_KEYS.has(itemKey);
}


/* ------------------------------------------------------------------ *
 * Finish tiers
 * ------------------------------------------------------------------ */

/** Builder-grade, standard and high-end material selection tiers. */
export type FinishTier = "value" | "standard" | "premium";

/**
 * Tier moves MATERIAL money only. Labor hours for hanging a door or setting a
 * tile do not change because the tile costs more; the material does.
 */
export const TIER_MATERIAL_FACTOR: Record<FinishTier, number> = {
  value: 0.82,
  standard: 1,
  premium: 1.38,
};

/**
 * Work whose cost is set by code, fee schedules or raw labor rather than by
 * finish selection. Tier must never move these — a permit does not get more
 * expensive because the client picked quartz.
 */
const TIER_INSENSITIVE_PREFIXES = [
  "permits.",
  "demolition.",
  "general.",
  "electrical.protection",
  "electrical.circuit",
  "structural.",
  "restoration.",
  "framing.",
  "insulation.",
  "drywall.",
];

export function isTierSensitive(itemKey: string): boolean {
  return !TIER_INSENSITIVE_PREFIXES.some((prefix) => itemKey.startsWith(prefix));
}

export function normalizeFinishTier(value: string | null | undefined): FinishTier {
  const text = String(value ?? "").toLowerCase();
  if (text === "value" || text === "basic" || text === "builder" || text === "economy") return "value";
  if (text === "premium" || text === "high_end" || text === "luxury") return "premium";
  return "standard";
}

/** Wrap a pricebook so material money reflects the selected finish tier. */
export function withFinishTier(
  pricebook: BallparkPricebook,
  tier: FinishTier | string | null | undefined,
): BallparkPricebook {
  const resolved = normalizeFinishTier(typeof tier === "string" ? tier : tier ?? null);
  if (resolved === "standard") return pricebook;
  const factor = TIER_MATERIAL_FACTOR[resolved];
  return {
    ...pricebook,
    get: (itemKey: string) => {
      const found = pricebook.get(itemKey);
      if (!found || !isTierSensitive(itemKey)) return found;
      return {
        ...found,
        materialCostPerUnit: Math.round(found.materialCostPerUnit * factor * 100) / 100,
      };
    },
  };
}

/** Build a pricebook that keeps the sample rates but uses a real labor rate. */
export function withLaborRate(
  pricebook: BallparkPricebook,
  laborRate: number | null | undefined,
): BallparkPricebook {
  const rate = typeof laborRate === "number" && laborRate > 0 ? laborRate : pricebook.laborRate;
  return { ...pricebook, laborRate: rate, get: (k) => pricebook.get(k) };
}

