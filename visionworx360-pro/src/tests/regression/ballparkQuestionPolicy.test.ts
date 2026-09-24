/**
 * Ballpark vs Detailed workflow boundary.
 *
 * Proves the product promise across materially different trades: a preliminary
 * ballpark stays short and shareable, trade-assignment review never stands in
 * its way, and everything trimmed becomes a disclosed assumption rather than a
 * silent omission.
 */

import { describe, expect, it } from "vitest";
import {
  BALLPARK_QUESTION_MAX,
  BALLPARK_QUESTION_TARGET,
  classifyQuestionTier,
  planQuestions,
  questionDedupeKey,
  withinQuestionBudget,
  type UniversalQuestionCandidate,
} from "@/domains/questionPolicy";
import {
  evaluateScopeApproval,
  findingReviewStage,
  partitionFindingsByMode,
  type ScopeFinding,
  type ScopeValidationReport,
} from "@/domains/scopeValidation";
import en from "@/i18n/locales/en-US/estimating.json";
import es from "@/i18n/locales/es-US/estimating.json";
import enScope from "@/i18n/locales/en-US/scope.json";
import esScope from "@/i18n/locales/es-US/scope.json";

const q = (over: Partial<UniversalQuestionCandidate> & { id: string }): UniversalQuestionCandidate => ({
  subject: over.id,
  ...over,
});

const finding = (kind: ScopeFinding["kind"], severity: ScopeFinding["severity"] = "warning"): ScopeFinding => ({
  id: `f-${kind}`,
  subjectKey: `s-${kind}`,
  subjectFingerprint: `fp-${kind}`,
  kind,
  severity,
  itemIds: ["i1"],
});

const report = (findings: ScopeFinding[]): ScopeValidationReport => ({
  findings,
  fingerprint: "fp",
} as ScopeValidationReport);

describe("universal question policy — tiers", () => {
  it("classifies a materially price-changing unknown as critical", () => {
    expect(classifyQuestionTier(q({ id: "dims", subject: "Room dimensions?", topic: "dimensions" })))
      .toBe("critical");
  });

  it("classifies an inferable question as assumable", () => {
    expect(
      classifyQuestionTier(
        q({ id: "tier", subject: "Finish level?", topic: "finishTier", inferable: true }),
      ),
    ).toBe("assumable");
  });

  it("classifies production takeoff detail as detailed", () => {
    expect(classifyQuestionTier(q({ id: "studs", subject: "How many studs at 16 in spacing?", topic: "structural" })))
      .toBe("detailed");
  });

  it("classifies a non-price-significant question as minor", () => {
    expect(classifyQuestionTier(q({ id: "color", subject: "Preferred paint sheen name?" }))).toBe("minor");
  });

  it("always treats trade assignment as detailed, whatever its impact", () => {
    expect(
      classifyQuestionTier(
        q({ id: "trade", subject: "Keep as Electrical or move to Finish Carpentry?", topic: "dimensions", isTradeAssignment: true }),
      ),
    ).toBe("detailed");
  });
});

describe("trade assignment never blocks a ballpark", () => {
  it("routes trade-assignment questions to defer, not ask", () => {
    const plan = planQuestions([
      q({ id: "trade", subject: "Keep as Electrical?", isTradeAssignment: true, topic: "structural" }),
      q({ id: "dims", subject: "Overall dimensions?", topic: "dimensions" }),
    ]);
    expect(plan.ask.map((c) => c.id)).toEqual(["dims"]);
    expect(plan.defer.map((c) => c.id)).toEqual(["trade"]);
  });

  it("stages suspicious_trade findings to the detailed estimate", () => {
    expect(findingReviewStage("suspicious_trade")).toBe("detailed");
    expect(findingReviewStage("duplicate")).toBe("ballpark");
  });

  it("does not count deferred findings as outstanding in ballpark mode", () => {
    const r = report([finding("suspicious_trade"), finding("zero_hours", "blocker"), finding("duplicate")]);
    const ballpark = evaluateScopeApproval(r, { mode: "ballpark" });
    expect(ballpark.outstanding.map((f) => f.kind)).toEqual(["duplicate"]);
    expect(ballpark.deferred.map((f) => f.kind)).toEqual(["suspicious_trade", "zero_hours"]);
    expect(ballpark.canApprove).toBe(true);
  });

  it("still blocks the same scope in detailed mode", () => {
    const r = report([finding("zero_hours", "blocker")]);
    expect(evaluateScopeApproval(r, { mode: "detailed" }).canApprove).toBe(false);
  });

  it("keeps price/scope-integrity findings active in ballpark", () => {
    const staged = partitionFindingsByMode(
      [finding("duplicate"), finding("unrelated_scope"), finding("missing_phase"), finding("suspicious_trade")],
      "ballpark",
    );
    expect(staged.active).toHaveLength(3);
    expect(staged.deferred).toHaveLength(1);
  });
});

describe("question budget and duplicate suppression", () => {
  it("suppresses a rephrasing of a question already planned", () => {
    const plan = planQuestions([
      q({ id: "a", subject: "Is the wall load bearing?", topic: "structural" }),
      q({ id: "b", subject: "Are these walls load-bearing?", topic: "structural" }),
    ]);
    expect(plan.ask).toHaveLength(1);
    expect(plan.duplicates.map((c) => c.id)).toEqual(["b"]);
  });

  it("normalizes phrasing into one dedupe key", () => {
    expect(questionDedupeKey(q({ id: "a", subject: "Is the wall load bearing?" })))
      .toBe(questionDedupeKey(q({ id: "b", subject: "Are these walls load bearing?" })));
  });

  it("keeps an ordinary ballpark at or below the target", () => {
    const plan = planQuestions(
      Array.from({ length: 12 }, (_, i) =>
        q({ id: `f${i}`, subject: `finish question ${i}`, topic: "finishTier" }),
      ),
    );
    expect(plan.ask).toHaveLength(BALLPARK_QUESTION_TARGET);
    expect(withinQuestionBudget(plan.ask.length)).toBe(true);
  });

  it("lets a genuinely complex project exceed the target, but never the ceiling", () => {
    const plan = planQuestions(
      Array.from({ length: 20 }, (_, i) =>
        q({ id: `d${i}`, subject: `dimension question ${i}`, topic: "dimensions" }),
      ),
    );
    expect(plan.ask.length).toBeGreaterThan(BALLPARK_QUESTION_TARGET);
    expect(plan.ask.length).toBeLessThanOrEqual(BALLPARK_QUESTION_MAX);
  });

  it("never loses a trimmed question — it becomes an assumption", () => {
    const candidates = Array.from({ length: 12 }, (_, i) =>
      q({ id: `f${i}`, subject: `finish question ${i}`, topic: "finishTier" }),
    );
    const plan = planQuestions(candidates);
    expect(plan.ask.length + plan.assume.length).toBe(candidates.length);
  });

  it("ranks the highest-impact unknown first", () => {
    const plan = planQuestions([
      q({ id: "access", subject: "site access", topic: "siteConditions" }),
      q({ id: "dims", subject: "dimensions", topic: "dimensions" }),
    ]);
    expect(plan.ask[0]?.id).toBe("dims");
  });

  it("reviews everything in detailed mode — no deferral, no budget", () => {
    const plan = planQuestions(
      [
        q({ id: "trade", subject: "Keep as Electrical?", isTradeAssignment: true }),
        q({ id: "hours", subject: "Confirm labor hours", topic: "structural" }),
        ...Array.from({ length: 12 }, (_, i) => q({ id: `d${i}`, subject: `dimension ${i}`, topic: "dimensions" })),
      ],
      { mode: "detailed" },
    );
    expect(plan.defer).toHaveLength(0);
    expect(plan.ask.length).toBeGreaterThan(BALLPARK_QUESTION_MAX);
    expect(plan.ask.map((c) => c.id)).toContain("trade");
  });
});

describe("trade-agnostic behaviour across project types", () => {
  const archetypes: Record<string, UniversalQuestionCandidate[]> = {
    "garage conversion": [
      q({ id: "g-dims", subject: "Garage dimensions?", topic: "dimensions" }),
      q({ id: "g-trade", subject: "Keep as Framing?", isTradeAssignment: true }),
      q({ id: "g-studs", subject: "How many studs?", topic: "structural" }),
      q({ id: "g-tier", subject: "Finish level?", topic: "finishTier", inferable: true }),
    ],
    "kitchen cabinets": [
      q({ id: "k-lf", subject: "Cabinet run dimensions?", topic: "dimensions" }),
      q({ id: "k-trade", subject: "Move to Finish Carpentry?", isTradeAssignment: true }),
      q({ id: "k-sku", subject: "Cabinet SKU?", topic: "finishTier" }),
    ],
    bathroom: [
      q({ id: "b-type", subject: "Tub or shower?", topic: "bathroomType" }),
      q({ id: "b-move", subject: "Relocating plumbing?", topic: "plumbingRelocation" }),
      q({ id: "b-trade", subject: "Keep as Plumbing?", isTradeAssignment: true }),
    ],
    "handyman repair": [
      q({ id: "h-scope", subject: "How large is the damaged area?", topic: "dimensions" }),
      q({ id: "h-trade", subject: "Keep as General Carpentry?", isTradeAssignment: true }),
      q({ id: "h-sheen", subject: "Preferred sheen?" }),
    ],
    roofing: [
      q({ id: "r-area", subject: "Roof area dimensions?", topic: "dimensions" }),
      q({ id: "r-layers", subject: "Structural deck repairs expected?", topic: "structural" }),
      q({ id: "r-trade", subject: "Keep as Roofing?", isTradeAssignment: true }),
      q({ id: "r-fast", subject: "Which fasteners?", topic: "other" }),
    ],
    "site / concrete": [
      q({ id: "s-dims", subject: "Slab dimensions?", topic: "dimensions" }),
      q({ id: "s-access", subject: "Truck access to the pour?", topic: "siteConditions" }),
      q({ id: "s-trade", subject: "Keep as Concrete?", isTradeAssignment: true }),
    ],
  };

  for (const [name, candidates] of Object.entries(archetypes)) {
    it(`${name}: never asks a trade-assignment question and stays in budget`, () => {
      const plan = planQuestions(candidates);
      expect(plan.ask.some((c) => c.isTradeAssignment)).toBe(false);
      expect(plan.defer.some((c) => c.isTradeAssignment)).toBe(true);
      expect(withinQuestionBudget(plan.ask.length)).toBe(true);
    });

    it(`${name}: keeps the highest-impact unknown askable`, () => {
      const plan = planQuestions(candidates);
      expect(plan.ask.length).toBeGreaterThan(0);
    });
  }
});

describe("bilingual preliminary labeling and conversion CTA copy", () => {
  it("exposes preliminary status copy in EN and ES", () => {
    for (const bundle of [en, es]) {
      const mode = (bundle as unknown as { mode: Record<string, string> }).mode;
      expect(mode.preliminaryBadge?.length).toBeGreaterThan(0);
      expect(mode.preliminaryTitle?.length).toBeGreaterThan(0);
      expect(mode.preliminaryBody?.length).toBeGreaterThan(0);
    }
  });

  it("exposes a Convert to Detailed Estimate action in EN and ES", () => {
    for (const bundle of [en, es]) {
      const convert = (bundle as unknown as { convert: Record<string, string> }).convert;
      expect(convert.action?.length).toBeGreaterThan(0);
    }
  });

  it("exposes deferred-review copy on the scope panel in EN and ES", () => {
    for (const bundle of [enScope, esScope]) {
      const validation = (bundle as unknown as { validation: Record<string, unknown> }).validation;
      const deferred = validation.deferred as Record<string, string>;
      expect(deferred.title?.length).toBeGreaterThan(0);
      expect(deferred.body?.length).toBeGreaterThan(0);
      expect((validation.subtitleBallpark as string)?.length).toBeGreaterThan(0);
    }
  });
});
