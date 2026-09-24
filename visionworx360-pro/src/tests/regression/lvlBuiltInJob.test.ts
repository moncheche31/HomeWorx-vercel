/**
 * NOVEL ONE-OFF JOB — structural opening + built-ins.
 *
 * Remove an interior wall and closet, carry the load temporarily, set an LVL
 * and posts, wrap the beam and columns, build built-in bookcases with
 * decorative trim, patch the ceiling and walls, then prime and paint.
 *
 * Nothing here is a job template. The assertions prove the estimating core
 * recognizes the work from reusable primitives, prices every recognized item
 * from a canonical assembly (or a disclosed allowance / contractor amount),
 * classifies the trades correctly and stays isolated from earlier test jobs.
 */

import { describe, expect, it } from "vitest";
import { recalculateBallparkFromScope, type RecalcScopeItem } from "@/domains/ballpark/scopeRecalc";
import { SAMPLE_PRICEBOOK } from "@/domains/ballpark/pricebook";
import {
  canonicalForBallparkKey,
  isAllowanceBallparkKey,
} from "@/domains/estimating/pricing/canonicalAssemblies";
import { resolveIntent } from "@/domains/estimating/pricing/intentMap";
import { QUICK_BALLPARK_SCHEMA } from "@/domains/ballpark/questions";
import { buildCurrentProjectScopeContext, type ProjectEvidence } from "@/domains/workScope";

const JOB: RecalcScopeItem[] = [
  { id: "demo", title: "Remove load bearing wall and closet", quantity: 12, unitKey: "linear_foot", tradeKey: "demolition", isIncluded: true },
  { id: "shore", title: "Temporary shoring while wall is open", quantity: 12, unitKey: "linear_foot", tradeKey: "framing", isIncluded: true },
  { id: "beam", title: "Install LVL beam and posts", quantity: 14, unitKey: "linear_foot", tradeKey: "framing", isIncluded: true },
  { id: "wrap", title: "Wrap beam in paint-grade trim", quantity: 14, unitKey: "linear_foot", tradeKey: "trim", isIncluded: true },
  { id: "cols", title: "Wrap columns", quantity: 2, unitKey: "each", tradeKey: "trim", isIncluded: true },
  { id: "books", title: "Built-in bookcases", quantity: 10, unitKey: "linear_foot", tradeKey: "trim", isIncluded: true },
  { id: "mold", title: "Decorative molding and crown", quantity: 60, unitKey: "linear_foot", tradeKey: "trim", isIncluded: true },
  { id: "patch", title: "Patch ceiling and wall drywall", quantity: 120, unitKey: "square_foot", tradeKey: "drywall", isIncluded: true },
  { id: "paint", title: "Prime and paint", quantity: 480, unitKey: "square_foot", tradeKey: "painting", isIncluded: true },
];

const EVIDENCE: ProjectEvidence = {
  projectId: "p-lvl-builtin",
  projectName: "Wall removal with built-ins",
  scopeItems: JOB.map((i) => ({
    key: i.id,
    title: i.title,
    tradeKey: i.tradeKey ?? null,
    quantity: i.quantity ?? null,
    unitKey: i.unitKey ?? null,
  })),
};

describe("novel LVL + built-in job", () => {
  const result = recalculateBallparkFromScope(JOB)!;
  const keyFor = (itemId: string) =>
    result.assumptions.filter((a) => a.itemId === itemId).map((a) => a.itemKey);

  it("prices every recognized item — nothing silently contributes $0", () => {
    expect(result).not.toBeNull();
    expect(result.unpriceable).toHaveLength(0);
    for (const assumption of result.assumptions) {
      expect(SAMPLE_PRICEBOOK.get(assumption.itemKey), assumption.itemKey).toBeTruthy();
    }
  });

  it("resolves structural work to reusable primitives, not a generic package", () => {
    expect(keyFor("demo")).toContain("demolition.wall_bearing");
    expect(keyFor("shore")).toContain("structural.shoring");
    expect(keyFor("beam")).toContain("structural.beam_lvl");
    expect(keyFor("beam")).toContain("structural.post");
    expect(keyFor("beam")).not.toContain("structural.beam_posts");
  });

  it("treats beam/column wraps and built-ins as finish carpentry", () => {
    expect(keyFor("wrap")).toContain("trim.beam_wrap");
    expect(keyFor("cols")).toContain("trim.column_wrap");
    expect(keyFor("books")).toContain("trim.bookcase");
    expect(keyFor("mold")).toContain("trim.decorative");
    /* A bookcase is NEVER kitchen cabinetry. */
    expect(result.assumptions.some((a) => a.itemKey.startsWith("kitchen."))).toBe(false);
  });

  it("labels genuinely uncertain primitives as allowances", () => {
    expect(isAllowanceBallparkKey("structural.shoring")).toBe(true);
    expect(isAllowanceBallparkKey("structural.engineering")).toBe(true);
    expect(isAllowanceBallparkKey("trim.bookcase")).toBe(true);
    expect(isAllowanceBallparkKey("structural.beam_lvl")).toBe(false);
  });

  it("ballpark and detailed resolve the same canonical assembly", () => {
    const pairs: Array<[string, string]> = [
      ["shoring", "structural.shoring"],
      ["bookcase", "trim.bookcase"],
      ["wrap beam", "trim.beam_wrap"],
      ["column wrap", "trim.column_wrap"],
      ["remove bearing wall", "demolition.wall_bearing"],
    ];
    for (const [phrase, ballparkKey] of pairs) {
      const canonical = canonicalForBallparkKey(ballparkKey);
      expect(canonical, ballparkKey).toBeTruthy();
      const intent = resolveIntent(phrase);
      expect(intent?.rule.components?.[0]?.assemblyKey, phrase).toBe(canonical!.catalogKey);
    }
  });

  it("classifies labor by the authoritative trade", () => {
    const trades = new Set(result.labor.tasks.map((t) => t.tradeKey));
    expect(trades).toContain("framing");
    expect(trades).toContain("finish_carpentry");
    expect(trades).toContain("demolition");
  });

  it("reconciles labor hours between tasks and the project total", () => {
    const sum = result.labor.tasks.reduce((acc, t) => acc + t.adjustedHours, 0);
    expect(sum).toBeGreaterThan(0);
    expect(Math.abs(sum - result.labor.baselineHours * result.labor.productivityMultiplier)).toBeLessThan(0.5);
  });

  it("asks only high-impact, in-scope questions", () => {
    const context = buildCurrentProjectScopeContext(EVIDENCE, QUICK_BALLPARK_SCHEMA);
    const ids = context.questions.map((q) => q.id);
    /* No kitchen, bath, garage, flooring, roofing or landscape questions. */
    for (const forbidden of [
      "cabinetRunFt",
      "counterMaterial",
      "bathFixtureScope",
      "showerWaterproofing",
      "lengthFt",
      "widthFt",
      "plantingStockSize",
    ]) {
      expect(ids, `must not ask ${forbidden}`).not.toContain(forbidden);
    }
    /* Structural / built-in questions are the ones that move the money. */
    expect(ids).toContain("temporaryShoring");
    expect(ids).toContain("beamFinishMethod");
    expect(ids).toContain("builtInLengthFt");
    /* Every question traces to current scope. */
    for (const provenance of context.questionProvenance) {
      expect(provenance.reason.length).toBeGreaterThan(0);
    }
  });

  it("accepts contractor-supplied pricing for work it cannot rate", () => {
    const novel: RecalcScopeItem[] = [
      ...JOB,
      { id: "odd", title: "Custom curved plaster reveal detail", quantity: 1, unitKey: "each", tradeKey: "specialty", isIncluded: true },
    ];
    const blocked = recalculateBallparkFromScope(novel)!;
    expect(blocked.unpriceable.map((u) => u.itemId)).toContain("odd");

    const priced = recalculateBallparkFromScope(novel, { contractorPricing: { odd: 2400 } })!;
    expect(priced.unpriceable.map((u) => u.itemId)).not.toContain("odd");
    expect(priced.band.high).toBeGreaterThan(blocked.band.high);
    const supplied = priced.assumptions.find((a) => a.itemId === "odd");
    expect(supplied?.source).toBe("contractor");
    expect(supplied?.basisKey).toBe("contractorPricing");
  });
});
