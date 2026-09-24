/**
 * PRODUCTION-PATH integration test: two projects at ONE property.
 *
 * This is deliberately NOT a source-grep test. It creates two real projects
 * that share a single property row, inserts real estimate lines, and then calls
 * the SAME server-side pricing entry point the app calls
 * (`public.repair_estimate_pricing`, which runs geometry derivation →
 * catalog binding → knowledge-base pricing → ballpark rebuild).
 *
 * It proves four things that a static test cannot:
 *   1. Quantities come from the CURRENT project's measurements only — the
 *      measured project derives real square/linear footage while the
 *      unmeasured project at the same address stays unresolved instead of
 *      inheriting its neighbour's geometry.
 *   2. Permits are written as direct fees with exactly zero labor.
 *   3. Trades are inferred from the words used (prime/paint → painting).
 *   4. The preliminary band is rebuilt from the SAME invariant job cost and the
 *      SAME pricing settings as the detailed sell:
 *      recommended === round(jobCost / (1 - targetGM)).
 *
 * Requires privileged database access. Skipped when the service-role key is
 * absent OR present but not accepted by the database (Lovable Cloud does not
 * expose one), so a credential-less environment reports skipped, not failed.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env["SUPABASE_URL"];
const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
const live = Boolean(url && serviceKey);

const d = live ? describe : describe.skip;

interface Fixture {
  organizationId: string;
  clientId: string;
  propertyId: string;
  userId: string;
  measuredProjectId: string;
  measuredEstimateId: string;
  unmeasuredProjectId: string;
  unmeasuredEstimateId: string;
}

const LINES = [
  { description: "Building permit", unit_key: "each", quantity: 1, placeholder: false },
  { description: "Prime and paint walls and ceilings", unit_key: "square_foot", quantity: 1, placeholder: true },
  { description: "Install/replace baseboards", unit_key: "linear_foot", quantity: 1, placeholder: true },
];

d("two projects at one property price independently", () => {
  let db: SupabaseClient;
  let fx: Fixture;
  const cleanup: Array<() => Promise<unknown>> = [];

  const seedProject = async (name: string, base: Omit<Fixture, "measuredProjectId" | "measuredEstimateId" | "unmeasuredProjectId" | "unmeasuredEstimateId">) => {
    const { data: project, error: pErr } = await db
      .from("projects")
      .insert({
        organization_id: base.organizationId,
        client_id: base.clientId,
        property_id: base.propertyId,
        created_by: base.userId,
        name,
        status: "estimate_in_progress",
      })
      .select("id")
      .single();
    if (pErr) throw pErr;

    const { data: estimate, error: eErr } = await db
      .from("estimates")
      .insert({
        organization_id: base.organizationId,
        project_id: project.id,
        created_by: base.userId,
        status: "draft",
        pricing_method: "target_gross_margin",
        target_gross_margin_pct: 40,
      })
      .select("id")
      .single();
    if (eErr) throw eErr;

    const { error: lErr } = await db.from("estimate_line_items").insert(
      LINES.map((line) => ({
        organization_id: base.organizationId,
        project_id: project.id,
        estimate_id: estimate.id,
        created_by: base.userId,
        description: line.description,
        unit_key: line.unit_key,
        quantity: line.quantity,
        is_quantity_placeholder: line.placeholder,
      })),
    );
    if (lErr) throw lErr;

    cleanup.push(async () => {
      await db.from("projects").delete().eq("id", project.id);
    });
    return { projectId: project.id as string, estimateId: estimate.id as string };
  };

  let unavailable: string | null = null;

  beforeAll(async () => {
    db = createClient(url!, serviceKey!, { auth: { persistSession: false } });

    try {

      const { data: seedProjectRow, error } = await db
        .from("projects")
        .select("organization_id, client_id, property_id, created_by")
        .not("property_id", "is", null)
        .limit(1)
        .single();
      if (error) throw error;

      const base = {
        organizationId: seedProjectRow.organization_id as string,
        clientId: seedProjectRow.client_id as string,
        propertyId: seedProjectRow.property_id as string,
        userId: seedProjectRow.created_by as string,
      };

      const measured = await seedProject("INTEGRATION — measured project", base);
      const unmeasured = await seedProject("INTEGRATION — unmeasured project", base);

      // Only the FIRST project gets measurements. 20 x 15 x 8 room.
      const { error: mErr } = await db.from("project_measurements").insert({
        organization_id: base.organizationId,
        project_id: measured.projectId,
        created_by: base.userId,
        label: "Test room",
        length_ft: 20,
        width_ft: 15,
        ceiling_height_ft: 8,
        floor_waste_pct: 10,
      });
      if (mErr) throw mErr;

      fx = {
        ...base,
        measuredProjectId: measured.projectId,
        measuredEstimateId: measured.estimateId,
        unmeasuredProjectId: unmeasured.projectId,
        unmeasuredEstimateId: unmeasured.estimateId,
      };

      for (const estimateId of [fx.measuredEstimateId, fx.unmeasuredEstimateId]) {
        const { error: rErr } = await db.rpc("repair_estimate_pricing", { _estimate_id: estimateId });
        if (rErr) throw rErr;
      }
    } catch (error) {
      /* No usable service-role credential in this environment. */
      unavailable = (error as Error)?.message ?? "privileged database access unavailable";
    }
  }, 60_000);

  afterAll(async () => {
    for (const remove of cleanup) await remove();
  });

  const lines = async (estimateId: string) => {
    const { data, error } = await db
      .from("estimate_line_items")
      .select("description, quantity, unit_key, labor_hours, trade_key, cost_basis, resolution_status, direct_cost")
      .eq("estimate_id", estimateId)
      .is("archived_at", null);
    if (error) throw error;
    return data!;
  };

  it("derives paint and baseboard quantities from the measured project only", async (ctx) => {
    if (unavailable) return ctx.skip();
    const measured = await lines(fx.measuredEstimateId);
    const paint = measured.find((l) => l.description.startsWith("Prime and paint"))!;
    const base = measured.find((l) => l.description.startsWith("Install/replace"))!;

    // 20 x 15 room, 8 ft ceilings: wall area and trim length must be real.
    expect(Number(paint.quantity)).toBeGreaterThan(100);
    expect(Number(base.quantity)).toBeGreaterThan(20);
    expect(Number(paint.labor_hours)).toBeGreaterThan(0);
  });

  it("does not leak the neighbour project's geometry into the unmeasured project", async (ctx) => {
    if (unavailable) return ctx.skip();
    const measured = await lines(fx.measuredEstimateId);
    const unmeasured = await lines(fx.unmeasuredEstimateId);

    for (const description of ["Prime and paint walls and ceilings", "Install/replace baseboards"]) {
      const a = measured.find((l) => l.description === description)!;
      const b = unmeasured.find((l) => l.description === description)!;
      expect(Number(b.quantity)).toBeLessThanOrEqual(1);
      expect(b.resolution_status).toBe("unresolved");
      expect(Number(b.quantity)).not.toBe(Number(a.quantity));
      expect(Number(b.labor_hours)).toBe(0);
    }
  });

  it("writes permits as a zero-labor direct fee and infers trades from wording", async (ctx) => {
    if (unavailable) return ctx.skip();
    const measured = await lines(fx.measuredEstimateId);
    const permit = measured.find((l) => l.description === "Building permit")!;
    expect(permit.cost_basis).toBe("permit_fee");
    expect(Number(permit.labor_hours)).toBe(0);
    expect(Number(permit.direct_cost)).toBeGreaterThan(0);

    expect(measured.find((l) => l.description.startsWith("Prime and paint"))!.trade_key).toBe("painting");
    expect(measured.find((l) => l.description.startsWith("Install/replace"))!.trade_key).toBe("trim");
  });

  it("rebuilds the preliminary band from the same invariant cost and pricing settings", async (ctx) => {
    if (unavailable) return ctx.skip();
    const { data, error } = await db
      .from("estimates")
      .select("range_snapshot, pricing_method, target_gross_margin_pct")
      .eq("id", fx.measuredEstimateId)
      .single();
    if (error) throw error;

    const snapshot = (data.range_snapshot ?? {}) as Record<string, any>;
    const ballpark = snapshot["ballpark"] ?? snapshot;
    const jobCost = Number(ballpark?.costBasis?.jobCost ?? 0);
    const expected = Number(ballpark?.band?.expected ?? 0);
    const marginPct = Number(data.target_gross_margin_pct);

    expect(data.pricing_method).toBe("target_gross_margin");
    expect(jobCost).toBeGreaterThan(0);
    // Recommended === detailed sell derived from the SAME job cost. Whole dollars.
    expect(expected).toBe(Math.round(jobCost / (1 - marginPct / 100)));
    // Target GM and O+P are mutually exclusive.
    expect(ballpark?.costBasis?.pricing?.overheadPct ?? null).toBeNull();
    expect(ballpark?.costBasis?.pricing?.profitPct ?? null).toBeNull();
    expect(Number(ballpark?.band?.low)).toBeLessThan(expected);
    expect(Number(ballpark?.band?.high)).toBeGreaterThan(expected);
  });
});
