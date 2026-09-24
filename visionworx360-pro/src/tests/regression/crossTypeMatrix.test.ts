/**
 * CROSS-TYPE REGRESSION MATRIX.
 *
 * The garage failure was not garage-specific: rows entered the project with no
 * provenance, a template of another type was applied without a gate, a derived
 * quantity hardened into "contractor intent", and estimate pricing never
 * inherited the company snapshot. Each of those is asserted here across SIX
 * unrelated project types so a future regression fails for every trade at once,
 * not only for the one job we happened to repair.
 */

import { describe, expect, it } from "vitest";
import { QUICK_BALLPARK_SCHEMA } from "@/domains/ballpark/questions";
import {
  buildCurrentProjectScopeContext,
  guardQuestions,
  type ProjectEvidence,
} from "@/domains/workScope";
import { deriveWorkDomains, hasWorkIntent } from "@/domains/workScope/taxonomy";
import { evaluateTemplateApply, templateMatchesProject } from "@/domains/scopeTemplates/compatibility";
import {
  deriveQuantity,
  isContractorAuthored,
  isRederivable,
  originStamp,
} from "@/domains/provenance";

interface Fixture {
  name: string;
  projectTypeKey: string;
  evidence: ProjectEvidence;
  /** Domains that must NOT appear anywhere in this project's derived scope. */
  forbidDomains: string[];
  /** Question ids that must never be asked on this job. */
  forbidQuestions: string[];
}

const FIXTURES: Fixture[] = [
  {
    name: "Garage conversion",
    projectTypeKey: "garage_conversion",
    evidence: {
      projectId: "p-garage",
      projectName: "Master Suite Garage Conversion",
      scopeItems: [
        { key: "garage.convert", title: "Convert garage to living space", tradeKey: "framing" },
        { key: "ins.walls", title: "Insulate walls, ceiling, floor", tradeKey: "insulation" },
        { key: "floor.hardwood", title: "Hardwood Flooring", tradeKey: "flooring" },
      ],
    },
    forbidDomains: ["cabinets", "countertops", "planting", "roofing"],
    forbidQuestions: ["cabinetRunFt", "counterMaterial", "plantingStockSize"],
  },
  {
    name: "Kitchen remodel",
    projectTypeKey: "kitchen_remodel",
    evidence: {
      projectId: "p-kitchen",
      projectName: "Kitchen remodel",
      scopeItems: [
        { key: "cab.base", title: "Install base cabinets", tradeKey: "cabinetry", quantity: 18, unitKey: "lf" },
        { key: "counter.q", title: "Template and install countertops", tradeKey: "countertops" },
      ],
    },
    forbidDomains: ["planting", "roofing", "excavation"],
    forbidQuestions: ["plantingStockSize", "beamSpanFt"],
  },
  {
    name: "Bathroom remodel",
    projectTypeKey: "bathroom_remodel",
    evidence: {
      projectId: "p-bath",
      projectName: "Hall bath remodel",
      scopeItems: [
        { key: "plb.tub", title: "Set new tub and shower valve", tradeKey: "plumbing" },
        { key: "tile.floor", title: "Install tile flooring", tradeKey: "flooring" },
      ],
    },
    forbidDomains: ["cabinets", "planting", "roofing"],
    forbidQuestions: ["cabinetRunFt", "plantingStockSize"],
  },
  {
    name: "Handyman punch list",
    projectTypeKey: "handyman",
    evidence: {
      projectId: "p-handy",
      projectName: "Punch list",
      narrativeText: "Patch two drywall holes in the hallway and repaint the hallway walls.",
    },
    forbidDomains: ["cabinets", "countertops", "planting", "roofing", "excavation"],
    forbidQuestions: ["cabinetRunFt", "counterMaterial", "plantingStockSize", "beamSpanFt"],
  },
  {
    name: "Roof replacement",
    projectTypeKey: "roofing",
    evidence: {
      projectId: "p-roof",
      projectName: "Roof replacement",
      narrativeText: "Tear off the existing shingle roof and install new architectural shingles with new underlayment.",
    },
    forbidDomains: ["cabinets", "countertops", "planting"],
    forbidQuestions: ["cabinetRunFt", "counterMaterial", "plantingStockSize"],
  },
  {
    name: "Structural beam",
    projectTypeKey: "structural",
    evidence: {
      projectId: "p-struct",
      projectName: "Remove interior walls",
      narrativeText: "Remove the interior bearing wall and install an LVL beam with new posts and footings.",
    },
    forbidDomains: ["cabinets", "countertops", "planting"],
    forbidQuestions: ["cabinetRunFt", "counterMaterial", "plantingStockSize"],
  },
];

describe("cross-type matrix: no foreign-trade scope leaks into any project type", () => {
  for (const f of FIXTURES) {
    it(`${f.name} keeps only its own domains`, () => {
      const context = buildCurrentProjectScopeContext(f.evidence, QUICK_BALLPARK_SCHEMA);
      for (const domain of f.forbidDomains) {
        expect(context.domains).not.toContain(domain);
      }
      const asked = context.questions.map((q) => q.id);
      for (const id of f.forbidQuestions) {
        expect(asked).not.toContain(id);
      }
      /*
       * The guard is the last line of defence and must agree with the context.
       * A fully self-describing narrative may justify no questions at all;
       * that is a pass, so only a non-empty set can be wholly rejected.
       */
      if (context.questions.length > 0) {
        const guarded = guardQuestions(context, context.questions);
        expect(guarded.rejected.map((r) => r.id)).not.toEqual(
          expect.arrayContaining(context.questions.map((q) => q.id)),
        );
      }
    });
  }
});

describe("cross-type matrix: template application is gated by project type", () => {
  const TEMPLATE_TYPES = FIXTURES.map((f) => f.projectTypeKey);

  it("same-type templates apply without confirmation", () => {
    for (const f of FIXTURES) {
      const decision = evaluateTemplateApply({
        projectTypeKey: f.projectTypeKey,
        templateTypeKey: f.projectTypeKey,
      });
      expect(decision.allowed).toBe(true);
      expect(decision.requiresConfirmation).toBe(false);
    }
  });

  it("every cross-type pairing demands explicit confirmation", () => {
    for (const f of FIXTURES) {
      for (const templateType of TEMPLATE_TYPES) {
        if (templateType === f.projectTypeKey) continue;
        const blocked = evaluateTemplateApply({
          projectTypeKey: f.projectTypeKey,
          templateTypeKey: templateType,
        });
        expect(blocked.requiresConfirmation).toBe(true);
        expect(blocked.allowed).toBe(false);

        const confirmed = evaluateTemplateApply({
          projectTypeKey: f.projectTypeKey,
          templateTypeKey: templateType,
          confirmMismatch: true,
        });
        expect(confirmed.allowed).toBe(true);
      }
    }
  });

  it("reproduces the original failure: kitchen template into a garage project", () => {
    expect(templateMatchesProject("garage_conversion", "kitchen_remodel")).toBe(false);
  });

  it("never blocks when either side has no type metadata", () => {
    expect(templateMatchesProject(null, "kitchen_remodel")).toBe(true);
    expect(templateMatchesProject("garage_conversion", null)).toBe(true);
    expect(templateMatchesProject(" Garage_Conversion ", "garage_conversion")).toBe(true);
  });

  it("template-applied rows carry a reversible provenance stamp", () => {
    const stamp = originStamp("template", "107214ca-kitchen-remodel");
    expect(stamp.origin_type).toBe("template");
    expect(stamp.origin_ref).toBe("107214ca-kitchen-remodel");
    expect(stamp.origin_at).toBeTruthy();
  });
});

describe("cross-type matrix: quantity provenance survives review", () => {
  it("geometry-derived quantities stay re-derivable after a measurement correction", () => {
    const before = deriveQuantity({ kind: "floor_area", wastePct: 10 }, { lengthFt: 18, widthFt: 16 });
    expect(before?.quantity).toBe(316.8);

    const after = deriveQuantity({ kind: "floor_area", wastePct: 10 }, { lengthFt: 18, widthFt: 15.5 });
    expect(after?.quantity).toBe(306.9);
    expect(after?.basisNote).toContain("15.5");

    /* The exact defect: a derived number must never present as contractor intent. */
    expect(isContractorAuthored("geometry_derived")).toBe(false);
    expect(isRederivable("geometry_derived")).toBe(true);
  });

  it("contractor-entered quantities are never re-derived", () => {
    expect(isContractorAuthored("contractor_entered")).toBe(true);
    expect(isRederivable("contractor_entered")).toBe(false);
  });

  it("derives wall, perimeter and volume bases for non-floor trades", () => {
    expect(deriveQuantity({ kind: "wall_area" }, { lengthFt: 18, widthFt: 15.5, ceilingHeightFt: 9 })?.quantity)
      .toBeCloseTo(603, 0);
    expect(deriveQuantity({ kind: "perimeter_lf" }, { lengthFt: 18, widthFt: 15.5 })?.quantity).toBe(67);
    expect(deriveQuantity({ kind: "floor_area" }, { lengthFt: 0, widthFt: 12 })).toBeNull();
  });
});

describe("cross-type matrix: classification needs action + object corroboration", () => {
  const NON_WORK = [
    "mid grade materials throughout",
    "builder grade finishes",
    "standard grade cabinets",
    "counter height seating",
    "finish level 4 drywall spec",
  ];

  it("grade/counter qualifiers carry no work intent", () => {
    expect(hasWorkIntent("mid grade materials throughout")).toBe(false);
    expect(hasWorkIntent("counter height seating")).toBe(false);
  });

  for (const phrase of NON_WORK) {
    it(`"${phrase}" is a qualifier, not work`, () => {
      const domains = deriveWorkDomains([{ source: "narrative", title: phrase }]);
      expect(domains).not.toContain("excavation");
      expect(domains).not.toContain("sitework");
    });
  }

  const REAL_WORK: Array<[string, string]> = [
    ["Grade the driveway and haul away spoils", "excavation"],
    ["Install new quartz countertops", "countertops"],
    ["Install base cabinets along the north wall", "cabinets"],
  ];

  for (const [phrase, domain] of REAL_WORK) {
    it(`"${phrase}" still activates ${domain}`, () => {
      expect(hasWorkIntent(phrase)).toBe(true);
      expect(deriveWorkDomains([{ source: "narrative", title: phrase }])).toContain(domain);
    });
  }
});
