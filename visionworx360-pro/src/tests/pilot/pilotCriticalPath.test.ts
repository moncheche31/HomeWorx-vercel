/**
 * CONTRACTOR PILOT — critical-path smoke / regression suite.
 *
 * One end-to-end pass over the workflows a pilot contractor actually uses:
 *
 *   create project -> add media/context -> generate/revise scope -> ballpark
 *   -> revise assumptions -> detailed transition -> proposal -> print / PDF
 *   -> share / client view.
 *
 * Every assertion here protects behavior that already shipped and was already
 * fixed once. It is deliberately coarse-grained: exact dollars, copy and
 * markup belong to the focused suites. This file exists so a future change
 * cannot quietly remove a working step of the pilot path.
 *
 * Two kinds of check are used:
 *  - DOMAIN checks run the real engines end to end;
 *  - CONTRACT checks read the source of a UI/route surface and assert the
 *    wiring still exists (the same technique the shipped feature suites use,
 *    e.g. convertToDetailed.test.ts).
 */

import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { resolveBallparkScope, type BallparkGeometryFacts } from "@/domains/ballpark/quantityResolution";
import { recalculateBallparkFromScope } from "@/domains/ballpark/scopeRecalc";
import { finalizeBallparkBand, evidenceCompleteness } from "@/domains/ballpark/plausibility";
import { planBallparkQuestions, isDetailedOnlyQuestion } from "@/domains/ballpark/questionPriority";
import { BALLPARK_ENGINE_VERSION, isBallparkSnapshotStale } from "@/domains/ballpark/engineVersion";
import { BALLPARK_QUESTION_BUDGET, estimatingModeContract } from "@/domains/estimating/modes";
import { deriveClarificationState, countAnsweredEntries } from "@/domains/estimating/clarificationState";
import {
  buildProposal,
  defaultProposalSettings,
  planProposalGallery,
  containsInternalTerms,
  computeAsIllustrated,
} from "@/domains/proposal";
import type { ProposalInput } from "@/domains/proposal/types";
import {
  generateShareToken,
  hashShareToken,
  resolveShareAccess,
  sanitizeShareDocument,
  canTransitionChangeRequest,
} from "@/domains/proposal/share";

/* ------------------------------------------------------------------ *
 * Fixture: one realistic pilot project, minimal input.
 * ------------------------------------------------------------------ */

const geometry = ((): BallparkGeometryFacts => {
  const lengthFt = 22;
  const widthFt = 20;
  const ceilingHeightFt = 9;
  const floor = lengthFt * widthFt;
  const perimeter = 2 * (lengthFt + widthFt);
  const wall = perimeter * ceilingHeightFt;
  return {
    lengthFt,
    widthFt,
    ceilingHeightFt,
    floorAreaSf: floor,
    ceilingAreaSf: floor,
    wallNetAreaSf: Math.round(wall * 0.88),
    drywallSurfaceSf: Math.round(wall * 0.88 + floor),
    flooringWithWasteSf: Math.round(floor * 1.1),
    trimLf: perimeter,
    partitionLf: perimeter,
    perimeterLf: perimeter,
  } as BallparkGeometryFacts;
})();

const SCOPE_TITLES = [
  "Pull permits for the garage conversion",
  "Frame new partition walls",
  "Insulate walls and ceiling",
  "Hang and finish drywall",
  "Install luxury vinyl plank flooring",
  "Rough-in electrical for the new suite",
  "Install mini-split HVAC",
  "Rough-in plumbing for the new bathroom",
  "Tile the shower walls",
  "Set the vanity and vanity light",
  "Paint walls and ceiling",
  "Install baseboard trim",
  "Haul debris and provide dumpster",
];

const scopeItems = SCOPE_TITLES.map((title, index) => ({
  id: `item-${index}`,
  title,
  quantity: null,
  unitKey: null,
  isIncluded: true,
}));

const readSource = (path: string): string => {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  return readFileSync(path, "utf8");
};

/* ------------------------------------------------------------------ *
 * 1. Scope -> ballpark: the engine never stalls.
 * ------------------------------------------------------------------ */

describe("pilot path: scope -> ballpark", () => {
  it("prices every ordinary residential line with no blockers", () => {
    const { resolved, unresolved } = resolveBallparkScope(
      scopeItems.map((i) => ({ id: i.id, title: i.title, quantity: i.quantity, unitKey: i.unitKey })),
      { geometry },
    );
    expect(resolved.length).toBeGreaterThan(0);
    expect(unresolved).toEqual([]);
  });

  it("produces an ordered, disclosed band from minimal input", () => {
    const result = recalculateBallparkFromScope(scopeItems, { geometry });
    expect(result).not.toBeNull();
    const band = result!.band;
    expect(band.low).toBeLessThan(band.expected);
    expect(band.expected).toBeLessThan(band.high);
    expect(band.low).toBeGreaterThan(0);
    /* Whatever the engine assumed on the contractor's behalf is disclosed. */
    expect(result!.assumptions.length).toBeGreaterThan(0);
    expect(result!.unpriceable).toEqual([]);
  });

  it("keeps the presented band inside the plausibility window", () => {
    const result = recalculateBallparkFromScope(scopeItems, { geometry })!;
    const evidence = {
      hasDimensions: true,
      pricedCount: result.pricedCount,
      derivedCount: result.derivedCount,
      allowanceCount: result.allowanceCount,
      correctedCount: result.correctedCount,
      unpriceableCount: result.unpriceable.length,
    };
    const final = finalizeBallparkBand(result.band, evidence);
    expect(final.low).toBeLessThan(final.expected);
    expect(final.expected).toBeLessThan(final.high);
    const relSpread = (final.high - final.low) / final.expected;
    expect(relSpread).toBeGreaterThan(0);
    expect(relSpread).toBeLessThanOrEqual(0.72 + 1e-6);
    expect(evidenceCompleteness(evidence)).toBeGreaterThan(0);
  });

  it("moves material money only when the finish tier changes", () => {
    const standard = recalculateBallparkFromScope(scopeItems, { geometry, finishTier: "standard" })!;
    const value = recalculateBallparkFromScope(scopeItems, { geometry, finishTier: "value" })!;
    const premium = recalculateBallparkFromScope(scopeItems, { geometry, finishTier: "premium" })!;
    expect(value.band.expected).toBeLessThan(standard.band.expected);
    expect(premium.band.expected).toBeGreaterThan(standard.band.expected);
  });
});

/* ------------------------------------------------------------------ *
 * 2. Questions, assumptions and the refinement loop.
 * ------------------------------------------------------------------ */

describe("pilot path: questions and assumption revision", () => {
  it("asks few, high-impact, ballpark-only questions", () => {
    const plan = planBallparkQuestions([
      { id: "dims", subject: "Room dimensions", topic: "dimensions", inferable: true, inferredFrom: "geometry" },
      { id: "finish", subject: "Finish level", topic: "finishTier" },
      { id: "bath", subject: "Is a full bathroom included?", topic: "bathroomType" },
      { id: "recept", subject: "How many receptacles are in the plan?", topic: "electricalHvac" },
    ]);
    expect(plan.ask.length).toBeLessThanOrEqual(BALLPARK_QUESTION_BUDGET);
    expect(plan.ask.every((q) => !isDetailedOnlyQuestion(q.subject))).toBe(true);
    expect(plan.ask.some((q) => q.topic === "dimensions")).toBe(false);
  });

  it("honours a contractor correction and keeps it across recalculation", () => {
    const base = recalculateBallparkFromScope(scopeItems, { geometry })!;
    const target = base.assumptions[0]!;
    const key = `${target.itemId}:${target.itemKey}`;
    const corrected = recalculateBallparkFromScope(scopeItems, {
      geometry,
      assumptionOverrides: { [key]: Number(target.quantity ?? 1) * 2 + 1 },
    })!;
    expect(corrected.band.expected).not.toBe(base.band.expected);
    expect(corrected.correctedCount).toBeGreaterThan(0);
    /* Recalculating again with the same override is stable. */
    const again = recalculateBallparkFromScope(scopeItems, {
      geometry,
      assumptionOverrides: { [key]: Number(target.quantity ?? 1) * 2 + 1 },
    })!;
    expect(again.band).toEqual(corrected.band);
  });

  it("keeps clarification CTAs truthful across the lifecycle", () => {
    expect(deriveClarificationState({ answeredCount: 0, openCount: 3 }).status).toBe("unstarted");
    expect(deriveClarificationState({ answeredCount: 3, openCount: 0 }).status).toBe("completed");
    expect(deriveClarificationState({ answeredCount: 3, openCount: 2 }).status).toBe("new");
    /* Persisted answers, not local state: a refresh reconstructs the same status. */
    const persisted = { size: "22x20", finish: "  ", bath: { status: "answered" } };
    expect(countAnsweredEntries(persisted)).toBe(2);
    expect(deriveClarificationState({ answeredCount: countAnsweredEntries(persisted), openCount: 0 }).completed).toBe(true);
  });

  it("auto-heals snapshots written by an older engine", () => {
    expect(isBallparkSnapshotStale({ engineVersion: BALLPARK_ENGINE_VERSION })).toBe(false);
    expect(isBallparkSnapshotStale({ engineVersion: BALLPARK_ENGINE_VERSION - 1 })).toBe(true);
    expect(isBallparkSnapshotStale({})).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * 3. Ballpark vs Detailed separation.
 * ------------------------------------------------------------------ */

describe("pilot path: ballpark -> detailed transition", () => {
  it("keeps the two modes contractually distinct", () => {
    const ballpark = estimatingModeContract("ballpark");
    const detailed = estimatingModeContract("detailed");
    expect(ballpark.questionBudget).toBe(BALLPARK_QUESTION_BUDGET);
    expect(ballpark.mode).toBe("ballpark");
    expect(detailed.mode).toBe("detailed");
    expect(detailed.questionBudget).not.toBe(ballpark.questionBudget);
  });

  it("converts in place and preserves the original ballpark range", () => {
    const fn = readSource("src/features/estimating/services/estimating.functions.ts");
    expect(fn).toMatch(/convertEstimateToDetailed/);
    expect(fn).toMatch(/\.update\(\{ intake_mode: "detailed" \}\)/);
    expect(fn).toMatch(/ballparkRange: existing\.range_snapshot/);
  });

  it("keeps Use This Ballpark and the range card entry points wired", () => {
    const card = readSource("src/features/estimating/components/BallparkRangeCard.tsx");
    expect(card).toMatch(/ConvertToDetailedDialog/);
    expect(card).toMatch(/clarificationLabel|deriveClarificationState/);
  });
});

/* ------------------------------------------------------------------ *
 * 4. Proposal generation, variants, gallery hierarchy, As Illustrated.
 * ------------------------------------------------------------------ */

const SCOPE_TEXT = `Framing
We will frame the new partition walls and insulate the space.

Finishes
New flooring, paint and trim will be installed throughout.`;

const proposalInput = (over: Partial<ProposalInput> = {}): ProposalInput => ({
  projectId: "pilot-90210",
  projectName: "Garage Conversion",
  locale: "en-US",
  audience: "customer",
  customer: { name: "Dana Miller", propertyAddress: "88 Oak Ave" },
  branding: {
    companyName: "VisionWorx Remodeling",
    logoUrl: null,
    contractorPhotoUrl: null,
    phone: "555-0100",
    email: "hello@example.com",
    website: null,
    addressLine: "12 Main St",
    licenseNumber: "LIC-1234",
    insuranceLine: null,
    accentColor: null,
  },
  approvedScopeText: SCOPE_TEXT,
  scopeApproved: true,
  roomNames: ["Garage"],
  media: [
    { id: "b1", kind: "before", storagePath: "before-1.jpg", caption: null, altText: null },
    { id: "b2", kind: "before", storagePath: "before-2.jpg", caption: null, altText: null },
    { id: "a1", kind: "rendering", storagePath: "after-1.jpg", caption: null, altText: null },
  ],
  baseTotal: null,
  pricingSource: { kind: "ballpark", low: 36500, expected: 48000, high: 65500 },
  currency: "USD",
  settings: defaultProposalSettings(),
  issuedAt: "2026-03-01T00:00:00.000Z",
  ...over,
});

describe("pilot path: proposal", () => {
  it("builds a client proposal from the saved ballpark band", () => {
    const doc = buildProposal(proposalInput());
    expect(doc.sections).toContain("cover");
    expect(doc.sections).toContain("scope");
    expect(doc.sections).toContain("investment");
    expect(doc.investment.map((o) => o.amount)).toEqual([36500, 48000, 65500]);
    expect(doc.awaitingApproval).toBe(false);
  });

  it("never leaks internal cost language into a client-facing document", () => {
    const doc = buildProposal(proposalInput());
    for (const section of doc.scopeSections) {
      for (const line of section.lines) {
        expect(containsInternalTerms(line)).toBe(false);
      }
    }
  });

  it("keeps every contractor/client/realtor/buyer variant buildable", () => {
    for (const audience of ["contractor", "customer"] as const) {
      const doc = buildProposal(proposalInput({ audience }));
      expect(doc.audience).toBe(audience);
      expect(doc.sections.length).toBeGreaterThan(0);
    }
    for (const template of ["contractor", "buyer_transformation", "realtor_brief"] as const) {
      const doc = buildProposal(
        proposalInput({ settings: { ...defaultProposalSettings(), template } }),
      );
      expect(doc.template).toBe(template);
      expect(doc.sections.length).toBeGreaterThan(0);
    }
  });

  it("makes the AFTER image dominant and BEFORE images supporting", () => {
    const doc = buildProposal(proposalInput());
    const plan = planProposalGallery(doc.gallery);
    expect(plan.primary).not.toBeNull();
    expect(plan.primary?.kind).toBe("rendering");
    expect(plan.supporting.some((g) => g.kind === "before")).toBe(true);
  });

  it("anchors As Illustrated inside the ballpark band and stays builder-grade for buyers", () => {
    const band = { low: 36500, expected: 48000, high: 65500 };
    const contractorSide = computeAsIllustrated({
      band,
      presentation: "contractor",
      finishLabels: ["quartz countertops", "custom tile shower"],
    });
    const buyerSide = computeAsIllustrated({
      band,
      presentation: "buyer",
      finishLabels: [],
    });
    for (const result of [contractorSide, buyerSide]) {
      if (!result) continue;
      expect(result.amount).toBeGreaterThanOrEqual(band.low);
      expect(result.amount).toBeLessThanOrEqual(band.high);
    }
    if (contractorSide && buyerSide) {
      expect(buyerSide.amount).toBeLessThanOrEqual(contractorSide.amount);
    }
  });

  it("builds a Spanish proposal with the same structure", () => {
    const en = buildProposal(proposalInput());
    const es = buildProposal(proposalInput({ locale: "es-US" }));
    expect(es.sections).toEqual(en.sections);
  });
});

/* ------------------------------------------------------------------ *
 * 5. Print / PDF and share / client portal.
 * ------------------------------------------------------------------ */

describe("pilot path: print, share and client portal", () => {
  it("keeps the chrome-free print route and print stylesheet", () => {
    const route = readSource("src/routes/proposal-print.$projectId.tsx");
    expect(route).toMatch(/ProposalPrintPage|createFileRoute/);
    const printCss = readSource("src/styles.css");
    expect(printCss).toMatch(/@media print/);
  });

  it("keeps the tokenized client portal route public and read-only", () => {
    const route = readSource("src/routes/p.$token.tsx");
    expect(route).toMatch(/createFileRoute\("\/p\/\$token"\)/);
    expect(route).not.toMatch(/_authenticated/);
  });

  it("hashes share tokens and enforces revoked/expired access", () => {
    const token = generateShareToken();
    expect(token.length).toBeGreaterThan(20);
    expect(hashShareToken(token)).not.toBe(token);
    expect(resolveShareAccess(null).ok).toBe(false);
    expect(resolveShareAccess({ status: "revoked", expiresAt: null })).toEqual({
      ok: false,
      reason: "revoked",
    });
    expect(
      resolveShareAccess({ status: "active", expiresAt: "2020-01-01T00:00:00.000Z" }),
    ).toEqual({ ok: false, reason: "expired" });
    expect(resolveShareAccess({ status: "active", expiresAt: null }).ok).toBe(true);
  });

  it("strips internal media/branding artifacts from the shared document", () => {
    const doc = buildProposal(proposalInput());
    const shared = sanitizeShareDocument(doc);
    expect(JSON.stringify(shared)).not.toMatch(/blob:/);
  });

  it("keeps the change-request lifecycle legal", () => {
    expect(canTransitionChangeRequest("requested", "reviewing")).toBe(true);
    expect(canTransitionChangeRequest("applied", "requested")).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * 6. Auth / tenant isolation guardrails.
 * ------------------------------------------------------------------ */

describe("pilot path: auth and tenant guardrails", () => {
  it("registers only the configured auth attacher", () => {
    const start = readSource("src/start.ts");
    expect(start).toMatch(/functionMiddleware: \[attachConfiguredAuth\]/);
    expect(start).not.toMatch(/@\/integrations\/supabase\/auth-attacher/);
  });

  it("keeps the protected app subtree gated", () => {
    const app = readSource("src/routes/app.tsx");
    expect(app).toMatch(/ProtectedRoute/);
  });
});
