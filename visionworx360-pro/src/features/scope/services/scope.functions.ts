import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { originStamp } from "@/domains/provenance";
import {
  applyTemplateSchema, archiveItemSchema, archiveSectionSchema, bulkInclusionSchema,
  createItemSchema, createSectionSchema, deleteItemSchema, duplicateItemSchema,
  insertTemplateItemSchema, insertTemplateSectionSchema, linkDocumentSchema, linkPhotoSchema,
  listItemsSchema, listSectionsSchema, listTemplatesSchema, moveItemSchema,
  moveItemToPositionSchema, previewTemplateSchema, quickAddSchema, recommendTemplateSchema,
  reorderItemsSchema, reorderSectionsSchema, unlinkDocumentSchema, unlinkPhotoSchema,
  updateItemSchema, updateSectionSchema,
} from "./schemas";
import { mapItem, mapSection, mapTemplate } from "./mappers";
import type {
  ApplyTemplateResult, ScopeItemDTO, ScopeSectionDTO,
  ScopeTemplatePreviewDTO, ScopeTemplateSummaryDTO,
} from "../types";

type SB = {
  from: (t: string) => any;
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

async function resolveOrg(sb: SB): Promise<string> {
  const { data, error } = await sb.rpc("current_active_organization_id");
  if (error) throw new Error((error as { message?: string }).message ?? "No active organization");
  const org = data as string | null;
  if (!org) throw new Error("No active organization");
  return org;
}

async function assertProjectInOrg(sb: SB, projectId: string, orgId: string) {
  const { data, error } = await sb.from("projects").select("id").eq("id", projectId)
    .eq("organization_id", orgId).maybeSingle();
  if (error) throw new Error((error as { message?: string }).message ?? "Project lookup failed");
  if (!data) throw new Error("Project not in active organization");
}

async function assertRoomInProject(sb: SB, roomId: string, projectId: string, orgId: string) {
  const { data, error } = await sb.from("project_rooms").select("id").eq("id", roomId)
    .eq("project_id", projectId).eq("organization_id", orgId).maybeSingle();
  if (error) throw new Error((error as { message?: string }).message ?? "Room lookup failed");
  if (!data) throw new Error("Room not in project");
}

async function assertSectionInProject(sb: SB, sectionId: string, projectId: string, orgId: string) {
  const { data, error } = await sb.from("scope_sections").select("id").eq("id", sectionId)
    .eq("project_id", projectId).eq("organization_id", orgId).maybeSingle();
  if (error) throw new Error((error as { message?: string }).message ?? "Section lookup failed");
  if (!data) throw new Error("Section not in project");
}

async function assertItemInProject(sb: SB, itemId: string, projectId: string, orgId: string) {
  const { data, error } = await sb.from("scope_items").select("id").eq("id", itemId)
    .eq("project_id", projectId).eq("organization_id", orgId).maybeSingle();
  if (error) throw new Error((error as { message?: string }).message ?? "Item lookup failed");
  if (!data) throw new Error("Item not in project");
}

async function assertPhotoInProject(sb: SB, photoId: string, projectId: string, orgId: string) {
  const { data, error } = await sb.from("project_photos").select("id,archived_at")
    .eq("id", photoId).eq("project_id", projectId).eq("organization_id", orgId).maybeSingle();
  if (error) throw new Error((error as { message?: string }).message ?? "Photo lookup failed");
  if (!data) throw new Error("Photo not in project");
}

async function loadItemLinks(sb: SB, projectId: string, orgId: string, itemIds: string[]) {
  const map = new Map<string, string[]>();
  if (itemIds.length === 0) return map;
  const { data, error } = await sb.from("scope_item_photos")
    .select("scope_item_id,project_photo_id")
    .eq("project_id", projectId).eq("organization_id", orgId)
    .in("scope_item_id", itemIds);
  if (error) throw new Error((error as { message?: string }).message ?? "Failed to load photo links");
  for (const row of (data as Array<{ scope_item_id: string; project_photo_id: string }>) ?? []) {
    const arr = map.get(row.scope_item_id) ?? [];
    arr.push(row.project_photo_id);
    map.set(row.scope_item_id, arr);
  }
  return map;
}

async function loadItemDocumentLinks(sb: SB, projectId: string, orgId: string, itemIds: string[]) {
  const map = new Map<string, string[]>();
  if (itemIds.length === 0) return map;
  const { data, error } = await sb.from("scope_item_documents")
    .select("scope_item_id,project_document_id")
    .eq("project_id", projectId).eq("organization_id", orgId)
    .in("scope_item_id", itemIds);
  if (error) throw new Error((error as { message?: string }).message ?? "Failed to load attachments");
  for (const row of (data as Array<{ scope_item_id: string; project_document_id: string }>) ?? []) {
    const arr = map.get(row.scope_item_id) ?? [];
    arr.push(row.project_document_id);
    map.set(row.scope_item_id, arr);
  }
  return map;
}

async function assertDocumentInProject(sb: SB, documentId: string, projectId: string, orgId: string) {
  const { data, error } = await sb.from("project_documents").select("id")
    .eq("id", documentId).eq("project_id", projectId).eq("organization_id", orgId).maybeSingle();
  if (error) throw new Error((error as { message?: string }).message ?? "Document lookup failed");
  if (!data) throw new Error("Document not in project");
}

/* ================ SECTIONS ================ */

export const listScopeSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSectionsSchema.parse(d))
  .handler(async ({ data, context }): Promise<ScopeSectionDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    let q = sb.from("scope_sections").select("*")
      .eq("organization_id", org).eq("project_id", data.projectId);
    if (data.roomId === null) q = q.is("room_id", null);
    else if (data.roomId) q = q.eq("room_id", data.roomId);
    if (!data.includeArchived) q = q.is("archived_at", null);
    q = q.order("sort_order", { ascending: true }).order("created_at", { ascending: true });
    const { data: rows, error } = await q;
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to load scope sections");
    return ((rows as unknown[]) ?? []).map((r) => mapSection(r as Record<string, unknown>));
  });

export const createScopeSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSectionSchema.parse(d))
  .handler(async ({ data, context }): Promise<ScopeSectionDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const { data: max } = await sb.from("scope_sections").select("sort_order")
      .eq("organization_id", org).eq("project_id", data.projectId)
      .order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const nextSort = ((max as { sort_order?: number } | null)?.sort_order ?? -1) + 1;
    const { data: row, error } = await sb.from("scope_sections").insert({
      organization_id: org, project_id: data.projectId, room_id: data.roomId ?? null,
      name: data.name, section_key: data.sectionKey, trade_key: data.tradeKey,
      description: data.description, sort_order: nextSort, created_by: context.userId,
    }).select("*").single();
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to create section");
    return mapSection(row as Record<string, unknown>);
  });

export const updateScopeSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSectionSchema.parse(d))
  .handler(async ({ data, context }): Promise<ScopeSectionDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    await assertSectionInProject(sb, data.id, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const { data: row, error } = await sb.from("scope_sections").update({
      name: data.name, section_key: data.sectionKey, trade_key: data.tradeKey,
      description: data.description, room_id: data.roomId ?? null,
    }).eq("id", data.id).eq("organization_id", org).eq("project_id", data.projectId)
      .select("*").single();
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to update section");
    return mapSection(row as Record<string, unknown>);
  });

export const archiveScopeSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveSectionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb.from("scope_sections").update({ archived_at: new Date().toISOString() })
      .eq("id", data.id).eq("organization_id", org).eq("project_id", data.projectId);
    if (error) {
      const msg = (error as { message?: string }).message ?? "Failed to archive section";
      if (msg.includes("section_has_active_items"))
        throw new Error("section_has_active_items");
      throw new Error(msg);
    }
    return { ok: true };
  });

export const restoreScopeSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveSectionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb.from("scope_sections").update({ archived_at: null })
      .eq("id", data.id).eq("organization_id", org).eq("project_id", data.projectId);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to restore section");
    return { ok: true };
  });

export const reorderScopeSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reorderSectionsSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb.rpc("reorder_scope_sections", {
      _project_id: data.projectId, _ordered_ids: data.orderedIds,
    });
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to reorder sections");
    return { ok: true };
  });

/* ================ ITEMS ================ */

function itemInsertPayload(input: any, org: string, userId: string) {
  return {
    organization_id: org, project_id: input.projectId, section_id: input.sectionId,
    room_id: input.roomId ?? null, title: input.title, scope_item_key: input.scopeItemKey,
    trade_key: input.tradeKey, category_key: input.categoryKey ?? null,
    subcategory_key: input.subcategoryKey ?? null,
    action_key: input.actionKey ?? null, description: input.description,
    quantity: input.quantity ?? null, unit_key: input.unitKey ?? null,
    material_selection: input.materialSelection, finish_selection: input.finishSelection,
    labor_notes: input.laborNotes, customer_notes: input.customerNotes,
    internal_notes: input.internalNotes, assumptions: input.assumptions, exclusions: input.exclusions,
    is_included: input.isIncluded ?? true, is_customer_selection: input.isCustomerSelection ?? false,
    is_client_visible: input.isClientVisible ?? true, priority: input.priority ?? "normal",
    confidence_status: input.confidenceStatus ?? null,
    completion_status: input.completionStatus ?? "draft",
    created_by: userId,
    /* Provenance is never optional: a typed item is contractor authority, and
       a typed quantity is a contractor quantity, not a derived one. */
    ...originStamp("contractor"),
    ...(input.quantity != null
      ? { quantity_basis: "contractor_entered" as const, quantity_basis_note: "Entered by contractor" }
      : {}),
  };
}


export const listScopeItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listItemsSchema.parse(d))
  .handler(async ({ data, context }): Promise<ScopeItemDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    let q = sb.from("scope_items").select("*")
      .eq("organization_id", org).eq("project_id", data.projectId);
    if (data.roomId === null) q = q.is("room_id", null);
    else if (data.roomId) q = q.eq("room_id", data.roomId);
    if (data.sectionId) q = q.eq("section_id", data.sectionId);
    if (data.tradeKey) q = q.eq("trade_key", data.tradeKey);
    if (data.confidence) q = q.eq("confidence_status", data.confidence);
    if (data.status) q = q.eq("completion_status", data.status);
    if (data.priority) q = q.eq("priority", data.priority);
    if (data.categoryKey) q = q.eq("category_key", data.categoryKey);
    if (data.includedOnly) q = q.eq("is_included", true);
    if (data.excludedOnly) q = q.eq("is_included", false);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    if (!data.includeArchived) q = q.is("archived_at", null);
    q = q.order("sort_order", { ascending: true }).order("created_at", { ascending: true });
    const { data: rows, error } = await q;
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to load scope items");
    const items = ((rows as unknown[]) ?? []).map((r) => r as Record<string, unknown>);
    const ids = items.map((i) => i.id as string);
    const links = await loadItemLinks(sb, data.projectId, org, ids);
    const docLinks = await loadItemDocumentLinks(sb, data.projectId, org, ids);
    return items.map((r) =>
      mapItem(r, links.get(r.id as string) ?? [], docLinks.get(r.id as string) ?? []));
  });

export const createScopeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createItemSchema.parse(d))
  .handler(async ({ data, context }): Promise<ScopeItemDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    await assertSectionInProject(sb, data.sectionId, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const { data: max } = await sb.from("scope_items").select("sort_order")
      .eq("organization_id", org).eq("section_id", data.sectionId)
      .order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const nextSort = ((max as { sort_order?: number } | null)?.sort_order ?? -1) + 1;
    const payload = { ...itemInsertPayload(data, org, context.userId), sort_order: nextSort };
    const { data: row, error } = await sb.from("scope_items").insert(payload).select("*").single();
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to create scope item");
    return mapItem(row as Record<string, unknown>, []);
  });

export const quickAddScopeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => quickAddSchema.parse(d))
  .handler(async ({ data, context }): Promise<ScopeItemDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    await assertSectionInProject(sb, data.sectionId, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const { data: max } = await sb.from("scope_items").select("sort_order")
      .eq("organization_id", org).eq("section_id", data.sectionId)
      .order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const nextSort = ((max as { sort_order?: number } | null)?.sort_order ?? -1) + 1;
    const { data: row, error } = await sb.from("scope_items").insert({
      organization_id: org, project_id: data.projectId, section_id: data.sectionId,
      room_id: data.roomId ?? null, title: data.title, sort_order: nextSort,
      created_by: context.userId, is_included: true, completion_status: "draft",
      ...originStamp("contractor"),
    }).select("*").single();
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to add item");
    return mapItem(row as Record<string, unknown>, []);
  });

export const updateScopeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateItemSchema.parse(d))
  .handler(async ({ data, context }): Promise<ScopeItemDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    await assertItemInProject(sb, data.id, data.projectId, org);
    await assertSectionInProject(sb, data.sectionId, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const payload = itemInsertPayload(data, org, context.userId);
    delete (payload as any).created_by;
    const { data: row, error } = await sb.from("scope_items").update(payload)
      .eq("id", data.id).eq("organization_id", org).eq("project_id", data.projectId)
      .select("*").single();
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to update item");
    const links = await loadItemLinks(sb, data.projectId, org, [data.id]);
    const docLinks = await loadItemDocumentLinks(sb, data.projectId, org, [data.id]);
    return mapItem(row as Record<string, unknown>, links.get(data.id) ?? [], docLinks.get(data.id) ?? []);
  });

export const archiveScopeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveItemSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb.from("scope_items").update({ archived_at: new Date().toISOString() })
      .eq("id", data.id).eq("organization_id", org).eq("project_id", data.projectId);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to archive item");
    return { ok: true };
  });

export const restoreScopeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveItemSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb.from("scope_items").update({ archived_at: null })
      .eq("id", data.id).eq("organization_id", org).eq("project_id", data.projectId);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to restore item");
    return { ok: true };
  });

export const duplicateScopeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => duplicateItemSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    await assertItemInProject(sb, data.id, data.projectId, org);
    const { data: id, error } = await sb.rpc("duplicate_scope_item", { _item_id: data.id });
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to duplicate item");
    return { id: id as string };
  });

export const moveScopeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => moveItemSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    await assertItemInProject(sb, data.id, data.projectId, org);
    await assertSectionInProject(sb, data.newSectionId, data.projectId, org);
    if (data.newRoomId) await assertRoomInProject(sb, data.newRoomId, data.projectId, org);
    const { error } = await sb.rpc("move_scope_item", {
      _item_id: data.id, _new_section_id: data.newSectionId, _new_room_id: data.newRoomId ?? null,
    });
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to move item");
    return { ok: true };
  });

export const reorderScopeItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reorderItemsSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    await assertSectionInProject(sb, data.sectionId, data.projectId, org);
    const { error } = await sb.rpc("reorder_scope_items", {
      _section_id: data.sectionId, _ordered_ids: data.orderedIds,
    });
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to reorder items");
    return { ok: true };
  });

export const bulkUpdateScopeInclusion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bulkInclusionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ count: number }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { data: count, error } = await sb.rpc("bulk_update_scope_inclusion", {
      _project_id: data.projectId, _item_ids: data.itemIds, _is_included: data.isIncluded,
    });
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to update items");
    return { count: Number(count ?? 0) };
  });

/* ================ PHOTOS ================ */

export const linkScopePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => linkPhotoSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    await assertItemInProject(sb, data.itemId, data.projectId, org);
    await assertPhotoInProject(sb, data.photoId, data.projectId, org);
    const { error } = await sb.from("scope_item_photos").insert({
      scope_item_id: data.itemId, project_photo_id: data.photoId,
      organization_id: org, project_id: data.projectId,
    });
    if (error) {
      const msg = (error as { message?: string; code?: string }).message ?? "";
      if (!msg.includes("duplicate")) throw new Error(msg || "Failed to link photo");
    }
    return { ok: true };
  });

export const unlinkScopePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => unlinkPhotoSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb.from("scope_item_photos").delete()
      .eq("scope_item_id", data.itemId).eq("project_photo_id", data.photoId)
      .eq("organization_id", org).eq("project_id", data.projectId);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to unlink photo");
    return { ok: true };
  });

/* ================ TEMPLATES ================ */

export const listScopeTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listTemplatesSchema.parse(d))
  .handler(async ({ context }): Promise<ScopeTemplateSummaryDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const { data, error } = await sb.from("scope_templates")
      .select("id,template_key,name,description,is_system_template,organization_id,project_category_key,project_type_key,project_subtype_key,business_type_key,is_active")
      .eq("is_active", true).order("is_system_template", { ascending: false }).order("name");
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to load templates");
    return ((data as unknown[]) ?? []).map((r) => mapTemplate(r as Record<string, unknown>));
  });

export const previewScopeTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => previewTemplateSchema.parse(d))
  .handler(async ({ data, context }): Promise<ScopeTemplatePreviewDTO> => {
    const sb = context.supabase as unknown as SB;
    const { data: row, error } = await sb.from("scope_templates").select("*")
      .eq("id", data.templateId).maybeSingle();
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to load template");
    if (!row) throw new Error("Template not found");
    const summary = mapTemplate(row as Record<string, unknown>);
    const td = (row as { template_data?: { sections?: any[] } }).template_data ?? {};
    const sections = ((td.sections as any[]) ?? []).map((s, index) => ({
      index,
      name: s.name as string,
      sectionKey: (s.section_key as string) ?? null,
      tradeKey: (s.trade_key as string) ?? null,
      items: ((s.items as any[]) ?? []).map((i, itemIndex) => ({
        index: itemIndex,
        title: i.title as string,
        scopeItemKey: (i.scope_item_key as string) ?? null,
        tradeKey: (i.trade_key as string) ?? null,
      })),
    }));
    return { ...summary, sections };
  });

export const applyScopeTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => applyTemplateSchema.parse(d))
  .handler(async ({ data, context }): Promise<ApplyTemplateResult> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const { data: result, error } = await sb.rpc("apply_scope_template", {
      _project_id: data.projectId, _template_id: data.templateId,
      _room_id: data.roomId ?? null, _allow_append: data.allowAppend ?? true,
      _confirm_mismatch: data.confirmMismatch ?? false,
    });
    if (error) {
      const msg = (error as { message?: string }).message ?? "Failed to apply template";
      if (msg.includes("scope_exists_append_required")) throw new Error("scope_exists_append_required");
      /* Mismatch is a decision for the contractor, not a hard failure: the UI
         re-submits with confirmMismatch once they accept it. */
      if (msg.includes("template_project_type_mismatch")) {
        const [, projectType, templateType] = msg.split("template_project_type_mismatch:")[1]
          ? ["", ...msg.split("template_project_type_mismatch:")[1].split(":")]
          : ["", "unknown", "unknown"];
        throw new Error(
          `template_project_type_mismatch:${projectType ?? "unknown"}:${(templateType ?? "unknown").split(/\s/)[0]}`,
        );
      }
      throw new Error(msg);
    }
    const r = result as { sections_created?: number; items_created?: number } | null;
    return { sectionsCreated: r?.sections_created ?? 0, itemsCreated: r?.items_created ?? 0 };
  });

export const recommendScopeTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recommendTemplateSchema.parse(d))
  .handler(async ({ data, context }): Promise<ScopeTemplateSummaryDTO | null> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { data: proj } = await sb.from("projects")
      .select("project_category_key,project_type_key,project_subtype_key")
      .eq("id", data.projectId).eq("organization_id", org).maybeSingle();
    const p = (proj as { project_category_key?: string; project_type_key?: string; project_subtype_key?: string } | null) ?? {};
    const { data: rows } = await sb.from("scope_templates")
      .select("id,template_key,name,description,is_system_template,organization_id,project_category_key,project_type_key,project_subtype_key,business_type_key")
      .eq("is_active", true);
    const templates = ((rows as unknown[]) ?? []).map((r) => mapTemplate(r as Record<string, unknown>));
    if (templates.length === 0) return null;
    const scored = templates.map((t) => {
      let score = 0;
      if (p.project_type_key && t.projectTypeKey === p.project_type_key) score += 10;
      if (p.project_subtype_key && t.projectSubtypeKey === p.project_subtype_key) score += 5;
      if (p.project_category_key && t.projectCategoryKey === p.project_category_key) score += 3;
      if (t.organizationId) score += 1;
      return { t, score };
    }).sort((a, b) => b.score - a.score);
    return scored[0].score > 0 ? scored[0].t : null;
  });


/* ================ V2: DELETE / ORDERED MOVE ================ */

export const deleteScopeItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteItemSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    await assertItemInProject(sb, data.id, data.projectId, org);
    const { error } = await sb.rpc("delete_scope_item", { _item_id: data.id });
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to delete item");
    return { ok: true };
  });

export const moveScopeItemToPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => moveItemToPositionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    await assertItemInProject(sb, data.id, data.projectId, org);
    await assertSectionInProject(sb, data.newSectionId, data.projectId, org);
    if (data.newRoomId) await assertRoomInProject(sb, data.newRoomId, data.projectId, org);
    const { error } = await sb.rpc("move_scope_item_to_position", {
      _item_id: data.id, _new_section_id: data.newSectionId,
      _new_room_id: data.newRoomId ?? null, _new_index: data.newIndex,
    });
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to move item");
    return { ok: true };
  });

/* ================ V2: ATTACHMENTS ================ */

export const linkScopeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => linkDocumentSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    await assertItemInProject(sb, data.itemId, data.projectId, org);
    await assertDocumentInProject(sb, data.documentId, data.projectId, org);
    const { error } = await sb.from("scope_item_documents").insert({
      scope_item_id: data.itemId, project_document_id: data.documentId,
      organization_id: org, project_id: data.projectId,
    });
    if (error) {
      const msg = (error as { message?: string }).message ?? "";
      if (!msg.includes("duplicate")) throw new Error(msg || "Failed to attach document");
    }
    return { ok: true };
  });

export const unlinkScopeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => unlinkDocumentSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb.from("scope_item_documents").delete()
      .eq("scope_item_id", data.itemId).eq("project_document_id", data.documentId)
      .eq("organization_id", org).eq("project_id", data.projectId);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to remove attachment");
    return { ok: true };
  });

/* ================ V2: GRANULAR TEMPLATE INSERTION ================ */

/**
 * Section and item insertion carry the same project-type gate as a full
 * template apply, so the mismatch surfaces to the contractor identically
 * instead of failing as a generic error.
 */
function templateInsertError(error: unknown, fallback: string): Error {
  const msg = (error as { message?: string }).message ?? fallback;
  if (msg.includes("template_project_type_mismatch")) {
    const parts = msg.split("template_project_type_mismatch:")[1]?.split(":") ?? [];
    const projectType = parts[0] || "unknown";
    const templateType = (parts[1] || "unknown").split(/\s/)[0];
    return new Error(`template_project_type_mismatch:${projectType}:${templateType}`);
  }
  return new Error(msg);
}

export const insertTemplateSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => insertTemplateSectionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ sectionId: string }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const { data: id, error } = await sb.rpc("insert_template_section", {
      _project_id: data.projectId, _template_id: data.templateId,
      _section_index: data.sectionIndex, _room_id: data.roomId ?? null,
      _confirm_mismatch: data.confirmMismatch ?? false,
    });
    if (error) throw templateInsertError(error, "Failed to insert section");
    return { sectionId: id as string };
  });

export const insertTemplateItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => insertTemplateItemSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    await assertSectionInProject(sb, data.targetSectionId, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const { data: id, error } = await sb.rpc("insert_template_item", {
      _project_id: data.projectId, _template_id: data.templateId,
      _section_index: data.sectionIndex, _item_index: data.itemIndex,
      _target_section_id: data.targetSectionId, _room_id: data.roomId ?? null,
      _confirm_mismatch: data.confirmMismatch ?? false,
    });
    if (error) throw templateInsertError(error, "Failed to insert item");
    return { id: id as string };
  });
