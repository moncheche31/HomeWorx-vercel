/**
 * Project subtype catalog.
 *
 * Subtypes refine a chosen Project Type. Keys are stable, language-neutral,
 * and stored in the database (`projects.project_subtype_key`). Labels are
 * resolved via i18n (namespace "crm", key "projectSubtypes.<KEY>").
 *
 * This catalog is the single source of truth for subtype foundations. Future
 * AI heuristics and estimate-template mappings should read from here.
 *
 * NOTE: Not every Project Type has subtypes. When a type has no configured
 * subtypes, the subtype picker is hidden.
 */
import type { ProjectTypeKey } from "./projectTypes";

export const PROJECT_SUBTYPES_BY_TYPE: Partial<Record<ProjectTypeKey | string, readonly string[]>> =
  {
    // Interior remodeling
    KITCHEN_REMODEL: [
      "KITCHEN_COSMETIC_REFRESH",
      "KITCHEN_PULL_AND_REPLACE",
      "KITCHEN_LAYOUT_CHANGE",
      "KITCHEN_FULL_GUT",
      "OTHER",
    ],
    BATHROOM_REMODEL: [
      "BATHROOM_COSMETIC_REFRESH",
      "BATHROOM_TUB_TO_SHOWER",
      "BATHROOM_FULL_GUT",
      "BATHROOM_WET_ROOM",
      "OTHER",
    ],
    WHOLE_HOUSE_REMODEL: [
      "WHOLE_HOUSE_COSMETIC",
      "WHOLE_HOUSE_FULL_GUT",
      "WHOLE_HOUSE_HISTORIC",
      "OTHER",
    ],
    BASEMENT_FINISH: [
      "BASEMENT_UNFINISHED_TO_FINISHED",
      "BASEMENT_APARTMENT",
      "BASEMENT_MEDIA_ROOM",
      "OTHER",
    ],
    GARAGE_CONVERSION: [
      "GARAGE_TO_LIVING_SPACE",
      "GARAGE_TO_ADU",
      "GARAGE_TO_OFFICE",
      "GARAGE_TO_GYM",
      "OTHER",
    ],
    FLOORING: [
      "FLOORING_HARDWOOD",
      "FLOORING_ENGINEERED_WOOD",
      "FLOORING_LVP",
      "FLOORING_TILE",
      "FLOORING_CARPET",
      "OTHER",
    ],
    CABINETS_MILLWORK: [
      "CABINETS_STOCK",
      "CABINETS_SEMI_CUSTOM",
      "CABINETS_CUSTOM",
      "BUILT_INS",
      "OTHER",
    ],
    HOME_BAR: ["HOME_BAR_BASIC", "HOME_BAR_BUILT_IN", "HOME_BAR_WITH_KITCHENETTE", "OTHER"],
    WET_BAR: ["WET_BAR_BASIC", "WET_BAR_BUILT_IN", "OTHER"],
    WINE_ROOM: ["WINE_CELLAR", "WINE_CLOSET", "WINE_DISPLAY_WALL", "OTHER"],

    // Painting
    INTERIOR_PAINTING: ["PAINT_WALLS_CEILINGS", "PAINT_TRIM_DOORS", "PAINT_FULL_INTERIOR", "OTHER"],
    EXTERIOR_PAINTING: ["PAINT_SIDING", "PAINT_TRIM_EXTERIOR", "PAINT_FULL_EXTERIOR", "OTHER"],
    CABINET_PAINTING: ["CABINET_PAINT_KITCHEN", "CABINET_PAINT_BATHROOM", "CABINET_REFINISH", "OTHER"],

    // Exterior
    SIDING: ["SIDING_VINYL", "SIDING_FIBER_CEMENT", "SIDING_WOOD", "SIDING_METAL", "OTHER"],
    WINDOWS_DOORS: ["WINDOW_REPLACEMENT", "DOOR_REPLACEMENT", "ENTRY_DOOR", "PATIO_DOOR", "OTHER"],
    DECK_PORCH: ["DECK_NEW", "DECK_REBUILD", "PORCH_NEW", "PORCH_SCREENED", "OTHER"],

    // Outdoor living
    OUTDOOR_KITCHEN: [
      "BASIC_GRILL_STATION",
      "FULL_OUTDOOR_KITCHEN",
      "COVERED_OUTDOOR_KITCHEN",
      "OUTDOOR_KITCHEN_WITH_BAR",
      "OTHER",
    ],
    COVERED_PATIO: ["COVERED_PATIO_ATTACHED", "COVERED_PATIO_FREESTANDING", "OTHER"],
    PERGOLA: ["ATTACHED", "FREESTANDING", "LOUVERED", "MOTORIZED", "OTHER"],
    GAZEBO: ["OPEN", "SCREENED", "ENCLOSED", "OTHER"],
    DECK: ["WOOD", "COMPOSITE", "MULTI_LEVEL", "ROOFTOP", "REPAIR_RESURFACE", "OTHER"],
    PATIO: ["CONCRETE", "PAVERS", "STONE", "COVERED", "OTHER"],
    SCREENED_PORCH: [
      "SCREENED_PORCH_NEW",
      "SCREENED_PORCH_CONVERSION",
      "SCREENED_PORCH_THREE_SEASON",
      "OTHER",
    ],
    OUTDOOR_BAR: [
      "OUTDOOR_BAR_BASIC",
      "OUTDOOR_BAR_COVERED",
      "OUTDOOR_BAR_WITH_KITCHEN",
      "OTHER",
    ],
    FIRE_PIT_FIREPLACE: ["FIRE_PIT", "OUTDOOR_FIREPLACE", "OTHER"],

    // Roofing
    ROOF_REPLACEMENT: [
      "ROOF_ASPHALT_SHINGLE",
      "ROOF_ARCHITECTURAL_SHINGLE",
      "ROOF_METAL",
      "ROOF_TILE",
      "OTHER",
    ],
    ROOF_REPAIR: ["ROOF_LEAK_REPAIR", "ROOF_STORM_REPAIR", "ROOF_FLASHING_REPAIR", "OTHER"],

    // Additions & construction
    HOME_ADDITION: ["ADDITION_BUMP_OUT", "ADDITION_ROOM", "ADDITION_SECOND_STORY", "OTHER"],
    ADU: ["ADU_DETACHED", "ADU_ATTACHED", "ADU_GARAGE_CONVERSION", "OTHER"],

    // Restoration
    WATER_DAMAGE: ["WATER_MITIGATION", "WATER_STRUCTURAL_REPAIR", "WATER_CONTENTS", "OTHER"],
    FIRE_SMOKE_DAMAGE: ["FIRE_STRUCTURAL_REPAIR", "SMOKE_ODOR_REMEDIATION", "OTHER"],

    // Plumbing
    WATER_HEATER: ["WATER_HEATER_TANK", "WATER_HEATER_TANKLESS", "WATER_HEATER_HEAT_PUMP", "OTHER"],

    // Electrical
    SERVICE_PANEL_UPGRADE: ["PANEL_100A_TO_200A", "PANEL_200A_TO_400A", "PANEL_SUBPANEL_ADD", "OTHER"],

    // HVAC
    HEATING: ["HEATING_FURNACE", "HEATING_BOILER", "HEATING_RADIANT_FLOOR", "OTHER"],
    COOLING: ["COOLING_CENTRAL", "COOLING_MINI_SPLIT", "COOLING_WINDOW_UNITS", "OTHER"],
    HEAT_PUMP: ["HEAT_PUMP_AIR_SOURCE", "HEAT_PUMP_MINI_SPLIT", "HEAT_PUMP_GEOTHERMAL", "OTHER"],

    // General
    OTHER: [],
  };

/**
 * Type guard used by legacy compatibility paths and validators.
 */
export function hasSubtypes(typeKey: string | null | undefined): boolean {
  if (!typeKey) return false;
  const list = PROJECT_SUBTYPES_BY_TYPE[typeKey];
  return Array.isArray(list) && list.length > 0;
}

export function getSubtypesForType(typeKey: string | null | undefined): readonly string[] {
  if (!typeKey) return [];
  return PROJECT_SUBTYPES_BY_TYPE[typeKey] ?? [];
}

export function isValidSubtypeForType(
  typeKey: string | null | undefined,
  subtypeKey: string | null | undefined,
): boolean {
  if (!subtypeKey) return true; // subtype is optional
  if (!typeKey) return false;
  return getSubtypesForType(typeKey).includes(subtypeKey);
}
