/**
 * Handyman / small-service regression suite.
 *
 * Guards the promises that make small work sellable: tasks are recognised from
 * plain speech, units are sensible, nothing is ever silently priced at $0, one
 * visit carries one mobilization, questions stay under budget and the roll-up
 * reconciles.
 */

import { describe, expect, it } from "vitest";
import { SAMPLE_PRICEBOOK } from "@/domains/ballpark/pricebook";
import {
  DEFAULT_SERVICE_MINIMUMS,
  HANDYMAN_TASKS,
  buildPunchListEstimate,
  contractorCustomSource,
  defaultPricingSources,
  importedDatasetSource,
  matchTask,
  recognizePunchList,
  resolveTaskRate,
  searchHandymanTasks,
} from "..";

const RATE = 65;

const estimateFor = (narration: string, extra: Parameters<typeof buildPunchListEstimate>[1] | null = null) =>
  buildPunchListEstimate(recognizePunchList(narration), {
    laborRate: RATE,
    ...(extra ?? {}),
  });

describe("task library integrity", () => {
  it("has unique ids and non-empty aliases", () => {
    const ids = new Set<string>();
    for (const task of HANDYMAN_TASKS) {
      expect(ids.has(task.id)).toBe(false);
      ids.add(task.id);
      expect(task.aliases.length).toBeGreaterThan(0);
      expect(task.label["es-US"].length).toBeGreaterThan(0);
    }
    expect(HANDYMAN_TASKS.length).toBeGreaterThanOrEqual(90);
  });

  it("only references pricing primitives that exist, at matching units", () => {
    for (const task of HANDYMAN_TASKS) {
      if (!task.priceRef) continue;
      const entry = SAMPLE_PRICEBOOK.get(task.priceRef);
      expect(entry, `${task.id} -> ${task.priceRef}`).toBeTruthy();
      expect(entry!.unitKey, `${task.id} unit`).toBe(task.unit);
    }
  });

  it("searches by plain English and by synonym", () => {
    const toilet = searchHandymanTasks("toilet").slice(0, 3).map((r) => r.task.id);
    expect(toilet).toContain("plumbing.toilet.replace");
    expect(searchHandymanTasks("can light").some((r) => r.task.id === "electrical.recessed.install")).toBe(true);
    expect(searchHandymanTasks("pasamanos").some((r) => r.task.id === "deck.railing.replace")).toBe(true);
    expect(searchHandymanTasks("", { category: "plumbing" }).length).toBeGreaterThan(5);
  });
});

describe("individual task recognition and pricing", () => {
  const cases: Array<[string, string]> = [
    ["replace toilet", "plumbing.toilet.replace"],
    ["replace the kitchen faucet", "plumbing.faucet.replace.kitchen"],
    ["replace bathroom faucet", "plumbing.faucet.replace.bath"],
    ["replace light switch", "electrical.switch.replace"],
    ["replace light fixture", "electrical.fixture.replace"],
    ["patch drywall", "drywall.patch.small"],
    ["paint room", "paint.room.interior"],
    ["patch flooring", "flooring.patch"],
    ["adjust cabinet doors", "cabinets.door.adjust"],
    ["replace deck boards", "deck.board.replace"],
    ["replace handrail", "deck.railing.replace"],
  ];

  it.each(cases)("recognizes %s", (phrase, taskId) => {
    expect(matchTask(phrase)?.taskId).toBe(taskId);
  });

  it.each(cases)("never fabricates $0 for %s", (phrase) => {
    const estimate = estimateFor(phrase);
    expect(estimate.lines).toHaveLength(1);
    const [line] = estimate.lines;
    expect(line.taskId).not.toBeNull();
    expect(line.unit).toBeTruthy();
    if (line.pricingNeeded) {
      expect(line.subtotal).toBe(0);
      expect(line.pricingNeededReason).toBe("no_source_rate");
      expect(estimate.pricingNeededCount).toBe(1);
    } else {
      expect(line.subtotal).toBeGreaterThan(0);
      expect(line.provenance?.kind).toBe("internal_curated");
    }
  });

  it("charges one visit's mobilization for a single small task", () => {
    const estimate = estimateFor("replace toilet");
    expect(estimate.mobilization).toBe(DEFAULT_SERVICE_MINIMUMS.mobilizationFee);
    expect(estimate.setupCleanupCost).toBe(DEFAULT_SERVICE_MINIMUMS.setupCleanupHours * RATE);
    expect(estimate.total).toBeGreaterThanOrEqual(estimate.minimumCharge);
  });

  it("does not price a fifteen-minute repair as fifteen minutes of labor", () => {
    const estimate = estimateFor("replace light switch");
    expect(estimate.lines[0].laborHours).toBeGreaterThanOrEqual(0.5);
    expect(estimate.total).toBeGreaterThanOrEqual(estimate.minimumCharge);
  });

  it("applies the per-occurrence labor floor to counted work", () => {
    const four = estimateFor("change four switches");
    expect(four.lines[0].quantity).toBe(4);
    expect(four.lines[0].laborHours).toBeCloseTo(4 * 0.5, 5);
  });
});

describe("pricing-needed policy", () => {
  it("flags recognized-but-unpriced work instead of guessing", () => {
    const estimate = estimateFor("replace garbage disposal");
    expect(estimate.lines[0].taskId).toBe("plumbing.disposal.replace");
    expect(estimate.lines[0].pricingNeeded).toBe(true);
    expect(estimate.lines[0].subtotal).toBe(0);
    expect(estimate.pricingNeededCount).toBe(1);
  });

  it("accepts a contractor flat price for an unpriced task", () => {
    const sources = defaultPricingSources([
      { taskId: "plumbing.disposal.replace", unit: "each", flatAmount: 385 },
    ]);
    const estimate = estimateFor("replace garbage disposal", { laborRate: RATE, sources });
    expect(estimate.pricingNeededCount).toBe(0);
    expect(estimate.lines[0].materialCost).toBe(385);
    expect(estimate.lines[0].provenance?.reviewStatus).toBe("contractor_supplied");
  });

  it("lets contractor rates override baseline sources", () => {
    const sources = defaultPricingSources([
      { taskId: "plumbing.toilet.replace", unit: "each", laborHoursPerUnit: 2, materialCostPerUnit: 600 },
    ]);
    const resolution = resolveTaskRate("plumbing.toilet.replace", sources);
    expect(resolution.rate?.provenance.kind).toBe("contractor_custom");
    expect(resolution.rate?.materialCostPerUnit).toBe(600);
  });

  it("supports a licensed dataset import without changing the estimator", () => {
    const licensed = importedDatasetSource({
      datasetId: "org-licensed-2026",
      rows: [{ taskId: "plumbing.disposal.replace", unit: "each", laborHoursPerUnit: 1.3, materialCostPerUnit: 240, market: "78701", effectiveDate: "2026-01-01", version: "2026.1" }],
    });
    const resolution = resolveTaskRate("plumbing.disposal.replace", [...defaultPricingSources(), licensed], { market: "78701" });
    expect(resolution.rate?.provenance).toMatchObject({
      kind: "licensed_import",
      market: "78701",
      effectiveDate: "2026-01-01",
      version: "2026.1",
    });
  });

  it("keeps an unrecognized fragment visible instead of dropping it", () => {
    const estimate = estimateFor("do the thing with the whatsit");
    expect(estimate.unrecognizedCount).toBe(1);
    expect(estimate.lines[0].taskId).toBeNull();
    expect(estimate.lines[0].subtotal).toBe(0);
  });
});

describe("mixed punch list", () => {
  const narration =
    "replace toilet, fix two cabinet doors, patch three drywall holes, replace the porch handrail, " +
    "change four switches, install a ceiling fan, replace the kitchen faucet, mount tv, " +
    "install two grab bars, and paint touch up";

  it("decomposes into ten independent scope items", () => {
    const instances = recognizePunchList(narration);
    expect(instances).toHaveLength(10);
    expect(new Set(instances.map((i) => i.taskId)).size).toBe(10);
    expect(instances.every((i) => i.taskId !== null)).toBe(true);
  });

  it("applies mobilization exactly once for the visit", () => {
    const estimate = estimateFor(narration);
    expect(estimate.mobilization).toBe(DEFAULT_SERVICE_MINIMUMS.mobilizationFee);
    expect(estimate.setupCleanupCost).toBe(DEFAULT_SERVICE_MINIMUMS.setupCleanupHours * RATE);
  });

  it("rolls up to the sum of its lines plus one visit cost", () => {
    const estimate = estimateFor(narration);
    const lineSum = estimate.lines.reduce((s, l) => s + l.subtotal, 0);
    expect(estimate.subtotal).toBeCloseTo(
      lineSum + estimate.mobilization + estimate.setupCleanupCost,
      2,
    );
    expect(estimate.laborCost).toBeCloseTo(estimate.laborHours * RATE, 0);
  });

  it("asks at most three clarification questions", () => {
    const estimate = estimateFor(narration);
    expect(estimate.questionIds.length).toBeLessThanOrEqual(3);
    expect(estimate.questionIds).toContain("supplyResponsibility");
  });

  it("never surfaces a question that no task in the visit needs", () => {
    const estimate = estimateFor("replace toilet");
    expect(estimate.questionIds).not.toContain("deckBoardMaterial");
    expect(estimate.questionIds).not.toContain("flooringMaterialArea");
    expect(estimate.questionIds.length).toBeLessThanOrEqual(3);
  });

  it("keeps stated counts per line without cross-contamination", () => {
    const instances = recognizePunchList(narration);
    const byId = Object.fromEntries(instances.map((i) => [i.taskId!, i.quantity]));
    expect(byId["cabinets.door.adjust"]).toBe(2);
    expect(byId["electrical.switch.replace"]).toBe(4);
    expect(byId["bath.grab_bar.install"]).toBe(2);
    expect(byId["plumbing.toilet.replace"]).toBe(1);
  });

  it("carries companion work without inventing optional scope", () => {
    const estimate = estimateFor("replace toilet");
    const ids = estimate.lines[0].companions.map((c) => c.id);
    expect(ids).toContain("wax_ring");
    expect(ids).toContain("remove_haul");
    const conditional = estimate.lines[0].companions.filter((c) => c.inclusion !== "standard");
    expect(conditional.every((c) => c.inclusion === "conditional" || c.inclusion === "question")).toBe(true);
  });
});
