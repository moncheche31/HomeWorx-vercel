import { describe, expect, it } from "vitest";
import {
  ONTOLOGY,
  evaluateWorkCandidate,
  matchSubject,
  ontologyCoverageByTrade,
  subjectForFeatureKey,
  unitFamilyCompatible,
  dependenciesFor,
} from "@/domains/remoteVision/ontology";
import { FEATURE_ASSEMBLY_MAP } from "@/domains/remoteVision/featureAssembly";
import { LABOR_TRADES } from "@/domains/estimating/tradeTaxonomy";

describe("construction ontology", () => {
  it("maps every subject feature key onto a real canonical assembly", () => {
    for (const subject of ONTOLOGY) {
      if (!subject.featureKey) continue;
      expect(
        FEATURE_ASSEMBLY_MAP[subject.featureKey],
        `${subject.subjectKey} -> ${subject.featureKey}`,
      ).toBeTruthy();
    }
  });

  it("assigns every subject a real trade and unit family", () => {
    for (const subject of ONTOLOGY) {
      expect(LABOR_TRADES).toContain(subject.tradeKey);
      expect(["linear", "area", "count", "volume"]).toContain(subject.unitFamily);
      expect(subject.actions.length).toBeGreaterThan(0);
      expect(subject.aliases.length).toBeGreaterThan(0);
    }
  });

  it("covers the breadth of residential trades", () => {
    const coverage = ontologyCoverageByTrade();
    for (const trade of [
      "general_conditions",
      "demolition",
      "framing",
      "drywall",
      "painting",
      "flooring",
      "tile",
      "finish_carpentry",
      "plumbing",
      "electrical",
      "hvac",
      "insulation",
      "roofing",
      "exterior",
      "sitework_concrete",
      "specialty",
    ]) {
      expect(coverage[trade] ?? 0, trade).toBeGreaterThan(0);
    }
  });

  describe("action + object + context semantics", () => {
    const cases: Array<[string, string, boolean]> = [
      ["specialty.appliance", "the closets are on the backside of that range hood", false],
      ["specialty.appliance", "install a new range hood over the cooktop", true],
      // Painting cabinets is Painting work, never a cabinetry install.
      ["carpentry.cabinets", "paint the cabinets", false],
      ["paint.interior", "paint the cabinets", true],

      ["carpentry.trim", "use paint-grade trim for the built-ins", false],
      ["flooring.finish", "see the floor plan for the layout", false],
      ["flooring.finish", "install new flooring in the living room", true],
      ["sitework.concrete", "mid-grade finishes throughout", false],
      ["carpentry.countertop", "keep everything at countertop level", false],
      ["demo.wall", "the wall behind the refrigerator stays", false],
      ["demo.wall", "remove six feet of wall", true],
    ];

    for (const [subjectKey, phrase, expected] of cases) {
      it(`${expected ? "creates" : "does not create"} work: "${phrase}"`, () => {
        const subject = ONTOLOGY.find((s) => s.subjectKey === subjectKey);
        expect(subject).toBeTruthy();
        expect(evaluateWorkCandidate(subject!, phrase).createsWork).toBe(expected);
      });
    }

    it("paint verb routes to painting and install verb routes to cabinetry", () => {
      const cabinets = ONTOLOGY.find((s) => s.subjectKey === "carpentry.cabinets")!;
      expect(evaluateWorkCandidate(cabinets, "install cabinets").action).toBe("install");
      const paint = ONTOLOGY.find((s) => s.subjectKey === "paint.interior")!;
      expect(evaluateWorkCandidate(paint, "paint the cabinets").action).toBe("paint");
      expect(evaluateWorkCandidate(paint, "paint-grade trim").createsWork).toBe(false);
    });
  });

  it("binds measurements only to compatible unit families", () => {
    const beam = ONTOLOGY.find((s) => s.subjectKey === "structure.lvl_beam")!;
    const post = ONTOLOGY.find((s) => s.subjectKey === "structure.post")!;
    expect(unitFamilyCompatible(beam, "linear")).toBe(true);
    // 26 linear feet can never bind to a counted post subject.
    expect(unitFamilyCompatible(post, "linear")).toBe(false);
    expect(unitFamilyCompatible(post, "count")).toBe(true);
    // A room's square footage can never bind to shower tile without its own evidence.
    const tile = ONTOLOGY.find((s) => s.subjectKey === "tile.wet_area")!;
    expect(unitFamilyCompatible(tile, "linear")).toBe(false);
  });

  it("knows a beam requires bearing posts but only guesses at shoring", () => {
    const required = dependenciesFor("structure.lvl_beam", ["required"]);
    expect(required.map((d) => d.subjectKey)).toContain("structure.post");
    const unknown = dependenciesFor("demo.wall", ["unknown"]);
    expect(unknown.map((d) => d.subjectKey)).toContain("structure.temporary_support");
  });

  it("resolves subjects from free text and from feature keys", () => {
    expect(matchSubject("double LVL over the opening")?.subjectKey).toBe("structure.lvl_beam");
    expect(subjectForFeatureKey("structural.column")?.subjectKey).toBe("structure.post");
  });
});
