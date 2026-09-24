/**
 * Real sourced exterior rates — no reverse-engineered totals.
 *
 * Every rate below comes from the 2026 National Construction Estimator
 * (Craftsman Book Co.) as RAW job cost: contractor-buy material money and book
 * craft hours that exclude overhead and profit. The test exists so nobody
 * re-introduces a blended lump sum, a markup-inclusive web rate, or a labor
 * pair solved backwards from a target total.
 */
import { describe, expect, it } from "vitest";
import { SAMPLE_PRICEBOOK, SAMPLE_LABOR_RATE } from "@/domains/ballpark/pricebook";
import { assemblyKeyForFeature } from "@/domains/remoteVision/featureAssembly";

const byKey = { get: (k: string) => SAMPLE_PRICEBOOK.get(k) };

const RATE = SAMPLE_LABOR_RATE;

function installedCost(itemKey: string): number {
  const e = byKey.get(itemKey);
  if (!e) throw new Error(`missing pricebook entry: ${itemKey}`);
  return e.laborHoursPerUnit * RATE + e.materialCostPerUnit;
}

describe("exterior catalog carries real, split labor + material rates", () => {
  it.each([
    ["roofing.metal_standing_seam", 0.027, 2.8],
    ["siding.install", 0.0334, 0.938],
    ["siding.soffit_fascia", 0.077, 3.5],
    ["deck.rebuild", 0.225, 19.2],
    ["landscaping.install", 0.045, 4.2],
    ["window.replacement", 1, 238],
    ["window.replacement_double", 1.5, 428.4],
    ["door.exterior", 1, 533.5],
  ])("%s prices from real hours and real material", (key, hours, material) => {
    const entry = byKey.get(key as string);
    expect(entry, `pricebook entry ${key}`).toBeDefined();
    expect(entry!.laborHoursPerUnit).toBeCloseTo(hours as number, 4);
    expect(entry!.materialCostPerUnit).toBeCloseTo(material as number, 3);
    /* Material money is never zeroed out into a labor lump sum. */
    expect(entry!.materialCostPerUnit).toBeGreaterThan(0);
  });

  it("keeps installed cost in a sane market band", () => {
    expect(installedCost("roofing.metal_standing_seam")).toBeGreaterThan(4);
    expect(installedCost("deck.rebuild")).toBeGreaterThan(25);
    expect(installedCost("window.replacement_double")).toBeGreaterThan(
      installedCost("window.replacement"),
    );
  });
});


describe("exterior features route to the right price subject", () => {
  it.each([
    ["roofing.metal.replace", "roofing.metal_standing_seam"],
    ["siding.replace", "siding.install"],
    ["fascia.replace", "siding.soffit_fascia"],
    ["deck.build", "deck.rebuild"],
    ["windows.replace", "window.replacement"],
    ["windows.replace.double", "window.replacement_double"],
    ["doors.exterior.replace", "door.exterior"],
    ["landscaping.install", "landscaping.install"],
  ])("%s -> %s", (feature, expected) => {
    expect(assemblyKeyForFeature(feature as string)).toBe(expected);
  });
});
