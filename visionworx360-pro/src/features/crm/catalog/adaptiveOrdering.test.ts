import { describe, it, expect } from "vitest";
import {
  getAdaptiveCategoryOrder,
  getAdaptiveTypeOrder,
  getRecommendedTypes,
  getRecommendedScale,
  EMPTY_PROFILE,
  type OrganizationBusinessProfile,
} from "./adaptiveOrdering";
import { PROJECT_CATEGORY_KEYS, ALL_PROJECT_TYPE_KEYS, CATEGORY_OF_TYPE } from "./projectTypes";
import fs from "node:fs";
import path from "node:path";

const p = (over: Partial<OrganizationBusinessProfile>): OrganizationBusinessProfile => ({
  ...EMPTY_PROFILE,
  ...over,
});

describe("adaptiveOrdering — category order", () => {
  it("HANDYMAN puts GENERAL first and prioritizes handyman categories", () => {
    const order = getAdaptiveCategoryOrder(p({ primaryBusinessType: "HANDYMAN" }));
    expect(order[0]).toBe("GENERAL");
    const top6 = order.slice(0, 6);
    for (const c of ["INTERIOR_REMODELING", "PAINTING", "EXTERIOR", "PLUMBING", "ELECTRICAL"]) {
      expect(top6).toContain(c);
    }
  });

  it("PAINTING puts PAINTING first", () => {
    const order = getAdaptiveCategoryOrder(p({ primaryBusinessType: "PAINTING" }));
    expect(order[0]).toBe("PAINTING");
  });

  it("GENERAL_REMODELING puts INTERIOR_REMODELING first", () => {
    const order = getAdaptiveCategoryOrder(p({ primaryBusinessType: "GENERAL_REMODELING" }));
    expect(order[0]).toBe("INTERIOR_REMODELING");
  });

  it("ROOFING puts ROOFING first", () => {
    const order = getAdaptiveCategoryOrder(p({ primaryBusinessType: "ROOFING" }));
    expect(order[0]).toBe("ROOFING");
  });

  it("PLUMBING / ELECTRICAL / HVAC / DECKS_OUTDOOR_LIVING / DESIGN_BUILD front their categories", () => {
    expect(getAdaptiveCategoryOrder(p({ primaryBusinessType: "PLUMBING" }))[0]).toBe("PLUMBING");
    expect(getAdaptiveCategoryOrder(p({ primaryBusinessType: "ELECTRICAL" }))[0]).toBe("ELECTRICAL");
    expect(getAdaptiveCategoryOrder(p({ primaryBusinessType: "HVAC" }))[0]).toBe("HVAC");
    expect(
      getAdaptiveCategoryOrder(p({ primaryBusinessType: "DECKS_OUTDOOR_LIVING" }))[0],
    ).toBe("OUTDOOR_LIVING");
    expect(getAdaptiveCategoryOrder(p({ primaryBusinessType: "DESIGN_BUILD" }))[0]).toBe(
      "INTERIOR_REMODELING",
    );
  });

  it("specialties bump their category above baseline", () => {
    const base = getAdaptiveCategoryOrder(p({ primaryBusinessType: "GENERAL_REMODELING" }));
    const boosted = getAdaptiveCategoryOrder(
      p({ primaryBusinessType: "GENERAL_REMODELING", serviceSpecialties: ["ROOFING"] }),
    );
    expect(boosted.indexOf("ROOFING")).toBeLessThan(base.indexOf("ROOFING"));
  });

  it("no primary and no specialties falls back to default order", () => {
    const order = getAdaptiveCategoryOrder(null);
    expect(order).toEqual([...PROJECT_CATEGORY_KEYS]);
  });

  it("OTHER with no specialties falls back to default; with specialties they lead", () => {
    const noSpec = getAdaptiveCategoryOrder(p({ primaryBusinessType: "OTHER" }));
    expect(noSpec).toEqual([...PROJECT_CATEGORY_KEYS]);
    const withSpec = getAdaptiveCategoryOrder(
      p({ primaryBusinessType: "OTHER", serviceSpecialties: ["ROOFING", "PAINTING"] }),
    );
    expect(withSpec.slice(0, 3)).toEqual(
      expect.arrayContaining(["ROOFING", "PAINTING"]),
    );
  });

  it("never hides any category regardless of profile", () => {
    for (const primary of [
      "HANDYMAN",
      "PAINTING",
      "GENERAL_REMODELING",
      "ROOFING",
      "HVAC",
      "OTHER",
    ] as const) {
      const order = getAdaptiveCategoryOrder(p({ primaryBusinessType: primary }));
      expect(order.length).toBe(PROJECT_CATEGORY_KEYS.length);
      expect(new Set(order)).toEqual(new Set(PROJECT_CATEGORY_KEYS));
    }
  });
});

describe("adaptiveOrdering — type order within categories", () => {
  it("HANDYMAN floats punch-list style types to the top of GENERAL", () => {
    const order = getAdaptiveTypeOrder("GENERAL", p({ primaryBusinessType: "HANDYMAN" }));
    expect(order[0]).toBe("GENERAL_REPAIR");
    expect(order).toContain("PUNCH_LIST");
  });

  it("does not drop any type from a category", () => {
    for (const cat of PROJECT_CATEGORY_KEYS) {
      const order = getAdaptiveTypeOrder(cat, p({ primaryBusinessType: "HANDYMAN" }));
      expect(new Set(order)).toEqual(
        new Set(
          Object.entries(CATEGORY_OF_TYPE)
            .filter(([, c]) => c === cat)
            .map(([t]) => t),
        ),
      );
    }
  });
});

describe("adaptiveOrdering — recommended section", () => {
  it("returns up to 6 unique project-type keys for HANDYMAN", () => {
    const rec = getRecommendedTypes(p({ primaryBusinessType: "HANDYMAN" }));
    expect(rec.length).toBeGreaterThan(0);
    expect(rec.length).toBeLessThanOrEqual(6);
    expect(new Set(rec).size).toBe(rec.length);
    for (const k of rec) expect(ALL_PROJECT_TYPE_KEYS).toContain(k);
  });

  it("prioritizes explicit service specialties", () => {
    const rec = getRecommendedTypes(
      p({ primaryBusinessType: "PAINTING", serviceSpecialties: ["METAL_ROOFING"] }),
    );
    expect(rec[0]).toBe("METAL_ROOFING");
  });

  it("recommended keys stay available in the full catalog", () => {
    const rec = getRecommendedTypes(p({ primaryBusinessType: "HANDYMAN" }));
    for (const k of rec) expect(ALL_PROJECT_TYPE_KEYS).toContain(k);
  });

  it("no profile → empty recommended list", () => {
    expect(getRecommendedTypes(null)).toEqual([]);
  });
});

describe("adaptiveOrdering — recommended scale", () => {
  it("WHOLE_HOUSE_REMODEL → MAJOR_RENOVATION", () => {
    expect(getRecommendedScale("WHOLE_HOUSE_REMODEL", null)).toBe("MAJOR_RENOVATION");
  });
  it("GENERAL_REPAIR → QUICK_REPAIR", () => {
    expect(getRecommendedScale("GENERAL_REPAIR", null)).toBe("QUICK_REPAIR");
  });
  it("falls back to profile default when type gives no hint", () => {
    expect(getRecommendedScale(null, p({ primaryBusinessType: "HANDYMAN" }))).toBe("HALF_DAY");
  });
  it("respects preferred scale when set and not ALL_SIZES", () => {
    expect(
      getRecommendedScale(
        null,
        p({ primaryBusinessType: "HANDYMAN", preferredProjectScale: "FULL_DAY" }),
      ),
    ).toBe("FULL_DAY");
  });
});

describe("i18n parity for new keys", () => {
  const readJson = (p: string) =>
    JSON.parse(fs.readFileSync(path.join(process.cwd(), p), "utf8"));
  const en = readJson("src/i18n/locales/en-US/crm.json");
  const es = readJson("src/i18n/locales/es-US/crm.json");
  const enW = readJson("src/i18n/locales/en-US/workspace.json");
  const esW = readJson("src/i18n/locales/es-US/workspace.json");

  it("crm.json: every project-type key has EN and ES", () => {
    for (const k of ALL_PROJECT_TYPE_KEYS) {
      expect(en.projectTypes[k], `en ${k}`).toBeTruthy();
      expect(es.projectTypes[k], `es ${k}`).toBeTruthy();
    }
  });
  it("projectScales parity", () => {
    expect(Object.keys(en.projectScales).sort()).toEqual(Object.keys(es.projectScales).sort());
  });
  it("workspace.json businessProfile parity", () => {
    expect(Object.keys(enW.businessProfile).sort()).toEqual(
      Object.keys(esW.businessProfile).sort(),
    );
    expect(Object.keys(enW.businessProfile.primaryTypes).sort()).toEqual(
      Object.keys(esW.businessProfile.primaryTypes).sort(),
    );
  });
  it("recommendedHeading present in both languages", () => {
    expect(en.projectTypePicker.recommendedHeading).toBeTruthy();
    expect(es.projectTypePicker.recommendedHeading).toBeTruthy();
  });
});
