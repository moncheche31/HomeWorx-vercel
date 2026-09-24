/**
 * Regression: the real pilot kitchen-cabinet job.
 *
 * ~7.83 LF of base cabinets, ~7.83 LF of upper cabinets, a countertop, ONE
 * receptacle relocation and minor trim. Three defects made this job price at
 * roughly $12k in ballpark and $161 in the detailed estimate:
 *
 *  1. the single receptacle relocation resolved to `electrical.moderate`
 *     (22 hours / $950 whole-room package);
 *  2. upper cabinetry reused the base-cabinet key, double-counting base
 *     cabinet material;
 *  3. labor was classified from the display group label, so cabinetry showed
 *     up as painting.
 *
 * No dollar target is asserted here — only the structural facts that make the
 * number credible.
 */

import { describe, expect, it } from "vitest";
import { recalculateBallparkFromScope, type RecalcScopeItem } from "@/domains/ballpark/scopeRecalc";
import { SAMPLE_PRICEBOOK } from "@/domains/ballpark/pricebook";
import {
  canonicalForBallparkKey,
  canonicalForCatalogKey,
} from "@/domains/estimating/pricing/canonicalAssemblies";
import { resolveIntent } from "@/domains/estimating/pricing/intentMap";

const CABINET_JOB: RecalcScopeItem[] = [
  {
    id: "base",
    title: "Install base cabinets",
    quantity: 7.83,
    unitKey: "linear_foot",
    isIncluded: true,
    tradeKey: "cabinetry",
  },
  {
    id: "upper",
    title: "Install upper cabinets",
    quantity: 7.83,
    unitKey: "linear_foot",
    isIncluded: true,
    tradeKey: "cabinetry",
  },
  {
    id: "top",
    title: "Install quartz countertop",
    quantity: 22,
    unitKey: "square_foot",
    isIncluded: true,
    tradeKey: "countertops",
  },
  {
    id: "device",
    title: "Relocate one receptacle",
    quantity: 1,
    unitKey: "each",
    isIncluded: true,
    tradeKey: "electrical",
  },
  {
    id: "trim",
    title: "Install base trim",
    quantity: 16,
    unitKey: "linear_foot",
    isIncluded: true,
    tradeKey: "trim",
  },
];

describe("kitchen cabinet job — canonical pricing", () => {
  it("prices upper cabinetry with the wall-cabinet key, never the base key", () => {
    const res = recalculateBallparkFromScope(CABINET_JOB)!;
    const keys = res.assumptions.map((a) => `${a.itemId}:${a.itemKey}`);
    expect(keys).toContain("base:kitchen.cabinets_base");
    expect(keys).toContain("upper:kitchen.cabinets_wall");
    expect(keys).not.toContain("upper:kitchen.cabinets_base");
  });

  it("resolves one receptacle relocation to the device assembly, not a package", () => {
    const res = recalculateBallparkFromScope(CABINET_JOB)!;
    const keys = res.assumptions.map((a) => a.itemKey);
    expect(keys).toContain("electrical.device.relocate");
    expect(keys).not.toContain("electrical.moderate");
  });

  it("classifies cabinetry labor as carpentry, never as painting", () => {
    const res = recalculateBallparkFromScope(CABINET_JOB)!;
    const trades = res.labor.byTrade.map((t) => t.tradeKey);
    /* `cabinetry` normalizes into the GC finish-carpentry trade. */
    expect(trades).toContain("finish_carpentry");
    expect(trades).toContain("electrical");
    expect(trades).not.toContain("painting");
    expect(trades).not.toContain("unassigned");
  });

  it("reconciles task hours with trade hours and keeps working days sane", () => {
    const res = recalculateBallparkFromScope(CABINET_JOB)!;
    const taskHours = res.labor.tasks.reduce((sum, t) => sum + t.adjustedHours, 0);
    const tradeHours = res.labor.byTrade.reduce((sum, t) => sum + t.adjustedHours, 0);
    expect(Math.abs(taskHours - tradeHours)).toBeLessThan(0.05);
    /* A one-bank cabinet job is days of work, not weeks. */
    expect(res.labor.duration.workingDays).toBeGreaterThan(0);
    expect(res.labor.duration.workingDays).toBeLessThan(res.labor.totalHours);
  });

  it("keeps ballpark and Knowledge Base rates identical for the same subject", () => {
    for (const ballparkKey of [
      "kitchen.cabinets_base",
      "kitchen.cabinets_wall",
      "kitchen.countertop",
      "electrical.device.relocate",
      "trim.base",
    ]) {
      const canonical = canonicalForBallparkKey(ballparkKey)!;
      const price = SAMPLE_PRICEBOOK.get(ballparkKey)!;
      expect(price.laborHoursPerUnit).toBe(canonical.laborHoursPerUnit);
      expect(price.materialCostPerUnit).toBe(canonical.materialCostPerUnit);
      expect(canonicalForCatalogKey(canonical.catalogKey)).toBe(canonical);
    }
  });

  it("maps detailed scope wording to the same canonical assemblies", () => {
    expect(resolveIntent("Install upper cabinets")?.rule.components?.[0]?.assemblyKey)
      .toBe("cabinets.wall.install");
    expect(resolveIntent("Install base cabinets")?.rule.components?.[0]?.assemblyKey)
      .toBe("cabinets.base.install");
    expect(resolveIntent("Relocate outlet at sink wall")?.rule.components?.[0]?.assemblyKey)
      .toBe("electrical.device.relocate");
  });
});
