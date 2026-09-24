/**
 * Ballpark Quantity Resolution.
 *
 * A ballpark is NOT a detailed takeoff. A contractor who has already told the
 * app the room is 18 ft × 16 ft with a 12 ft ceiling must never be asked for
 * drywall square footage, insulation SF, flooring SF, baseboard LF or a stud
 * count. This layer sits in front of ballpark pricing and resolves a quantity
 * for every scope line in a fixed priority order:
 *
 *   1. explicit contractor-entered quantity;
 *   2. a count expressed in the scope text (size-is-not-a-count rules apply);
 *   3. derivation from saved project geometry;
 *   4. a conservative standard residential allowance;
 *   5. only then is the line reported as genuinely needing contractor input.
 *
 * It also consolidates overlapping scope wording (two flooring lines, two
 * paint lines, two generic electrical lines) into ONE ballpark price subject so
 * synonymous scope is never double-priced. Nothing is deleted: every source
 * item id is preserved on the surviving subject for auditability.
 *
 * Pure: no React, no network, no i18n. Project geometry is passed in — no
 * project-specific numbers are ever hard-coded here.
 */

import type { RoomGeometryInput } from "@/domains/geometry";
import { deriveRoomGeometry } from "@/domains/geometry";
import { detectQuantity } from "@/domains/voiceCapture";
import { subjectFor } from "@/domains/scopeInterpretation/subjects";
import { DEFAULT_MAX_QUANTITY, DEFAULT_MAX_EACH_COUNT, SAMPLE_PRICEBOOK } from "./pricebook";
import type { BallparkPricebook } from "./types";

/**
 * Where a ballpark quantity came from. `contractor` is a correction the
 * contractor made to a quantity the ballpark had inferred — it outranks every
 * inference and survives recalculation.
 */
export type BallparkQuantitySource =
  | "explicit"
  | "text"
  | "geometry"
  | "allowance"
  | "contractor";

export type BallparkUnit = "square_foot" | "linear_foot" | "each";

/** The geometry facts a ballpark can price from. Any of them may be missing. */
export interface BallparkGeometryFacts {
  lengthFt: number | null;
  widthFt: number | null;
  ceilingHeightFt: number | null;
  floorAreaSf: number | null;
  ceilingAreaSf: number | null;
  perimeterLf: number | null;
  wallNetAreaSf: number | null;
  /** Walls + ceiling + both faces of interior partitions, openings deducted. */
  drywallSurfaceSf: number | null;
  flooringWithWasteSf: number | null;
  /** Perimeter base less door openings, plus interior partitions. */
  trimLf: number | null;
  partitionLf: number | null;
}

export const EMPTY_GEOMETRY_FACTS: BallparkGeometryFacts = {
  lengthFt: null,
  widthFt: null,
  ceilingHeightFt: null,
  floorAreaSf: null,
  ceilingAreaSf: null,
  perimeterLf: null,
  wallNetAreaSf: null,
  drywallSurfaceSf: null,
  flooringWithWasteSf: null,
  trimLf: null,
  partitionLf: null,
};

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const pos = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};

/** Facts from a saved room geometry record (measurements or ballpark session). */
export function geometryFactsFrom(input: RoomGeometryInput | null | undefined): BallparkGeometryFacts {
  if (!input) return EMPTY_GEOMETRY_FACTS;
  const g = deriveRoomGeometry(input);
  const m = g.measurements;
  const avail = (key: keyof typeof m): number | null =>
    m[key].status === "available" ? round2(m[key].value) : null;

  const partitionLf = pos(input.interiorPartitionLf);
  const height = pos(input.ceilingHeightFt);
  const wallNet = avail("wall_net_area");
  const ceiling = avail("ceiling_area");
  /* Both faces of an interior partition get drywall. */
  const partitionFaces = partitionLf != null && height != null ? partitionLf * height * 2 : 0;
  const trim = avail("trim_lf");

  return {
    lengthFt: pos(input.lengthFt),
    widthFt: pos(input.widthFt),
    ceilingHeightFt: height,
    floorAreaSf: avail("floor_area"),
    ceilingAreaSf: ceiling,
    perimeterLf: avail("perimeter"),
    wallNetAreaSf: wallNet,
    drywallSurfaceSf:
      wallNet != null && ceiling != null ? round2(wallNet + ceiling + partitionFaces) : null,
    flooringWithWasteSf: avail("flooring_area_with_waste"),
    trimLf: trim != null ? round2(trim + (partitionLf ?? 0)) : null,
    partitionLf,
  };
}

/**
 * Facts from a stored ballpark snapshot (`geometry` on the snapshot or on its
 * preserved `originalBallpark` / `previous` history). Project specific data
 * comes from here — never from constants in this module.
 */
export function geometryFactsFromSnapshot(snapshot: unknown): BallparkGeometryFacts {
  const input = findGeometryInput(snapshot, 0);
  return geometryFactsFrom(input);
}

function findGeometryInput(node: unknown, depth: number): RoomGeometryInput | null {
  if (!node || typeof node !== "object" || depth > 4) return null;
  const o = node as Record<string, unknown>;
  const geo = o.geometry as Record<string, unknown> | undefined;
  if (geo && (pos(geo.lengthFt) || pos(geo.widthFt))) {
    return {
      roomId: (geo.roomId as string | null) ?? null,
      label: (geo.label as string | null) ?? null,
      lengthFt: pos(geo.lengthFt),
      widthFt: pos(geo.widthFt),
      ceilingHeightFt: pos(geo.ceilingHeightFt),
      openings: Array.isArray(geo.openings) ? (geo.openings as RoomGeometryInput["openings"]) : [],
      interiorPartitionLf: pos(geo.interiorPartitionLf),
      floorWastePct: pos(geo.floorWastePct),
    };
  }
  return (
    findGeometryInput(o.originalBallpark, depth + 1) ??
    findGeometryInput(o.previous, depth + 1) ??
    findGeometryInput(o.ballpark, depth + 1)
  );
}

export const hasUsableGeometry = (f: BallparkGeometryFacts): boolean =>
  f.floorAreaSf != null || f.wallNetAreaSf != null;

/* ------------------------------------------------------------------ *
 * Standard residential ballpark allowances
 * ------------------------------------------------------------------ */

/** Scope-level allowances used when a count/measurement is not required. */
export const BALLPARK_ALLOWANCES = {
  /** One demolition run of a single interior wall when its length is unknown. */
  wallDemoLf: 16,
  /** Closet shelving run when nothing better is known. */
  closetLf: 8,
  /** Trim painting run when there is no geometry at all. */
  trimLf: 60,
  /**
   * Provisional allowances. Ballpark mode carries credible money for work whose
   * exact extent is only settled in detailed estimating / design. Each one is
   * disclosed to the contractor and can be overridden.
   */
  /** Permit packages for one residential remodel (fee + submittal time). */
  permitCount: 1,
  /** Protected circuits a typical residential remodel adds or modifies. */
  protectedCircuits: 6,
  /** Structural openings (beam + posts) when the drawing set is not in yet. */
  structuralOpenings: 1,
  /** Floor transitions / thresholds between rooms and materials. */
  transitions: 3,
  /**
   * One partition wall run when the project has no partition geometry — a
   * single-wall framing change must never stall the ballpark.
   */
  framingLf: 12,
  /* -------- Structural / finish-carpentry primitives -------- */
  /** Temporary shoring run carrying one opening while it is framed. */
  shoringLf: 12,
  /** Stamped structural details for one residential opening. */
  engineeringDetails: 1,
  /** Beam span when the opening has not been measured yet. */
  beamLf: 14,
  /** Point-load posts at each end of one opening. */
  structuralPosts: 2,
  /** Bearing wall / structural opening length when unmeasured. */
  bearingDemoLf: 12,
  /** Finished length of a wrapped beam when the span is unmeasured. */
  beamWrapLf: 14,
  /** Wrapped columns at one opening. */
  columnWraps: 2,
  /** Finished run of built-in casework when the wall has not been measured. */
  builtInLf: 10,
  /** Decorative / applied molding run in one room. */
  decorativeTrimLf: 40,
  /* -------- Outdoor structures / site (not building envelope) -------- */
  /** One residential deck or porch platform when it was never measured. */
  deckSf: 240,
  /** One run of residential fencing when the line was never measured. */
  fenceLf: 150,
  /** One driveway apron / walkway pour when it was never measured. */
  flatworkSf: 320,
  /* -------- Standard kitchen cabinetry assumptions -------- */
  /**
   * Industry rule of thumb: a kitchen cabinet run finishes at 84" to the floor
   * (standard base + upper stack). Used as the assumed height whenever a
   * cabinet's height was never stated.
   */
  cabinetRunHeightIn: 84,
  cabinetRunHeightFt: 7,
  /**
   * A single pantry-style cabinet comes in 30" or 36" widths; 36" is the
   * default assumption when no width is stated.
   */
  singleCabinetWidthIn: 36,
  /** 36" expressed as the linear-foot allowance for one cabinet. */
  singleCabinetLf: 3,
  /** 36" × 84" cabinet face, for cabinetry priced by area. */
  singleCabinetFaceSf: 21,
} as const;




/* ------------------------------------------------------------------ *
 * Price subjects
 * ------------------------------------------------------------------ */

export interface ResolvedPricePart {
  itemKey: string;
  quantity: number;
  unitKey: BallparkUnit;
  source: BallparkQuantitySource;
  /** i18n key suffix under `estimating:ballparkCard.basis`. */
  basisKey: string;
  basisValues?: Record<string, string | number>;
  /**
   * A provisional allowance: real money is carried for work whose exact scope
   * (permit fee schedule, device count, beam sizing) is only established during
   * detailed estimating. Always disclosed, never presented as an exact price.
   */
  provisional?: boolean;
}


export interface ResolvedScopeSubject {
  itemId: string;
  title: string;
  /** Family used for consolidation, e.g. "flooring", "paint.walls". */
  family: string;
  /** Source items rolled into this one because they describe the same work. */
  rolledUp: Array<{ itemId: string; title: string }>;
  parts: ResolvedPricePart[];
}

export interface UnresolvedScopeSubject {
  itemId: string;
  title: string;
  reason: "noMapping" | "noQuantity" | "implausibleQuantity";
  quantity?: number;
  maxPlausible?: number;
}

export interface ResolvableScopeItem {
  id: string;
  title: string;
  quantity: number | null;
  unitKey: string | null;
}

interface SubjectPlan {
  family: string;
  /** Pricebook keys with how to size each one. */
  parts: Array<{
    itemKey: string;
    /** Geometry fact to use, or null when this part is a scope allowance. */
    geometry?: (f: BallparkGeometryFacts) => { value: number; basisKey: string; basisValues?: Record<string, string | number> } | null;
    /** Allowance quantity used when geometry is unavailable. */
    allowance?: number;
    allowanceBasisKey?: string;
    /** Marks the resolved part as a disclosed provisional allowance. */
    provisional?: boolean;
  }>;
  /** True when the plan is a specific reading (wins consolidation ties). */
  specific?: boolean;
}


const has = (text: string, re: RegExp) => re.test(text);

const geo =
  (pick: (f: BallparkGeometryFacts) => number | null, basisKey: string) =>
  (f: BallparkGeometryFacts) => {
    const v = pick(f);
    if (v == null || v <= 0) return null;
    return {
      value: round2(v),
      basisKey,
      basisValues: {
        length: f.lengthFt ?? "?",
        width: f.widthFt ?? "?",
        height: f.ceilingHeightFt ?? "?",
      },
    };
  };

const FLOOR_AREA = geo((f) => f.floorAreaSf, "floorArea");
const CEILING_AREA = geo((f) => f.ceilingAreaSf, "ceilingArea");
const WALL_AREA = geo((f) => f.wallNetAreaSf, "wallArea");
const DRYWALL_SURFACE = geo((f) => f.drywallSurfaceSf, "drywallSurface");
const FLOORING_AREA = geo((f) => f.flooringWithWasteSf, "flooringArea");
const TRIM_LF = geo((f) => f.trimLf, "trimLength");
const PARTITION_LF = geo((f) => f.partitionLf, "partitionLength");
const FRAMING_LF = geo((f) => f.partitionLf ?? f.perimeterLf, "framingLength");

/**
 * Deterministic title → ballpark price subject. Ordered: the first match wins,
 * so specific readings sit above generic ones.
 */
const SUBJECT_PLANS: Array<{ test: RegExp; plan: SubjectPlan }> = [
  /*
   * Provisional-allowance families. Routine remodeling uncertainty (permit fee
   * schedules, code-required protection, structural sizing, floor transitions)
   * must never leave a scope line at $0 and must never trigger an engineering
   * questionnaire in ballpark mode. Each one carries a conservative, disclosed
   * allowance the contractor can override.
   */
  {
    /* Permits and jurisdictional fees. */
    test: /\bpermits?\b|permit fee|plan review|jurisdiction|permiso|licencia de construcci/i,
    plan: {
      family: "permits",
      specific: true,
      parts: [
        {
          itemKey: "permits.allowance",
          allowance: BALLPARK_ALLOWANCES.permitCount,
          allowanceBasisKey: "permitAllowance",
          provisional: true,
        },
      ],
    },
  },
  {
    /* GFCI / AFCI / code-required circuit protection. */
    test: /\bgfci\b|\bafci\b|arc[- ]fault|ground[- ]fault|circuit protection|protecci[oó]n (el[eé]ctrica|de circuito)/i,
    plan: {
      family: "electrical.protection",
      specific: true,
      parts: [
        {
          itemKey: "electrical.protection",
          allowance: BALLPARK_ALLOWANCES.protectedCircuits,
          allowanceBasisKey: "protectionAllowance",
          provisional: true,
        },
      ],
    },
  },
  /* ------------------------------------------------------------------ *
   * Structural primitives.
   *
   * Ordered specific-first: a beam that is being WRAPPED is finish carpentry,
   * not a second structural beam, so the wrap readings sit above the beam
   * reading. Every one of these is a reusable operation — nothing here knows
   * anything about a particular job.
   * ------------------------------------------------------------------ */
  {
    /* Drywall-finished beam / column enclosure. */
    test: /(drywall|sheet ?rock|tabla ?roca).{0,24}(wrap|box|enclos|encase)|(wrap|box|enclos|encase).{0,24}(beam|column|post).{0,24}(in |with )?(drywall|sheet ?rock)/i,
    plan: {
      family: "beam.wrap",
      specific: true,
      parts: [
        {
          itemKey: "drywall.beam_wrap",
          allowance: BALLPARK_ALLOWANCES.beamWrapLf,
          allowanceBasisKey: "beamWrapAllowance",
          provisional: true,
        },
      ],
    },
  },
  {
    /* Paint-grade / stain-grade wrapped (boxed) beam. */
    test: /(wrap|box(ed)?|clad|encase|envolver|forrar).{0,24}(beam|lvl|header|viga)|beam wrap|boxed beam/i,
    plan: {
      family: "beam.wrap",
      specific: true,
      parts: [
        {
          itemKey: "trim.beam_wrap",
          allowance: BALLPARK_ALLOWANCES.beamWrapLf,
          allowanceBasisKey: "beamWrapAllowance",
          provisional: true,
        },
      ],
    },
  },
  {
    /* Wrapped post / column. */
    test: /(wrap|box(ed)?|clad|encase|envolver|forrar).{0,24}(column|post|poste|columna)|column wrap|post wrap/i,
    plan: {
      family: "column.wrap",
      specific: true,
      parts: [
        {
          itemKey: "trim.column_wrap",
          allowance: BALLPARK_ALLOWANCES.columnWraps,
          allowanceBasisKey: "columnWrapAllowance",
          provisional: true,
        },
      ],
    },
  },
  {
    /* Temporary shoring / support wall while structure is open. */
    test: /shoring|temporary (support|wall|bracing)|needle (wall|beam)|apuntalamiento|soporte temporal/i,
    plan: {
      family: "structural.shoring",
      specific: true,
      parts: [
        {
          itemKey: "structural.shoring",
          allowance: BALLPARK_ALLOWANCES.shoringLf,
          allowanceBasisKey: "shoringAllowance",
          provisional: true,
        },
      ],
    },
  },
  {
    /* Stamped structural detail — an allowance, never a legal assertion. */
    test: /structural engineer\w*|engineer\w* (detail|letter|calc)|stamped (detail|plan)|ingenier[oí]a estructural/i,
    plan: {
      family: "structural.engineering",
      specific: true,
      parts: [
        {
          itemKey: "structural.engineering",
          allowance: BALLPARK_ALLOWANCES.engineeringDetails,
          allowanceBasisKey: "engineeringAllowance",
          provisional: true,
        },
      ],
    },
  },
  {
    /* Bearing-wall / structural-opening demolition: not ordinary demo. */
    test: /(load[- ]?bearing|bearing|structural).{0,20}(wall|opening).{0,20}(demo|remov)|(demo|remove|open up|cut).{0,24}(load[- ]?bearing|bearing|structural).{0,12}(wall|opening)|bearing wall demo|structural opening|muro de carga/i,
    plan: {
      family: "demolition.wall_bearing",
      specific: true,
      parts: [
        {
          itemKey: "demolition.wall_bearing",
          geometry: PARTITION_LF,
          allowance: BALLPARK_ALLOWANCES.bearingDemoLf,
          allowanceBasisKey: "bearingDemoAllowance",
          provisional: true,
        },
      ],
    },
  },
  {
    /*
     * Structural beam and its point loads. The beam is priced by span, the
     * posts by count, and a stamped detail is carried as a disclosed
     * allowance — the three parts a structural opening always has.
     */
    test: /\blvl\b|\bglulam\b|\bbeam\b|\bheader\b|(structural|carrying|bearing|support|new).*(post|column)|\bposts?\b|\bcolumns?\b|viga|cabezal|columna|poste/i,
    plan: {
      family: "structural.beam",
      specific: true,
      parts: [
        {
          itemKey: "structural.beam_lvl",
          allowance: BALLPARK_ALLOWANCES.beamLf,
          allowanceBasisKey: "beamSpanAllowance",
          provisional: true,
        },
        {
          itemKey: "structural.post",
          allowance: BALLPARK_ALLOWANCES.structuralPosts,
          allowanceBasisKey: "structuralPostAllowance",
          provisional: true,
        },
        {
          itemKey: "structural.engineering",
          allowance: BALLPARK_ALLOWANCES.engineeringDetails,
          allowanceBasisKey: "engineeringAllowance",
          provisional: true,
        },
      ],
    },
  },
  {
    /*
     * Built-in casework. Finish carpentry — NEVER kitchen cabinetry: a
     * bookcase must not drag a kitchen schema into an unrelated job.
     */
    test: /bookcase|book ?case|book ?shel(f|ves|ving)|built[- ]?in (shelv|book|cabinet|casework)|built[- ]?ins?\b|librero|empotrado/i,
    plan: {
      family: "trim.bookcase",
      specific: true,
      parts: [
        {
          itemKey: "trim.bookcase",
          allowance: BALLPARK_ALLOWANCES.builtInLf,
          allowanceBasisKey: "builtInAllowance",
          provisional: true,
        },
      ],
    },
  },
  {
    /* Decorative / applied molding: panel molding, chair rail, wainscot trim. */
    test: /panel mold|applied mold|chair rail|decorative (mold|trim)|wainscot|moldura decorativa/i,
    plan: {
      family: "trim.decorative",
      specific: true,
      parts: [
        {
          itemKey: "trim.decorative",
          geometry: TRIM_LF,
          allowance: BALLPARK_ALLOWANCES.decorativeTrimLf,
          allowanceBasisKey: "scopeAllowance",
        },
      ],
    },
  },



  {
    /* Floor transitions, thresholds and reducers. */
    test: /transition strips?|transitions?( and | y )?(threshold|umbral)|\bthresholds?\b|\breducers?\b|umbrales/i,
    plan: {
      family: "trim.transitions",
      specific: true,
      parts: [
        {
          itemKey: "trim.transitions",
          allowance: BALLPARK_ALLOWANCES.transitions,
          allowanceBasisKey: "transitionAllowance",
          provisional: true,
        },
      ],
    },
  },

  /* ------------------------------------------------------------------ *
   * Residential Catalog V2 readings.
   *
   * Deterministic, specific-first. Each one either sizes from saved geometry
   * or carries a conservative standard allowance, so ballpark mode completes
   * with a disclosed assumption instead of a blocker.
   * ------------------------------------------------------------------ */

  /* -- general conditions, protection, disposal -- */
  {
    test: /dumpster|debris (removal|haul)|haul[- ]?away|disposal fee|contenedor|escombro/i,
    plan: { family: "general.dumpster", specific: true, parts: [{ itemKey: "general.dumpster", allowance: 1, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /final clean|construction clean|post[- ]construction|clean ?-?up|limpieza final/i,
    plan: { family: "general.cleanup", specific: true, parts: [{ itemKey: "general.cleanup", allowance: 1, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /floor protection|protect (existing|the |adjacent )?(floor|finish|surface)|dust (barrier|containment)|protecci[oó]n de (piso|superficie)/i,
    plan: {
      family: "general.protection",
      specific: true,
      parts: [{ itemKey: "general.protection", geometry: FLOOR_AREA, allowance: 250, allowanceBasisKey: "scopeAllowance" }],
    },
  },

  /* -- demolition -- */
  {
    test: /(gut|strip)\s+(the\s+)?(interior|room|bath|bathroom|kitchen)|interior demo|demo(lition)? of existing finishes/i,
    plan: {
      family: "demolition.interior",
      specific: true,
      parts: [{ itemKey: "demolition.interior_gut", geometry: FLOOR_AREA, allowance: 200, allowanceBasisKey: "scopeAllowance" }],
    },
  },
  {
    test: /(remove|demo|demolish|tear ?out|pull up|quitar).*(flooring|floor covering|carpet|existing tile|alfombra|piso existente)/i,
    plan: {
      family: "demolition.flooring",
      specific: true,
      parts: [{ itemKey: "demolition.flooring", geometry: FLOOR_AREA, allowance: 200, allowanceBasisKey: "scopeAllowance" }],
    },
  },
  {
    test: /(remove|demo|demolish|tear ?out|quitar).*(cabinet|gabinete)/i,
    plan: {
      family: "demolition.cabinets",
      specific: true,
      parts: [{ itemKey: "demolition.cabinets", allowance: 14, allowanceBasisKey: "scopeAllowance" }],
    },
  },

  /* -- drywall repair before generic drywall -- */
  {
    test: /(patch|repair|parch).*(drywall|sheetrock|wall|ceiling|pared|techo)|drywall (repair|patch)/i,
    plan: {
      family: "drywall.patch",
      specific: true,
      parts: [{ itemKey: "drywall.patch", allowance: 64, allowanceBasisKey: "scopeAllowance" }],
    },
  },
  {
    test: /texture|knockdown|orange peel|skim ?coat|textura/i,
    plan: {
      family: "drywall.texture",
      specific: true,
      parts: [{ itemKey: "drywall.texture", geometry: DRYWALL_SURFACE, allowance: 400, allowanceBasisKey: "scopeAllowance" }],
    },
  },

  /* -- tile and wet areas (before the generic shower fixture reading) -- */
  {
    test: /(tile|waterproof|schluter|kerdi|red ?gard|impermeabiliz).*(shower|pan|wet wall|regadera|ducha)|shower (pan|waterproofing|tile)/i,
    plan: {
      family: "tile.shower",
      specific: true,
      parts: [
        { itemKey: "bath.waterproofing", allowance: 90, allowanceBasisKey: "scopeAllowance" },
        { itemKey: "tile.wall", allowance: 90, allowanceBasisKey: "scopeAllowance" },
      ],
    },
  },
  {
    test: /backsplash|salpicadero/i,
    plan: { family: "tile.backsplash", specific: true, parts: [{ itemKey: "tile.backsplash", allowance: 32, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /(tile|azulejo|loseta|porcelain|ceramic).*(floor|piso)|floor tile|piso de (azulejo|loseta)/i,
    plan: { family: "flooring", specific: true, parts: [{ itemKey: "flooring.tile", geometry: FLOORING_AREA }] },
  },
  {
    test: /wall tile|tile (surround|wainscot)|azulejo de pared/i,
    plan: { family: "tile.wall", specific: true, parts: [{ itemKey: "tile.wall", allowance: 90, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /\bcarpet\b|alfombra/i,
    plan: { family: "flooring", specific: true, parts: [{ itemKey: "flooring.carpet", geometry: FLOORING_AREA }] },
  },

  /* -- kitchen -- */
  {
    test: /countertop|counter ?top|encimera|quartz|granite|butcher block/i,
    plan: { family: "kitchen.countertop", specific: true, parts: [{ itemKey: "kitchen.countertop", allowance: 42, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /kitchen island|\bisland cabinet|isla de cocina/i,
    plan: { family: "kitchen.island", specific: true, parts: [{ itemKey: "kitchen.island", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /range hood|vent hood|campana/i,
    plan: { family: "kitchen.hood", specific: true, parts: [{ itemKey: "kitchen.range_hood", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /kitchen (sink|faucet)|fregadero/i,
    plan: { family: "kitchen.sink", specific: true, parts: [{ itemKey: "kitchen.sink_faucet", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /(install|set|hook ?up|replace).*(appliance|refrigerator|dishwasher|microwave|cooktop|oven|range\b|electrodom|estufa|lavavajillas)|appliance package/i,
    plan: { family: "kitchen.appliances", specific: true, parts: [{ itemKey: "kitchen.appliance_install", allowance: 4, allowanceBasisKey: "scopeAllowance" }] },
  },
  /*
   * Base and upper cabinetry are DIFFERENT price subjects: different hours,
   * different material money. A wall run must never be priced by reusing the
   * base-cabinet key, which silently double-counts base-cabinet material.
   */
  {
    test: /\b(upper|uppers|wall|overhead|gabinetes? (altos?|de pared))\b[^.]{0,24}\b(cabinet|cabinets|cabinetry|gabinete|gabinetes)\b|\bcabinet(ry)?\b[^.]{0,16}\b(uppers?|wall run)\b/i,
    plan: {
      family: "kitchen.cabinets.wall",
      specific: true,
      parts: [{ itemKey: "kitchen.cabinets_wall", allowance: 10, allowanceBasisKey: "scopeAllowance" }],
    },
  },
  {
    test: /\b(base|lower|bases?|gabinetes? (bajos?|inferiores?))\b[^.]{0,24}\b(cabinet|cabinets|cabinetry|gabinete|gabinetes)\b|\bcabinet(ry)?\b[^.]{0,16}\b(base run|lowers?)\b/i,
    plan: {
      family: "kitchen.cabinets.base",
      specific: true,
      parts: [{ itemKey: "kitchen.cabinets_base", allowance: 14, allowanceBasisKey: "scopeAllowance" }],
    },
  },
  {
    test: /(install|new|replace|set).*(cabinet|cabinetry|gabinete)|kitchen cabinets|cabinetry package/i,
    plan: {
      family: "kitchen.cabinets",
      specific: true,
      parts: [
        { itemKey: "kitchen.cabinets_base", allowance: 14, allowanceBasisKey: "scopeAllowance" },
        { itemKey: "kitchen.cabinets_wall", allowance: 10, allowanceBasisKey: "scopeAllowance" },
      ],
    },
  },

  /* -- electrical detail before the generic electrical subject -- */
  /*
   * Moving one device is device-level work. It must never fall through to the
   * whole-room `electrical.moderate` remodel package (22 hours, $950).
   */
  {
    test: /\b(relocat\w*|move|moving|shift|reposition\w*|reubica\w*|mover)\b[^.]{0,32}\b(outlet|receptacle|switch(es)?|device|j-?box|junction box|contacto|apagador|tomacorriente)\b|\b(outlet|receptacle|switch(es)?|contacto|apagador|tomacorriente)\b[^.]{0,24}\b(relocat\w*|moved?|reubica\w*)\b/i,
    plan: {
      family: "electrical.device.relocate",
      specific: true,
      parts: [{ itemKey: "electrical.device.relocate", allowance: 1, allowanceBasisKey: "countAllowance" }],
    },
  },
  {
    test: /recessed (light|can)|can lights?|luces empotradas/i,
    plan: { family: "electrical.recessed", specific: true, parts: [{ itemKey: "electrical.recessed_light", allowance: 6, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /ceiling fan|ventilador de techo/i,
    plan: { family: "electrical.fan", specific: true, parts: [{ itemKey: "electrical.ceiling_fan", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /smoke (detector|alarm)|carbon monoxide|detector de humo/i,
    plan: { family: "electrical.detectors", specific: true, parts: [{ itemKey: "electrical.smoke_detector", allowance: 3, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /light fixture|pendant|sconce|vanity light|luminaria/i,
    plan: { family: "electrical.fixtures", specific: true, parts: [{ itemKey: "electrical.fixture", allowance: 3, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /(outlet|receptacle|switch(es)?\b|contacto|apagador)/i,
    plan: { family: "electrical.devices", specific: true, parts: [{ itemKey: "electrical.device", allowance: 8, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /sub ?panel|panel upgrade|service upgrade|200 ?amp|panel el[eé]ctrico/i,
    plan: { family: "electrical.panel", specific: true, parts: [{ itemKey: "electrical.panel", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /dedicated circuit|circuits?\b|home ?run|circuito/i,
    plan: { family: "electrical.circuits", specific: true, parts: [{ itemKey: "electrical.circuit", allowance: 2, allowanceBasisKey: "scopeAllowance" }] },
  },

  /* -- plumbing and HVAC equipment -- */
  {
    test: /water heater|tankless|calentador de agua/i,
    plan: { family: "plumbing.water_heater", specific: true, parts: [{ itemKey: "plumbing.water_heater", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /laundry (box|hookup|connection)|washer and dryer|lavander[ií]a/i,
    plan: { family: "plumbing.laundry", specific: true, parts: [{ itemKey: "plumbing.laundry_box", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /hose bib|spigot|llave de manguera/i,
    plan: { family: "plumbing.hose_bib", specific: true, parts: [{ itemKey: "plumbing.hose_bib", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /mini[- ]?split|ductless/i,
    plan: { family: "hvac.mini_split", specific: true, parts: [{ itemKey: "hvac.mini_split", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /(bath|exhaust|ventilation) fan|extractor de ba[nñ]o/i,
    plan: { family: "hvac.vent", specific: true, parts: [{ itemKey: "hvac.bath_vent", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /registers?\b|grilles?\b|rejillas?/i,
    plan: { family: "hvac.registers", specific: true, parts: [{ itemKey: "hvac.register", allowance: 3, allowanceBasisKey: "scopeAllowance" }] },
  },

  /* -- bath fittings -- */
  {
    test: /shower (door|enclosure)|frameless|mampara/i,
    plan: { family: "bath.shower_door", specific: true, parts: [{ itemKey: "bath.shower_door", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /bath ?tub|\btub\b|tina de ba[nñ]o/i,
    plan: { family: "bath.tub", specific: true, parts: [{ itemKey: "bath.tub", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /(bath )?accessor(y|ies)|towel bar|toilet paper holder|accesorios de ba[nñ]o/i,
    plan: { family: "bath.accessories", specific: true, parts: [{ itemKey: "bath.accessories", allowance: 4, allowanceBasisKey: "scopeAllowance" }] },
  },

  /* -- accessibility -- */
  {
    test: /grab bar|barra de apoyo/i,
    plan: { family: "accessibility.grab_bar", specific: true, parts: [{ itemKey: "accessibility.grab_bar", allowance: 2, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /curbless|zero[- ]entry|roll[- ]in shower|ducha sin borde/i,
    plan: { family: "accessibility.shower", specific: true, parts: [{ itemKey: "accessibility.curbless_shower", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /\bramp\b|rampa/i,
    plan: { family: "accessibility.ramp", specific: true, parts: [{ itemKey: "accessibility.ramp", allowance: 20, allowanceBasisKey: "scopeAllowance" }] },
  },

  /* -- restoration -- */
  {
    test: /water damage|mitigation|remediation|\bmold\b|moho|humedad/i,
    plan: { family: "restoration", specific: true, parts: [{ itemKey: "restoration.mitigation", geometry: FLOOR_AREA, allowance: 200, allowanceBasisKey: "scopeAllowance" }] },
  },

  /* -- doors, windows, trim -- */
  {
    test: /exterior door|front door|patio door|sliding (glass )?door|french door|storm door|puerta exterior/i,
    plan: { family: "door.exterior", specific: true, parts: [{ itemKey: "door.exterior", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /garage door|puerta de garaje/i,
    plan: { family: "door.garage", specific: true, parts: [{ itemKey: "door.garage", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /(replace|new|reemplaz).*(window|ventana)|window replacement/i,
    plan: { family: "window.replacement", specific: true, parts: [{ itemKey: "window.replacement", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },
  {
    test: /crown mold|corona/i,
    plan: { family: "trim.crown", specific: true, parts: [{ itemKey: "trim.crown", geometry: TRIM_LF, allowance: 60, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /casing|door jamb|marco de puerta/i,
    plan: { family: "trim.casing", specific: true, parts: [{ itemKey: "trim.door_casing", allowance: 2, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /\bshelv(ing|es)\b|estante/i,
    plan: { family: "trim.shelving", specific: true, parts: [{ itemKey: "trim.shelving", allowance: 12, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /stairs?\b|staircase|escalera/i,
    plan: { family: "stairs", specific: true, parts: [{ itemKey: "stairs.build", allowance: 1, allowanceBasisKey: "countAllowance" }] },
  },

  /* -- exterior envelope and site -- */
  {
    test: /roof(ing)?\b|shingle|tejas|techado/i,
    plan: { family: "roofing", specific: true, parts: [{ itemKey: "roofing.shingle_replace", allowance: 1500, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /gutter|downspout|canal[oó]n/i,
    plan: { family: "gutters", specific: true, parts: [{ itemKey: "gutters.install", allowance: 120, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /siding|hardie|lap board|revestimiento/i,
    plan: { family: "siding", specific: true, parts: [{ itemKey: "siding.install", allowance: 800, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /soffit|fascia/i,
    plan: { family: "siding.soffit", specific: true, parts: [{ itemKey: "siding.soffit_fascia", allowance: 80, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /\bdeck\b|decking|terraza de madera/i,
    plan: {
      family: "deck",
      specific: true,
      parts: [
        { itemKey: "deck.framing", allowance: 200, allowanceBasisKey: "scopeAllowance" },
        { itemKey: "deck.decking", allowance: 200, allowanceBasisKey: "scopeAllowance" },
      ],
    },
  },
  {
    test: /railing|handrail|barandal/i,
    plan: { family: "deck.railing", specific: true, parts: [{ itemKey: "deck.railing", allowance: 24, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /concrete (slab|patio|walkway|driveway|pad)|flatwork|losa de concreto|acera/i,
    plan: { family: "concrete", specific: true, parts: [{ itemKey: "concrete.flatwork", allowance: 200, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /\bfenc(e|ing)\b|cerca perimetral/i,
    plan: { family: "fence", specific: true, parts: [{ itemKey: "fence.install", allowance: 100, allowanceBasisKey: "scopeAllowance" }] },
  },
  {
    test: /(paint|pintar).*(exterior|siding|fachada)|exterior paint/i,
    plan: { family: "paint.exterior", specific: true, parts: [{ itemKey: "paint.exterior", allowance: 800, allowanceBasisKey: "scopeAllowance" }] },
  },

  {
    /* Platform / raised floor framing is framing, not floor covering. */

    test: /(platform|raised|subfloor|sub-floor|joist)\s*(floor|framing|system)?|floor\s+(framing|joist)/i,
    plan: { family: "framing.floor", specific: true, parts: [{ itemKey: "framing.raised_floor", geometry: FLOOR_AREA }] },
  },
  {
    test: /\bhvac\b|ductwork|duct work|heating and cooling|mini[- ]split|air condition|climatizaci|calefacci/i,
    plan: {
      family: "hvac",
      specific: true,
      parts: [{ itemKey: "hvac.extension", allowance: 1, allowanceBasisKey: "hvacAllowance" }],
    },
  },
  {
    test: /shut ?-?offs?|supply lines?|angle stops?|llaves de paso|l[ií]neas de suministro/i,
    plan: {
      family: "plumbing.supply",
      specific: true,
      parts: [{ itemKey: "plumbing.supply_lines", allowance: 1, allowanceBasisKey: "supplyAllowance" }],
    },
  },
  {
    test: /(remove|demo|demolish|tear ?out|quitar|demoler).*(wall|partition|muro|pared)/i,
    plan: {
      family: "demolition.wall",
      specific: true,
      parts: [
        {
          itemKey: "demolition.wall",
          geometry: PARTITION_LF,
          allowance: BALLPARK_ALLOWANCES.wallDemoLf,
          allowanceBasisKey: "wallDemoAllowance",
        },
      ],
    },
  },
  {
    test: /(paint|prime|pintar).*(trim|baseboard|molding|moldura|zoclo)|(trim|baseboard).*(paint|prime)/i,
    plan: {
      family: "paint.trim",
      specific: true,
      parts: [
        {
          itemKey: "paint.trim",
          geometry: TRIM_LF,
          allowance: BALLPARK_ALLOWANCES.trimLf,
          allowanceBasisKey: "trimAllowance",
        },
      ],
    },
  },
  {
    /* Painting walls / ceilings prices off paintable surface, never wall LF. */
    test: /(paint|prime|pintar).*(wall|ceiling|pared|techo)|(wall|ceiling).*(paint|prime)/i,
    plan: {
      family: "paint.walls",
      specific: true,
      parts: [{ itemKey: "paint.walls_ceiling", geometry: DRYWALL_SURFACE }],
    },
  },
  {
    test: /drywall|sheetrock|tablarroca|tablaroca|hang, ?tape/i,
    plan: {
      family: "drywall",
      specific: true,
      parts: [{ itemKey: "drywall.hang_finish", geometry: DRYWALL_SURFACE }],
    },
  },
  {
    test: /baseboard|base trim|zoclo|moldura|molding/i,
    plan: { family: "trim.base", specific: true, parts: [{ itemKey: "trim.base", geometry: TRIM_LF }] },
  },

  {
    test: /vanity|vanities|tocador/i,
    plan: { family: "bath.vanity", specific: true, parts: [{ itemKey: "bath.vanity", allowance: 1, allowanceBasisKey: "fixtureAllowance" }] },
  },
  {
    test: /shower|surround|regadera|ducha/i,
    plan: {
      family: "bath.shower",
      specific: true,
      parts: [{ itemKey: "bath.shower_surround", allowance: 1, allowanceBasisKey: "fixtureAllowance" }],
    },
  },
  {
    test: /toilet|water closet|inodoro/i,
    plan: { family: "bath.toilet", specific: true, parts: [{ itemKey: "bath.toilet", allowance: 1, allowanceBasisKey: "fixtureAllowance" }] },
  },
  {
    test: /(rough|rough-in|rough in).*(plumb|bath)|plumb.*(rough|rough-in)/i,
    plan: { family: "bath.rough_in", specific: true, parts: [{ itemKey: "bath.rough_in", allowance: 1, allowanceBasisKey: "bathRoughAllowance" }] },
  },
  {
    /* Frame walls / build partitions. */
    test: /(frame|framing|build|construir|enmarcar).*(wall|partition|muro|pared)/i,
    plan: { family: "framing.walls", specific: true, parts: [{ itemKey: "framing.partition_wall", geometry: FRAMING_LF, allowance: BALLPARK_ALLOWANCES.framingLf, allowanceBasisKey: "framingAllowance" }] },
  },
];

const FLOORING_KEY = (title: string): string => {
  if (has(title, /hardwood|oak|maple|walnut|engineered wood|madera/i)) return "flooring.premium";
  if (has(title, /laminate|vinyl|lvp|lvt|carpet|alfombra|vin[ií]lico/i)) return "flooring.basic";
  return "flooring.mid";
};

/** Insulation may cover walls, ceiling and floor in one sentence. */
function insulationPlan(text: string): SubjectPlan {
  const wants = {
    wall: has(text, /wall|pared|muro/i),
    ceiling: has(text, /ceiling|techo/i),
    floor: has(text, /floor|piso|suelo/i),
  };
  const any = wants.wall || wants.ceiling || wants.floor;
  const parts: SubjectPlan["parts"] = [];
  if (wants.wall || !any) parts.push({ itemKey: "insulation.walls", geometry: WALL_AREA });
  if (wants.ceiling) parts.push({ itemKey: "insulation.ceiling", geometry: CEILING_AREA });
  if (wants.floor) parts.push({ itemKey: "insulation.floor", geometry: FLOOR_AREA });
  return { family: "insulation", specific: true, parts };
}

/** Build the price-subject plan for a scope title. Deterministic. */
export function planForTitle(title: string): SubjectPlan | null {
  const text = title ?? "";
  if (has(text, /insulat|aislamiento|aislar/i)) return insulationPlan(text);
  for (const { test, plan } of SUBJECT_PLANS) {
    if (test.test(text)) return plan;
  }

  const subject = subjectFor(text);
  if (!subject?.ballparkItemKey) return null;

  switch (subject.key) {
    case "insulation":
      return insulationPlan(text);
    case "drywall":
      return { family: "drywall", parts: [{ itemKey: "drywall.hang_finish", geometry: DRYWALL_SURFACE }] };
    case "paint":
      return { family: "paint.walls", parts: [{ itemKey: "paint.walls_ceiling", geometry: DRYWALL_SURFACE }] };
    case "flooring":
      return {
        family: "flooring",
        specific: FLOORING_KEY(text) !== "flooring.mid",
        parts: [{ itemKey: FLOORING_KEY(text), geometry: FLOORING_AREA }],
      };
    case "trim":
      return { family: "trim.base", parts: [{ itemKey: "trim.base", geometry: TRIM_LF }] };
    case "wall":
      return {
        family: "framing.walls",
        parts: [
          {
            itemKey: "framing.partition_wall",
            geometry: FRAMING_LF,
            allowance: BALLPARK_ALLOWANCES.framingLf,
            allowanceBasisKey: "framingAllowance",
          },
        ],
      };
    case "electrical":
      /* A ballpark never counts individual devices: one remodel allowance. */
      return {
        family: "electrical",
        parts: [{ itemKey: "electrical.moderate", allowance: 1, allowanceBasisKey: "electricalAllowance" }],
      };
    case "bath_fixtures":
      return {
        family: "bath.fixtures",
        parts: [{ itemKey: "bath.full_fixtures", allowance: 1, allowanceBasisKey: "bathAllowance" }],
      };
    case "plumbing":
      return {
        family: "plumbing.rough",
        parts: [{ itemKey: "plumbing.nearby", allowance: 1, allowanceBasisKey: "plumbingAllowance" }],
      };
    case "closet":
      return {
        family: "closet",
        parts: [
          {
            itemKey: "closet.shelving",
            allowance: BALLPARK_ALLOWANCES.closetLf,
            allowanceBasisKey: "closetAllowance",
          },
        ],
      };
    case "door":
      return { family: "door", parts: [{ itemKey: "door.interior", allowance: 1, allowanceBasisKey: "countAllowance" }] };
    case "window":
      return { family: "window", parts: [{ itemKey: "window.unit", allowance: 1, allowanceBasisKey: "countAllowance" }] };
    default:
      return {
        family: subject.key,
        parts: [{ itemKey: subject.ballparkItemKey, allowance: 1, allowanceBasisKey: "scopeAllowance" }],
      };
  }
}

/* ------------------------------------------------------------------ *
 * Resolution
 * ------------------------------------------------------------------ */

export interface ResolveOptions {
  geometry?: BallparkGeometryFacts;
  pricebook?: BallparkPricebook;
}

export interface ResolveScopeResult {
  resolved: ResolvedScopeSubject[];
  unresolved: UnresolvedScopeSubject[];
}

/** A count stated in the scope text, honouring the size-is-not-a-count rules. */
export function countFromText(title: string): number | null {
  const { quantity } = detectQuantity(title ?? "");
  if (quantity == null || !Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isInteger(quantity)) return null;
  return quantity > DEFAULT_MAX_EACH_COUNT ? null : quantity;
}

export function resolveBallparkScope(
  items: readonly ResolvableScopeItem[],
  options: ResolveOptions = {},
): ResolveScopeResult {
  const facts = options.geometry ?? EMPTY_GEOMETRY_FACTS;
  const pricebook = options.pricebook ?? SAMPLE_PRICEBOOK;

  const resolved: ResolvedScopeSubject[] = [];
  const unresolved: UnresolvedScopeSubject[] = [];

  for (const item of items) {
    const plan = planForTitle(item.title);
    if (!plan || plan.parts.length === 0) {
      unresolved.push({ itemId: item.id, title: item.title, reason: "noMapping" });
      continue;
    }

    const explicit = pos(item.quantity);
    const textCount = explicit == null ? countFromText(item.title) : null;

    const parts: ResolvedPricePart[] = [];
    let blocked: UnresolvedScopeSubject | null = null;

    for (const spec of plan.parts) {
      const price = pricebook.get(spec.itemKey);
      if (!price) {
        blocked = { itemId: item.id, title: item.title, reason: "noMapping" };
        break;
      }

      let quantity: number | null = null;
      let source: BallparkQuantitySource = "allowance";
      let basisKey = spec.allowanceBasisKey ?? "scopeAllowance";
      let basisValues: Record<string, string | number> | undefined;

      /* 1 + 2: contractor-entered or stated in the scope text. */
      const stated = explicit ?? textCount;
      /**
       * A stated total covers the whole subject. With one part it is that
       * part; with several parts sharing one measured unit it is split across
       * them in the same proportion as their allowances, so a 94" (7.83 ft)
       * cabinet wall no longer falls back to the 24 LF catalog allowance.
       */
      const sameUnitParts =
        price.unitKey !== "each"
          ? plan.parts.filter((p) => (pricebook.get(p.itemKey)?.unitKey ?? null) === price.unitKey)
          : [];
      const allowanceTotal = sameUnitParts.reduce((sum, p) => sum + (p.allowance ?? 0), 0);
      const shareable =
        sameUnitParts.length > 1 &&
        sameUnitParts.length === plan.parts.length &&
        allowanceTotal > 0 &&
        spec.allowance != null;
      /*
       * A measured total NEVER becomes a count. "14 LF of LVL beam and posts"
       * is fourteen feet of beam, not fourteen posts — a per-each part in a
       * multi-part plan falls through to its own allowance instead.
       */
      const itemUnitIsCount =
        !item.unitKey || /^(each|ea|count|unit|qty)$/i.test(String(item.unitKey).trim());
      const countUsable = price.unitKey !== "each" || itemUnitIsCount || explicit == null;
      const statedIsUsable =
        stated != null &&
        countUsable &&
        (plan.parts.length === 1 || price.unitKey === "each" || shareable);

      if (statedIsUsable && stated != null) {
        quantity = shareable ? (stated * spec.allowance!) / allowanceTotal : stated;
        source = explicit != null ? "explicit" : "text";
        basisKey = source === "explicit" ? "contractorEntered" : "statedInScope";
      }

      /* 3: derive from saved project geometry. */
      if (quantity == null && spec.geometry) {
        const derived = spec.geometry(facts);
        if (derived) {
          quantity = derived.value;
          source = "geometry";
          basisKey = derived.basisKey;
          basisValues = derived.basisValues;
        }
      }

      /* 4: conservative standard allowance. */
      if (quantity == null && spec.allowance != null) {
        quantity = spec.allowance;
        source = "allowance";
        basisKey = spec.allowanceBasisKey ?? "scopeAllowance";
      }

      /* 4b: a count-based line always defaults to one. */
      if (quantity == null && price.unitKey === "each") {
        quantity = 1;
        source = "allowance";
        basisKey = "countAllowance";
      }

      /* 5: genuinely unresolved — the contractor has to supply the fact. */
      if (quantity == null || quantity <= 0) {
        blocked = { itemId: item.id, title: item.title, reason: "noQuantity" };
        break;
      }

      const measuredCap =
        price.unitKey === "each" ? null : (DEFAULT_MAX_QUANTITY[price.unitKey] ?? null);
      if (measuredCap != null && quantity > measuredCap) {
        blocked = {
          itemId: item.id,
          title: item.title,
          reason: "implausibleQuantity",
          quantity,
          maxPlausible: measuredCap,
        };
        break;
      }

      if (price.unitKey === "each") {
        const cap = price.maxPlausibleCount ?? DEFAULT_MAX_EACH_COUNT;
        if (quantity > cap) {
          blocked = {
            itemId: item.id,
            title: item.title,
            reason: "implausibleQuantity",
            quantity,
            maxPlausible: cap,
          };
          break;
        }
      }

      parts.push({
        itemKey: spec.itemKey,
        quantity: round2(quantity),
        unitKey: price.unitKey,
        source,
        basisKey,
        ...(basisValues ? { basisValues } : {}),
        ...(spec.provisional && source !== "explicit" ? { provisional: true } : {}),
      });

    }

    if (blocked) {
      unresolved.push(blocked);
      continue;
    }

    resolved.push({
      itemId: item.id,
      title: item.title,
      family: plan.family,
      rolledUp: [],
      parts,
    });
  }

  return { resolved: consolidate(resolved), unresolved };
}

/**
 * Fold synonymous scope into one price subject.
 *
 * Only subjects whose quantity came from geometry or an allowance are folded:
 * a contractor-entered or scope-stated count is additive work ("move 1 window"
 * plus "reframe 1 egress window" is two windows) and is never merged.
 */
/**
 * Families that describe one continuous surface or one whole-scope allowance,
 * so overlapping wording must roll up instead of being priced twice. Discrete
 * count families (doors, windows) stay additive: two door lines are two doors.
 */
const CONSOLIDATABLE_FAMILIES = new Set([
  "flooring",
  "framing.floor",
  "framing.walls",
  "drywall",
  "insulation",
  "paint.walls",
  "paint.trim",
  "trim.base",
  "electrical",
  "hvac",
  "plumbing.supply",
  "plumbing.rough",
  "bath.rough_in",
  "bath.vanity",
  "bath.shower",
  "bath.toilet",
  "demolition.wall",
  "permits",
  "electrical.protection",
  "trim.transitions",
  /* Residential Catalog V2 whole-scope families. */
  "general.dumpster",
  "general.cleanup",
  "general.protection",
  "demolition.interior",
  "demolition.flooring",
  "demolition.cabinets",
  "drywall.patch",
  "drywall.texture",
  "tile.shower",
  "tile.backsplash",
  "tile.wall",
  "kitchen.countertop",
  "kitchen.cabinets",
  "kitchen.appliances",
  "kitchen.island",
  "kitchen.hood",
  "kitchen.sink",
  "electrical.recessed",
  "electrical.fixtures",
  "electrical.devices",
  "electrical.circuits",
  "electrical.detectors",
  "electrical.panel",
  "electrical.fan",
  "plumbing.water_heater",
  "plumbing.laundry",
  "plumbing.hose_bib",
  "hvac.mini_split",
  "hvac.vent",
  "hvac.registers",
  "bath.shower_door",
  "bath.tub",
  "bath.accessories",
  "accessibility.grab_bar",
  "accessibility.shower",
  "accessibility.ramp",
  "restoration",
  "trim.crown",
  "trim.casing",
  "trim.shelving",
  "stairs",
  "roofing",
  "gutters",
  "siding",
  "siding.soffit",
  "deck",
  "deck.railing",
  "concrete",
  "fence",
  "paint.exterior",
  /* Structural / finish-carpentry primitives. */
  "structural.beam",
  "structural.shoring",
  "structural.engineering",
  "demolition.wall_bearing",
  "beam.wrap",
  "column.wrap",
  "trim.bookcase",
  "trim.decorative",

]);


export function consolidate(subjects: readonly ResolvedScopeSubject[]): ResolvedScopeSubject[] {

  const isInferred = (s: ResolvedScopeSubject) =>
    s.parts.every((p) => p.source === "geometry" || p.source === "allowance");

  const out: ResolvedScopeSubject[] = [];
  const winners = new Map<string, ResolvedScopeSubject>();

  for (const subject of subjects) {
    if (!isInferred(subject) || !CONSOLIDATABLE_FAMILIES.has(subject.family)) {
      out.push(subject);
      continue;
    }

    const current = winners.get(subject.family);
    if (!current) {
      const copy = { ...subject, rolledUp: [...subject.rolledUp] };
      winners.set(subject.family, copy);
      out.push(copy);
      continue;
    }
    /* Most specific reading wins; ties go to the longer (more descriptive) title. */
    const challengerWins =
      specificity(subject) > specificity(current) ||
      (specificity(subject) === specificity(current) &&
        subject.title.length > current.title.length);

    if (challengerWins) {
      const rolled = [
        ...current.rolledUp,
        { itemId: current.itemId, title: current.title },
      ];
      current.itemId = subject.itemId;
      current.title = subject.title;
      current.parts = subject.parts;
      current.rolledUp = [...rolled, ...subject.rolledUp];
    } else {
      current.rolledUp = [
        ...current.rolledUp,
        { itemId: subject.itemId, title: subject.title },
        ...subject.rolledUp,
      ];
    }
  }

  return out;
}

const SPECIFIC_KEYS = new Set(["flooring.premium", "flooring.basic"]);
const specificity = (s: ResolvedScopeSubject): number =>
  (s.parts.some((p) => SPECIFIC_KEYS.has(p.itemKey)) ? 2 : 0) + s.parts.length;
