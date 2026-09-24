/**
 * Contractor Knowledge Base server functions (Module 007B).
 *
 * Contractors NEVER mutate the seeded master library: edits are written as
 * per-organization overrides (copy-on-write) or org-owned assemblies.
 *
 * Extension points (not implemented here): localized cost providers
 * (`src/domains/localizedCost`), supplier catalog providers
 * (`src/domains/supplierCatalog`), AI recommendations and voice capture all
 * read this library through the same DTOs.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  applyTemplateSchema, assemblyStateSchema, createOrgAssemblySchema,
  duplicateAssemblySchema, favoriteSchema, recordUsageSchema, saveAssemblySchema,
  searchAssembliesSchema, templateItemsSchema,
} from "./schemas";
import { mapAssembly, mapTemplate, mapTemplateItem, toOverrideRow } from "./mappers";
import type {
  AssemblyDTO, AssemblyTemplateDTO, AssemblyTemplateItemDTO, LibraryVersionDTO,
} from "../types";

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

export const searchAssemblies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchAssembliesSchema.parse(d))
  .handler(async ({ data, context }): Promise<AssemblyDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const { data: rows, error } = await sb.rpc("search_assemblies", {
      _search: data.search?.trim() || null,
      _trade: data.tradeKey || null,
      _category: data.categoryKey || null,
      _include_disabled: data.includeDisabled ?? false,
      _limit: data.limit ?? 200,
      _offset: data.offset ?? 0,
    });
    if (error) throw new Error(msg(error, "Assembly search failed"));
    return ((rows ?? []) as Record<string, unknown>[]).map(mapAssembly);
  });

export const listLibraryVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<LibraryVersionDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const { data, error } = await sb.from("catalog_library_versions")
      .select("version, name, notes, is_current, released_at").order("version", { ascending: false });
    if (error) throw new Error(msg(error, "Library version lookup failed"));
    return (data as Record<string, unknown>[]).map((r) => ({
      version: Number(r.version),
      name: String(r.name),
      notes: (r.notes as string) ?? null,
      isCurrent: Boolean(r.is_current),
      releasedAt: String(r.released_at),
    }));
  });

/** Save an edit. Library items get an override row; org items are edited directly. */
export const saveAssemblyEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveAssemblySchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const row = toOverrideRow(data.patch);

    if (data.origin === "organization") {
      const { error } = await sb.from("org_assemblies").update(row)
        .eq("organization_id", org).eq("assembly_key", data.assemblyKey);
      if (error) throw new Error(msg(error, "Save failed"));
      return { ok: true };
    }

    const { data: version, error: vErr } = await sb.from("catalog_library_versions")
      .select("version").eq("is_current", true).maybeSingle();
    if (vErr) throw new Error(msg(vErr, "Library version lookup failed"));

    const { error } = await sb.from("org_assembly_overrides").upsert(
      {
        organization_id: org,
        library_version: Number((version as { version: number } | null)?.version ?? 1),
        assembly_key: data.assemblyKey,
        ...row,
      },
      { onConflict: "organization_id,assembly_key" },
    );
    if (error) throw new Error(msg(error, "Save failed"));
    return { ok: true };
  });

/** Disable / enable / archive / restore. Master records stay untouched. */
export const setAssemblyState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => assemblyStateSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const patch: Record<string, unknown> = {};
    if (data.isDisabled !== undefined) patch.is_disabled = data.isDisabled;
    if (data.isArchived !== undefined) patch.archived_at = data.isArchived ? new Date().toISOString() : null;

    if (data.origin === "organization") {
      const { error } = await sb.from("org_assemblies").update(patch)
        .eq("organization_id", org).eq("assembly_key", data.assemblyKey);
      if (error) throw new Error(msg(error, "Update failed"));
      return { ok: true };
    }

    const { data: version } = await sb.from("catalog_library_versions")
      .select("version").eq("is_current", true).maybeSingle();
    const { error } = await sb.from("org_assembly_overrides").upsert(
      {
        organization_id: org,
        library_version: Number((version as { version: number } | null)?.version ?? 1),
        assembly_key: data.assemblyKey,
        ...patch,
      },
      { onConflict: "organization_id,assembly_key" },
    );
    if (error) throw new Error(msg(error, "Update failed"));
    return { ok: true };
  });

export const duplicateAssembly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => duplicateAssemblySchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const sb = context.supabase as unknown as SB;
    const { data: id, error } = await sb.rpc("duplicate_assembly", {
      _assembly_key: data.assemblyKey,
      _new_key: data.newKey ?? null,
    });
    if (error) throw new Error(msg(error, "Duplicate failed"));
    return { id: String(id) };
  });

export const createOrgAssembly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createOrgAssemblySchema.parse(d))
  .handler(async ({ data, context }): Promise<{ assemblyKey: string }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const key =
      data.assemblyKey?.trim() ||
      `org.${data.categoryKey}.${data.workItem.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}`;
    const { error } = await sb.from("org_assemblies").insert({
      organization_id: org,
      assembly_key: key,
      trade_key: data.tradeKey,
      category_key: data.categoryKey,
      subcategory_key: data.subcategoryKey ?? null,
      work_item: data.workItem,
      default_scope_description: data.defaultScopeDescription,
      unit_key: data.unitKey,
      keywords: data.keywords ?? [],
    });
    if (error) throw new Error(msg(error, "Create failed"));
    return { assemblyKey: key };
  });

export const toggleFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => favoriteSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    if (!data.isFavorite) {
      const { error } = await sb.from("assembly_favorites").delete()
        .eq("organization_id", org).eq("assembly_key", data.assemblyKey);
      if (error) throw new Error(msg(error, "Update failed"));
      return { ok: true };
    }
    const { error } = await sb.from("assembly_favorites").upsert(
      {
        organization_id: org,
        user_id: context.userId,
        assembly_key: data.assemblyKey,
        is_pinned: data.isPinned ?? false,
      },
      { onConflict: "organization_id,user_id,assembly_key" },
    );
    if (error) throw new Error(msg(error, "Update failed"));
    return { ok: true };
  });

export const recordAssemblyUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recordUsageSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const { error } = await sb.rpc("record_assembly_usage", { _assembly_keys: data.assemblyKeys });
    if (error) throw new Error(msg(error, "Usage tracking failed"));
    return { ok: true };
  });

export const listAssemblyTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AssemblyTemplateDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const { data, error } = await sb.from("assembly_templates")
      .select("id, template_key, name, description, category_key, is_system_template, assembly_template_items(count)")
      .eq("is_active", true).is("archived_at", null).order("name");
    if (error) throw new Error(msg(error, "Template lookup failed"));
    return (data as Record<string, unknown>[]).map(mapTemplate);
  });

export const listTemplateItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => templateItemsSchema.parse(d))
  .handler(async ({ data, context }): Promise<AssemblyTemplateItemDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const { data: rows, error } = await sb.from("assembly_template_items")
      .select("id, section_label, assembly_key, quantity, unit_key, sort_order")
      .eq("template_id", data.templateId).order("sort_order");
    if (error) throw new Error(msg(error, "Template item lookup failed"));
    return (rows as Record<string, unknown>[]).map(mapTemplateItem);
  });

/** Insert an entire template into a project's scope. Always additive. */
export const applyAssemblyTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => applyTemplateSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ sectionsCreated: number; itemsCreated: number }> => {
    const sb = context.supabase as unknown as SB;
    const { data: res, error } = await sb.rpc("apply_assembly_template", {
      _project_id: data.projectId,
      _template_id: data.templateId,
      _room_id: data.roomId ?? null,
    });
    if (error) throw new Error(msg(error, "Template apply failed"));
    const out = res as { sections_created?: number; items_created?: number } | null;
    return {
      sectionsCreated: Number(out?.sections_created ?? 0),
      itemsCreated: Number(out?.items_created ?? 0),
    };
  });
