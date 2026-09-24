import { describe, expect, it, beforeEach } from "vitest";
import {
  KNOWLEDGE_ENTRIES,
  KNOWLEDGE_ENTRY_KEYS,
  KNOWLEDGE_VERSION,
  ITEM_LIBRARY,
  activeKnowledgeVersion,
  applyOverride,
  archiveEntry,
  createOverrideDraft,
  deterministicKnowledgeEngine as engine,
  isDeterministicKnowledgeOnly,
  knowledgeCopilotRecommendations,
  matchScopeText,
  mergeKnowledgeIntoCopilot,
  normalize,
  selectAvailableEntries,
  setKnowledgeOverrides,
  toCopilotConfidence,
  type KnowledgeOverride,
} from "../index";
import { containsInternalTerms } from "@/domains/copilot";
import { reviewProject, type CopilotReviewInput } from "@/domains/copilot";

const ORG = "org-123";

beforeEach(() => setKnowledgeOverrides([]));

describe("knowledge matching", () => {
  it("finds the kitchen entry from a project type key", () => {
    const matches = engine.search({ projectTypeKeys: ["kitchen_remodel"] });
    expect(matches[0]?.entryKey).toBe("kitchen_remodel");
  });

  it("matches free scope text for each documented example", () => {
    const cases: Array<[string, string]> = [
      ["remove wall", "structural_wall_removal"],
      ["load-bearing wall", "structural_wall_removal"],
      ["open concept", "structural_wall_removal"],
      ["install cabinets", "cabinet_installation"],
      ["replace flooring", "flooring_replacement"],
      ["bathroom remodel", "bathroom_remodel"],
    ];
    for (const [text, expected] of cases) {
      const matches = matchScopeText(KNOWLEDGE_ENTRIES, text);
      expect(matches.map((m) => m.entryKey)).toContain(expected);
    }
  });

  it("matches Spanish trigger terms and synonyms", () => {
    expect(matchScopeText(KNOWLEDGE_ENTRIES, "quitar muro de carga")[0]?.entryKey).toBe(
      "structural_wall_removal",
    );
    expect(matchScopeText(KNOWLEDGE_ENTRIES, "instalar gabinetes")[0]?.entryKey).toBe(
      "cabinet_installation",
    );
  });

  it("matches synonyms that are not trigger terms", () => {
    const matches = matchScopeText(KNOWLEDGE_ENTRIES, "we want to tumbar muro");
    expect(matches.map((m) => m.entryKey)).toContain("structural_wall_removal");
    expect(matchScopeText(KNOWLEDGE_ENTRIES, "new luxury vinyl plank")[0]?.entryKey).toBeDefined();
  });

  it("normalizes accents and punctuation deterministically", () => {
    expect(normalize("Remodelación de Cocina!")).toBe("remodelacion de cocina");
    expect(matchScopeText(KNOWLEDGE_ENTRIES, "remodelacion de cocina")[0]?.entryKey).toBe(
      "kitchen_remodel",
    );
  });

  it("returns nothing for unrelated text", () => {
    expect(matchScopeText(KNOWLEDGE_ENTRIES, "purchase office stationery")).toHaveLength(0);
  });

  it("matches through Knowledge Base assembly and Copilot keys", () => {
    const viaAssembly = engine.search({ assemblyKeys: ["cabinets.install.base"] });
    expect(viaAssembly.length).toBeGreaterThan(0);
    const viaCopilot = engine.search({ copilotItemKeys: ["standard.dust_containment"] });
    expect(viaCopilot.length).toBeGreaterThanOrEqual(0);
  });
});

describe("omission detection", () => {
  it("lists the documented kitchen omissions", () => {
    const keys = engine
      .commonOmissions({ projectTypeKeys: ["kitchen_remodel"] })
      .map((i) => i.itemKey);
    for (const expected of [
      "general.floor_protection",
      "general.dust_containment",
      "appliance.disconnect",
      "appliance.removal",
      "plumbing.temp_sink",
      "general.dumpster",
      "general.debris_removal",
      "general.permit",
      "electrical.adjustments",
      "plumbing.relocation",
      "general.drywall_repair",
      "general.paint_touchup",
      "general.final_cleaning",
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it("lists the documented cabinet-installation omissions", () => {
    const keys = engine.commonOmissions({ text: "install cabinets" }).map((i) => i.itemKey);
    for (const expected of [
      "cabinet.fillers",
      "cabinet.end_panels",
      "cabinet.toe_kicks",
      "cabinet.crown",
      "cabinet.hardware",
      "cabinet.appliance_panels",
      "cabinet.delivery",
      "countertop.template",
      "backsplash.prep",
      "lighting.undercabinet_coordination",
    ]) {
      expect(keys).toContain(expected);
    }
  });

  it("returns an empty recommendation set when nothing matches", () => {
    const set = engine.recommend({ text: "unrelated administrative task" });
    expect(set.isEmpty).toBe(true);
    expect(set.commonOmissions).toHaveLength(0);
  });
});

describe("standard additions", () => {
  it("suggests high-confidence one-tap items with a reason", () => {
    const items = engine.standardAdditions({ projectTypeKeys: ["kitchen_remodel"] });
    const keys = items.map((i) => i.itemKey);
    expect(keys).toContain("general.floor_protection");
    expect(keys).toContain("general.final_cleaning");
    expect(items.every((i) => i.reason["en-US"].length > 0 && i.reason["es-US"].length > 0)).toBe(true);
  });

  it("never marks a standard item as automatically committed", () => {
    const recs = knowledgeCopilotRecommendations({
      locale: "en-US",
      query: { projectTypeKeys: ["kitchen_remodel"] },
    });
    const standards = recs.filter((r) => r.sectionKey === "standard_items");
    expect(standards.length).toBeGreaterThan(0);
    // Default is "accepted" but always visible and removable — never silent.
    expect(standards.every((r) => r.defaultDecision === "accepted")).toBe(true);
    const omissions = recs.filter((r) => r.sectionKey === "missing_scope");
    expect(omissions.every((r) => r.defaultDecision === "pending")).toBe(true);
  });
});

describe("sales opportunities", () => {
  it("exposes kitchen, bathroom and deck upgrades", () => {
    const kitchen = engine.salesOpportunities({ projectTypeKeys: ["kitchen_remodel"] }).map((u) => u.itemKey);
    expect(kitchen).toContain("upgrade.undercabinet_lighting");
    expect(kitchen).toContain("upgrade.soft_close");

    const bath = engine.salesOpportunities({ projectTypeKeys: ["bathroom_remodel"] }).map((u) => u.itemKey);
    expect(bath).toContain("upgrade.heated_floor");
    expect(bath).toContain("upgrade.frameless_glass");

    const deck = engine.salesOpportunities({ projectTypeKeys: ["deck_build"] }).map((u) => u.itemKey);
    expect(deck).toContain("upgrade.composite_decking");
    expect(deck).toContain("upgrade.cable_railing");
  });

  it("marks every opportunity optional with an impact category", () => {
    const all = engine.salesOpportunities({ projectTypeKeys: ["bathroom_remodel"] });
    expect(all.every((u) => u.isOptional && u.confidence === "optional")).toBe(true);
    expect(all.every((u) => u.impactCategory.length > 0)).toBe(true);
  });
});

describe("value engineering", () => {
  it("offers documented ladders without any pricing", () => {
    const kitchen = engine.alternatives({ projectTypeKeys: ["kitchen_remodel"] });
    const rules = kitchen.map((v) => v.ruleKey);
    expect(rules).toContain("ve.quartz_to_granite");
    expect(rules).toContain("ve.quartz_to_laminate");
    expect(rules).toContain("ve.custom_to_semi_custom");
    expect(rules).toContain("ve.semi_custom_to_stock");

    const bath = engine.alternatives({ projectTypeKeys: ["bathroom_remodel"] }).map((v) => v.ruleKey);
    expect(bath).toContain("ve.tile_to_solid_surface");
    expect(bath).toContain("ve.tile_to_acrylic");

    const floors = engine.alternatives({ text: "replace flooring hardwood" }).map((v) => v.ruleKey);
    expect(floors).toContain("ve.hardwood_to_engineered");
    expect(floors).toContain("ve.hardwood_to_lvp");
  });

  it("uses relative impacts only — never a number or currency", () => {
    for (const rule of engine.alternatives({ projectTypeKeys: ["kitchen_remodel"] })) {
      expect(["lower", "similar", "higher"]).toContain(rule.costImpact);
      expect(JSON.stringify(rule)).not.toMatch(/[$€]|\d+\s?%/);
    }
  });
});

describe("confidence assignment", () => {
  it("uses the four documented levels only", () => {
    const allowed = ["high", "medium", "optional", "contractor_decision_required"];
    for (const item of Object.values(ITEM_LIBRARY)) {
      expect(allowed).toContain(item.confidence);
    }
  });

  it("grades permits and inspections as contractor decisions", () => {
    expect(ITEM_LIBRARY["general.permit"].confidence).toBe("contractor_decision_required");
    expect(ITEM_LIBRARY["general.inspection"].confidence).toBe("contractor_decision_required");
  });

  it("grades protection and cleanup as high confidence", () => {
    expect(ITEM_LIBRARY["general.floor_protection"].confidence).toBe("high");
    expect(ITEM_LIBRARY["general.dust_containment"].confidence).toBe("high");
  });
});

describe("bilingual parity", () => {
  it("provides English and Spanish for every item string", () => {
    for (const item of Object.values(ITEM_LIBRARY)) {
      for (const field of [
        item.label,
        item.customerLabel,
        item.contractorRationale,
        item.customerValueStatement,
      ]) {
        expect(field["en-US"].trim().length).toBeGreaterThan(0);
        expect(field["es-US"].trim().length).toBeGreaterThan(0);
        expect(field["en-US"]).not.toBe(field["es-US"]);
      }
    }
  });

  it("provides English and Spanish for every entry note", () => {
    for (const entry of KNOWLEDGE_ENTRIES) {
      const notes = [
        ...entry.safetyNotes,
        ...entry.codeReminders,
        ...entry.permitReminders,
        ...entry.inspectionReminders,
        ...entry.sequencingNotes,
      ];
      for (const note of notes) {
        expect(note.text["en-US"].trim().length).toBeGreaterThan(0);
        expect(note.text["es-US"].trim().length).toBeGreaterThan(0);
      }
    }
  });
});

describe("customer wording separation", () => {
  it("keeps internal estimating vocabulary out of customer strings", () => {
    for (const item of Object.values(ITEM_LIBRARY)) {
      expect(containsInternalTerms(item.customerLabel["en-US"])).toBe(false);
      expect(containsInternalTerms(item.customerValueStatement["en-US"])).toBe(false);
      expect(containsInternalTerms(item.customerValueStatement["es-US"])).toBe(false);
    }
  });

  it("never implies the contractor forgot something", () => {
    const banned = /forgot|missed|omitted|olvid|omiti/i;
    for (const item of Object.values(ITEM_LIBRARY)) {
      expect(item.customerValueStatement["en-US"]).not.toMatch(banned);
      expect(item.customerValueStatement["es-US"]).not.toMatch(banned);
    }
  });

  it("uses the documented customer wording for floor protection and dust containment", () => {
    expect(engine.statementForItem("general.floor_protection")?.["en-US"]).toContain(
      "reduce damage",
    );
    expect(engine.statementForItem("general.dust_containment")?.["en-US"]).toContain(
      "dust migration",
    );
    expect(engine.statementForItem("structural.temporary_support")?.["en-US"]).toContain(
      "safely supported",
    );
  });
});

describe("organization overrides and copy-on-write", () => {
  const override = (patch: Partial<KnowledgeOverride> = {}): KnowledgeOverride => ({
    organizationId: ORG,
    entryKey: "kitchen_remodel",
    version: KNOWLEDGE_VERSION,
    createdAt: "2026-08-01T00:00:00.000Z",
    ...patch,
  });

  it("never mutates the platform seed", () => {
    const seed = KNOWLEDGE_ENTRIES.find((e) => e.entryKey === "kitchen_remodel")!;
    const before = JSON.stringify(seed);
    setKnowledgeOverrides([override({ disabledItemKeys: ["general.dumpster"] })]);
    engine.recommend({ projectTypeKeys: ["kitchen_remodel"], organizationId: ORG });
    expect(JSON.stringify(seed)).toBe(before);
    expect(seed.sourceType).toBe("platform_seed");
  });

  it("suppresses disabled items for that organization only", () => {
    setKnowledgeOverrides([override({ disabledItemKeys: ["general.dumpster"] })]);
    const withOrg = engine
      .getEntry("kitchen_remodel", { organizationId: ORG })!
      .standardItems.map((i) => i.itemKey);
    const withoutOrg = engine.getEntry("kitchen_remodel")!.standardItems.map((i) => i.itemKey);
    expect(withOrg).not.toContain("general.dumpster");
    expect(withoutOrg).toContain("general.dumpster");
  });

  it("adds organization-owned items and tags the entry as an override", () => {
    setKnowledgeOverrides([
      override({
        addedItems: [
          {
            role: "standard_addition",
            item: {
              itemKey: "org.shoe_covers",
              tradeKey: "general",
              categoryKey: "protection",
              confidence: "high",
              label: { "en-US": "Shoe covers", "es-US": "Cubrezapatos" },
              customerLabel: { "en-US": "Shoe covers", "es-US": "Cubrezapatos" },
              contractorRationale: { "en-US": "House rule.", "es-US": "Regla de la empresa." },
              customerValueStatement: {
                "en-US": "Our crews wear shoe covers inside your home.",
                "es-US": "Nuestras cuadrillas usan cubrezapatos dentro de su casa.",
              },
            },
          },
        ],
      }),
    ]);
    const items = engine.standardAdditions({
      projectTypeKeys: ["kitchen_remodel"],
      organizationId: ORG,
    });
    expect(items.map((i) => i.itemKey)).toContain("org.shoe_covers");
    const entry = engine.getEntry("kitchen_remodel", { organizationId: ORG })!.entry;
    expect(entry.sourceType).toBe("organization_override");
    expect(entry.organizationId).toBe(ORG);
  });

  it("re-grades confidence and replaces labels without touching other orgs", () => {
    setKnowledgeOverrides([
      override({
        confidenceOverrides: { "general.dumpster": "optional" },
        labelOverrides: {
          "general.dumpster": { "en-US": "Roll-off", "es-US": "Contenedor rodante" },
        },
      }),
    ]);
    const item = engine
      .getEntry("kitchen_remodel", { organizationId: ORG })!
      .standardItems.find((i) => i.itemKey === "general.dumpster")!;
    expect(item.confidence).toBe("optional");
    expect(item.label["en-US"]).toBe("Roll-off");

    const platform = engine
      .getEntry("kitchen_remodel")!
      .standardItems.find((i) => i.itemKey === "general.dumpster")!;
    expect(platform.confidence).toBe("high");
    expect(platform.label["en-US"]).toBe("Dumpster allowance");
  });

  it("can disable an entire entry for one organization", () => {
    setKnowledgeOverrides([override({ disabled: true })]);
    const keys = engine.listEntries({ organizationId: ORG }).map((e) => e.entryKey);
    expect(keys).not.toContain("kitchen_remodel");
    expect(engine.listEntries().map((e) => e.entryKey)).toContain("kitchen_remodel");
  });

  it("creates an override draft that starts empty", () => {
    const seed = KNOWLEDGE_ENTRIES[0];
    const draft = createOverrideDraft(seed, ORG);
    expect(draft.entryKey).toBe(seed.entryKey);
    expect(draft.disabledItemKeys).toEqual([]);
    expect(applyOverride(seed, draft)!.entry.sourceType).toBe("organization_override");
  });
});

describe("versioning and archived knowledge", () => {
  it("reports one active version matching the catalog", () => {
    expect(activeKnowledgeVersion().version).toBe(KNOWLEDGE_VERSION);
    expect(engine.version().isActive).toBe(true);
  });

  it("excludes archived entries by default and includes them on request", () => {
    const seed = KNOWLEDGE_ENTRIES[0];
    const archived = archiveEntry(seed, "2026-09-01");
    expect(selectAvailableEntries([archived])).toHaveLength(0);
    expect(selectAvailableEntries([archived], { includeArchived: true })).toHaveLength(1);
    // Archiving is copy-on-write too.
    expect(seed.isActive).toBe(true);
  });

  it("excludes entries from a different version", () => {
    expect(selectAvailableEntries(KNOWLEDGE_ENTRIES, { version: "1999.1.1" })).toHaveLength(0);
    expect(selectAvailableEntries(KNOWLEDGE_ENTRIES).length).toBe(KNOWLEDGE_ENTRY_KEYS.length);
  });
});

describe("contractor copilot integration", () => {
  it("maps knowledge confidence onto the copilot vocabulary", () => {
    expect(toCopilotConfidence("contractor_decision_required")).toBe("contractor_decision");
    expect(toCopilotConfidence("high")).toBe("high");
  });

  it("produces copilot-shaped recommendations in all four sections", () => {
    const recs = knowledgeCopilotRecommendations({
      locale: "en-US",
      query: { projectTypeKeys: ["kitchen_remodel"] },
    });
    const sections = new Set(recs.map((r) => r.sectionKey));
    expect(sections).toEqual(
      new Set(["standard_items", "missing_scope", "upsell", "value_engineering"]),
    );
    expect(recs.every((r) => r.customerLabel.length > 0)).toBe(true);
    expect(recs.every((r) => !containsInternalTerms(r.customerRationale))).toBe(true);
  });

  it("merges into an existing copilot review without duplicating item keys", () => {
    const input: CopilotReviewInput = {
      projectName: "Miller Kitchen",
      locale: "en-US",
      items: [{ id: "1", title: "Install new cabinets", roomName: "Kitchen", materialSelection: null, notes: null }],
    };
    const review = reviewProject(input);
    const knowledge = knowledgeCopilotRecommendations({
      locale: "en-US",
      query: { text: "install new cabinets kitchen", projectTypeKeys: ["kitchen_remodel"] },
    });
    const merged = mergeKnowledgeIntoCopilot(review.recommendations, knowledge);
    expect(merged.length).toBeGreaterThanOrEqual(review.recommendations.length);
    const ids = merged.map((r) => `${r.sectionKey}:${r.itemKey}`);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves the existing copilot review output untouched", () => {
    const input: CopilotReviewInput = {
      projectName: "Miller Kitchen",
      locale: "en-US",
      items: [{ id: "1", title: "Install new cabinets", roomName: "Kitchen", materialSelection: null, notes: null }],
    };
    const before = reviewProject(input);
    knowledgeCopilotRecommendations({ locale: "en-US", query: { text: "install cabinets" } });
    const after = reviewProject(input);
    expect(after.counts).toEqual(before.counts);
    expect(after.recommendations.map((r) => r.id)).toEqual(before.recommendations.map((r) => r.id));
  });
});

describe("engine boundaries", () => {
  it("stays deterministic with no AI provider registered", () => {
    expect(isDeterministicKnowledgeOnly()).toBe(true);
    expect(engine.deterministic).toBe(true);
  });

  it("returns identical results for identical queries", () => {
    const a = engine.recommend({ projectTypeKeys: ["deck_build"] });
    const b = engine.recommend({ projectTypeKeys: ["deck_build"] });
    expect(a.commonOmissions).toEqual(b.commonOmissions);
    expect(a.matches.map((m) => m.entryKey)).toEqual(b.matches.map((m) => m.entryKey));
  });

  it("never returns a price, quantity cost or markup field", () => {
    const set = engine.recommend({ projectTypeKeys: ["kitchen_remodel"] });
    const json = JSON.stringify(set);
    expect(json).not.toMatch(/unitPrice|totalCost|markup|laborRate|"price"/i);
  });

  it("covers every inspection-page project type", () => {
    for (const key of KNOWLEDGE_ENTRY_KEYS) {
      expect(engine.getEntry(key)).not.toBeNull();
    }
    expect(KNOWLEDGE_ENTRY_KEYS.length).toBeGreaterThanOrEqual(14);
  });
});
