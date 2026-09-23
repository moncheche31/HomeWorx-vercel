// @ts-nocheck -- HOST-REPO GUARD ONLY: this file belongs to the VisionWorx360 Pro project and is stored in HomeWorx-vercel, whose tsconfig type-checks every *.ts during `next build`. harness/run.sh strips this line when it copies the suite into a VisionWorx checkout.
// @vitest-environment node
/**
 * VisionWorx360 Pro — Step 1B regression suite: organization pricing
 * inheritance at the REAL write boundary.
 *
 * Contract under test (ADR-061 + recovery brief):
 *  - An estimate carries the pricing method and inputs the organization
 *    intended at creation; derived estimates (revision / version / copy) carry
 *    their SOURCE estimate's pricing unless the contractor chose otherwise.
 *  - The audit/provenance record never misstates where a value came from.
 *  - The database invariant cost and the TypeScript canonical pricing path agree.
 *
 * These tests are written against the CURRENT implementation and are expected
 * to FAIL wherever the defect exists. Do not weaken an assertion to make it
 * pass; fix the implementation instead.
 *
 * Fixture money (both line sets are contractor-priced, whole-dollar policy):
 *   line A: 10 h x $85 + $500 material x 1  = $1,350 direct
 *   line B:  4 h x $85 + $125 material x 2  =   $590 direct
 *   job cost                                  = $1,940
 *   target gross margin 40%  -> $1,940 / 0.60 = $3,233
 *   overhead 15% / profit 12% (per line)      -> $1,739 + $760 = $2,499
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";

import { copyEstimateToProjectImpl } from "@/features/estimating/services/estimateCopy.server";
import { buildProjectPricing, commitApprovedEstimateImpl } from "@/features/estimating/services/estimateCommit.server";
import { calculateEngineEstimate } from "@/domains/estimating/engine/calculate";
import { pricingStrategyOf } from "@/domains/estimating/pricingStrategy";
import * as h from "./harness";

/* ------------------------------------------------------------------ *
 * Fixtures and independent expectations (never computed by the code under test)
 * ------------------------------------------------------------------ */

const TGM_ORG: h.OrgPricing = {
  defaultPricingMethod: "target_gross_margin",
  defaultTargetGrossMarginPct: 40,
  /* Configured but inactive under a margin target. Deliberately NOT 10/10. */
  defaultOverheadPct: 15,
  defaultProfitPct: 12,
  defaultLaborRate: 85,
};

const OHP_ORG: h.OrgPricing = {
  defaultPricingMethod: "overhead_profit",
  /* Configured but inactive under overhead + profit. */
  defaultTargetGrossMarginPct: 33,
  /* Deliberately NOT the hard-coded 10/10 fallbacks. */
  defaultOverheadPct: 15,
  defaultProfitPct: 12,
  defaultLaborRate: 85,
};

const JOB_COST = 1940;
const round = (v: number) => (v > 0 ? Math.round(v) : -Math.round(-v));
const tgmSell = (jobCost: number, pct: number) => round(jobCost / (1 - pct / 100));
const LINE_DIRECT = [1350, 590];
const ohpSell = (oh: number, p: number) =>
  LINE_DIRECT.reduce((sum, d) => {
    const o = round((d * oh) / 100);
    return sum + d + o + round(((d + o) * p) / 100);
  }, 0);

const n = (v: unknown) => Number(v ?? 0);

/* Evidence log: every derived estimate's stored pricing, for the report. */
const evidence: Array<Record<string, unknown>> = [];
function record(label: string, e: h.EstimateEvidence, extra: Record<string, unknown> = {}) {
  const line = h.describePricing(label, e);
  console.log(line);
  evidence.push({
    label,
    pricing_method: e.row.pricing_method,
    target_gross_margin_pct: n(e.row.target_gross_margin_pct),
    default_overhead_pct: n(e.row.default_overhead_pct),
    default_profit_pct: n(e.row.default_profit_pct),
    default_labor_rate: n(e.row.default_labor_rate),
    pricing_settings_locked_at: e.row.pricing_settings_locked_at ? "set" : null,
    line_overhead_profit: e.lines.map((l) => [n(l.overhead_pct), n(l.profit_pct)]),
    lines_resolved: e.lines.filter((l) => l.resolution_status === "resolved").length,
    lines_total: e.lines.length,
    job_cost_db: n(e.db.jobCost),
    sell_db: n(e.db.canonicalSubtotal),
    sell_ts: e.ts.subtotal,
    ...extra,
  });
}

/**
 * Pricing effect of the stored METHOD alone: re-price the SOURCE estimate's
 * (correctly priced) lines with the derived estimate's stored strategy and
 * line overhead/profit. Isolates the method defect from any line-copy defect.
 */
function methodOnlySell(source: h.EstimateEvidence, derived: h.EstimateEvidence): number {
  const strategy = pricingStrategyOf({
    pricingMethod: derived.row.pricing_method,
    targetGrossMarginPct: derived.row.target_gross_margin_pct,
    defaultOverheadPct: derived.row.default_overhead_pct,
    defaultProfitPct: derived.row.default_profit_pct,
  });
  const lines = source.lines.map((l, i) => ({
    id: String(l.id),
    quantity: n(l.quantity),
    laborHours: n(l.labor_hours),
    laborRate: n(l.labor_rate),
    materialCost: n(l.material_cost),
    equipmentCost: n(l.equipment_cost),
    subcontractorCost: n(l.subcontractor_cost),
    otherCost: n(l.other_cost),
    overheadPct: n(derived.lines[i]?.overhead_pct),
    profitPct: n(derived.lines[i]?.profit_pct),
    contingencyPct: n(l.contingency_pct),
    isTaxable: false,
  }));
  return calculateEngineEstimate(lines, { currency: "USD", taxRatePct: 0, pricingStrategy: strategy }).totals.subtotal;
}

/**
 * Provenance must not misstate the organization's settings. Accepted shapes:
 *  (a) a flat record whose values are the organization's configured values, or
 *  (b) a record that separates the organization's configured values
 *      (`organization_configured` | `organization` | `configured`) from the
 *      values applied to the estimate.
 * Returns the list of misstatements (empty = truthful).
 */
function provenanceMisstatements(prov: Record<string, unknown> | null, org: Record<string, unknown>): string[] {
  if (!prov) return ["no pricing provenance recorded"];
  const configured = (prov.organization_configured ?? prov.organization ?? prov.configured ?? null) as Record<string, unknown> | null;
  const src = configured ?? prov;
  const pairs: Array<[string, string]> = [
    ["pricing_method", "default_pricing_method"],
    ["target_gross_margin_pct", "default_target_gross_margin_pct"],
    ["default_overhead_pct", "default_overhead_pct"],
    ["default_profit_pct", "default_profit_pct"],
    ["default_labor_rate", "default_labor_rate"],
  ];
  const out: string[] = [];
  for (const [pk, ok] of pairs) {
    if (!(pk in src)) {
      out.push(`${pk}: missing`);
      continue;
    }
    const a = src[pk];
    const b = org[ok];
    const same = typeof b === "string" ? a === b : n(a) === n(b);
    if (!same) out.push(`${pk}: recorded ${JSON.stringify(a)} as organization_defaults, organization has ${JSON.stringify(b)}`);
  }
  return out;
}

/** The values the provenance says were APPLIED must equal the stored estimate row. */
function appliedProvenanceMismatches(prov: Record<string, unknown> | null, row: Record<string, unknown>): string[] {
  if (!prov) return ["no pricing provenance recorded"];
  const applied = (prov.applied ?? prov) as Record<string, unknown>;
  const out: string[] = [];
  for (const k of ["pricing_method", "target_gross_margin_pct", "default_overhead_pct", "default_profit_pct", "default_labor_rate"]) {
    if (!(k in applied)) continue;
    const same = typeof row[k] === "string" ? applied[k] === row[k] : n(applied[k]) === n(row[k]);
    if (!same) out.push(`${k}: provenance ${JSON.stringify(applied[k])} vs estimate ${JSON.stringify(row[k])}`);
  }
  return out;
}

/**
 * Shared assertions for a derived estimate that must carry its source's pricing.
 * Soft assertions so every independent symptom is reported in one run.
 */
function expectCarriesSourcePricing(label: string, source: h.EstimateEvidence, derived: h.EstimateEvidence) {
  const s = source.row;
  const d = derived.row;
  expect.soft(d.pricing_method, `${label}: pricing_method`).toBe(s.pricing_method);
  expect.soft(n(d.target_gross_margin_pct), `${label}: target_gross_margin_pct`).toBe(n(s.target_gross_margin_pct));
  expect.soft(n(d.default_overhead_pct), `${label}: default_overhead_pct`).toBe(n(s.default_overhead_pct));
  expect.soft(n(d.default_profit_pct), `${label}: default_profit_pct`).toBe(n(s.default_profit_pct));
  expect.soft(n(d.default_labor_rate), `${label}: default_labor_rate`).toBe(n(s.default_labor_rate));
  expect
    .soft(derived.lines.map((l) => [n(l.overhead_pct), n(l.profit_pct)]), `${label}: line overhead/profit`)
    .toEqual(source.lines.map((l) => [n(l.overhead_pct), n(l.profit_pct)]));
  expect
    .soft(derived.lines.filter((l) => l.resolution_status === "resolved").length, `${label}: contractor-priced lines stay priced`)
    .toBe(source.lines.filter((l) => l.resolution_status === "resolved").length);
  expect.soft(n(derived.db.jobCost), `${label}: job cost (database)`).toBe(n(source.db.jobCost));
  expect.soft(n(derived.db.canonicalSubtotal), `${label}: selling price (database invariant cost)`).toBe(n(source.db.canonicalSubtotal));
  expect.soft(derived.ts.subtotal, `${label}: selling price (TypeScript canonical path)`).toBe(source.ts.subtotal);
  expect
    .soft(methodOnlySell(source, derived), `${label}: price of the SOURCE lines under the derived estimate's stored method`)
    .toBe(n(source.db.canonicalSubtotal));
}

/** A derived estimate's creation audit row must record where its pricing came from. */
function expectDerivedPricingProvenance(label: string, derived: h.EstimateEvidence) {
  const meta = h.creationAuditMetadata(derived) ?? {};
  const prov = (meta.pricing_inherited ?? meta.pricing ?? null) as Record<string, unknown> | null;
  expect.soft(prov, `${label}: creation audit event records pricing provenance`).not.toBeNull();
  if (prov) {
    expect.soft(appliedProvenanceMismatches(prov, derived.row), `${label}: provenance matches the stored estimate`).toEqual([]);
  }
}

/* ------------------------------------------------------------------ *
 * Suite
 * ------------------------------------------------------------------ */

beforeAll(async () => {
  await h.probeLiveBoundary();
}, 60_000);

/**
 * Every test FAILS (never skips) with the "BLOCKED: ..." reason when the real
 * database boundary is unavailable. See harness.probeLiveBoundary().
 */
function liveIt(name: string, fn: () => Promise<void> | void, timeout = 60_000) {
  it(name, async () => {
    h.assertLive();
    await fn();
  }, timeout);
}

afterAll(async () => {
  const out = process.env["VW_IT_EVIDENCE_OUT"];
  if (out) fs.writeFileSync(out, JSON.stringify(evidence, null, 2));
  await h.releaseLiveBoundary();
});

describe("A. target_gross_margin organization (40% target; org overhead 15% / profit 12% configured; $85/hr)", () => {
  let t: h.Tenant;
  let projectId: string;
  let sourceId: string;
  let source: h.EstimateEvidence;

  beforeAll(async () => {
    if (h.isBlocked()) return;
    t = await h.createTenant("A-tgm", { ...TGM_ORG });
    projectId = await h.createProjectWithScope(t, "A source");
    sourceId = await h.createEstimateFromScope(t, projectId);
    await h.priceLinesAsContractor(t, sourceId);
    source = await h.readEvidence(t, sourceId);
    record("A1 create_estimate_from_scope", source);
  }, 60_000);

  liveIt("A1 create_estimate_from_scope stores the organization's method, target and labor rate, and locks them", () => {
    expect(source.row.pricing_method).toBe("target_gross_margin");
    expect(n(source.row.target_gross_margin_pct)).toBe(40);
    /* ADR-061: overhead/profit are not used under a margin target. */
    expect(n(source.row.default_overhead_pct)).toBe(0);
    expect(n(source.row.default_profit_pct)).toBe(0);
    expect(n(source.row.default_labor_rate)).toBe(85);
    expect(source.row.pricing_settings_locked_at).not.toBeNull();
    expect(source.lines.map((l) => [n(l.overhead_pct), n(l.profit_pct)])).toEqual([[0, 0], [0, 0]]);
  });

  liveIt("A1 math: selling price = job cost / (1 - 40%) in the database AND the TypeScript canonical path", () => {
    expect(n(source.db.jobCost)).toBe(JOB_COST);
    expect(n(source.db.canonicalSubtotal)).toBe(tgmSell(JOB_COST, 40));
    expect(source.ts.subtotal).toBe(tgmSell(JOB_COST, 40));
  });

  liveIt("A1 provenance: values applied to the estimate are recorded accurately", () => {
    expect(appliedProvenanceMismatches(h.createdPricingProvenance(source), source.row)).toEqual([]);
  });

  liveIt("A1 provenance: a record labelled organization_defaults does not misstate the organization's settings", async () => {
    const org = await h.readOrg(t);
    const prov = h.createdPricingProvenance(source);
    const wrong = provenanceMisstatements(prov, org);
    evidence.push({ label: `${String(source.row.pricing_method)} provenance`, recorded: prov, misstatements: wrong });
    expect(wrong, `provenance misstatements: ${JSON.stringify(wrong)}`).toEqual([]);
  });

  liveIt("A2 create_estimate_revision carries the source's target_gross_margin pricing", async () => {
    const rev = await h.readEvidence(t, await h.createRevision(t, sourceId));
    record("A2 create_estimate_revision", rev, { method_only_sell: methodOnlySell(source, rev) });
    expectCarriesSourcePricing("A2 revision", source, rev);
    expectDerivedPricingProvenance("A2 revision", rev);
  });

  liveIt("A3 create_estimate_version carries the source's target_gross_margin pricing", async () => {
    const ver = await h.readEvidence(t, await h.createVersion(t, sourceId));
    record("A3 create_estimate_version", ver, { method_only_sell: methodOnlySell(source, ver) });
    expectCarriesSourcePricing("A3 version", source, ver);
    expectDerivedPricingProvenance("A3 version", ver);
  });

  liveIt("A4 copy_estimate_to_project WITH pricing + markup (production copyEstimateToProjectImpl) carries the source's pricing", async () => {
    const target = await h.createProjectWithScope(t, "A copy target (markup)");
    const res = await copyEstimateToProjectImpl(t.sb, { sourceEstimateId: sourceId, targetProjectId: target, options: { copyPricing: true, copyMarkup: true } });
    const copy = await h.readEvidence(t, res.estimateId);
    record("A4 copy (pricing+markup)", copy, { method_only_sell: methodOnlySell(source, copy) });
    expectCarriesSourcePricing("A4 copy with markup", source, copy);
    expectDerivedPricingProvenance("A4 copy with markup", copy);
  });

  liveIt("A5 copy_estimate_to_project WITHOUT markup takes the ORGANIZATION's pricing, not hard-coded 10/10", async () => {
    const target = await h.createProjectWithScope(t, "A copy target (no markup)");
    const res = await copyEstimateToProjectImpl(t.sb, { sourceEstimateId: sourceId, targetProjectId: target, options: { copyPricing: true, copyMarkup: false } });
    const copy = await h.readEvidence(t, res.estimateId);
    record("A5 copy (pricing, no markup)", copy);
    expect.soft(copy.row.pricing_method, "A5: method from organization").toBe("target_gross_margin");
    expect.soft(n(copy.row.target_gross_margin_pct), "A5: target from organization").toBe(40);
    expect.soft(n(copy.row.default_overhead_pct), "A5: no overhead under a margin target").toBe(0);
    expect.soft(n(copy.row.default_profit_pct), "A5: no profit under a margin target").toBe(0);
    expect.soft(copy.lines.map((l) => [n(l.overhead_pct), n(l.profit_pct)]), "A5: line overhead/profit").toEqual([[0, 0], [0, 0]]);
    expectDerivedPricingProvenance("A5 copy without markup", copy);
  });

  liveIt("A6 an organization settings change AFTER creation does not reprice the original estimate", async () => {
    const t6 = await h.createTenant("A6-org-change", { ...TGM_ORG });
    const p = await h.createProjectWithScope(t6, "A6");
    const id = await h.createEstimateFromScope(t6, p);
    await h.priceLinesAsContractor(t6, id);
    const before = await h.readEvidence(t6, id);
    await h.updateOrgPricing(t6, { defaultPricingMethod: "overhead_profit", defaultTargetGrossMarginPct: 25, defaultOverheadPct: 18, defaultProfitPct: 9, defaultLaborRate: 99 });
    const after = await h.readEvidence(t6, id);
    for (const k of ["pricing_method", "target_gross_margin_pct", "default_overhead_pct", "default_profit_pct", "default_labor_rate", "pricing_settings_locked_at"]) {
      expect.soft(after.row[k], `A6: ${k} unchanged`).toEqual(before.row[k]);
    }
    expect.soft(n(after.db.canonicalSubtotal), "A6: database price unchanged").toBe(n(before.db.canonicalSubtotal));
    expect.soft(after.ts.subtotal, "A6: TypeScript price unchanged").toBe(before.ts.subtotal);
  });

  liveIt("A7 a revision made AFTER an organization settings change still carries the SOURCE estimate's pricing", async () => {
    const t7 = await h.createTenant("A7-org-change-rev", { ...TGM_ORG });
    const p = await h.createProjectWithScope(t7, "A7");
    const id = await h.createEstimateFromScope(t7, p);
    await h.priceLinesAsContractor(t7, id);
    const src = await h.readEvidence(t7, id);
    await h.updateOrgPricing(t7, { defaultPricingMethod: "overhead_profit", defaultTargetGrossMarginPct: 25, defaultOverheadPct: 18, defaultProfitPct: 9, defaultLaborRate: 99 });
    const rev = await h.readEvidence(t7, await h.createRevision(t7, id));
    record("A7 revision after org change", rev, { method_only_sell: methodOnlySell(src, rev) });
    expectCarriesSourcePricing("A7 revision after org change", src, rev);
  });

  liveIt("A8 a contractor's explicit 35% target on the source survives create_estimate_revision", async () => {
    const t8 = await h.createTenant("A8-explicit-35", { ...TGM_ORG });
    const p = await h.createProjectWithScope(t8, "A8");
    const id = await h.createEstimateFromScope(t8, p);
    await h.priceLinesAsContractor(t8, id);
    /* Same row write updateEstimate() makes for a pricing save (estimating.functions.ts:1694-1802). */
    const now = new Date().toISOString();
    const upd = await t8.sb
      .from("estimates")
      .update({
        target_gross_margin_pct: 35,
        default_overhead_pct: 0,
        default_profit_pct: 0,
        pricing_settings_locked_at: now,
        pricing_confirmation_required: false,
        pricing_confirmation_reason: null,
        pricing_confirmed_at: now,
        pricing_source: "contractor_confirmed",
      })
      .eq("id", id)
      .eq("organization_id", t8.orgId);
    expect(upd.error).toBeNull();
    const src = await h.readEvidence(t8, id);
    expect(n(src.row.target_gross_margin_pct), "A8 precondition: contractor save persisted").toBe(35);
    expect(n(src.db.canonicalSubtotal), "A8 precondition: source reprices at 35%").toBe(tgmSell(JOB_COST, 35));
    const rev = await h.readEvidence(t8, await h.createRevision(t8, id));
    record("A8 revision of explicit 35%", rev, { method_only_sell: methodOnlySell(src, rev) });
    expectCarriesSourcePricing("A8 revision of explicit 35%", src, rev);
  });

  liveIt("A9 intake re-approval of an ISSUED estimate (production commitApprovedEstimateImpl -> revision + sync) keeps target_gross_margin", async () => {
    const t9 = await h.createTenant("A9-commit", { ...TGM_ORG });
    const p = await h.createProjectWithScope(t9, "A9");
    const id = await h.createEstimateFromScope(t9, p);
    await h.priceLinesAsContractor(t9, id);
    const src = await h.readEvidence(t9, id);
    const st = await t9.sb.rpc("set_estimate_status", { _estimate_id: id, _status: "sent" });
    expect(st.error, "A9 precondition: estimate issued").toBeNull();
    const res = await commitApprovedEstimateImpl(t9.sb as never, t9.userId, { projectId: p, intakeSource: "walkthrough" });
    expect(res.createdRevision, "A9 precondition: re-approval of an issued estimate revises it").toBe(true);
    const rev = await h.readEvidence(t9, res.estimateId);
    record("A9 intake re-approval revision", rev, { method_only_sell: methodOnlySell(src, rev) });
    expectCarriesSourcePricing("A9 intake re-approval", src, rev);
  });

  liveIt("A10 revise-and-sync (reviseAndSyncEstimate: revision RPC then sync_estimate_from_scope) keeps target_gross_margin", async () => {
    const t10 = await h.createTenant("A10-revise-sync", { ...TGM_ORG });
    const p = await h.createProjectWithScope(t10, "A10");
    const id = await h.createEstimateFromScope(t10, p);
    await h.priceLinesAsContractor(t10, id);
    const src = await h.readEvidence(t10, id);
    const revId = await h.createRevision(t10, id);
    const pricing = await buildProjectPricing(t10.sb as never, p, t10.orgId);
    const sync = await t10.sb.rpc("sync_estimate_from_scope", { _estimate_id: revId, _pricing: pricing });
    expect(sync.error).toBeNull();
    const rev = await h.readEvidence(t10, revId);
    record("A10 revise-and-sync", rev, { method_only_sell: methodOnlySell(src, rev) });
    expectCarriesSourcePricing("A10 revise-and-sync", src, rev);
  });
});

describe("B. overhead_profit organization (overhead 15% / profit 12%; org target 33% configured; $85/hr)", () => {
  let t: h.Tenant;
  let sourceId: string;
  let source: h.EstimateEvidence;

  beforeAll(async () => {
    if (h.isBlocked()) return;
    t = await h.createTenant("B-ohp", { ...OHP_ORG });
    const p = await h.createProjectWithScope(t, "B source");
    sourceId = await h.createEstimateFromScope(t, p);
    await h.priceLinesAsContractor(t, sourceId);
    source = await h.readEvidence(t, sourceId);
    record("B1 create_estimate_from_scope", source);
  }, 60_000);

  liveIt("B1 create_estimate_from_scope stores the organization's 15% / 12% (not 10/10) and locks them", () => {
    expect(source.row.pricing_method).toBe("overhead_profit");
    expect(n(source.row.default_overhead_pct)).toBe(15);
    expect(n(source.row.default_profit_pct)).toBe(12);
    expect(n(source.row.target_gross_margin_pct)).toBe(0);
    expect(n(source.row.default_labor_rate)).toBe(85);
    expect(source.row.pricing_settings_locked_at).not.toBeNull();
    expect(source.lines.map((l) => [n(l.overhead_pct), n(l.profit_pct)])).toEqual([[15, 12], [15, 12]]);
  });

  liveIt("B1 math: overhead 15% of direct, profit 12% of (direct + overhead), per line, in the database AND TypeScript", () => {
    expect(n(source.db.jobCost)).toBe(JOB_COST);
    expect(n(source.db.canonicalSubtotal)).toBe(ohpSell(15, 12));
    expect(source.ts.subtotal).toBe(ohpSell(15, 12));
  });

  liveIt("B1 provenance: values applied to the estimate are recorded accurately", () => {
    expect(appliedProvenanceMismatches(h.createdPricingProvenance(source), source.row)).toEqual([]);
  });

  liveIt("B1 provenance: a record labelled organization_defaults does not misstate the organization's settings", async () => {
    const org = await h.readOrg(t);
    const prov = h.createdPricingProvenance(source);
    const wrong = provenanceMisstatements(prov, org);
    evidence.push({ label: `${String(source.row.pricing_method)} provenance`, recorded: prov, misstatements: wrong });
    expect(wrong, `provenance misstatements: ${JSON.stringify(wrong)}`).toEqual([]);
  });

  liveIt("B2 create_estimate_revision carries the source's overhead_profit pricing", async () => {
    const rev = await h.readEvidence(t, await h.createRevision(t, sourceId));
    record("B2 create_estimate_revision", rev, { method_only_sell: methodOnlySell(source, rev) });
    expectCarriesSourcePricing("B2 revision", source, rev);
    expectDerivedPricingProvenance("B2 revision", rev);
  });

  liveIt("B3 create_estimate_version carries the source's overhead_profit pricing", async () => {
    const ver = await h.readEvidence(t, await h.createVersion(t, sourceId));
    record("B3 create_estimate_version", ver, { method_only_sell: methodOnlySell(source, ver) });
    expectCarriesSourcePricing("B3 version", source, ver);
    expectDerivedPricingProvenance("B3 version", ver);
  });

  liveIt("B4 copy_estimate_to_project WITH pricing + markup carries the source's overhead_profit pricing", async () => {
    const target = await h.createProjectWithScope(t, "B copy target (markup)");
    const res = await copyEstimateToProjectImpl(t.sb, { sourceEstimateId: sourceId, targetProjectId: target, options: { copyPricing: true, copyMarkup: true } });
    const copy = await h.readEvidence(t, res.estimateId);
    record("B4 copy (pricing+markup)", copy, { method_only_sell: methodOnlySell(source, copy) });
    expectCarriesSourcePricing("B4 copy with markup", source, copy);
    expectDerivedPricingProvenance("B4 copy with markup", copy);
  });

  liveIt("B5 copy_estimate_to_project WITHOUT markup takes the ORGANIZATION's 15% / 12%, not hard-coded 10/10", async () => {
    const target = await h.createProjectWithScope(t, "B copy target (no markup)");
    const res = await copyEstimateToProjectImpl(t.sb, { sourceEstimateId: sourceId, targetProjectId: target, options: { copyPricing: true, copyMarkup: false } });
    const copy = await h.readEvidence(t, res.estimateId);
    record("B5 copy (pricing, no markup)", copy);
    expect.soft(copy.row.pricing_method, "B5: method").toBe("overhead_profit");
    expect.soft(n(copy.row.default_overhead_pct), "B5: overhead from organization").toBe(15);
    expect.soft(n(copy.row.default_profit_pct), "B5: profit from organization").toBe(12);
    expect.soft(copy.lines.map((l) => [n(l.overhead_pct), n(l.profit_pct)]), "B5: line overhead/profit from organization").toEqual([[15, 12], [15, 12]]);
    expectDerivedPricingProvenance("B5 copy without markup", copy);
  });

  liveIt("B6 a contractor's explicit 0% overhead on the source survives create_estimate_revision", async () => {
    const t6 = await h.createTenant("B6-explicit-zero", { ...OHP_ORG });
    const p = await h.createProjectWithScope(t6, "B6");
    const id = await h.createEstimateFromScope(t6, p);
    await h.priceLinesAsContractor(t6, id);
    const now = new Date().toISOString();
    /* Estimate-level pricing save (same write as updateEstimate) ... */
    const upd = await t6.sb
      .from("estimates")
      .update({ default_overhead_pct: 0, target_gross_margin_pct: 0, pricing_settings_locked_at: now, pricing_confirmed_at: now, pricing_source: "contractor_confirmed" })
      .eq("id", id)
      .eq("organization_id", t6.orgId);
    expect(upd.error).toBeNull();
    /* ... and the per-line overhead the contractor zeroed (updateEstimateLine). */
    const lines = await t6.sb.from("estimate_line_items").update({ overhead_pct: 0 }).eq("estimate_id", id).select("id");
    expect(lines.error).toBeNull();
    const src = await h.readEvidence(t6, id);
    expect(n(src.row.default_overhead_pct), "B6 precondition: explicit 0% stored").toBe(0);
    expect(n(src.db.canonicalSubtotal), "B6 precondition: source prices at 0% overhead / 12% profit").toBe(ohpSell(0, 12));
    const rev = await h.readEvidence(t6, await h.createRevision(t6, id));
    record("B6 revision of explicit 0% overhead", rev, { method_only_sell: methodOnlySell(src, rev) });
    expectCarriesSourcePricing("B6 revision of explicit 0% overhead", src, rev);
  });

  liveIt("B7 an organization settings change AFTER creation neither reprices the estimate nor leaks into its revision", async () => {
    const t7 = await h.createTenant("B7-org-change", { ...OHP_ORG });
    const p = await h.createProjectWithScope(t7, "B7");
    const id = await h.createEstimateFromScope(t7, p);
    await h.priceLinesAsContractor(t7, id);
    const before = await h.readEvidence(t7, id);
    await h.updateOrgPricing(t7, { defaultPricingMethod: "overhead_profit", defaultTargetGrossMarginPct: 33, defaultOverheadPct: 20, defaultProfitPct: 5, defaultLaborRate: 99 });
    const after = await h.readEvidence(t7, id);
    expect.soft(n(after.row.default_overhead_pct), "B7: source overhead unchanged").toBe(15);
    expect.soft(n(after.row.default_profit_pct), "B7: source profit unchanged").toBe(12);
    expect.soft(n(after.db.canonicalSubtotal), "B7: source price unchanged").toBe(n(before.db.canonicalSubtotal));
    const rev = await h.readEvidence(t7, await h.createRevision(t7, id));
    record("B7 revision after org change", rev, { method_only_sell: methodOnlySell(before, rev) });
    expectCarriesSourcePricing("B7 revision after org change", before, rev);
  });
});

describe("C. BEFORE INSERT trigger contract (direct PostgREST insert as the signed-in contractor — an RLS-permitted path)", () => {
  let tgm: h.Tenant;
  let ohp: h.Tenant;

  beforeAll(async () => {
    if (h.isBlocked()) return;
    tgm = await h.createTenant("C-tgm", { ...TGM_ORG });
    ohp = await h.createTenant("C-ohp", { ...OHP_ORG });
  }, 60_000);

  /* One fresh project per insert: estimates are unique per (project, version). */
  const insertEstimate = async (t: h.Tenant, fields: Record<string, unknown>) => {
    const projectId = await h.createProjectWithScope(t, `C ${Object.keys(fields).join("+") || "no-choice"}`);
    const res = await t.sb
      .from("estimates")
      .insert({ organization_id: t.orgId, project_id: projectId, created_by: t.userId, status: "draft", ...fields })
      .select("*")
      .single();
    expect(res.error, "insert accepted by RLS").toBeNull();
    return res.data as Record<string, unknown>;
  };

  liveIt("C1 an insert that does not choose a method inherits the target_gross_margin organization's 40% (ADR-061)", async () => {
    const row = await insertEstimate(tgm, {});
    console.log(`[C1] stored method=${row.pricing_method} target=${row.target_gross_margin_pct} oh=${row.default_overhead_pct} p=${row.default_profit_pct} locked=${row.pricing_settings_locked_at ? "set" : "null"}`);
    evidence.push({ label: "C1 insert without method (TGM org)", row: { pricing_method: row.pricing_method, target: n(row.target_gross_margin_pct), oh: n(row.default_overhead_pct), p: n(row.default_profit_pct), locked: !!row.pricing_settings_locked_at } });
    expect.soft(row.pricing_method, "C1: method").toBe("target_gross_margin");
    expect.soft(n(row.target_gross_margin_pct), "C1: target").toBe(40);
    expect.soft(n(row.default_overhead_pct), "C1: overhead").toBe(0);
    expect.soft(n(row.default_profit_pct), "C1: profit").toBe(0);
    expect.soft(n(row.default_labor_rate), "C1: labor rate from organization").toBe(85);
  });

  liveIt("C2 an insert that does not choose a method inherits the overhead_profit organization's 15% / 12% (not 10/10)", async () => {
    const row = await insertEstimate(ohp, {});
    console.log(`[C2] stored method=${row.pricing_method} target=${row.target_gross_margin_pct} oh=${row.default_overhead_pct} p=${row.default_profit_pct}`);
    evidence.push({ label: "C2 insert without method (OHP org)", row: { pricing_method: row.pricing_method, target: n(row.target_gross_margin_pct), oh: n(row.default_overhead_pct), p: n(row.default_profit_pct), labor: n(row.default_labor_rate) } });
    expect.soft(row.pricing_method, "C2: method").toBe("overhead_profit");
    expect.soft(n(row.default_overhead_pct), "C2: overhead").toBe(15);
    expect.soft(n(row.default_profit_pct), "C2: profit").toBe(12);
    expect.soft(n(row.default_labor_rate), "C2: labor rate from organization").toBe(85);
  });

  liveIt("C3 an explicit target_gross_margin 35% is kept as chosen", async () => {
    const row = await insertEstimate(tgm, { pricing_method: "target_gross_margin", target_gross_margin_pct: 35 });
    expect(row.pricing_method).toBe("target_gross_margin");
    expect(n(row.target_gross_margin_pct)).toBe(35);
    expect(row.pricing_settings_locked_at).not.toBeNull();
  });

  liveIt("C4 an explicit overhead_profit 12% / 8% is kept as chosen", async () => {
    const row = await insertEstimate(ohp, { pricing_method: "overhead_profit", default_overhead_pct: 12, default_profit_pct: 8 });
    expect(row.pricing_method).toBe("overhead_profit");
    expect(n(row.default_overhead_pct)).toBe(12);
    expect(n(row.default_profit_pct)).toBe(8);
    expect(n(row.target_gross_margin_pct)).toBe(0);
  });

  liveIt("C5 an explicit overhead_profit with 0% overhead keeps 0% (0 is a choice, not 'unset')", async () => {
    const row = await insertEstimate(ohp, { pricing_method: "overhead_profit", default_overhead_pct: 0, default_profit_pct: 8 });
    console.log(`[C5] stored oh=${row.default_overhead_pct} p=${row.default_profit_pct}`);
    evidence.push({ label: "C5 explicit 0% overhead insert", row: { oh: n(row.default_overhead_pct), p: n(row.default_profit_pct) } });
    expect(n(row.default_overhead_pct)).toBe(0);
    expect(n(row.default_profit_pct)).toBe(8);
  });
});

describe("D. Post-creation protection (pricing_settings_locked_at + preserve trigger)", () => {
  let t: h.Tenant;
  let id: string;

  beforeAll(async () => {
    if (h.isBlocked()) return;
    t = await h.createTenant("D-lock", { ...TGM_ORG });
    const p = await h.createProjectWithScope(t, "D");
    id = await h.createEstimateFromScope(t, p);
    await h.priceLinesAsContractor(t, id);
  }, 60_000);

  liveIt("D1 an UPDATE that changes pricing WITHOUT a new explicit save stamp is reverted by the preserve trigger", async () => {
    const before = await h.readEvidence(t, id);
    const upd = await t.sb.from("estimates").update({ pricing_method: "overhead_profit", default_overhead_pct: 30, default_profit_pct: 30 }).eq("id", id);
    expect(upd.error).toBeNull();
    const after = await h.readEvidence(t, id);
    expect(after.row.pricing_method).toBe(before.row.pricing_method);
    expect(n(after.row.target_gross_margin_pct)).toBe(n(before.row.target_gross_margin_pct));
    expect(n(after.row.default_overhead_pct)).toBe(n(before.row.default_overhead_pct));
    expect(n(after.db.canonicalSubtotal)).toBe(n(before.db.canonicalSubtotal));
  });

  liveIt("D2 an explicit contractor save (new pricing_settings_locked_at) is persisted and re-stamped", async () => {
    const stamp = new Date(Date.now() + 1000).toISOString();
    const upd = await t.sb.from("estimates").update({ target_gross_margin_pct: 30, pricing_settings_locked_at: stamp }).eq("id", id);
    expect(upd.error).toBeNull();
    const after = await h.readEvidence(t, id);
    expect(n(after.row.target_gross_margin_pct)).toBe(30);
    expect(new Date(String(after.row.pricing_settings_locked_at)).toISOString()).toBe(stamp);
    expect(n(after.db.canonicalSubtotal)).toBe(tgmSell(JOB_COST, 30));
  });

  liveIt("D3 the open-estimate repair pass (repair_estimate_pricing) does not change pricing settings or line overhead/profit", async () => {
    const before = await h.readEvidence(t, id);
    const r = await t.sb.rpc("repair_estimate_pricing", { _estimate_id: id });
    expect(r.error).toBeNull();
    const after = await h.readEvidence(t, id);
    for (const k of ["pricing_method", "target_gross_margin_pct", "default_overhead_pct", "default_profit_pct", "default_labor_rate", "pricing_settings_locked_at"]) {
      expect.soft(after.row[k], `D3: ${k}`).toEqual(before.row[k]);
    }
    expect.soft(after.lines.map((l) => [n(l.overhead_pct), n(l.profit_pct)])).toEqual(before.lines.map((l) => [n(l.overhead_pct), n(l.profit_pct)]));
  });

  liveIt("D5 BEFORE INSERT order is explicit: org defaults -> method normalization -> lock stamp on the FINAL snapshot", () => {
    /* Postgres fires same-event row triggers in name order. Identify the three
       pricing triggers by the FUNCTION they run, not by their names. */
    const rows = h.sql<{ tgname: string; fn: string }>(
      `select t.tgname, p.proname as fn
         from pg_trigger t join pg_proc p on p.oid = t.tgfoid
        where t.tgrelid = 'public.estimates'::regclass and not t.tgisinternal
          and (t.tgtype & 1) = 1      -- ROW
          and (t.tgtype & 2) = 2      -- BEFORE
          and (t.tgtype & 4) = 4      -- INSERT
        order by t.tgname`,
    );
    const order = rows.map((r) => r.fn);
    console.log(`[D5] BEFORE INSERT firing order: ${rows.map((r) => `${r.tgname}(${r.fn})`).join(" -> ")}`);
    const at = (fn: string) => order.indexOf(fn);
    expect(at("apply_org_pricing_method_defaults"), "defaults trigger present").toBeGreaterThanOrEqual(0);
    expect(at("enforce_estimate_pricing_mutex"), "mutex trigger present").toBeGreaterThanOrEqual(0);
    expect(at("lock_explicit_estimate_pricing"), "lock trigger present").toBeGreaterThanOrEqual(0);
    expect(at("apply_org_pricing_method_defaults"), "defaults fire before normalization").toBeLessThan(at("enforce_estimate_pricing_mutex"));
    expect(at("enforce_estimate_pricing_mutex"), "normalization fires before the lock stamp").toBeLessThan(at("lock_explicit_estimate_pricing"));
  });

  liveIt("D4 a lock stamp on a DERIVED estimate protects the source's values, not values the derivation invented", async () => {
    const src = await h.readEvidence(t, id);
    const rev = await h.readEvidence(t, await h.createRevision(t, id));
    record("D4 revision lock check", rev);
    expect.soft(rev.row.pricing_settings_locked_at, "D4: revision is locked").not.toBeNull();
    expect.soft(rev.row.pricing_method, "D4: locked method equals the source's").toBe(src.row.pricing_method);
    expect.soft(n(rev.row.target_gross_margin_pct), "D4: locked target equals the source's").toBe(n(src.row.target_gross_margin_pct));
  });
});

describe("E. Parity: database estimate_invariant_cost vs TypeScript canonical pricing (buildCanonicalCostGraph)", () => {
  liveIt("E1 target_gross_margin estimate: identical selling price", async () => {
    const t = await h.createTenant("E1", { ...TGM_ORG });
    const p = await h.createProjectWithScope(t, "E1");
    const id = await h.createEstimateFromScope(t, p);
    await h.priceLinesAsContractor(t, id);
    const e = await h.readEvidence(t, id);
    expect(e.ts.jobCost).toBe(n(e.db.jobCost));
    expect(e.ts.subtotal).toBe(n(e.db.canonicalSubtotal));
  });

  liveIt("E2 overhead_profit estimate: identical selling price", async () => {
    const t = await h.createTenant("E2", { ...OHP_ORG });
    const p = await h.createProjectWithScope(t, "E2");
    const id = await h.createEstimateFromScope(t, p);
    await h.priceLinesAsContractor(t, id);
    const e = await h.readEvidence(t, id);
    expect(e.ts.jobCost).toBe(n(e.db.jobCost));
    expect(e.ts.subtotal).toBe(n(e.db.canonicalSubtotal));
  });

  liveIt("E3 a revision's lines: database and TypeScript agree on the selling price", async () => {
    const t = await h.createTenant("E3", { ...TGM_ORG });
    const p = await h.createProjectWithScope(t, "E3");
    const id = await h.createEstimateFromScope(t, p);
    await h.priceLinesAsContractor(t, id);
    const rev = await h.readEvidence(t, await h.createRevision(t, id));
    record("E3 revision parity", rev);
    expect(rev.ts.subtotal).toBe(n(rev.db.canonicalSubtotal));
  });
});
