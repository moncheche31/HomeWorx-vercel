/**
 * Project category & type catalog.
 * Keys are stable, language-neutral, and stored in the database.
 * Labels are resolved via i18n (namespace "crm", key "projectCategories" / "projectTypes").
 */

/**
 * Default category order for the project-type picker.
 * Categories are ordered by expected frequency of use for a general contractor
 * (interior work and painting first, then exterior + outdoor living, roofing,
 * additions, specialty trades, and finally general).
 */
export const PROJECT_CATEGORY_KEYS = [
  "INTERIOR_REMODELING",
  "PAINTING",
  "EXTERIOR",
  "OUTDOOR_LIVING",
  "ROOFING",
  "ADDITIONS_CONSTRUCTION",
  "RESTORATION",
  "ACCESSIBILITY",
  "PLUMBING",
  "ELECTRICAL",
  "HVAC",
  "GENERAL",
] as const;
export type ProjectCategoryKey = (typeof PROJECT_CATEGORY_KEYS)[number];

/**
 * Project types within each category, ordered by expected frequency of use
 * for that trade. Stable keys are stored in the database; labels are localized.
 */
export const PROJECT_TYPES_BY_CATEGORY: Record<ProjectCategoryKey, readonly string[]> = {
  INTERIOR_REMODELING: [
    "KITCHEN_REMODEL",
    "BATHROOM_REMODEL",
    "WHOLE_HOUSE_REMODEL",
    "INTERIOR_RENOVATION",
    "GARAGE_CONVERSION",
    "BASEMENT_FINISH",
    "FLOORING",
    "CABINETS_MILLWORK",
    "TRIM_FINISH_CARPENTRY",
    "MINOR_CARPENTRY",
    "DRYWALL_PLASTER",
    "INSULATION",
    "CEILING",
    "STAIRS",
    "CLOSET_SYSTEMS",
    "SHELVING_INSTALLATION",
    "TV_MOUNTING",
    "FURNITURE_ASSEMBLY",
    "APPLIANCE_INSTALLATION",
    "HOME_BAR",
    "WET_BAR",
    "WINE_ROOM",
  ],
  PAINTING: ["INTERIOR_PAINTING", "EXTERIOR_PAINTING", "CABINET_PAINTING", "STAINING_FINISHING"],
  EXTERIOR: [
    "WINDOWS_DOORS",
    "DOOR_INSTALLATION_REPAIR",
    "WINDOW_REPAIR",
    "SIDING",
    "DECK_PORCH",
    "MASONRY",
    "GUTTERS",
    "FENCING",
    "CAULKING_WEATHERPROOFING",
    "PRESSURE_WASHING",
    "EXTERIOR_RENOVATION",
  ],
  OUTDOOR_LIVING: [
    "OUTDOOR_KITCHEN",
    "COVERED_PATIO",
    "PERGOLA",
    "GAZEBO",
    "PAVILION",
    "DECK",
    "PATIO",
    "SCREENED_PORCH",
    "THREE_SEASON_ROOM",
    "POOL_HOUSE",
    "OUTDOOR_BAR",
    "FIRE_PIT_FIREPLACE",
    "RETAINING_WALL",
    "LANDSCAPE_STRUCTURE",
    "OTHER_OUTDOOR_LIVING",
  ],
  ROOFING: ["ROOF_REPLACEMENT", "ROOF_REPAIR", "METAL_ROOFING", "FLAT_LOW_SLOPE_ROOFING"],
  ADDITIONS_CONSTRUCTION: [
    "HOME_ADDITION",
    "ADU",
    "NEW_CONSTRUCTION",
    "SUNROOM",
    "STRUCTURAL_REPAIR",
  ],
  RESTORATION: ["WATER_DAMAGE", "MOLD_REMEDIATION", "FIRE_SMOKE_DAMAGE", "INSURANCE_REPAIR"],
  ACCESSIBILITY: [
    "ACCESSIBILITY_MODIFICATION",
    "AGING_IN_PLACE",
    "ACCESSIBLE_BATHROOM",
    "RAMP_LIFT",
    "GRAB_BAR_INSTALLATION",
  ],
  PLUMBING: [
    "PLUMBING_REPAIR",
    "FIXTURE_REPLACEMENT",
    "WATER_HEATER",
    "DRAIN_SEWER",
    "REPIPING",
  ],
  ELECTRICAL: [
    "ELECTRICAL_REPAIR",
    "LIGHTING",
    "OUTLET_SWITCH_INSTALLATION",
    "CEILING_FAN_INSTALLATION",
    "SERVICE_PANEL_UPGRADE",
    "REWIRING",
    "GENERATOR_BACKUP_POWER",
  ],
  HVAC: ["HEATING", "COOLING", "HEAT_PUMP", "DUCTWORK", "VENTILATION"],
  GENERAL: [
    "GENERAL_REPAIR",
    "SMALL_HOME_REPAIR",
    "MAINTENANCE",
    "PUNCH_LIST",
    "RENTAL_TURNOVER",
    "INSPECTION_CONSULTATION",
    "OTHER",
  ],
};

export type ProjectTypeKey =
  (typeof PROJECT_TYPES_BY_CATEGORY)[ProjectCategoryKey][number] extends infer T
    ? T extends string
      ? T
      : never
    : never;

export const ALL_PROJECT_TYPE_KEYS: readonly string[] = PROJECT_CATEGORY_KEYS.flatMap(
  (c) => PROJECT_TYPES_BY_CATEGORY[c],
);

export const CATEGORY_OF_TYPE: Record<string, ProjectCategoryKey> = (() => {
  const out: Record<string, ProjectCategoryKey> = {};
  for (const cat of PROJECT_CATEGORY_KEYS) {
    for (const type of PROJECT_TYPES_BY_CATEGORY[cat]) {
      out[type] = cat;
    }
  }
  return out;
})();

export function isProjectTypeKey(v: unknown): v is string {
  return typeof v === "string" && v in CATEGORY_OF_TYPE;
}

export function isProjectCategoryKey(v: unknown): v is ProjectCategoryKey {
  return typeof v === "string" && (PROJECT_CATEGORY_KEYS as readonly string[]).includes(v);
}

/** Direct/alias legacy → new key mapping (case-insensitive). */
const LEGACY_TYPE_ALIASES: Record<string, string> = {
  // Kitchen
  "kitchen remodel": "KITCHEN_REMODEL",
  kitchen: "KITCHEN_REMODEL",
  // Bathroom
  "bathroom remodel": "BATHROOM_REMODEL",
  bathroom: "BATHROOM_REMODEL",
  bath: "BATHROOM_REMODEL",
  // Basement
  "basement finish": "BASEMENT_FINISH",
  basement: "BASEMENT_FINISH",
  // Garage
  "garage conversion": "GARAGE_CONVERSION",
  garage: "GARAGE_CONVERSION",
  // Whole house
  "whole house": "WHOLE_HOUSE_REMODEL",
  "whole house remodel": "WHOLE_HOUSE_REMODEL",
  "interior renovation": "INTERIOR_RENOVATION",
  "exterior renovation": "EXTERIOR_RENOVATION",
  flooring: "FLOORING",
  cabinets: "CABINETS_MILLWORK",
  millwork: "CABINETS_MILLWORK",
  drywall: "DRYWALL_PLASTER",
  plaster: "DRYWALL_PLASTER",
  "trim carpentry": "TRIM_FINISH_CARPENTRY",
  "finish carpentry": "TRIM_FINISH_CARPENTRY",
  trim: "TRIM_FINISH_CARPENTRY",
  insulation: "INSULATION",
  ceiling: "CEILING",
  ceilings: "CEILING",
  stairs: "STAIRS",
  staircase: "STAIRS",
  closet: "CLOSET_SYSTEMS",
  "closet systems": "CLOSET_SYSTEMS",
  // Interior bars & wine
  "home bar": "HOME_BAR",
  "wet bar": "WET_BAR",
  "wine room": "WINE_ROOM",
  "wine cellar": "WINE_ROOM",
  siding: "SIDING",
  windows: "WINDOWS_DOORS",
  doors: "WINDOWS_DOORS",
  "windows and doors": "WINDOWS_DOORS",
  // NOTE: legacy "deck" / "porch" continue to map to the pre-existing
  // exterior DECK_PORCH key for backward compatibility.
  deck: "DECK_PORCH",
  porch: "DECK_PORCH",
  patio: "PATIO",
  masonry: "MASONRY",
  gutters: "GUTTERS",
  fencing: "FENCING",
  fence: "FENCING",
  // Outdoor living
  "outdoor kitchen": "OUTDOOR_KITCHEN",
  "outdoor bar": "OUTDOOR_BAR",
  "covered patio": "COVERED_PATIO",
  pergola: "PERGOLA",
  gazebo: "GAZEBO",
  pavilion: "PAVILION",
  "screened porch": "SCREENED_PORCH",
  "screen porch": "SCREENED_PORCH",
  "three season room": "THREE_SEASON_ROOM",
  "3 season room": "THREE_SEASON_ROOM",
  "pool house": "POOL_HOUSE",
  "fire pit": "FIRE_PIT_FIREPLACE",
  "fire place": "FIRE_PIT_FIREPLACE",
  fireplace: "FIRE_PIT_FIREPLACE",
  "outdoor fireplace": "FIRE_PIT_FIREPLACE",
  "retaining wall": "RETAINING_WALL",
  "landscape structure": "LANDSCAPE_STRUCTURE",
  landscaping: "LANDSCAPE_STRUCTURE",
  addition: "HOME_ADDITION",
  "home addition": "HOME_ADDITION",
  adu: "ADU",
  sunroom: "SUNROOM",
  "new construction": "NEW_CONSTRUCTION",
  "structural repair": "STRUCTURAL_REPAIR",
  roof: "ROOF_REPLACEMENT",
  "roof replacement": "ROOF_REPLACEMENT",
  "roof repair": "ROOF_REPAIR",
  "metal roof": "METAL_ROOFING",
  "metal roofing": "METAL_ROOFING",
  "flat roof": "FLAT_LOW_SLOPE_ROOFING",
  painting: "INTERIOR_PAINTING",
  "interior paint": "INTERIOR_PAINTING",
  "interior painting": "INTERIOR_PAINTING",
  "exterior paint": "EXTERIOR_PAINTING",
  "exterior painting": "EXTERIOR_PAINTING",
  "cabinet painting": "CABINET_PAINTING",
  staining: "STAINING_FINISHING",
  plumbing: "PLUMBING_REPAIR",
  "plumbing repair": "PLUMBING_REPAIR",
  "water heater": "WATER_HEATER",
  "drain sewer": "DRAIN_SEWER",
  repiping: "REPIPING",
  electrical: "ELECTRICAL_REPAIR",
  "electrical repair": "ELECTRICAL_REPAIR",
  "panel upgrade": "SERVICE_PANEL_UPGRADE",
  "service panel": "SERVICE_PANEL_UPGRADE",
  lighting: "LIGHTING",
  rewiring: "REWIRING",
  generator: "GENERATOR_BACKUP_POWER",
  hvac: "HEATING",
  heating: "HEATING",
  cooling: "COOLING",
  ac: "COOLING",
  "heat pump": "HEAT_PUMP",
  ductwork: "DUCTWORK",
  ventilation: "VENTILATION",
  "water damage": "WATER_DAMAGE",
  "fire damage": "FIRE_SMOKE_DAMAGE",
  "smoke damage": "FIRE_SMOKE_DAMAGE",
  mold: "MOLD_REMEDIATION",
  "mold remediation": "MOLD_REMEDIATION",
  "insurance repair": "INSURANCE_REPAIR",
  "aging in place": "AGING_IN_PLACE",
  accessibility: "ACCESSIBILITY_MODIFICATION",
  "accessibility modification": "ACCESSIBILITY_MODIFICATION",
  ramp: "RAMP_LIFT",
  "accessible bathroom": "ACCESSIBLE_BATHROOM",
  repair: "GENERAL_REPAIR",
  "general repair": "GENERAL_REPAIR",
  maintenance: "MAINTENANCE",
  inspection: "INSPECTION_CONSULTATION",
  consultation: "INSPECTION_CONSULTATION",
  other: "OTHER",
};

/** Normalize a stored key/free-text value into { categoryKey, typeKey } if recognized. */
export function mapLegacyProjectType(
  value: string | null | undefined,
): { categoryKey: ProjectCategoryKey; typeKey: string } | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Exact key match first (e.g. "GARAGE_CONVERSION")
  const upper = trimmed.toUpperCase().replace(/[\s-]+/g, "_");
  if (upper in CATEGORY_OF_TYPE) {
    return { categoryKey: CATEGORY_OF_TYPE[upper]!, typeKey: upper };
  }

  const normalized = trimmed.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const aliased = LEGACY_TYPE_ALIASES[normalized];
  if (aliased && aliased in CATEGORY_OF_TYPE) {
    return { categoryKey: CATEGORY_OF_TYPE[aliased]!, typeKey: aliased };
  }
  return null;
}
