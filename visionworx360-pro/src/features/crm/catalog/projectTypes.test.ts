import { describe, it, expect } from "vitest";
import {
  PROJECT_CATEGORY_KEYS,
  PROJECT_TYPES_BY_CATEGORY,
  ALL_PROJECT_TYPE_KEYS,
  CATEGORY_OF_TYPE,
  mapLegacyProjectType,
} from "./projectTypes";
import {
  PROJECT_SUBTYPES_BY_TYPE,
  hasSubtypes,
  getSubtypesForType,
  isValidSubtypeForType,
} from "./projectSubtypes";
import { CATEGORY_ICON_COLOR } from "../components/ProjectTypeCombobox";
import enCrm from "@/i18n/locales/en-US/crm.json";
import esCrm from "@/i18n/locales/es-US/crm.json";

describe("project type catalog order", () => {
  it("categories follow the revised default order with OUTDOOR_LIVING after EXTERIOR", () => {
    expect(PROJECT_CATEGORY_KEYS).toEqual([
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
    ]);
  });

  it("GENERAL remains the final catch-all category", () => {
    expect(PROJECT_CATEGORY_KEYS[PROJECT_CATEGORY_KEYS.length - 1]).toBe("GENERAL");
    expect(PROJECT_TYPES_BY_CATEGORY.GENERAL[0]).toBe("GENERAL_REPAIR");
    for (const k of ["MAINTENANCE", "INSPECTION_CONSULTATION", "OTHER", "PUNCH_LIST"]) {
      expect(PROJECT_TYPES_BY_CATEGORY.GENERAL).toContain(k);
    }
  });

  it("INTERIOR_REMODELING follows the configured order and includes the new bar/wine types", () => {
    const interior = PROJECT_TYPES_BY_CATEGORY.INTERIOR_REMODELING;
    // Core headline types stay in the configured order.
    const core = interior.filter((k) =>
      [
        "KITCHEN_REMODEL",
        "BATHROOM_REMODEL",
        "WHOLE_HOUSE_REMODEL",
        "INTERIOR_RENOVATION",
        "GARAGE_CONVERSION",
        "BASEMENT_FINISH",
        "FLOORING",
        "CABINETS_MILLWORK",
        "TRIM_FINISH_CARPENTRY",
        "DRYWALL_PLASTER",
        "INSULATION",
        "CEILING",
        "STAIRS",
        "CLOSET_SYSTEMS",
        "HOME_BAR",
        "WET_BAR",
        "WINE_ROOM",
      ].includes(k),
    );
    expect(core).toEqual([
      "KITCHEN_REMODEL",
      "BATHROOM_REMODEL",
      "WHOLE_HOUSE_REMODEL",
      "INTERIOR_RENOVATION",
      "GARAGE_CONVERSION",
      "BASEMENT_FINISH",
      "FLOORING",
      "CABINETS_MILLWORK",
      "TRIM_FINISH_CARPENTRY",
      "DRYWALL_PLASTER",
      "INSULATION",
      "CEILING",
      "STAIRS",
      "CLOSET_SYSTEMS",
      "HOME_BAR",
      "WET_BAR",
      "WINE_ROOM",
    ]);
  });

  it("OUTDOOR_LIVING is rendered with the exact configured order", () => {
    expect(PROJECT_TYPES_BY_CATEGORY.OUTDOOR_LIVING).toEqual([
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
    ]);
  });

  it("types are ordered by expected frequency within each category", () => {
    expect(PROJECT_TYPES_BY_CATEGORY.PAINTING[0]).toBe("INTERIOR_PAINTING");
    expect(PROJECT_TYPES_BY_CATEGORY.EXTERIOR[0]).toBe("WINDOWS_DOORS");
    expect(PROJECT_TYPES_BY_CATEGORY.ROOFING[0]).toBe("ROOF_REPLACEMENT");
    expect(PROJECT_TYPES_BY_CATEGORY.ADDITIONS_CONSTRUCTION[0]).toBe("HOME_ADDITION");
    expect(PROJECT_TYPES_BY_CATEGORY.RESTORATION[0]).toBe("WATER_DAMAGE");
    expect(PROJECT_TYPES_BY_CATEGORY.ACCESSIBILITY[0]).toBe("ACCESSIBILITY_MODIFICATION");
    expect(PROJECT_TYPES_BY_CATEGORY.PLUMBING[0]).toBe("PLUMBING_REPAIR");
    expect(PROJECT_TYPES_BY_CATEGORY.ELECTRICAL[0]).toBe("ELECTRICAL_REPAIR");
    expect(PROJECT_TYPES_BY_CATEGORY.HVAC[0]).toBe("HEATING");
    expect(PROJECT_TYPES_BY_CATEGORY.GENERAL[0]).toBe("GENERAL_REPAIR");
    expect(PROJECT_TYPES_BY_CATEGORY.OUTDOOR_LIVING[0]).toBe("OUTDOOR_KITCHEN");
  });

  it("ALL_PROJECT_TYPE_KEYS respects the configured category and type order", () => {
    const expected = PROJECT_CATEGORY_KEYS.flatMap((c) => PROJECT_TYPES_BY_CATEGORY[c]);
    expect(ALL_PROJECT_TYPE_KEYS).toEqual(expected);
    expect(ALL_PROJECT_TYPE_KEYS[0]).toBe("KITCHEN_REMODEL");
  });

  it("CATEGORY_OF_TYPE maps every type to its configured category", () => {
    for (const category of PROJECT_CATEGORY_KEYS) {
      for (const type of PROJECT_TYPES_BY_CATEGORY[category]) {
        expect(CATEGORY_OF_TYPE[type]).toBe(category);
      }
    }
  });

  it("PATIO now resolves to OUTDOOR_LIVING (legacy stored value still recognized)", () => {
    expect(CATEGORY_OF_TYPE.PATIO).toBe("OUTDOOR_LIVING");
    const mapped = mapLegacyProjectType("patio");
    expect(mapped).toEqual({ categoryKey: "OUTDOOR_LIVING", typeKey: "PATIO" });
  });

  it("stored DECK_PORCH key continues to resolve to EXTERIOR (backward compat)", () => {
    expect(CATEGORY_OF_TYPE.DECK_PORCH).toBe("EXTERIOR");
    expect(mapLegacyProjectType("DECK_PORCH")).toEqual({
      categoryKey: "EXTERIOR",
      typeKey: "DECK_PORCH",
    });
    expect(mapLegacyProjectType("deck porch")).toEqual({
      categoryKey: "EXTERIOR",
      typeKey: "DECK_PORCH",
    });
  });
});

describe("project type presentation", () => {
  it("assigns a color token to every category icon", () => {
    for (const cat of PROJECT_CATEGORY_KEYS) {
      const cls = CATEGORY_ICON_COLOR[cat];
      expect(cls, `missing color for ${cat}`).toBeTruthy();
      expect(cls).toMatch(/text-/);
    }
  });

  it("OUTDOOR_LIVING uses a distinct green/earth-tone different from EXTERIOR", () => {
    expect(CATEGORY_ICON_COLOR.OUTDOOR_LIVING).not.toBe(CATEGORY_ICON_COLOR.EXTERIOR);
    expect(CATEGORY_ICON_COLOR.OUTDOOR_LIVING).toMatch(/lime|green|emerald|amber|olive/);
  });

  it("new interior remodeling types have en-US and es-US labels", () => {
    const newKeys = [
      "TRIM_FINISH_CARPENTRY",
      "INSULATION",
      "CEILING",
      "STAIRS",
      "CLOSET_SYSTEMS",
      "HOME_BAR",
      "WET_BAR",
      "WINE_ROOM",
    ];
    const en = enCrm.projectTypes as Record<string, string>;
    const es = esCrm.projectTypes as Record<string, string>;
    for (const key of newKeys) {
      expect(en[key], `missing en label for ${key}`).toBeTruthy();
      expect(es[key], `missing es label for ${key}`).toBeTruthy();
    }
  });

  it("every project type key has parity in en-US and es-US", () => {
    const en = enCrm.projectTypes as Record<string, string>;
    const es = esCrm.projectTypes as Record<string, string>;
    for (const key of ALL_PROJECT_TYPE_KEYS) {
      expect(en[key], `missing en label for type ${key}`).toBeTruthy();
      expect(es[key], `missing es label for type ${key}`).toBeTruthy();
    }
  });

  it("every project category key has parity in en-US and es-US", () => {
    const en = enCrm.projectCategories as Record<string, string>;
    const es = esCrm.projectCategories as Record<string, string>;
    for (const key of PROJECT_CATEGORY_KEYS) {
      expect(en[key], `missing en label for category ${key}`).toBeTruthy();
      expect(es[key], `missing es label for category ${key}`).toBeTruthy();
    }
  });

  it("every configured subtype key has parity in en-US and es-US", () => {
    const en = enCrm.projectSubtypes as Record<string, string>;
    const es = esCrm.projectSubtypes as Record<string, string>;
    for (const [typeKey, subs] of Object.entries(PROJECT_SUBTYPES_BY_TYPE)) {
      if (!subs) continue;
      for (const s of subs) {
        expect(en[s], `missing en label for subtype ${typeKey}/${s}`).toBeTruthy();
        expect(es[s], `missing es label for subtype ${typeKey}/${s}`).toBeTruthy();
      }
    }
  });
});

describe("outdoor living search-relevant labels", () => {
  const en = enCrm.projectTypes as Record<string, string>;
  const es = esCrm.projectTypes as Record<string, string>;

  it("pergola, gazebo, outdoor kitchen, bar, patio are findable by label substring (EN)", () => {
    const haystack = PROJECT_TYPES_BY_CATEGORY.OUTDOOR_LIVING.map((k) => en[k].toLowerCase());
    for (const q of ["pergola", "gazebo", "outdoor kitchen", "bar", "patio"]) {
      expect(haystack.some((l) => l.includes(q)), `no EN outdoor label matches "${q}"`).toBe(true);
    }
  });

  it("pergola, gazebo, outdoor kitchen, bar, patio are findable by label substring (ES)", () => {
    const haystack = PROJECT_TYPES_BY_CATEGORY.OUTDOOR_LIVING.map((k) => es[k].toLowerCase());
    for (const q of ["pérgola", "cenador", "cocina exterior", "bar", "patio"]) {
      expect(haystack.some((l) => l.includes(q)), `no ES outdoor label matches "${q}"`).toBe(true);
    }
  });
});

describe("subtype filtering", () => {
  it("hasSubtypes is true only for configured types", () => {
    expect(hasSubtypes("OUTDOOR_KITCHEN")).toBe(true);
    expect(hasSubtypes("PERGOLA")).toBe(true);
    expect(hasSubtypes("GAZEBO")).toBe(true);
    expect(hasSubtypes("DECK")).toBe(true);
    expect(hasSubtypes("PATIO")).toBe(true);
    expect(hasSubtypes("SCREENED_PORCH")).toBe(true);
    // no configured subtypes for these outdoor items
    expect(hasSubtypes("PAVILION")).toBe(false);
    expect(hasSubtypes("RETAINING_WALL")).toBe(false);
    expect(hasSubtypes("OTHER_OUTDOOR_LIVING")).toBe(false);
  });

  it("PERGOLA subtypes match the specified list including OTHER", () => {
    expect(getSubtypesForType("PERGOLA")).toEqual([
      "ATTACHED",
      "FREESTANDING",
      "LOUVERED",
      "MOTORIZED",
      "OTHER",
    ]);
  });

  it("DECK subtypes are filtered to DECK-only options", () => {
    expect(getSubtypesForType("DECK")).toEqual([
      "WOOD",
      "COMPOSITE",
      "MULTI_LEVEL",
      "ROOFTOP",
      "REPAIR_RESURFACE",
      "OTHER",
    ]);
    expect(isValidSubtypeForType("DECK", "WOOD")).toBe(true);
    // subtypes belonging to other types should not validate under DECK
    expect(isValidSubtypeForType("DECK", "ATTACHED")).toBe(false);
    expect(isValidSubtypeForType("DECK", "CONCRETE")).toBe(false);
  });

  it("subtype is optional (empty/null accepted)", () => {
    expect(isValidSubtypeForType("PATIO", null)).toBe(true);
    expect(isValidSubtypeForType("PATIO", undefined)).toBe(true);
  });
});

describe("General / Other fallback behavior", () => {
  it("GENERAL category ends with OTHER", () => {
    const general = PROJECT_TYPES_BY_CATEGORY.GENERAL;
    expect(general[general.length - 1]).toBe("OTHER");
  });

  it("OTHER type has EN and ES labels", () => {
    const en = enCrm.projectTypes as Record<string, string>;
    const es = esCrm.projectTypes as Record<string, string>;
    expect(en.OTHER).toBeTruthy();
    expect(es.OTHER).toBeTruthy();
  });

  it("mapping unknown free-text returns null (custom value flow preserves input exactly)", () => {
    expect(mapLegacyProjectType("something completely custom xyz")).toBeNull();
  });
});
