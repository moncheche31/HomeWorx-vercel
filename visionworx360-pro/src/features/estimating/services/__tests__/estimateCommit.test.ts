import { describe, expect, it } from "vitest";
import { commitApprovedEstimateImpl } from "../estimateCommit.server";
import { buildRemoteVisionCommit } from "@/domains/remoteVision/commitPayload";
import type { CanonicalEstimateCommit } from "@/domains/estimating/estimateCommit";

/* ------------------------------------------------------------------ fake DB */

interface Row extends Record<string, unknown> { id: string }

function makeDb() {
  const tables: Record<string, Row[]> = {
    projects: [{ id: "p1", organization_id: "org1", property_id: null }],
    properties: [],
    scope_sections: [],
    scope_items: [],
    estimates: [],
    estimate_line_items: [],
    catalog_assemblies: [],
  };
  let ids = 0;
  const nextId = (p: string) => `${p}-${++ids}`;
  const rpcCalls: Array<{ name: string; params: Record<string, unknown> | undefined }> = [];

  function query(table: string) {
    const filters: Array<(r: Row) => boolean> = [];
    let mode: "select" | "update" | "insert" = "select";
    let updatePayload: Record<string, unknown> = {};
    let inserted: Row[] = [];

    const api: any = {
      select: () => api,
      eq: (col: string, val: unknown) => { filters.push((r) => r[col] === val); return api; },
      is: (col: string, val: unknown) => { filters.push((r) => (r[col] ?? null) === val); return api; },
      in: (col: string, vals: unknown[]) => { filters.push((r) => vals.includes(r[col])); return api; },
      order: () => api,
      limit: () => api,
      update: (payload: Record<string, unknown>) => { mode = "update"; updatePayload = payload; return api; },
      insert: (payload: Record<string, unknown>) => {
        mode = "insert";
        const row = { id: nextId(table), ...payload } as Row;
        tables[table].push(row);
        inserted = [row];
        return api;
      },
      maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
      single: async () => ({ data: run()[0] ?? null, error: null }),
      then: (resolve: (v: { data: Row[]; error: null }) => unknown) =>
        Promise.resolve({ data: run(), error: null }).then(resolve),
    };

    function run(): Row[] {
      if (mode === "insert") return inserted;
      const matched = tables[table].filter((r) => filters.every((f) => f(r)));
      if (mode === "update") for (const r of matched) Object.assign(r, updatePayload);
      return matched;
    }
    return api;
  }

  const sb = {
    from: (t: string) => query(t),
    rpc: async (name: string, params?: Record<string, unknown>) => {
      rpcCalls.push({ name, params });
      if (name === "current_active_organization_id") return { data: "org1", error: null };
      if (name === "create_estimate_from_scope") {
        const id = nextId("est");
        tables.estimates.push({
          id, organization_id: "org1", project_id: params!._project_id as string,
          status: "draft", version: 1, locked_at: null, superseded_by_id: null,
          archived_at: null, intake_mode: "detailed",
        });
        for (const item of tables.scope_items.filter((i) => !i.archived_at)) {
          tables.estimate_line_items.push({ id: nextId("line"), estimate_id: id, scope_item_id: item.id });
        }
        return { data: id, error: null };
      }
      if (name === "sync_estimate_from_scope") return { data: 0, error: null };
      if (name === "create_estimate_revision") {
        const source = tables.estimates.find((e) => e.id === params!._estimate_id)!;
        const id = nextId("est");
        source.superseded_by_id = id;
        tables.estimates.push({
          ...source, id, status: "draft", locked_at: null, superseded_by_id: null,
          version: Number(source.version) + 1,
        });
        return { data: { estimate_id: id, created: true }, error: null };
      }
      if (name === "save_estimate_ballpark") {
        const est = tables.estimates.find((e) => e.id === params!._estimate_id)!;
        est.range_snapshot = params!._range_snapshot;
        return { data: { updated_at: "now" }, error: null };
      }
      return { data: null, error: null };
    },
  };

  return { sb, tables, rpcCalls };
}

const payloadFor = (source: CanonicalEstimateCommit["intakeSource"]): CanonicalEstimateCommit => ({
  projectId: "p1",
  intakeSource: source,
  items: [
    { key: "cabinets", title: "Install cabinets", quantity: 8, unitKey: "linear_foot", confirmed: true },
    { key: "counters", title: "Quartz counters", quantity: 24, unitKey: "square_foot" },
  ],
  ballpark: { level: "economy", low: 8000, high: 12000, confidence: "medium", laborHours: 40 },
});

describe("shared estimate commit bridge", () => {
  for (const source of ["photos_video", "describe", "walkthrough"] as const) {
    it(`${source}: approving creates exactly one durable estimate with a ballpark band`, async () => {
      const { sb, tables } = makeDb();
      const result = await commitApprovedEstimateImpl(sb as never, "u1", payloadFor(source));

      expect(result.createdEstimate).toBe(true);
      expect(tables.estimates).toHaveLength(1);
      expect(tables.scope_items).toHaveLength(2);
      expect(result.ballparkSaved).toBe(true);
      const snapshot = tables.estimates[0].range_snapshot as Record<string, unknown>;
      expect(snapshot.kind).toBe("ballpark");
      expect(snapshot.band).toEqual({ low: 8000, expected: 10000, high: 12000 });
      /* Estimate lines exist, so the Estimate tab and Proposal are available. */
      expect(tables.estimate_line_items.length).toBeGreaterThan(0);
    });

    it(`${source}: approving twice does not duplicate estimates or scope items`, async () => {
      const { sb, tables } = makeDb();
      await commitApprovedEstimateImpl(sb as never, "u1", payloadFor(source));
      const second = await commitApprovedEstimateImpl(sb as never, "u1", payloadFor(source));

      expect(second.createdEstimate).toBe(false);
      expect(second.createdRevision).toBe(false);
      expect(tables.estimates).toHaveLength(1);
      expect(tables.scope_items.filter((i) => !i.archived_at)).toHaveLength(2);
      expect(tables.scope_sections).toHaveLength(1);
    });
  }

  it("re-approving an issued estimate creates a revision instead of a sibling", async () => {
    const { sb, tables } = makeDb();
    await commitApprovedEstimateImpl(sb as never, "u1", payloadFor("photos_video"));
    tables.estimates[0].status = "sent";

    const result = await commitApprovedEstimateImpl(sb as never, "u1", payloadFor("photos_video"));
    expect(result.createdRevision).toBe(true);
    const live = tables.estimates.filter((e) => !e.superseded_by_id);
    expect(live).toHaveLength(1);
    expect(live[0].version).toBe(2);
  });

  it("removed scope is archived, never deleted, and media rows are untouched", async () => {
    const { sb, tables } = makeDb();
    await commitApprovedEstimateImpl(sb as never, "u1", payloadFor("describe"));

    const reduced = { ...payloadFor("describe"), items: [payloadFor("describe").items![0]] };
    const result = await commitApprovedEstimateImpl(sb as never, "u1", reduced);

    expect(result.scopeItemsArchived).toBe(1);
    expect(tables.scope_items).toHaveLength(2);
    expect(tables.scope_items.filter((i) => i.archived_at)).toHaveLength(1);
  });

  it("photos/video payload carries the internal breakdown but the client snapshot band stays clean", async () => {
    const commit = buildRemoteVisionCommit({
      projectId: "p1",
      grounded: {
        explicit: [
          {
            id: "g1", featureKey: "cabinets", label: "Cabinets", scopeClass: "explicit",
            quantity: 7.83, pricingQuantity: 8, unitKey: "linear_foot", reason: "stated",
            evidence: "94 inches of cabinets", provenance: {
              source: "spoken_measurement", evidence: null, rationale: "stated", isDefault: false,
            },
          } as never,
        ],
        incidental: [], observations: [], exclusions: [], dimensions: [], clarifications: [],
        rejected: [], roomScaling: { roomCount: 1, rooms: [] },
      } as never,
      scenario: {
        level: "economy", costLow: 5000, costHigh: 7000, laborHours: 20, durationDays: 2,
        confidence: 0.8, assumptionIds: [], drivers: [],
        breakdown: { laborHours: 20, crewHours: 20, laborCost: 1500, materialCost: 2500 } as never,
      } as never,
      assumptions: [],
      narrativeText: "Install cabinets",
    });

    expect(commit.intakeSource).toBe("photos_video");
    expect(commit.items?.[0]).toMatchObject({ key: "cabinets", pricingQuantity: 8, confirmed: true });
    expect(commit.ballpark?.confidence).toBe("high");
    expect(commit.ballpark?.breakdown).toBeTruthy();
  });
});
