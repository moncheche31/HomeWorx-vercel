/**
 * ASSEMBLY COMPONENT QUANTITIES — derivation (client-safe, pure).
 *
 * The review panel must not be a second takeoff. Wherever the quantity can be
 * derived from data the contractor already gave THIS job, it is pre-filled and
 * labelled "calculated". Where the app genuinely does not hold the measurement
 * (ridge length, eave length, penetration count), it says so and asks for that
 * one number once per line — it never guesses one from area.
 *
 * Project isolation: derived and entered quantities live on the ESTIMATE LINE,
 * never on the shared cached expansion, so one job's ridge length can never
 * leak into another job.
 */

/** Takeoff numbers the contractor enters once per expanded line. */
export interface AssemblyGeometry {
  /** Eave (gutter-line) length, LF. */
  eaveLf?: number | null;
  /** Rake (gable-edge) length, LF. */
  rakeLf?: number | null;
  /** Ridge length, LF. */
  ridgeLf?: number | null;
  /** Hip + valley length, LF. */
  hipValleyLf?: number | null;
  /** Roof/wall penetrations (vents, stacks, skylights), count. */
  penetrations?: number | null;
  /** Outside + inside corner length, LF. */
  cornerLf?: number | null;
  /** Openings (windows/doors) in the surface, count. */
  openingCount?: number | null;
  /** Explicit perimeter, LF, when the contractor prefers one number. */
  perimeterLf?: number | null;
}

export const GEOMETRY_FIELDS: {
  key: keyof AssemblyGeometry;
  label: string;
  unit: "LF" | "count";
  trades: string[];
}[] = [
  { key: "eaveLf", label: "Eave length", unit: "LF", trades: ["roofing"] },
  { key: "rakeLf", label: "Rake length", unit: "LF", trades: ["roofing"] },
  { key: "ridgeLf", label: "Ridge length", unit: "LF", trades: ["roofing"] },
  { key: "hipValleyLf", label: "Hip + valley", unit: "LF", trades: ["roofing"] },
  {
    key: "penetrations",
    label: "Penetrations",
    unit: "count",
    trades: ["roofing", "siding", "electrical", "plumbing", "hvac"],
  },
  {
    key: "perimeterLf",
    label: "Perimeter",
    unit: "LF",
    trades: [
      "roofing",
      "siding",
      "drywall",
      "painting",
      "insulation",
      "framing",
      "finish_carpentry",
      "flooring",
    ],
  },
  { key: "cornerLf", label: "Corner length", unit: "LF", trades: ["siding", "drywall"] },
  {
    key: "openingCount",
    label: "Openings",
    unit: "count",
    trades: ["siding", "drywall", "painting", "framing", "doors", "finish_carpentry"],
  },

];

export const geometryFieldsForTrade = (tradeKey: string) =>
  GEOMETRY_FIELDS.filter((f) => f.trades.includes(tradeKey.toLowerCase()));

export type QuantitySource = "contractor" | "derived" | "ballpark_default" | "needs_input";

export interface ResolvedQuantity {
  quantity: number | null;
  source: QuantitySource;
  /** Plain-language derivation, e.g. "eave 120 LF + rake 84 LF". */
  derivation: string;
  /** Which geometry input would unlock it, when it needs one. */
  needs: (keyof AssemblyGeometry)[];
}


const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
};

const round2 = (v: number) => Math.round(v * 100) / 100;

const NEEDS: Record<string, (keyof AssemblyGeometry)[]> = {
  eave_lf: ["eaveLf"],
  ridge_lf: ["ridgeLf"],
  perimeter_lf: ["perimeterLf", "eaveLf", "rakeLf"],
  per_penetration: ["penetrations"],
  corner_lf: ["cornerLf"],
  opening_count: ["openingCount"],
};

/**
 * BALLPARK STANDARD RATIOS.
 *
 * A ballpark must never stop for a takeoff. Where the app holds only an area,
 * the missing lengths and counts come from the standard shape the trade
 * assumes: a simple rectangular building. Every number produced this way is an
 * ASSUMPTION and is labelled as one — it is never presented as a measurement.
 */
export const BALLPARK_ROOF = {
  /** 6/12 pitch slope factor (sloped area ÷ footprint). */
  slopeFactor: 1.118,
  /** Typical length:width ratio of a residential footprint. */
  aspectRatio: 1.5,
  /** One vent/stack/penetration per this many SF of roof. */
  sfPerPenetration: 700,
  minPenetrations: 3,
};

export const BALLPARK_WALL = {
  /** Typical exterior wall height, ft. */
  wallHeightFt: 9,
  /** Outside + inside corners on a simple rectangular house. */
  corners: 6,
  /** One window/door opening per this many SF of wall. */
  sfPerOpening: 140,
  minOpenings: 4,
};

const BALLPARK_NOTE = {
  roof: "ballpark assumption: typical rectangular roof, 6/12 pitch",
  wall: `ballpark assumption: typical rectangular house, ${BALLPARK_WALL.wallHeightFt} ft walls`,
};

interface RoofShape {
  eaveLf: number;
  rakeLf: number;
  ridgeLf: number;
  perimeterLf: number;
  penetrations: number;
}

/** Derive the standard rectangular roof implied by a sloped roof area. */
export function ballparkRoofShape(roofAreaSf: number): RoofShape {
  const footprint = roofAreaSf / BALLPARK_ROOF.slopeFactor;
  const width = Math.sqrt(footprint / BALLPARK_ROOF.aspectRatio);
  const length = width * BALLPARK_ROOF.aspectRatio;
  const eaveLf = round2(2 * length);
  const rakeLf = round2(2 * width * BALLPARK_ROOF.slopeFactor);
  return {
    eaveLf,
    rakeLf,
    ridgeLf: round2(length),
    perimeterLf: round2(eaveLf + rakeLf),
    penetrations: Math.max(
      BALLPARK_ROOF.minPenetrations,
      Math.round(roofAreaSf / BALLPARK_ROOF.sfPerPenetration),
    ),
  };
}

/** Derive the standard wall run implied by a wall area. */
export function ballparkWallShape(wallAreaSf: number) {
  return {
    perimeterLf: round2(wallAreaSf / BALLPARK_WALL.wallHeightFt),
    cornerLf: round2(BALLPARK_WALL.corners * BALLPARK_WALL.wallHeightFt),
    openingCount: Math.max(
      BALLPARK_WALL.minOpenings,
      Math.round(wallAreaSf / BALLPARK_WALL.sfPerOpening),
    ),
  };
}

const isAreaUnit = (unit: string) => unit === "square_foot" || unit === "";

/**
 * Standard-ratio quantity for one basis.
 *
 * Area parents (roofs, walls, floors, ceilings) get the rectangular-shape
 * ratios above. Length and count parents — a run of wall framing, a fixture
 * count, a device count — are just as common on interior trades, so they get
 * their own defensible defaults instead of stalling a ballpark on a takeoff.
 * Returns null only where no defensible industry default exists.
 */
export function ballparkQuantityForBasis(args: {
  quantityBasis: string;
  parentQuantity: number | null;
  parentUnitKey?: string | null;
  tradeKey?: string | null;
}): { quantity: number; derivation: string } | null {
  const qty = num(args.parentQuantity);
  if (qty == null) return null;
  const unit = (args.parentUnitKey ?? "").trim();
  const trade = (args.tradeKey ?? "").toLowerCase();

  /* Anything that simply follows the parent task works in every unit. A
     'manual' basis is the model saying "job-specific" — there is no defensible
     ratio for a valley length or a steep-pitch adder, so it gets no default and
     the component starts switched off rather than blocking approval. */
  const sameAsParent = {
    quantity: qty,
    derivation: `parent measured quantity (${qty})`,
  };
  if (args.quantityBasis === "same_as_parent" || args.quantityBasis === "factor") {
    return sameAsParent;
  }
  if (args.quantityBasis === "manual") return null;


  if (!isAreaUnit(unit)) {
    /* Length parents: a run of wall at standard height, and one opening or
       penetration per typical bay of that run. */
    if (unit === "linear_foot") {
      const h = BALLPARK_WALL.wallHeightFt;
      switch (args.quantityBasis) {
        case "wall_sf":
          return {
            quantity: round2(qty * h),
            derivation: `${qty} LF × ${h} ft height — ${BALLPARK_NOTE.wall}`,
          };
        case "perimeter_lf":
        case "eave_lf":
        case "corner_lf":
          return { quantity: qty, derivation: `parent run length (${qty} LF)` };
        case "per_penetration":
        case "opening_count":
          return {
            quantity: Math.max(1, Math.round(qty / 25)),
            derivation: `one per 25 LF of ${qty} LF — ${BALLPARK_NOTE.wall}`,
          };
        default:
          return null;
      }
    }
    /* Count parents (fixtures, devices, doors): counted work follows the count. */
    if (unit === "each") {
      if (args.quantityBasis === "per_penetration" || args.quantityBasis === "opening_count") {
        return { quantity: qty, derivation: `one per counted item (${qty})` };
      }
      return null;
    }
    return null;
  }

  const area = qty;
  const wallTrade = trade !== "roofing";
  const roof = ballparkRoofShape(area);
  const wall = ballparkWallShape(area);

  const roofNote = (label: string, v: number) =>
    ({ quantity: v, derivation: `${label} ${v} from ${area} SF roof — ${BALLPARK_NOTE.roof}` });
  const wallNote = (label: string, v: number) =>
    ({ quantity: v, derivation: `${label} ${v} from ${area} SF wall — ${BALLPARK_NOTE.wall}` });

  switch (args.quantityBasis) {
    case "eave_lf":
      return wallTrade ? null : roofNote("eave", roof.eaveLf);
    case "ridge_lf":
      return wallTrade ? null : roofNote("ridge", roof.ridgeLf);
    case "perimeter_lf":
      return wallTrade
        ? wallNote("perimeter", wall.perimeterLf)
        : roofNote("perimeter", roof.perimeterLf);
    case "per_penetration":
      return wallTrade
        ? wallNote("penetrations", Math.max(2, Math.round(area / 900)))
        : roofNote("penetrations", roof.penetrations);
    case "corner_lf":
      return wallNote("corner length", wall.cornerLf);
    case "opening_count":
      return wallNote("openings", wall.openingCount);
    case "wall_sf":
      return sameAsParent;
    default:
      return null;
  }
}


/**
 * Resolve one component's quantity.
 *
 * Order of authority: contractor entry for this line > geometry derivation
 * (only if he chose to refine) > standard ballpark ratio > needs input (rare).
 */
export function resolveComponentQuantity(args: {
  quantityBasis: string;
  /** Contractor value entered for this component on THIS line. */
  entered?: number | null;
  parentQuantity?: number | null;
  parentUnitKey?: string | null;
  geometry?: AssemblyGeometry | null;
  /** Ballpark fills every gap with a standard ratio; detailed does not. */
  mode?: "ballpark" | "detailed";
  tradeKey?: string | null;
}): ResolvedQuantity {
  const entered = num(args.entered);
  if (entered != null) {
    return { quantity: entered, source: "contractor", derivation: "you entered this", needs: [] };
  }

  const g = args.geometry ?? {};
  const eave = num(g.eaveLf);
  const rake = num(g.rakeLf);
  const ridge = num(g.ridgeLf);
  const perim = num(g.perimeterLf);
  const pen = num(g.penetrations);
  const corner = num(g.cornerLf);
  const openings = num(g.openingCount);
  const parentQty = num(args.parentQuantity);
  const parentUnit = (args.parentUnitKey ?? "").trim();

  const derived = (quantity: number, derivation: string): ResolvedQuantity => ({
    quantity: round2(quantity),
    source: "derived",
    derivation,
    needs: [],
  });

  const needsInput = (basis: string): ResolvedQuantity => {
    if ((args.mode ?? "ballpark") === "ballpark") {
      const fallback = ballparkQuantityForBasis({
        quantityBasis: basis,
        parentQuantity: parentQty,
        parentUnitKey: parentUnit,
        tradeKey: args.tradeKey ?? null,
      });
      if (fallback) {
        return {
          quantity: round2(fallback.quantity),
          source: "ballpark_default",
          derivation: fallback.derivation,
          needs: [],
        };
      }
    }
    return {
      quantity: null,
      source: "needs_input",
      derivation: "",
      needs: NEEDS[basis] ?? [],
    };
  };


  switch (args.quantityBasis) {
    case "same_as_parent":
    case "factor":
      return parentQty != null
        ? derived(parentQty, `same measured quantity as the parent task (${parentQty})`)
        : needsInput(args.quantityBasis);

    case "wall_sf":
      return parentQty != null && parentUnit === "square_foot"
        ? derived(parentQty, `parent measured area (${parentQty} SF)`)
        : needsInput(args.quantityBasis);

    case "eave_lf":
      if (eave != null) return derived(eave, `eave length ${eave} LF`);
      if (perim != null && rake != null && perim > rake)
        return derived(perim - rake, `perimeter ${perim} LF − rake ${rake} LF`);
      return needsInput("eave_lf");

    case "ridge_lf":
      return ridge != null ? derived(ridge, `ridge length ${ridge} LF`) : needsInput("ridge_lf");

    case "perimeter_lf":
      if (perim != null) return derived(perim, `perimeter ${perim} LF`);
      if (eave != null && rake != null)
        return derived(eave + rake, `eave ${eave} LF + rake ${rake} LF`);
      return needsInput("perimeter_lf");

    case "per_penetration":
      return pen != null ? derived(pen, `${pen} penetrations`) : needsInput("per_penetration");

    case "corner_lf":
      return corner != null ? derived(corner, `corner length ${corner} LF`) : needsInput("corner_lf");

    case "opening_count":
      return openings != null ? derived(openings, `${openings} openings`) : needsInput("opening_count");

    default:
      /* 'manual' and anything unknown: a ballpark still gets the parent's own
         quantity as a labelled assumption; a detailed estimate asks. */
      return needsInput(args.quantityBasis);
  }

}

/** Parse the jsonb column into a typed geometry record. */
export const parseAssemblyGeometry = (raw: unknown): AssemblyGeometry => {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: AssemblyGeometry = {};
  for (const f of GEOMETRY_FIELDS) out[f.key] = num(o[f.key]);
  return out;
};

/** Parse the per-line component quantity overrides. */
export const parseComponentQuantities = (raw: unknown): Record<string, number> => {
  const o = (raw ?? {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(o)) {
    const n = num(v);
    if (n != null) out[k] = n;
  }
  return out;
};
