import type { ActionKey, DerivationKey, UnitFamily } from "./types";

/**
 * INDUSTRY-STANDARD TRADE UNIT / QUANTITY REGISTRY (ADR-060).
 *
 * One data table answers, for every task family the estimator can recognize:
 *
 *   - which unit the trade actually estimates in (SF, LF, EA, SQ, SY, CY...)
 *   - how the quantity is derived from authoritative geometry
 *   - which base unit that derivation produces, and how it converts
 *   - the industry waste convention, applied to PRICING only
 *   - the one high-impact question worth asking when it is unknown
 *   - the visible assumption used when nothing better exists
 *
 * Recognition (what the contractor asked for) lives in `patterns.ts`; this
 * file is the estimating convention. Adding a trade means adding rows here,
 * never a new code path in the resolver.
 *
 * Quantities are national/industry-standard. Localization happens in pricing
 * (regional cost factors by ZIP/market), never by bending the quantity.
 */

export interface TradeClarification {
  id: string;
  /** i18n-friendly plain question; short and trade-appropriate. */
  question: string;
  impact: "high" | "low";
  /** Skip the question when the transcript already answers it. */
  answeredWhen?: RegExp;
}

export interface TradeStandard {
  key: string;
  label: string;
  /** Canonical `catalog_assemblies.trade_key`. */
  trade: string;
  /** The unit the estimate is expressed in. */
  unitKey: string;
  family: UnitFamily;
  /** The unit the derivation natively produces, before conversion. */
  baseUnitKey: string;
  derivation: DerivationKey;
  defaultAction: ActionKey;
  /** Zone keys this task applies to; empty = any zone. */
  zoneKeys?: string[];
  /** Industry waste factor. Pricing quantity only — measured quantity stays exact. */
  wastePct?: number;
  /** Always-shown convention note. */
  standingAssumption?: string;
  /** Last-resort quantity, always disclosed as an assumption. */
  allowance?: { quantity: number; note: string };
  /**
   * Whole-house fallback ratio: paintable/board area per SF of floor area when
   * only house size is known. Documented, visible, and adjustable — never a
   * hidden constant buried in a formula.
   */
  houseAreaRatio?: number;
  clarification?: TradeClarification;
}

/** Documented industry ratios (visible assumptions, not hidden magic). */
export const INDUSTRY_RATIOS = {
  /** Paintable wall+ceiling area per SF of floor, whole-house ballpark. */
  paintAreaPerFloorSf: 3.5,
  /** Board area per SF of floor for a full drywall scope. */
  drywallAreaPerFloorSf: 3.5,
  /** Exterior wall area per SF of footprint, one story with gables. */
  sidingAreaPerFootprintSf: 1.1,
} as const;

export const TRADE_STANDARDS: Record<string, TradeStandard> = {
  /* ------------------------------------------------------------ exterior */
  "deck.surface": {
    key: "deck.surface",
    label: "Deck surface",
    trade: "decks",
    unitKey: "square_foot",
    family: "area",
    baseUnitKey: "square_foot",
    derivation: "surface_area",
    defaultAction: "build",
    zoneKeys: ["deck"],
    wastePct: 0.1,
    clarification: {
      id: "deck-material",
      question: "Pressure-treated, composite, or hardwood decking?",
      impact: "high",
      answeredWhen: /\b(pressure[- ]?treated|pt\b|composite|trex|azek|cedar|ipe|mahogany|hardwood|pvc)\b/i,
    },
  },
  "deck.railing": {
    key: "deck.railing",
    label: "Deck railing",
    trade: "decks",
    unitKey: "linear_foot",
    family: "length",
    baseUnitKey: "linear_foot",
    derivation: "perimeter",
    defaultAction: "install",
    zoneKeys: ["deck"],
    standingAssumption:
      "Railing is priced around the open perimeter; the house side is assumed to need none.",
  },
  "deck.stairs": {
    key: "deck.stairs",
    label: "Deck stairs",
    trade: "decks",
    unitKey: "each",
    family: "count",
    baseUnitKey: "each",
    derivation: "stated_count",
    defaultAction: "build",
    allowance: { quantity: 1, note: "One stair flight assumed (3-4 risers to grade)." },
    clarification: {
      id: "stair-rise",
      question: "How many steps down to grade?",
      impact: "low",
    },
  },
  "roofing.covering": {
    key: "roofing.covering",
    label: "Roof covering",
    trade: "roofing",
    unitKey: "roofing_square",
    family: "area",
    baseUnitKey: "square_foot",
    derivation: "roof_area",
    defaultAction: "replace",
    zoneKeys: ["roof", "footprint"],
    wastePct: 0.1,
    standingAssumption:
      "Roofing is estimated in squares (1 square = 100 SF of roof surface), not house floor area.",
    clarification: {
      id: "roof-pitch",
      question: "What is the roof pitch, and how many planes/valleys?",
      impact: "high",
      answeredWhen: /\b\d{1,2}\s*[/:]\s*12\b|\b(flat|low[- ]slope|walkable|steep)\b/i,
    },
  },
  "siding.covering": {
    key: "siding.covering",
    label: "Siding",
    trade: "siding",
    unitKey: "square_foot",
    family: "area",
    baseUnitKey: "square_foot",
    derivation: "wall_area",
    defaultAction: "replace",
    wastePct: 0.1,
    houseAreaRatio: INDUSTRY_RATIOS.sidingAreaPerFootprintSf,
    standingAssumption: "Exterior wall area less window and door openings.",
    clarification: {
      id: "siding-material",
      question: "Vinyl, fiber cement, or wood siding?",
      impact: "high",
      answeredWhen: /\b(vinyl|fiber[- ]?cement|hardie|wood|cedar|lp smart|stucco|engineered)\b/i,
    },
  },
  "siding.trim": {
    key: "siding.trim",
    label: "Soffit, fascia and corner trim",
    trade: "siding",
    unitKey: "linear_foot",
    family: "length",
    baseUnitKey: "linear_foot",
    derivation: "perimeter",
    defaultAction: "replace",
    wastePct: 0.1,
  },

  /* -------------------------------------------------------------- interior */
  "flooring.surface": {
    key: "flooring.surface",
    label: "Flooring",
    trade: "flooring",
    unitKey: "square_foot",
    family: "area",
    baseUnitKey: "square_foot",
    derivation: "floor_area",
    defaultAction: "replace",
    wastePct: 0.1,
    standingAssumption: "Room areas are summed; whole-house scope sums every named room.",
  },
  "flooring.carpet": {
    key: "flooring.carpet",
    label: "Carpet",
    trade: "flooring",
    unitKey: "square_yard",
    family: "area",
    baseUnitKey: "square_foot",
    derivation: "floor_area",
    defaultAction: "replace",
    wastePct: 0.1,
    standingAssumption:
      "Carpet is estimated in square yards (9 SF = 1 SY) with pad and standard seam waste.",
    clarification: {
      id: "carpet-grade",
      question: "Builder-grade, mid-grade, or premium carpet and pad?",
      impact: "high",
      answeredWhen: /\b(builder|mid[- ]grade|premium|berber|plush|frieze|nylon|polyester|wool)\b/i,
    },
  },
  "paint.walls": {
    key: "paint.walls",
    label: "Wall painting",
    trade: "painting",
    unitKey: "square_foot",
    family: "area",
    baseUnitKey: "square_foot",
    derivation: "wall_area",
    defaultAction: "paint",
    houseAreaRatio: INDUSTRY_RATIOS.paintAreaPerFloorSf,
    standingAssumption: "Two coats over prepared, previously painted surfaces.",
  },
  "paint.ceilings": {
    key: "paint.ceilings",
    label: "Ceiling painting",
    trade: "painting",
    unitKey: "square_foot",
    family: "area",
    baseUnitKey: "square_foot",
    derivation: "ceiling_area",
    defaultAction: "paint",
  },
  /*
   * Ceiling / underside insulation (basement lids, garage lids, rim joists) is
   * measured on the CEILING plane. Deriving it as wall area invents a paintable
   * perimeter that nobody insulated.
   */
  "insulation.ceiling": {
    key: "insulation.ceiling",
    label: "Ceiling insulation",
    trade: "insulation",
    unitKey: "square_foot",
    family: "area",
    baseUnitKey: "square_foot",
    derivation: "ceiling_area",
    defaultAction: "install",
  },
  "drywall.surface": {

    key: "drywall.surface",
    label: "Drywall",
    trade: "drywall",
    unitKey: "square_foot",
    family: "area",
    baseUnitKey: "square_foot",
    derivation: "wall_area",
    defaultAction: "install",
    wastePct: 0.1,
    houseAreaRatio: INDUSTRY_RATIOS.drywallAreaPerFloorSf,
  },
  "insulation.surface": {
    key: "insulation.surface",
    label: "Insulation",
    trade: "insulation",
    unitKey: "square_foot",
    family: "area",
    baseUnitKey: "square_foot",
    derivation: "wall_area",
    defaultAction: "install",
    houseAreaRatio: INDUSTRY_RATIOS.drywallAreaPerFloorSf,
  },
  "framing.walls": {
    key: "framing.walls",
    label: "Framing",
    trade: "framing",
    unitKey: "linear_foot",
    family: "length",
    baseUnitKey: "linear_foot",
    derivation: "perimeter",
    defaultAction: "build",
  },
  "trim.exterior": {
    key: "trim.exterior",
    label: "Exterior trim",
    trade: "siding",
    unitKey: "linear_foot",
    family: "length",
    baseUnitKey: "linear_foot",
    derivation: "perimeter",
    defaultAction: "install",
    wastePct: 0.1,
  },
  "trim.finish_carpentry": {
    key: "trim.finish_carpentry",
    label: "Trim and finish carpentry",
    trade: "trim",
    unitKey: "linear_foot",
    family: "length",
    baseUnitKey: "linear_foot",
    derivation: "perimeter",
    defaultAction: "install",
    wastePct: 0.1,
  },

  "carpentry.builtin": {
    key: "carpentry.builtin",
    label: "Built-in millwork",
    trade: "cabinetry",
    unitKey: "linear_foot",
    family: "length",
    baseUnitKey: "linear_foot",
    derivation: "run_length",
    defaultAction: "build",
    standingAssumption:
      "Priced from the overall built-in width; bay and shelf counts refine the price, they do not set it.",
  },
  "demolition.wall": {
    key: "demolition.wall",
    label: "Wall demolition",
    trade: "demolition",
    unitKey: "each",
    family: "count",
    baseUnitKey: "each",
    derivation: "stated_count",
    defaultAction: "remove",
    allowance: { quantity: 1, note: "One wall removal assumed." },
  },
  "demolition.finishes": {
    key: "demolition.finishes",
    label: "Finish demolition",
    trade: "demolition",
    unitKey: "square_foot",
    family: "area",
    baseUnitKey: "square_foot",
    derivation: "floor_area",
    defaultAction: "remove",
    standingAssumption:
      "Demolition quantity follows the surface being removed; it is only in scope when removal was requested.",
  },

  /* ---------------------------------------------------------- openings */
  "windows.openings": {
    key: "windows.openings",
    label: "Window replacement",
    trade: "windows",
    unitKey: "each",
    family: "opening",
    baseUnitKey: "each",
    derivation: "stated_count",
    defaultAction: "replace",
    allowance: {
      quantity: 1,
      note: "Standard-size window assumed; confirm any oversized or custom opening.",
    },
    standingAssumption:
      "Replacement in the existing opening — no new framing, siding, or drywall repair included.",
  },
  "windows.new_opening": {
    key: "windows.new_opening",
    label: "New window opening",
    trade: "windows",
    unitKey: "each",
    family: "opening",
    baseUnitKey: "each",
    derivation: "stated_count",
    defaultAction: "install",
    allowance: { quantity: 1, note: "One new opening assumed." },
    standingAssumption:
      "New opening includes header/rough framing, exterior patch, and interior trim — priced separately from a like-for-like replacement.",
  },
  "doors.openings": {
    key: "doors.openings",
    label: "Doors",
    trade: "doors",
    unitKey: "each",
    family: "opening",
    baseUnitKey: "each",
    derivation: "stated_count",
    defaultAction: "replace",
    allowance: { quantity: 1, note: "Standard pre-hung door assumed." },
  },
  "doors.new_opening": {
    key: "doors.new_opening",
    label: "New door opening",
    trade: "doors",
    unitKey: "each",
    family: "opening",
    baseUnitKey: "each",
    derivation: "stated_count",
    defaultAction: "install",
    allowance: { quantity: 1, note: "One new opening assumed." },
    standingAssumption:
      "New opening includes header/rough framing and finish patching, unlike a replacement in an existing opening.",
  },

  /* -------------------------------------------------------------- MEP */
  "plumbing.fixtures": {
    key: "plumbing.fixtures",
    label: "Plumbing fixtures",
    trade: "plumbing",
    unitKey: "each",
    family: "fixture",
    baseUnitKey: "each",
    derivation: "stated_count",
    defaultAction: "replace",
    allowance: { quantity: 1, note: "One fixture assumed per named fixture." },
    standingAssumption:
      "Fixture set in the existing location; new rough-in is a separate line.",
  },
  "plumbing.rough_in": {
    key: "plumbing.rough_in",
    label: "Plumbing rough-in",
    trade: "plumbing",
    unitKey: "each",
    family: "fixture",
    baseUnitKey: "each",
    derivation: "stated_count",
    defaultAction: "install",
    allowance: { quantity: 1, note: "One rough-in location assumed." },
  },
  "plumbing.piping": {
    key: "plumbing.piping",
    label: "Water and drain piping",
    trade: "plumbing",
    unitKey: "linear_foot",
    family: "length",
    baseUnitKey: "linear_foot",
    derivation: "run_length",
    defaultAction: "install",
  },
  "electrical.devices": {
    key: "electrical.devices",
    label: "Electrical devices",
    trade: "electrical",
    unitKey: "each",
    family: "circuit_device",
    baseUnitKey: "each",
    derivation: "stated_count",
    defaultAction: "install",
    allowance: { quantity: 1, note: "One device assumed." },
  },
  "electrical.circuits": {
    key: "electrical.circuits",
    label: "Electrical circuits",
    trade: "electrical",
    unitKey: "each",
    family: "circuit_device",
    baseUnitKey: "each",
    derivation: "stated_count",
    defaultAction: "install",
    allowance: { quantity: 1, note: "One dedicated circuit assumed." },
  },
  "electrical.service": {
    key: "electrical.service",
    label: "Panel and service",
    trade: "electrical",
    unitKey: "each",
    family: "count",
    baseUnitKey: "each",
    derivation: "stated_count",
    defaultAction: "replace",
    allowance: { quantity: 1, note: "One panel or service upgrade assumed." },
  },
  "electrical.wiring": {
    key: "electrical.wiring",
    label: "Wiring runs",
    trade: "electrical",
    unitKey: "linear_foot",
    family: "length",
    baseUnitKey: "linear_foot",
    derivation: "run_length",
    defaultAction: "install",
  },
  "electrical.fixtures": {
    key: "electrical.fixtures",
    label: "Light fixtures",
    trade: "electrical",
    unitKey: "each",
    family: "fixture",
    baseUnitKey: "each",
    derivation: "stated_count",
    defaultAction: "install",
    allowance: { quantity: 1, note: "One fixture assumed." },
  },
  "hvac.equipment": {
    key: "hvac.equipment",
    label: "HVAC",
    trade: "hvac",
    unitKey: "each",
    family: "count",
    baseUnitKey: "each",
    derivation: "stated_count",
    defaultAction: "install",
    allowance: { quantity: 1, note: "One system or zone assumed." },
  },

  /* ---------------------------------------------------------- sitework */
  "concrete.flatwork": {
    key: "concrete.flatwork",
    label: "Concrete flatwork",
    trade: "concrete",
    unitKey: "cubic_yard",
    family: "volume",
    baseUnitKey: "cubic_yard",
    derivation: "volume",
    defaultAction: "install",
    standingAssumption: '4" slab thickness assumed; slab area stays in SF, concrete in CY.',
  },
  "concrete.footings": {
    key: "concrete.footings",
    label: "Footings and foundation walls",
    trade: "concrete",
    unitKey: "linear_foot",
    family: "length",
    baseUnitKey: "linear_foot",
    derivation: "perimeter",
    defaultAction: "install",
    standingAssumption: "Footings are measured in linear feet; concrete volume is a separate line.",
  },
};

export function standardFor(key: string): TradeStandard | undefined {
  return TRADE_STANDARDS[key];
}

export const TRADE_STANDARD_KEYS = Object.keys(TRADE_STANDARDS);
