/**
 * SEQUENTIAL MULTI-PROJECT ISOLATION.
 *
 * Five different jobs are scoped one after another in the SAME module session.
 * Each assertion proves the current project's questions/measurements come only
 * from its own scope, and that nothing from the previous project survived.
 */

import { describe, expect, it } from "vitest";
import { QUICK_BALLPARK_SCHEMA } from "@/domains/ballpark/questions";
import {
  buildCurrentProjectScopeContext,
  type CurrentProjectScopeContext,
  guardAssumptions,
  guardMeasurementFields,
  guardPricedItems,
  guardQuestions,
  type ProjectEvidence,
} from "@/domains/workScope";

const build = (evidence: ProjectEvidence): CurrentProjectScopeContext =>
  buildCurrentProjectScopeContext(evidence, QUICK_BALLPARK_SCHEMA);

const ids = (context: CurrentProjectScopeContext) => context.questions.map((q) => q.id);

const PROJECTS: Array<{
  name: string;
  evidence: ProjectEvidence;
  expectDomains: string[];
  expectQuestions: string[];
  forbidQuestions: string[];
  expectMeasurements: string[];
  forbidMeasurements: string[];
}> = [
  {
    name: "Garage Conversion",
    evidence: {
      projectId: "p-garage",
      projectName: "Garage Conversion",
      scopeItems: [
        { key: "garage.convert", title: "Convert garage to living space", tradeKey: "framing" },
        { key: "drywall.hang", title: "Hang and finish drywall", tradeKey: "drywall" },
        { key: "insulation.walls", title: "Insulate walls", tradeKey: "insulation" },
        { key: "openings.door", title: "New entry door", tradeKey: "doors_windows" },
      ],
    },
    expectDomains: ["room_conversion", "drywall", "insulation", "openings"],
    expectQuestions: ["lengthFt", "widthFt", "ceilingHeightFt", "partitions", "newDoors"],
    forbidQuestions: ["cabinetRunFt", "plantingStockSize", "beamSpanFt"],
    expectMeasurements: ["lengthFt", "widthFt", "ceilingHeightFt", "interiorPartitionLf", "doors"],
    forbidMeasurements: [],
  },
  {
    name: "Cabinet Install",
    evidence: {
      projectId: "p-cabinets",
      projectName: "Kitchen Cabinets",
      scopeItems: [
        { key: "cab.base", title: "Install base cabinets", tradeKey: "cabinetry", quantity: 7.8, unitKey: "lf" },
        { key: "cab.upper", title: "Install upper cabinets", tradeKey: "cabinetry", quantity: 7.8, unitKey: "lf" },
        { key: "counter.top", title: "Countertop", tradeKey: "countertops", quantity: 7.8, unitKey: "lf" },
        { key: "elec.receptacle", title: "Relocate one receptacle", tradeKey: "electrical" },
      ],
      knownFacts: { finishLevel: "economy", cabinetRunFt: 7.8 },
    },
    expectDomains: ["cabinets", "countertops", "electrical"],
    expectQuestions: ["electrical", "counterMaterial"],
    forbidQuestions: [
      "lengthFt",
      "widthFt",
      "ceilingHeightFt",
      "partitions",
      "newDoors",
      "newWindows",
      "raisedFloor",
      "useOfSpace",
      "flooringQuality",
      "plantingStockSize",
      "beamSpanFt",
    ],
    expectMeasurements: [],
    forbidMeasurements: ["lengthFt", "widthFt", "ceilingHeightFt", "interiorPartitionLf", "doors", "windows"],
  },
  {
    name: "Plumbing Fixture / Rough-in",
    evidence: {
      projectId: "p-plumbing",
      projectName: "Fixture replacement",
      scopeItems: [
        { key: "plb.sink", title: "Set new sink and faucet", tradeKey: "plumbing" },
        { key: "plb.toilet", title: "Set new toilet", tradeKey: "plumbing" },
        { key: "plb.shower", title: "Set shower valve and trim", tradeKey: "plumbing" },
        { key: "plb.rough", title: "New supply and waste pipe runs", tradeKey: "plumbing" },
      ],
    },
    expectDomains: ["plumbing"],
    expectQuestions: ["fixtureCount", "pipeRunLf", "pipeMaterial", "plumbingAccess"],
    forbidQuestions: [
      "flooringQuality",
      "cabinetRunFt",
      "counterMaterial",
      "lengthFt",
      "widthFt",
      "ceilingHeightFt",
      "partitions",
      "newDoors",
      "newWindows",
      "plantingStockSize",
      "beamSpanFt",
    ],
    expectMeasurements: [],
    forbidMeasurements: ["lengthFt", "widthFt", "ceilingHeightFt", "interiorPartitionLf", "doors", "windows"],
  },
  {
    name: "Tree Planting",
    evidence: {
      projectId: "p-trees",
      projectName: "Front yard tree planting",
      narrativeText:
        "Plant three 15-gallon oak trees in the front yard.\nAuger holes, amend backfill soil, stake each tree and haul away spoils.",
    },
    expectDomains: ["planting", "excavation"],
    expectQuestions: ["plantingStockSize", "plantingAccess", "soilConditions", "proximityRisk", "spoilsDisposal"],
    forbidQuestions: [
      "lengthFt",
      "widthFt",
      "ceilingHeightFt",
      "cabinetRunFt",
      "counterMaterial",
      "bathFixtureScope",
      "flooringQuality",
      "fixtureCount",
      "pipeRunLf",
      "newDoors",
      "newWindows",
      "partitions",
    ],
    expectMeasurements: [],
    forbidMeasurements: ["lengthFt", "widthFt", "ceilingHeightFt", "interiorPartitionLf", "doors", "windows"],
  },
  {
    name: "LVL / Bookcase Structural",
    evidence: {
      projectId: "p-lvl",
      projectName: "Living room opening",
      scopeItems: [
        { key: "demo.wall", title: "Demo interior closet wall", tradeKey: "carpentry", description: "selective demolition" },
        { key: "struct.lvl", title: "Install LVL beam and posts", tradeKey: "structural" },
        { key: "carp.bookcase", title: "Build flanking bookcases and columns", tradeKey: "millwork", description: "finish carpentry built-ins" },
        { key: "dw.patch", title: "Patch ceiling and wall drywall", tradeKey: "drywall" },
        { key: "paint.room", title: "Paint patched areas", tradeKey: "painting" },
      ],
    },
    expectDomains: ["structure", "demolition", "finish_carpentry", "drywall", "paint"],
    expectQuestions: ["beamSpanFt", "bearingCondition", "temporaryShoring", "demoExtent", "builtInLengthFt", "patchScope"],
    forbidQuestions: [
      "cabinetRunFt",
      "counterMaterial",
      "plantingStockSize",
      "flooringQuality",
      "bathFixtureScope",
      "useOfSpace",
      "partitions",
      "spoilsDisposal",
    ],
    expectMeasurements: ["ceilingHeightFt"],
    forbidMeasurements: ["interiorPartitionLf", "doors", "windows", "floorWastePct"],
  },
  {
    name: "Bathroom Remodel",
    evidence: {
      projectId: "p-bath",
      projectName: "Hall bath remodel",
      narrativeText:
        "Gut the hall bathroom. Replace tub with a tiled shower including waterproofing.\nNew vanity, toilet and exhaust fan. Re-tile floor and walls.",
    },
    expectDomains: ["bath", "tile", "waterproofing", "plumbing"],
    expectQuestions: ["bathFixtureScope", "showerWaterproofing", "plumbing"],
    forbidQuestions: [
      "plantingStockSize",
      "soilConditions",
      "proximityRisk",
      "beamSpanFt",
      "bearingCondition",
      "useOfSpace",
    ],
    /* Floor and wall tile IS area work, so room dimensions are legitimate. */
    expectMeasurements: ["lengthFt", "widthFt"],
    forbidMeasurements: ["interiorPartitionLf", "doors", "windows"],
  },
];

describe("sequential multi-project scope isolation", () => {
  const seen: CurrentProjectScopeContext[] = [];

  for (const project of PROJECTS) {
    it(`${project.name}: derives questions and measurements from its own scope only`, () => {
      const context = build(project.evidence);
      seen.push(context);

      for (const domain of project.expectDomains) {
        expect(context.domains, `${project.name} domains`).toContain(domain);
      }
      for (const id of project.expectQuestions) {
        expect(ids(context), `${project.name} expects ${id}`).toContain(id);
      }
      for (const id of project.forbidQuestions) {
        expect(ids(context), `${project.name} must not ask ${id}`).not.toContain(id);
      }
      for (const field of project.expectMeasurements) {
        expect(context.measurementFields, `${project.name} measurement ${field}`).toContain(field);
      }
      for (const field of project.forbidMeasurements) {
        expect(
          context.measurementFields,
          `${project.name} must not measure ${field}`,
        ).not.toContain(field);
      }

      /* Every question is traceable to current evidence. */
      for (const provenance of context.questionProvenance) {
        expect(provenance.reason.length, `${provenance.questionId} needs a reason`).toBeGreaterThan(0);
        expect(provenance.affects.length).toBeGreaterThan(0);
      }
    });
  }

  it("carries nothing between projects run in the same session", () => {
    expect(seen).toHaveLength(PROJECTS.length);
    const [garage, cabinets, plumbing, trees, lvl, bath] = seen;

    /* A plumbing job never inherits cabinet or garage work. */
    expect(ids(plumbing)).not.toContain("cabinetRunFt");
    expect(ids(plumbing)).not.toContain("lengthFt");
    expect(plumbing.measurementFields).toHaveLength(0);
    expect(plumbing.domains).not.toContain("flooring");
    expect(plumbing.domains).not.toContain("paint");

    /* And the plumbing questions do not survive into later jobs. */
    expect(ids(trees)).not.toContain("pipeRunLf");
    expect(ids(lvl)).not.toContain("fixtureCount");

    /* Cabinets never inherit garage room geometry. */
    expect(ids(cabinets)).not.toContain("lengthFt");
    expect(cabinets.measurementFields).toHaveLength(0);
    expect(garage.measurementFields).toContain("lengthFt");

    /* Trees never inherit cabinet or kitchen work. */
    expect(ids(trees).some((id) => /cabinet|counter/i.test(id))).toBe(false);
    expect(trees.domains).not.toContain("cabinets");
    expect(trees.domains).not.toContain("kitchen");

    /* LVL job never inherits tree or kitchen questions. */
    expect(ids(lvl)).not.toContain("plantingStockSize");
    expect(ids(lvl)).not.toContain("cabinetRunFt");
    expect(lvl.measurementFields).not.toContain("lengthFt");

    /* Bath never inherits tree/LVL work. */
    expect(ids(bath)).not.toContain("soilConditions");
    expect(ids(bath)).not.toContain("beamSpanFt");
    /* A vanity IS cabinetry, so cabinet questions are legitimate here. */
    expect(bath.domains).toContain("cabinets");
    expect(bath.domains).not.toContain("planting");
  });

  it("known facts are not re-asked", () => {
    const cabinets = build(PROJECTS[1].evidence);
    expect(cabinets.unresolved.map((q) => q.id)).not.toContain("finishLevel");
    expect(cabinets.knownQuantities.map((q) => q.quantity)).toContain(7.8);
  });

  it("a novel scope derives its own domains instead of a garage/kitchen default", () => {
    const novel = build({
      projectId: "p-novel",
      projectName: "Backyard studio pad and shed",
      narrativeText:
        "Excavate and pour a concrete pad for a prefab shed.\nRun a subpanel circuit out to it and plant a hedge along the fence.",
    });
    expect(novel.domains).toEqual(
      expect.arrayContaining(["excavation", "concrete", "electrical", "planting"]),
    );
    expect(novel.domains).not.toContain("room_conversion");
    expect(novel.domains).not.toContain("cabinets");
    expect(ids(novel)).toContain("plantingAccess");
    expect(ids(novel)).not.toContain("useOfSpace");
  });

  it("an unscoped project asks one broad clarifier, never a garage default", () => {
    const empty = build({ projectId: "p-empty" });
    expect(empty.isEmpty).toBe(true);
    expect(empty.needsScopeClarifier).toBe(true);
    expect(ids(empty)).toEqual(["scopeClarifier"]);
    expect(empty.measurementFields).toHaveLength(0);
  });

  it("a second novel job (dock + boat lift electrical) derives its own domains", () => {
    const novel = build({
      projectId: "p-dock",
      projectName: "Waterfront work",
      narrativeText:
        "Demo the rotted dock decking and replace the framing and decking boards.\nRun a new circuit to the boat lift and repaint the handrail.",
    });
    expect(novel.needsScopeClarifier).toBe(false);
    expect(novel.domains).toEqual(expect.arrayContaining(["demolition", "electrical", "paint"]));
    expect(novel.domains).not.toContain("room_conversion");
    expect(novel.domains).not.toContain("cabinets");
    expect(ids(novel)).not.toContain("useOfSpace");
    expect(ids(novel)).not.toContain("cabinetRunFt");
  });

  it("the runtime guard rejects anything untraceable to the current scope", () => {
    const trees = build(PROJECTS[3].evidence);
    const questions = guardQuestions(trees, [
      { id: "plantingAccess" },
      { id: "cabinetRunFt" },
      { id: "finishLevel" },
      { id: "totallyMadeUp" },
    ]);
    expect(questions.allowed.map((q) => q.id)).toEqual(["plantingAccess", "finishLevel"]);
    expect(questions.rejected.map((r) => r.id)).toEqual(["cabinetRunFt", "totallyMadeUp"]);

    const fields = guardMeasurementFields(trees, ["lengthFt", "ceilingHeightFt"]);
    expect(fields.allowed).toHaveLength(0);

    const assumptions = guardAssumptions(trees, [
      { key: "sinkCutout", questionId: "counterMaterial" },
      { key: "markup" },
    ]);
    expect(assumptions.allowed.map((a) => a.key)).toEqual(["markup"]);

    const lines = guardPricedItems(trees, [
      { id: "plant-1", domain: "planting" as const },
      { id: "cab-1", domain: "cabinets" as const },
      { id: "permit" },
    ]);
    expect(lines.allowed.map((l) => l.id)).toEqual(["plant-1", "permit"]);
    expect(lines.rejected.map((l) => l.id)).toEqual(["cab-1"]);
  });
});
