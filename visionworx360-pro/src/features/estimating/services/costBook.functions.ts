/**
 * Contractor Cost Book server functions.
 *
 * TRANSPARENCY + OVERRIDES ONLY. Every number is still produced by the
 * canonical pricing engine (`kb_apply_pricing` + the estimate line triggers);
 * these functions decide which baseline the engine consumes and record where it
 * came from. The VisionWorx catalog baseline is never mutated.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { CostBookEntry, PricingBasisTrace } from "@/domains/costBook";
import {
  costBookEntrySchema,
  linePricingBasisSchema,
  overrideHistorySchema,
  repriceFromCostBookSchema,
  resetCompanyOverrideSchema,
  resetLineRateOverrideSchema,
  saveCompanyOverrideSchema,
  saveLineRateOverrideSchema,
  searchCostBookSchema,
} from "./costBook.schemas";
import {
  toCompanyOverrideRow,
  toCostBookEntry,
  toCostBookValues,
  toLineOverrideRow,
  toPricingBasisTrace,
  type CostBookListRow,
} from "./costBook.server";

type SB = {
  from: (t: string) => any;
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const msg = (e: unknown, fallback: string) =>
  (e as { message?: string } | null)?.message ?? fallback;

async function resolveOrg(sb: SB): Promise<string> {
  const { data, error } = await sb.rpc("current_active_organization_id");
  if (error) throw new Error(msg(error, "No active organization"));
  const org = data as string | null;
  if (!org) throw new Error("No active organization");
  return org;
}

/** Catalog tasks with their company Cost Book state, for the settings list. */
export const searchCostBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchCostBookSchema.parse(d))
  .handler(async ({ data, context }): Promise<CostBookListRow[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);

    const { data: version } = await sb
      .from("catalog_library_versions")
      .select("version")
      .eq("is_current", true)
      .maybeSingle();
    const libraryVersion = (version as { version?: number } | null)?.version ?? null;

    let query = sb
      .from("catalog_assemblies")
      .select(
        "assembly_key, work_item, trade_key, category_key, unit_key, cost_basis, " +
          "productivity_convention, default_labor_hours, production_rate, setup_hours, " +
          "material_allowance, waste_factor, crew_size",
      )
      .eq("is_active", true);
    if (libraryVersion !== null) query = query.eq("library_version", libraryVersion);
    if (data.tradeKey) query = query.eq("trade_key", data.tradeKey);
    if (data.categoryKey) query = query.eq("category_key", data.categoryKey);
    if (data.search?.trim()) query = query.ilike("work_item", `%${data.search.trim()}%`);

    const limit = data.limit ?? 60;
    const offset = data.offset ?? 0;
    const { data: rows, error } = await query
      .order("trade_key", { ascending: true })
      .order("work_item", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new Error(msg(error, "Cost Book search failed"));

    const catalog = (rows ?? []) as Record<string, unknown>[];
    const keys = catalog.map((r) => String(r.assembly_key));

    const { data: overrides } = await sb
      .from("org_assembly_overrides")
      .select(
        "assembly_key, default_labor_hours, setup_hours, min_task_hours, material_allowance, " +
          "waste_factor, crew_size, equipment_cost, other_cost, direct_unit_cost, rate_note, updated_at",
      )
      .eq("organization_id", org)
      .is("archived_at", null)
      .in("assembly_key", keys.length > 0 ? keys : ["__none__"]);

    const byKey = new Map<string, Record<string, unknown>>();
    for (const o of (overrides ?? []) as Record<string, unknown>[]) {
      byKey.set(String(o.assembly_key), o);
    }

    const hoursPerUnit = (r: Record<string, unknown>): number | null => {
      const convention = String(r.productivity_convention ?? "");
      const hours = Number(r.default_labor_hours ?? 0);
      const rate = Number(r.production_rate ?? 0);
      if (convention === "units_per_hour" && rate > 0) return Math.round((1 / rate) * 10000) / 10000;
      return hours > 0 ? hours : null;
    };

    const list: CostBookListRow[] = catalog.map((r) => {
      const o = byKey.get(String(r.assembly_key));
      const company = o
        ? toCostBookValues({
            hoursPerUnit: o.default_labor_hours,
            setupHours: o.setup_hours,
            minTaskHours: o.min_task_hours,
            materialAllowance: o.material_allowance,
            wasteFactor: o.waste_factor,
            crewSize: o.crew_size,
            equipmentCost: o.equipment_cost,
            otherCost: o.other_cost,
            directUnitCost: o.direct_unit_cost,
          })
        : null;
      const customized =
        !!company && Object.values(company).some((v) => v !== null && v !== undefined);

      return {
        assemblyKey: String(r.assembly_key),
        workItem: (r.work_item as string | null) ?? null,
        tradeKey: (r.trade_key as string | null) ?? null,
        categoryKey: (r.category_key as string | null) ?? null,
        unitKey: (r.unit_key as string | null) ?? null,
        costBasis: (r.cost_basis as string | null) ?? null,
        baseline: toCostBookValues({
          hoursPerUnit: hoursPerUnit(r),
          setupHours: r.setup_hours,
          materialAllowance: r.material_allowance,
          wasteFactor: r.waste_factor,
          crewSize: r.crew_size,
        }),
        company: customized ? company : null,
        isCustomized: customized,
        companyUpdatedAt: customized ? ((o?.updated_at as string | null) ?? null) : null,
      };
    });

    return data.customizedOnly ? list.filter((r) => r.isCustomized) : list;
  });

/** Baseline vs company comparison for one catalog task. */
export const getCostBookEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => costBookEntrySchema.parse(d))
  .handler(async ({ data, context }): Promise<CostBookEntry | null> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const { data: raw, error } = await sb.rpc("cost_book_entry", {
      _org: org,
      _assembly_key: data.assemblyKey,
    });
    if (error) throw new Error(msg(error, "Could not load the pricing basis"));
    return toCostBookEntry(raw);
  });

/** Save (or clear) a company Cost Book default. Baseline row is untouched. */
export const saveCompanyOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveCompanyOverrideSchema.parse(d))
  .handler(async ({ data, context }): Promise<CostBookEntry | null> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);

    const { data: version } = await sb
      .from("catalog_library_versions")
      .select("version")
      .eq("is_current", true)
      .maybeSingle();

    const row = {
      organization_id: org,
      assembly_key: data.assemblyKey,
      library_version: (version as { version?: number } | null)?.version ?? 1,
      ...toCompanyOverrideRow(data.values),
      productivity_convention: data.productivityConvention ?? "hours_per_unit",
      rate_note: data.note ?? null,
      source_version: "company-cost-book",
      updated_at: new Date().toISOString(),
    };

    const { error } = await sb
      .from("org_assembly_overrides")
      .upsert(row, { onConflict: "organization_id,assembly_key" });
    if (error) throw new Error(msg(error, "Could not save the company rate"));

    const { data: raw } = await sb.rpc("cost_book_entry", {
      _org: org,
      _assembly_key: data.assemblyKey,
    });
    return toCostBookEntry(raw);
  });

/**
 * Reset a company default back to the VisionWorx baseline. The override row is
 * deleted, but its previous values are preserved in the history log.
 */
export const resetCompanyOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetCompanyOverrideSchema.parse(d))
  .handler(async ({ data, context }): Promise<CostBookEntry | null> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const { error } = await sb
      .from("org_assembly_overrides")
      .delete()
      .eq("organization_id", org)
      .eq("assembly_key", data.assemblyKey);
    if (error) throw new Error(msg(error, "Could not reset the company rate"));

    const { data: raw } = await sb.rpc("cost_book_entry", {
      _org: org,
      _assembly_key: data.assemblyKey,
    });
    return toCostBookEntry(raw);
  });

/** Full source trace for one estimate line — contractor surfaces only. */
export const getLinePricingBasis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => linePricingBasisSchema.parse(d))
  .handler(async ({ data, context }): Promise<PricingBasisTrace | null> => {
    const sb = context.supabase as unknown as SB;
    const { data: raw, error } = await sb.rpc("line_pricing_basis", { _line_id: data.lineId });
    if (error) throw new Error(msg(error, "Could not load the pricing basis"));
    return toPricingBasisTrace(raw);
  });

/**
 * Override a rate from an estimate line.
 *
 * `scope: "estimate"` touches this estimate only. `scope: "company"` writes the
 * organization default and, only when the contractor asks, applies it to this
 * estimate too — never to other estimates.
 */
export const saveLineRateOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveLineRateOverrideSchema.parse(d))
  .handler(async ({ data, context }): Promise<PricingBasisTrace | null> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);

    const { data: line, error: lineError } = await sb
      .from("estimate_line_items")
      .select("id, estimate_id, catalog_item_key, organization_id")
      .eq("id", data.lineId)
      .maybeSingle();
    if (lineError) throw new Error(msg(lineError, "Line not found"));
    const target = line as {
      estimate_id: string;
      catalog_item_key: string | null;
      organization_id: string;
    } | null;
    if (!target || target.organization_id !== org) throw new Error("Line not found");

    const editable = await sb.rpc("estimate_is_editable", { _estimate_id: target.estimate_id });
    if (editable.data === false) throw new Error("This estimate is no longer editable");

    if (data.scope === "company") {
      if (!target.catalog_item_key) {
        throw new Error("This line has no catalog task, so it cannot become a company default");
      }
      await saveCompanyOverride({
        data: {
          assemblyKey: target.catalog_item_key,
          values: data.values,
          note: data.note ?? null,
        },
      });
    }

    const applyToLine = data.scope === "estimate" || data.applyToThisEstimate === true;
    if (applyToLine) {
      const { error } = await sb
        .from("estimate_line_items")
        .update({
          ...toLineOverrideRow(data.values),
          rate_override_note: data.note ?? null,
          rate_override_at: new Date().toISOString(),
        })
        .eq("id", data.lineId);
      if (error) throw new Error(msg(error, "Could not save the rate override"));
    }

    const { data: raw } = await sb.rpc("line_pricing_basis", { _line_id: data.lineId });
    return toPricingBasisTrace(raw);
  });

/**
 * Drop this estimate's override so the line falls back to the next source
 * (company Cost Book, else VisionWorx baseline), then reprice that line.
 */
export const resetLineRateOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetLineRateOverrideSchema.parse(d))
  .handler(async ({ data, context }): Promise<PricingBasisTrace | null> => {
    const sb = context.supabase as unknown as SB;

    const { data: line } = await sb
      .from("estimate_line_items")
      .select("id, estimate_id")
      .eq("id", data.lineId)
      .maybeSingle();
    const estimateId = (line as { estimate_id?: string } | null)?.estimate_id;
    if (!estimateId) throw new Error("Line not found");

    const editable = await sb.rpc("estimate_is_editable", { _estimate_id: estimateId });
    if (editable.data === false) throw new Error("This estimate is no longer editable");

    const { error } = await sb
      .from("estimate_line_items")
      .update({
        rate_override_hours_per_unit: null,
        rate_override_setup_hours: null,
        rate_override_labor_rate: null,
        rate_override_material_unit_cost: null,
        rate_override_equipment_cost: null,
        rate_override_other_cost: null,
        rate_override_note: null,
        rate_override_at: null,
        /* Hand the line back to the library so the next source takes effect. */
        is_price_overridden: false,
      })
      .eq("id", data.lineId);
    if (error) throw new Error(msg(error, "Could not reset the rate override"));

    await sb.rpc("reprice_estimate_from_cost_book", { _estimate_id: estimateId });

    const { data: raw } = await sb.rpc("line_pricing_basis", { _line_id: data.lineId });
    return toPricingBasisTrace(raw);
  });

/**
 * Explicit contractor action: reprice an EDITABLE estimate from the current
 * Cost Book. Locked/approved/archived/superseded estimates are refused by the
 * database function, and manual line overrides are preserved.
 */
export const repriceEstimateFromCostBook = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => repriceFromCostBookSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ repricedAt: string | null }> => {
    const sb = context.supabase as unknown as SB;
    const { data: result, error } = await sb.rpc("reprice_estimate_from_cost_book", {
      _estimate_id: data.estimateId,
    });
    if (error) throw new Error(msg(error, "Reprice failed"));
    const j = (result ?? {}) as Record<string, unknown>;
    return { repricedAt: (j.repricedAt as string | null) ?? null };
  });

/** Previous company values for a task — audit history, newest first. */
export const listCostBookHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => overrideHistorySchema.parse(d))
  .handler(async ({ data, context }) => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const { data: rows, error } = await sb
      .from("org_assembly_override_history")
      .select("id, action, previous_values, new_values, created_at")
      .eq("organization_id", org)
      .eq("assembly_key", data.assemblyKey)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 10);
    if (error) throw new Error(msg(error, "Could not load rate history"));

    return ((rows ?? []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id),
      action: String(r.action),
      createdAt: String(r.created_at),
      previous: toCostBookValues({
        hoursPerUnit: (r.previous_values as Record<string, unknown> | null)?.default_labor_hours,
        setupHours: (r.previous_values as Record<string, unknown> | null)?.setup_hours,
        materialAllowance: (r.previous_values as Record<string, unknown> | null)?.material_allowance,
      }),
      next: toCostBookValues({
        hoursPerUnit: (r.new_values as Record<string, unknown> | null)?.default_labor_hours,
        setupHours: (r.new_values as Record<string, unknown> | null)?.setup_hours,
        materialAllowance: (r.new_values as Record<string, unknown> | null)?.material_allowance,
      }),
    }));
  });
