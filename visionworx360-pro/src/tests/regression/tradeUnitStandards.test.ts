import { describe, expect, it } from "vitest";
import {
  TRADE_STANDARDS,
  checkQuantitySanity,
  convertBetweenUnits,
  recognizeWork,
  unitFamily,
  KNOWN_UNIT_KEYS,
  type ResolvedWorkItem,
  type WorkRecognitionResult,
} from "@/domains/workRecognition";

/**
 * Cross-trade regression scenarios for the industry-standard unit layer
 * (ADR-060). Every scenario asserts: correct unit family, a quantity derived
 * from contractor geometry (not a default), and no unrelated invented scope.
 */

const item = (r: WorkRecognitionResult, key: string): ResolvedWorkItem | undefined =>
  r.items.find((i) => i.workTypeKey === key);

const keys = (r: WorkRecognitionResult) => r.items.map((i) => i.workTypeKey);

const noBlocking = (r: WorkRecognitionResult) =>
  checkQuantitySanity(r.items, r.zones).every((f) => f.severity !== "block");

describe("trade unit standards registry", () => {
  it("every standard uses a known unit and a matching family", () => {
    for (const standard of Object.values(TRADE_STANDARDS)) {
      expect(KNOWN_UNIT_KEYS).toContain(standard.unitKey);
      expect(KNOWN_UNIT_KEYS).toContain(standard.baseUnitKey);
      /* `each` covers every countable family (openings, fixtures, devices). */
      const countable = ["count", "opening", "fixture", "circuit_device", "room_zone"];
      const compatible = (unit: string) =>
        unitFamily(unit) === standard.family ||
        (countable.includes(unitFamily(unit)) && countable.includes(standard.family));
      expect(compatible(standard.unitKey)).toBe(true);
      expect(compatible(standard.baseUnitKey)).toBe(true);
    }
  });

  it("converts only inside a unit family", () => {
    expect(convertBetweenUnits(1560, "square_foot", "roofing_square")).toBe(15.6);
    expect(convertBetweenUnits(180, "square_foot", "square_yard")).toBe(20);
    expect(convertBetweenUnits(2, "cubic_yard", "cubic_foot")).toBe(54);
    expect(convertBetweenUnits(10, "square_foot", "linear_foot")).toBeNull();
  });
});

describe("cross-trade ballpark scenarios", () => {
  it("carpet bedroom: square yards from room dimensions", () => {
    const r = recognizeWork({ text: "Replace the carpet in the bedroom, it is 12 by 15." });
    const carpet = item(r, "flooring.carpet")!;
    expect(carpet.unitKey).toBe("square_yard");
    // 180 SF / 9 = 20 SY
    expect(carpet.quantity).toBe(20);
    expect(carpet.isAllowance).toBe(false);
    expect(keys(r)).not.toContain("flooring.surface");
    expect(keys(r)).not.toContain("paint.walls");
    expect(noBlocking(r)).toBe(true);
  });

  it("hard-surface flooring stays in square feet", () => {
    const r = recognizeWork({ text: "Install new LVP flooring in the living room, 14 x 20." });
    const floor = item(r, "flooring.surface")!;
    expect(floor.unitKey).toBe("square_foot");
    expect(floor.quantity).toBe(280);
    // Waste is a pricing factor only.
    expect(floor.pricingQuantity).toBe(308);
  });

  it("whole-house painting: documented ratio when only house size is known", () => {
    const r = recognizeWork({ text: "Paint the whole house interior, it is 1800 sq ft." });
    const paint = item(r, "paint.walls")!;
    expect(paint.unitKey).toBe("square_foot");
    expect(paint.quantity).toBe(6300); // 1800 x 3.5, disclosed
    expect(paint.assumptions.map((a) => a.id)).toContain("house-area-ratio");
    expect(paint.isAllowance).toBe(false);
  });

  it("12x14 deck: surface SF, railing LF, stairs EA, material question asked", () => {
    const r = recognizeWork({
      text: "Build a 12 x 14 deck with railings and stairs down to the yard.",
    });
    expect(item(r, "deck.surface")!.quantity).toBe(168);
    expect(item(r, "deck.surface")!.unitKey).toBe("square_foot");
    expect(item(r, "deck.railing")!.unitKey).toBe("linear_foot");
    expect(item(r, "deck.railing")!.quantity).toBe(52);
    expect(item(r, "deck.stairs")!.unitKey).toBe("each");
    expect(r.clarifications.map((c) => c.id)).toContain("deck.surface:deck-material");
    expect(noBlocking(r)).toBe(true);
  });

  it("deck material stated: the high-impact question is not asked again", () => {
    const r = recognizeWork({ text: "Build a 12 x 14 composite deck." });
    expect(r.clarifications.map((c) => c.id)).not.toContain("deck.surface:deck-material");
  });

  it("roofing: squares, never house floor area", () => {
    const r = recognizeWork({ text: "Tear off and replace the roof, the house is 2000 sq ft." });
    const roof = item(r, "roofing.covering")!;
    expect(roof.unitKey).toBe("roofing_square");
    expect(roof.quantity).toBe(26); // 2000 x 1.3 = 2600 SF = 26 squares
    expect(roof.pricingQuantity).toBe(29); // 10% waste, rounded up to whole squares
    expect(r.clarifications.map((c) => c.id)).toContain("roofing.covering:roof-pitch");
    expect(noBlocking(r)).toBe(true);
  });

  it("siding: wall area in SF, trim on its own linear-foot line", () => {
    const r = recognizeWork({
      text: "Replace the siding and the fascia. The house is 30 x 40 with 9 foot walls.",
    });
    const siding = item(r, "siding.covering")!;
    expect(siding.unitKey).toBe("square_foot");
    expect(siding.quantity).toBeGreaterThan(1000);
    expect(siding.assumptions.map((a) => a.id)).toContain("opening-deduction");
    expect(item(r, "siding.trim")!.unitKey).toBe("linear_foot");
  });

  it("window replacement stays distinct from a new opening", () => {
    const replacement = recognizeWork({ text: "Replace six windows." });
    expect(item(replacement, "windows.openings")!.quantity).toBe(6);
    expect(keys(replacement)).not.toContain("windows.new_opening");

    const newOpening = recognizeWork({ text: "Cut in a new window in the back wall." });
    expect(keys(newOpening)).toContain("windows.new_opening");
    expect(keys(newOpening)).not.toContain("windows.openings");
  });

  it("plumbing: fixtures EA, piping LF, rough-in separate", () => {
    const r = recognizeWork({
      text: "Replace two toilets, install rough-in for a new sink, and run 30 feet of pex piping.",
    });
    expect(item(r, "plumbing.fixtures")!.quantity).toBe(2);
    expect(item(r, "plumbing.fixtures")!.family).toBe("fixture");
    expect(item(r, "plumbing.rough_in")).toBeDefined();
    const piping = item(r, "plumbing.piping")!;
    expect(piping.unitKey).toBe("linear_foot");
    expect(piping.quantity).toBe(30);
  });

  it("electrical: devices, circuits and wiring keep their own units", () => {
    const r = recognizeWork({
      text: "Install eight outlets, add two dedicated circuits, and run 60 feet of romex.",
    });
    expect(item(r, "electrical.devices")!.quantity).toBe(8);
    expect(item(r, "electrical.circuits")!.quantity).toBe(2);
    expect(item(r, "electrical.wiring")!.unitKey).toBe("linear_foot");
    expect(item(r, "electrical.wiring")!.quantity).toBe(60);
  });

  it("cabinet doors never become architectural doors or electrical panels", () => {
    const r = recognizeWork({
      text: "Install raised panel cabinet doors on the new uppers.",
    });
    expect(keys(r)).not.toContain("doors.openings");
    expect(keys(r)).not.toContain("electrical.service");
    expect(keys(r)).not.toContain("electrical.devices");
  });

  it("basement finish: framing LF, drywall and insulation SF from one geometry model", () => {
    const r = recognizeWork({
      text: "Finish the basement, it is 24 x 30 with 8 foot ceilings. Frame the partitions, insulate, and hang drywall.",
    });
    expect(item(r, "framing.walls")!.unitKey).toBe("linear_foot");
    expect(item(r, "framing.walls")!.quantity).toBe(108);
    expect(item(r, "drywall.surface")!.unitKey).toBe("square_foot");
    expect(item(r, "drywall.surface")!.quantity).toBeGreaterThan(600);
    expect(item(r, "insulation.surface")!.quantity).toBeGreaterThan(600);
    expect(item(r, "insulation.surface")!.isAllowance).toBe(false);
  });

  it("concrete: slab volume in CY, footings in LF, units never mixed", () => {
    const r = recognizeWork({
      text: "Pour a 20 x 30 concrete slab and the footings around it.",
    });
    const slab = item(r, "concrete.flatwork")!;
    expect(slab.unitKey).toBe("cubic_yard");
    expect(slab.quantity).toBeCloseTo(7.41, 1);
    expect(item(r, "concrete.footings")!.unitKey).toBe("linear_foot");
  });

  it("demo only appears when removal was requested, and follows the surface removed", () => {
    const requested = recognizeWork({
      text: "Tear out the flooring in the 12 x 12 den.",
    });
    const demo = item(requested, "demolition.finishes")!;
    expect(demo.unitKey).toBe("square_foot");
    expect(demo.quantity).toBe(144);

    const notRequested = recognizeWork({ text: "The existing tile flooring stays." });
    expect(keys(notRequested)).not.toContain("demolition.finishes");
  });

  it("finish carpentry one-off: overall width prices it, components refine it", () => {
    const r = recognizeWork({
      text: "Build a built-in bookcase, 10 feet wide with shelves and crown.",
    });
    const builtin = item(r, "carpentry.builtin")!;
    expect(builtin.unitKey).toBe("linear_foot");
    expect(builtin.quantity).toBe(10);
    expect(builtin.isAllowance).toBe(false);
  });

  it("minimal input still produces a priced ballpark without inventing trades", () => {
    const r = recognizeWork({ text: "Build a 12 x 14 deck." });
    const priced = r.items.filter((i) => i.pricingQuantity !== null);
    expect(priced.length).toBeGreaterThan(0);
    expect(keys(r)).not.toContain("roofing.covering");
    expect(keys(r)).not.toContain("plumbing.fixtures");
    expect(keys(r)).not.toContain("electrical.devices");
  });
});
