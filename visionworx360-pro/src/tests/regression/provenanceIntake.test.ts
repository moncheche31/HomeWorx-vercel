import { describe, expect, it } from "vitest";

import { commitApprovedEstimateImpl } from "@/features/estimating/services/estimateCommit.server";
import type { CanonicalEstimateCommit } from "@/domains/estimating/estimateCommit";

/**
 * Interpreted-intake provenance regression.
 *
 * Interpreted intake records WHAT produced a row ("walkthrough",
 * "photos_video", "describe"). Those are source tokens, not row ids, so the
 * provenance ref column must be free text. The fake database below rejects a
 * non-UUID ref the way the old uuid column did: if provenance ever regresses
 * to a uuid ref, these commits fail loudly here instead of in production.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Row extends Record<string, unknown> { id: string }

function makeDb(uuidOnlyOriginRef: boolean) {
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

  const checkRef = (table: string, payload: Record<string, unknown>) => {
    if (!uuidOnlyOriginRef) return;
    if (table !== "scope_items" && table !== "estimate_line_items") return;
    const ref = payload.origin_ref;
    if (typeof ref === "string" && !UUID.test(ref)) {
      throw new Error(`invalid input syntax for type uuid: "${ref}"`);
    }
  };

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
      update: (payload: Record<string, unknown>) => {
        mode = "update"; updatePayload = payload; checkRef(table, payload); return api;
      },
      insert: (payload: Record<string, unknown>) => {
        mode = "insert";
        checkRef(table, payload);
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
      if (name === "current_active_organization_id") return { data: "org1", error: null };
      if (name === "create_estimate_from_scope") {
        const id = nextId("est");
        tables.estimates.push({
          id, organization_id: "org1", project_id: params!._project_id as string,
          status: "draft", version: 1, locked_at: null, superseded_by_id: null,
          archived_at: null, intake_mode: "detailed",
        });
        return { data: id, error: null };
      }
      return { data: null, error: null };
    },
  };

  return { sb, tables };
}

const payloadFor = (
  source: CanonicalEstimateCommit["intakeSource"],
): CanonicalEstimateCommit => ({
  projectId: "p1",
  intakeSource: source,
  items: [
    { key: "cabinets", title: "Install cabinets", quantity: 8, unitKey: "linear_foot", confirmed: true },
  ],
  ballpark: { level: "economy", low: 8000, high: 12000, confidence: "medium", laborHours: 40 },
});

describe("interpreted intake provenance", () => {
  for (const source of ["walkthrough", "photos_video", "describe"] as const) {
    it(`${source}: writes a non-UUID provenance ref without a uuid error`, async () => {
      const { sb, tables } = makeDb(false);
      await commitApprovedEstimateImpl(sb as never, "u1", payloadFor(source));

      const item = tables.scope_items[0];
      expect(item.origin_ref).toBe(source);
      expect(UUID.test(String(item.origin_ref))).toBe(false);
    });

    it(`${source}: a uuid-typed provenance column would reject this write`, async () => {
      const { sb } = makeDb(true);
      await expect(
        commitApprovedEstimateImpl(sb as never, "u1", payloadFor(source)),
      ).rejects.toThrow(/uuid/i);
    });
  }
});
