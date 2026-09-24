/**
 * Standard-object scale references.
 *
 * A photo has no scale of its own, but rooms are full of objects whose size is
 * effectively standardized: a dishwasher bay is 24", a range is 30", a base
 * cabinet is 24" deep, a switch sits about 48" off the floor. Counting how many
 * of those fit across a run turns a photo into an *approximate* dimension.
 *
 * Every entry carries a min/max, because "standard" still varies by
 * manufacturer, era and installer. Nothing here is a measurement — it is a
 * documented reference band that always travels with its uncertainty.
 *
 * Pure data. No React, no IO, no i18n lookups.
 */

export type ScaleReferenceCategory =
  | "appliance"
  | "cabinetry"
  | "fixture"
  | "opening"
  | "electrical"
  | "finish";

/** Which run of the room a reference can help size. */
export type ScaleAxis = "horizontal" | "vertical";

export interface ScaleReference {
  key: string;
  /** i18n key under the `ballpark` namespace. */
  labelKey: string;
  category: ScaleReferenceCategory;
  axis: ScaleAxis;
  /** Nominal size in inches, with the honest spread around it. */
  nominalIn: number;
  minIn: number;
  maxIn: number;
  /**
   * How dependable the object is as a ruler. Code-driven or appliance-bay
   * dimensions are tight; a vanity or a window is not.
   */
  reliability: "high" | "medium" | "low";
  /** True when the reference reads a height off the floor rather than a run. */
  isElevation?: boolean;
}

export const SCALE_REFERENCES: ScaleReference[] = [
  /* --- Appliances: bay openings are the most dependable rulers -------- */
  {
    key: "dishwasher",
    labelKey: "scaleRef.dishwasher",
    category: "appliance",
    axis: "horizontal",
    nominalIn: 24,
    minIn: 23.5,
    maxIn: 24.5,
    reliability: "high",
  },
  {
    key: "range",
    labelKey: "scaleRef.range",
    category: "appliance",
    axis: "horizontal",
    nominalIn: 30,
    minIn: 29.5,
    maxIn: 36,
    reliability: "high",
  },
  {
    key: "refrigerator",
    labelKey: "scaleRef.refrigerator",
    category: "appliance",
    axis: "horizontal",
    nominalIn: 33,
    minIn: 30,
    maxIn: 36,
    reliability: "medium",
  },
  {
    key: "overRangeMicrowave",
    labelKey: "scaleRef.overRangeMicrowave",
    category: "appliance",
    axis: "horizontal",
    nominalIn: 30,
    minIn: 29.5,
    maxIn: 30.5,
    reliability: "high",
  },

  /* --- Cabinetry ------------------------------------------------------ */
  {
    key: "baseCabinetDepth",
    labelKey: "scaleRef.baseCabinetDepth",
    category: "cabinetry",
    axis: "horizontal",
    nominalIn: 24,
    minIn: 24,
    maxIn: 25.5,
    reliability: "high",
  },
  {
    key: "baseCabinetWidth",
    labelKey: "scaleRef.baseCabinetWidth",
    category: "cabinetry",
    axis: "horizontal",
    nominalIn: 24,
    minIn: 12,
    maxIn: 36,
    reliability: "low",
  },
  {
    key: "counterHeight",
    labelKey: "scaleRef.counterHeight",
    category: "cabinetry",
    axis: "vertical",
    nominalIn: 36,
    minIn: 35,
    maxIn: 36.5,
    reliability: "high",
    isElevation: true,
  },
  {
    key: "wallCabinetHeight",
    labelKey: "scaleRef.wallCabinetHeight",
    category: "cabinetry",
    axis: "vertical",
    nominalIn: 36,
    minIn: 30,
    maxIn: 42,
    reliability: "low",
  },
  {
    key: "backsplashGap",
    labelKey: "scaleRef.backsplashGap",
    category: "cabinetry",
    axis: "vertical",
    nominalIn: 18,
    minIn: 15,
    maxIn: 20,
    reliability: "medium",
  },

  /* --- Plumbing fixtures ---------------------------------------------- */
  {
    key: "bathtub",
    labelKey: "scaleRef.bathtub",
    category: "fixture",
    axis: "horizontal",
    nominalIn: 60,
    minIn: 59,
    maxIn: 72,
    reliability: "high",
  },
  {
    key: "toilet",
    labelKey: "scaleRef.toilet",
    category: "fixture",
    axis: "horizontal",
    nominalIn: 28,
    minIn: 26,
    maxIn: 31,
    reliability: "medium",
  },
  {
    key: "vanity",
    labelKey: "scaleRef.vanity",
    category: "fixture",
    axis: "horizontal",
    nominalIn: 36,
    minIn: 24,
    maxIn: 60,
    reliability: "low",
  },
  {
    key: "showerBase",
    labelKey: "scaleRef.showerBase",
    category: "fixture",
    axis: "horizontal",
    nominalIn: 36,
    minIn: 32,
    maxIn: 60,
    reliability: "low",
  },

  /* --- Openings -------------------------------------------------------- */
  {
    key: "interiorDoorWidth",
    labelKey: "scaleRef.interiorDoorWidth",
    category: "opening",
    axis: "horizontal",
    nominalIn: 32,
    minIn: 28,
    maxIn: 36,
    reliability: "medium",
  },
  {
    key: "doorHeight",
    labelKey: "scaleRef.doorHeight",
    category: "opening",
    axis: "vertical",
    nominalIn: 80,
    minIn: 79,
    maxIn: 84,
    reliability: "high",
    isElevation: true,
  },
  {
    key: "windowWidth",
    labelKey: "scaleRef.windowWidth",
    category: "opening",
    axis: "horizontal",
    nominalIn: 36,
    minIn: 24,
    maxIn: 72,
    reliability: "low",
  },

  /* --- Electrical: rough-in heights are code-driven and very stable ---- */
  {
    key: "outletHeight",
    labelKey: "scaleRef.outletHeight",
    category: "electrical",
    axis: "vertical",
    nominalIn: 15,
    minIn: 12,
    maxIn: 18,
    reliability: "medium",
    isElevation: true,
  },
  {
    key: "switchHeight",
    labelKey: "scaleRef.switchHeight",
    category: "electrical",
    axis: "vertical",
    nominalIn: 48,
    minIn: 44,
    maxIn: 52,
    reliability: "high",
    isElevation: true,
  },

  /* --- Finishes: repeating units are excellent counters ---------------- */
  {
    key: "floorPlank",
    labelKey: "scaleRef.floorPlank",
    category: "finish",
    axis: "horizontal",
    nominalIn: 48,
    minIn: 36,
    maxIn: 60,
    reliability: "low",
  },
  {
    key: "tile12",
    labelKey: "scaleRef.tile12",
    category: "finish",
    axis: "horizontal",
    nominalIn: 12,
    minIn: 12,
    maxIn: 12.5,
    reliability: "high",
  },
  {
    key: "tile24",
    labelKey: "scaleRef.tile24",
    category: "finish",
    axis: "horizontal",
    nominalIn: 24,
    minIn: 24,
    maxIn: 24.5,
    reliability: "high",
  },
  {
    key: "ceilingTile",
    labelKey: "scaleRef.ceilingTile",
    category: "finish",
    axis: "horizontal",
    nominalIn: 24,
    minIn: 24,
    maxIn: 48,
    reliability: "medium",
  },
];

const BY_KEY = new Map(SCALE_REFERENCES.map((ref) => [ref.key, ref]));

export function scaleReferenceFor(key: string): ScaleReference | null {
  return BY_KEY.get(key) ?? null;
}

export function scaleReferencesForAxis(axis: ScaleAxis): ScaleReference[] {
  return SCALE_REFERENCES.filter((ref) => ref.axis === axis);
}

/** References worth offering first for a given room type. */
export const ROOM_TYPE_REFERENCE_HINTS: Record<string, string[]> = {
  kitchen: ["dishwasher", "range", "refrigerator", "baseCabinetDepth", "counterHeight", "tile12"],
  bathroom: ["bathtub", "toilet", "vanity", "showerBase", "tile12", "switchHeight"],
  bedroom: ["interiorDoorWidth", "doorHeight", "outletHeight", "switchHeight", "floorPlank"],
  living: ["interiorDoorWidth", "doorHeight", "windowWidth", "floorPlank", "switchHeight"],
  garage: ["doorHeight", "switchHeight", "outletHeight", "tile24"],
  basement: ["doorHeight", "switchHeight", "ceilingTile", "outletHeight"],
  other: ["interiorDoorWidth", "doorHeight", "switchHeight", "outletHeight"],
};

export function suggestedReferences(roomType: string | null): ScaleReference[] {
  const keys = ROOM_TYPE_REFERENCE_HINTS[roomType ?? "other"] ?? ROOM_TYPE_REFERENCE_HINTS["other"]!;
  return keys.flatMap((key) => {
    const ref = scaleReferenceFor(key);
    return ref ? [ref] : [];
  });
}

/**
 * References that may legitimately size a run on the given axis.
 *
 * A door height is a superb ruler *up a wall* and a meaningless one across a
 * floor, so the picker never offers it for a horizontal run. Filtering here
 * rather than in the UI keeps the rule in one place with the math that enforces
 * it.
 */
export function suggestedReferencesForAxis(
  roomType: string | null,
  axis: ScaleAxis,
): ScaleReference[] {
  const hinted = suggestedReferences(roomType).filter((ref) => ref.axis === axis);
  const rest = scaleReferencesForAxis(axis).filter(
    (ref) => !hinted.some((hint) => hint.key === ref.key),
  );
  return [...hinted, ...rest];
}

