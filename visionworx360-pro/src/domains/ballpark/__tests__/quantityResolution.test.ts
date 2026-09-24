import { describe, expect, it } from "vitest";

import {
  EMPTY_GEOMETRY_FACTS,
  geometryFactsFrom,
  geometryFactsFromSnapshot,
  resolveBallparkScope,
} from "../quantityResolution";
import { recalculateBallparkFromScope, type RecalcScopeItem } from "../scopeRecalc";

/**
 * An 18 x 16 garage with a 12 ft ceiling: the geometry a contractor already
 * gave the app. A ballpark must price the whole conversion from it without
 * asking for a single drywall sheet, flooring SF or baseboard LF.
 */
const GARAGE = geometryFactsFrom({
  roomId: null,
  label: "Garage",
  lengthFt: 18,
  widthFt: 16,
  ceilingHeightFt: 12,
  interiorPartitionLf: 20,
  floorWastePct: 10,
  openings: [
    { kind: "door", count: 2, widthFt: 3, heightFt: 6.83, interruptsTrim: true },
    { kind: "window", count: 2, widthFt: 3, heightFt: 4, interruptsTrim: false },
  ],
});

const item = (title: string, quantity: number | null = null, unitKey: string | null = null): RecalcScopeItem => ({
  id: title,
  title,
  quantity,
  unitKey,
  isIncluded: true,
  archivedAt: null,
});

const GARAGE_SCOPE: RecalcScopeItem[] = [
  item("Remove existing garage partition wall", null, "linear_foot"),
  item("Frame walls to code"),
  item("Insulate walls, ceiling, floor"),
  item("Hang, tape, finish drywall"),
  item("Prime and paint walls and ceilings"),
  item("Paint walls and ceilings"),
  item("Prime and paint trim"),
  item("Install/replace baseboards"),
  item("Hardwood Flooring", null, "square_foot"),
  item("Install finished flooring", null, "square_foot"),
  item("Extend HVAC to new space"),
  item("Install new shutoffs and supply lines"),
  item("New circuits, outlets, lighting", null, "each"),
  item("Add GFCI receptacles at counters"),
  item("Move and reframe 1 garage window", 1, "each"),
  item("Remove and reframe 1 large egress window", 1, "each"),
  item("Vanity 60” double sink", 1, "each"),
];

function resolve(items: readonly RecalcScopeItem[], geometry = GARAGE) {
  return resolveBallparkScope(
    items.map((i) => ({ id: i.id, title: i.title, quantity: i.quantity, unitKey: i.unitKey })),
    { geometry },
  );
}

const subjectFor = (
  resolved: ReturnType<typeof resolve>["resolved"],
  itemKey: string,
) => resolved.find((s) => s.parts.some((p) => p.itemKey === itemKey));

const partFor = (resolved: ReturnType<typeof resolve>["resolved"], itemKey: string) =>
  resolved.flatMap((s) => s.parts).find((p) => p.itemKey === itemKey);

describe("ballpark quantity resolution", () => {
  it("derives flooring, insulation, drywall, paint and trim without asking the contractor", () => {
    const { resolved, unresolved } = resolve(GARAGE_SCOPE);

    expect(unresolved).toEqual([]);
    for (const key of [
      "flooring.premium",
      "insulation.walls",
      "insulation.ceiling",
      "insulation.floor",
      "drywall.hang_finish",
      "paint.walls_ceiling",
      "trim.base",
    ]) {
      const part = partFor(resolved, key);
      expect(part, key).toBeTruthy();
      expect(part!.quantity, key).toBeGreaterThan(0);
      expect(part!.source, key).toBe("geometry");
    }
  });

  it("never asks for a drywall sheet count or drywall SF when geometry exists", () => {
    const { resolved, unresolved } = resolve([item("Hang, tape, finish drywall")]);
    expect(unresolved).toEqual([]);
    expect(partFor(resolved, "drywall.hang_finish")).toMatchObject({
      source: "geometry",
      unitKey: "square_foot",
      quantity: GARAGE.drywallSurfaceSf,
    });
  });

  it("never asks for flooring SF or baseboard LF when geometry exists", () => {
    const { resolved, unresolved } = resolve([
      item("Install new oak hardwood flooring"),
      item("Install/replace baseboards"),
    ]);
    expect(unresolved).toEqual([]);
    expect(partFor(resolved, "flooring.premium")?.quantity).toBe(GARAGE.flooringWithWasteSf);
    expect(partFor(resolved, "trim.base")?.quantity).toBe(GARAGE.trimLf);
  });

  it("resolves HVAC extension and bathroom supply lines to allowances", () => {
    const { resolved, unresolved } = resolve([
      item("Extend HVAC to new space"),
      item("Install new shutoffs and supply lines"),
    ]);
    expect(unresolved).toEqual([]);
    expect(partFor(resolved, "hvac.extension")).toMatchObject({ source: "allowance", quantity: 1 });
    expect(partFor(resolved, "plumbing.supply_lines")).toMatchObject({ source: "allowance", quantity: 1 });
  });

  it("infers one-count doors and windows as one each", () => {
    const { resolved } = resolve([
      item("Move and reframe 1 garage window"),
      item("Install 1 new entry door"),
    ]);
    expect(partFor(resolved, "window.unit")?.quantity).toBe(1);
    expect(partFor(resolved, "door.interior")?.quantity).toBe(1);
  });

  it("treats a 60 inch vanity as one vanity, never sixty", () => {
    const { resolved } = resolve([item("Vanity 60” double sink")]);
    expect(partFor(resolved, "bath.vanity")?.quantity).toBe(1);
  });

  it("consolidates overlapping flooring, paint, electrical and vanity wording", () => {
    const { resolved } = resolve(GARAGE_SCOPE);

    const flooring = resolved.filter((s) => s.family === "flooring");
    expect(flooring).toHaveLength(1);
    expect(flooring[0]!.rolledUp.length).toBeGreaterThan(0);

    expect(resolved.filter((s) => s.family === "paint.walls")).toHaveLength(1);
    expect(resolved.filter((s) => s.family === "electrical.devices")).toHaveLength(1);
    expect(resolved.filter((s) => s.family === "bath.vanity")).toHaveLength(1);
  });

  it("keeps discrete door and window work additive", () => {
    const { resolved } = resolve([
      item("Remove existing back entry door"),
      item("Cut out and frame opening for new bedroom entry door"),
    ]);
    expect(resolved.filter((s) => s.family === "door")).toHaveLength(2);
  });

  it("still reports scope it genuinely cannot resolve", () => {
    const { unresolved } = resolve([item("Fabricate custom stained glass dome")], EMPTY_GEOMETRY_FACTS);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]!.reason).toBe("noMapping");
  });

  it("reads geometry back out of a saved ballpark snapshot", () => {
    const facts = geometryFactsFromSnapshot({
      kind: "ballpark",
      originalBallpark: {
        geometry: { lengthFt: 18, widthFt: 16, ceilingHeightFt: 12, interiorPartitionLf: 20, openings: [] },
      },
    });
    expect(facts.floorAreaSf).toBe(288);
    expect(facts.ceilingHeightFt).toBe(12);
  });
});

describe("ballpark recalculation from geometry", () => {
  it("prices the garage conversion with no contractor prompts and a modest widen", () => {
    const result = recalculateBallparkFromScope(GARAGE_SCOPE, { geometry: GARAGE, laborRate: 65 });

    expect(result).not.toBeNull();
    expect(result!.unpriceable).toEqual([]);
    expect(result!.derivedCount).toBeGreaterThan(0);
    expect(result!.allowanceCount).toBeGreaterThan(0);
    expect(result!.widenPct).toBeLessThanOrEqual(18);
    expect(result!.band.low).toBeLessThan(result!.band.expected);
    expect(result!.band.expected).toBeLessThan(result!.band.high);
    /* Sanity: a garage conversion of this size is tens of thousands, not 10x that. */
    expect(result!.band.expected).toBeGreaterThan(15_000);
    expect(result!.band.expected).toBeLessThan(120_000);
  });

  it("does not scale a dimension into a quantity", () => {
    const withVanity = recalculateBallparkFromScope(GARAGE_SCOPE, { geometry: GARAGE, laborRate: 65 })!;
    const withoutVanity = recalculateBallparkFromScope(
      GARAGE_SCOPE.filter((i) => !i.title.startsWith("Vanity")),
      { geometry: GARAGE, laborRate: 65 },
    )!;
    /* One vanity, so removing it moves the number by a fixture, not by 60 of them. */
    expect(withVanity.band.expected - withoutVanity.band.expected).toBeLessThan(15_000);
  });

  it("carries every assumption with its provenance for review", () => {
    const result = recalculateBallparkFromScope(GARAGE_SCOPE, { geometry: GARAGE, laborRate: 65 })!;
    for (const assumption of result.assumptions) {
      expect(assumption.basisKey).toBeTruthy();
      expect(["explicit", "stated", "geometry", "allowance"]).toContain(assumption.source);
    }
    const drywall = result.assumptions.find((a) => a.itemKey === "drywall.hang_finish");
    expect(drywall?.basisKey).toBe("drywallSurface");
  });
});

/**
 * The exact included scope of the live Garage Conversion. A ballpark must price
 * every line of it from the saved 18 x 16 x 12 geometry, with nothing left for
 * the contractor to measure.
 */
const LIVE_GARAGE_SCOPE: RecalcScopeItem[] = [
  item("Add GFCI receptacles at counters"),
  item("Close in existing back garage entry door", null, "each"),
  item("Cut out and frame opening for new entry door to master bedroom from existing dining room", null, "each"),
  item("Extend HVAC to new space"),
  item("Frame an approximately 16' x 18' platform floor using 2 x 8 lumber and 3/4\" Advantech", 288, "square_foot"),
  item("Frame walls to code"),
  item("Hang, tape, finish drywall"),
  item("Hardwood Flooring", null, "square_foot"),
  item("Install finished flooring", null, "square_foot"),
  item("Install interior doors and trim"),
  item("Install new shutoffs and supply lines"),
  item("Install rough plumbing for bathroom fixtures", null, "each"),
  item("Install/replace baseboards"),
  item("Insulate walls, ceiling, floor"),
  item("Move and reframe 1 garage window", 1, "each"),
  item("New circuits, outlets, lighting", null, "each"),
  item("Paint walls and ceilings"),
  item("Prime and paint trim"),
  item("Prime and paint walls and ceilings"),
  item("Remove and reframe 1 large egress window", 1, "each"),
  item("Remove existing back entry door", null, "each"),
  item("Remove existing garage partition wall", null, "linear_foot"),
];

describe("live garage conversion ballpark", () => {
  it("leaves nothing for the contractor to measure", () => {
    const { unresolved } = resolve(LIVE_GARAGE_SCOPE);
    expect(unresolved).toEqual([]);
    expect(recalculateBallparkFromScope(LIVE_GARAGE_SCOPE, { geometry: GARAGE, laborRate: 65 })!.unpriceable)
      .toEqual([]);
  });

  it("derives hardwood flooring from the 18 x 16 floor with waste, priced once", () => {
    const { resolved } = resolve(LIVE_GARAGE_SCOPE);
    expect(GARAGE.floorAreaSf).toBe(288);
    const flooring = resolved.filter((s) => s.family === "flooring");
    expect(flooring).toHaveLength(1);
    expect(flooring[0]!.parts[0]!.quantity).toBe(316.8);
    expect(flooring[0]!.rolledUp.length).toBeGreaterThan(0);
  });

  it("prices duplicate paint wording once and resolves the trade allowances", () => {
    const { resolved } = resolve(LIVE_GARAGE_SCOPE);
    expect(resolved.filter((s) => s.family === "paint.walls")).toHaveLength(1);
    for (const key of ["hvac.extension", "plumbing.supply_lines", "bath.rough_in"]) {
      expect(partFor(resolved, key), key).toMatchObject({ source: "allowance", quantity: 1 });
    }
  });

  it("derives demolition and framing lengths instead of asking for LF", () => {
    const { resolved } = resolve(LIVE_GARAGE_SCOPE);
    expect(partFor(resolved, "demolition.wall")).toMatchObject({ source: "geometry", quantity: 20 });
    expect(partFor(resolved, "framing.partition_wall")).toMatchObject({ source: "geometry", quantity: 20 });
  });
});

