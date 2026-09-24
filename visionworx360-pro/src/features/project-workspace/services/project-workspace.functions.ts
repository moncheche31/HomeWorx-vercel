import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  archiveDocumentSchema,
  archiveNoteSchema,
  archivePhotoSchema,
  archiveRoomSchema,
  clearProjectCoverSchema,
  createNoteSchema,
  createRoomSchema,
  createUploadTicketSchema,
  finalizeDocumentSchema,
  finalizePhotoSchema,
  listNotesSchema,
  listRoomsSchema,
  orgActivitySchema,
  projectIdSchema,
  reorderRoomsSchema,
  roomIdSchema,
  setProjectCoverSchema,
  signedUrlSchema,
  updateDocumentSchema,
  updateNoteSchema,
  updatePhotoSchema,
  updateRoomSchema,
} from "./schemas";
import { mapActivity, mapDocument, mapNote, mapPhoto, mapRoom } from "./mappers";
import {
  buildOrgActivityFeed,
  type ActorRecord,
  type OrgActivityItem,
} from "@/features/workspace/services/orgActivity";
import type { ActivityDTO, DocumentDTO, NoteDTO, PhotoDTO, RoomDTO } from "../types";

/* -------- utilities -------- */

type SB = {
  from: (t: string) => any;
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  storage: {
    from: (bucket: string) => {
      createSignedUploadUrl: (path: string) => Promise<{
        data: { signedUrl: string; token: string; path: string } | null;
        error: unknown;
      }>;
      createSignedUrl: (
        path: string,
        expiresIn: number,
        opts?: { download?: string | boolean },
      ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
      remove: (paths: string[]) => Promise<{ data: unknown; error: unknown }>;
    };
  };
};

async function resolveOrg(sb: SB): Promise<string> {
  const { data, error } = await sb.rpc("current_active_organization_id");
  if (error) throw new Error((error as { message?: string }).message ?? "No active organization");
  const org = data as string | null;
  if (!org) throw new Error("No active organization");
  return org;
}

async function assertProjectInOrg(sb: SB, projectId: string, orgId: string): Promise<void> {
  const { data, error } = await sb
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error((error as { message?: string }).message ?? "Project lookup failed");
  if (!data) throw new Error("Project not in active organization");
}

async function assertRoomInProject(
  sb: SB,
  roomId: string,
  projectId: string,
  orgId: string,
): Promise<void> {
  const { data, error } = await sb
    .from("project_rooms")
    .select("id")
    .eq("id", roomId)
    .eq("project_id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (error) throw new Error((error as { message?: string }).message ?? "Room lookup failed");
  if (!data) throw new Error("Room not in project");
}

function sanitizeFilename(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[^\w. -]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^\.+/, "")
    .slice(0, 180) || "file";
}

/* ================= ROOMS ================= */

export const listRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listRoomsSchema.parse(d))
  .handler(async ({ data, context }): Promise<RoomDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    let q = sb
      .from("project_rooms")
      .select("*")
      .eq("organization_id", org)
      .eq("project_id", data.projectId);
    if (!data.includeArchived) q = q.is("archived_at", null);
    q = q.order("sort_order", { ascending: true }).order("created_at", { ascending: true });
    const { data: rows, error } = await q;
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to load rooms");
    return ((rows as unknown[]) ?? []).map((r) => mapRoom(r as Record<string, unknown>));
  });

export const getRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => roomIdSchema.parse(d))
  .handler(async ({ data, context }): Promise<RoomDTO | null> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { data: row, error } = await sb
      .from("project_rooms")
      .select("*")
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org)
      .maybeSingle();
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to load room");
    return row ? mapRoom(row as Record<string, unknown>) : null;
  });

export const createRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createRoomSchema.parse(d))
  .handler(async ({ data, context }): Promise<RoomDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    // Compute next sort_order
    const { data: rows } = await sb
      .from("project_rooms")
      .select("sort_order")
      .eq("project_id", data.projectId)
      .eq("organization_id", org)
      .order("sort_order", { ascending: false })
      .limit(1);
    const next = rows && (rows as any[])[0] ? Number((rows as any[])[0].sort_order) + 1 : 0;
    const { data: row, error } = await sb
      .from("project_rooms")
      .insert({
        organization_id: org,
        project_id: data.projectId,
        name: data.name,
        room_type: data.roomType,
        floor_level: data.floorLevel ?? null,
        description: data.description ?? null,
        sort_order: next,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to create room");
    return mapRoom(row as Record<string, unknown>);
  });

export const updateRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateRoomSchema.parse(d))
  .handler(async ({ data, context }): Promise<RoomDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { data: row, error } = await sb
      .from("project_rooms")
      .update({
        name: data.name,
        room_type: data.roomType,
        floor_level: data.floorLevel ?? null,
        description: data.description ?? null,
      })
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org)
      .select("*")
      .single();
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to update room");
    return mapRoom(row as Record<string, unknown>);
  });

export const archiveRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveRoomSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb
      .from("project_rooms")
      .update({ archived_at: new Date().toISOString(), status: "archived" })
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to archive");
    return { ok: true };
  });

export const restoreRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveRoomSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb
      .from("project_rooms")
      .update({ archived_at: null, status: "active" })
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to restore");
    return { ok: true };
  });

export const reorderRooms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reorderRoomsSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const { error } = await sb.rpc("reorder_project_rooms", {
      _project_id: data.projectId,
      _ordered_ids: data.orderedIds,
    });
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to reorder");
    return { ok: true };
  });

/* ================= NOTES ================= */

export const listNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listNotesSchema.parse(d))
  .handler(async ({ data, context }): Promise<NoteDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    let q = sb
      .from("project_notes")
      .select("*")
      .eq("organization_id", org)
      .eq("project_id", data.projectId);
    if (data.roomId === null) q = q.is("room_id", null);
    else if (data.roomId) q = q.eq("room_id", data.roomId);
    if (!data.includeArchived) q = q.is("archived_at", null);
    if (data.internalOnly) q = q.eq("is_internal", true);
    q = q.order("created_at", { ascending: false });
    const { data: rows, error } = await q;
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to load notes");
    return ((rows as unknown[]) ?? []).map((r) => mapNote(r as Record<string, unknown>));
  });

export const createNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createNoteSchema.parse(d))
  .handler(async ({ data, context }): Promise<NoteDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const { data: row, error } = await sb
      .from("project_notes")
      .insert({
        organization_id: org,
        project_id: data.projectId,
        room_id: data.roomId ?? null,
        body: data.body,
        note_type: data.noteType,
        is_internal: data.isInternal ?? false,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to save note");
    return mapNote(row as Record<string, unknown>);
  });

export const updateNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateNoteSchema.parse(d))
  .handler(async ({ data, context }): Promise<NoteDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const { data: row, error } = await sb
      .from("project_notes")
      .update({
        room_id: data.roomId ?? null,
        body: data.body,
        note_type: data.noteType,
        is_internal: data.isInternal ?? false,
      })
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org)
      .select("*")
      .single();
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to update note");
    return mapNote(row as Record<string, unknown>);
  });

export const archiveNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveNoteSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb
      .from("project_notes")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to archive");
    return { ok: true };
  });

export const restoreNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveNoteSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb
      .from("project_notes")
      .update({ archived_at: null })
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to restore");
    return { ok: true };
  });

/* ================= UPLOAD TICKET (photos + documents) ================= */

export const createUploadTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createUploadTicketSchema.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ storagePath: string; signedUrl: string; token: string }> => {
      const sb = context.supabase as unknown as SB;
      const org = await resolveOrg(sb);
      await assertProjectInOrg(sb, data.projectId, org);
      const bucket = data.kind === "photo" ? "photos" : "documents";
      const uuid = crypto.randomUUID();
      const safe = sanitizeFilename(data.fileName);
      const path = `${org}/${data.projectId}/${bucket}/${uuid}/${safe}`;
      const { data: ticket, error } = await sb.storage
        .from("project-media")
        .createSignedUploadUrl(path);
      if (error || !ticket)
        throw new Error(
          (error as { message?: string })?.message ?? "Failed to create upload ticket",
        );
      return { storagePath: path, signedUrl: ticket.signedUrl, token: ticket.token };
    },
  );

/* ================= PHOTOS ================= */

async function verifyObjectExists(orgPrefix: string, path: string): Promise<boolean> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // list dirname to confirm object exists at expected path
  const dir = path.substring(0, path.lastIndexOf("/"));
  const file = path.substring(path.lastIndexOf("/") + 1);
  if (!dir.startsWith(orgPrefix)) return false;
  const { data, error } = await supabaseAdmin.storage
    .from("project-media")
    .list(dir, { limit: 100, search: file });
  if (error) return false;
  return !!data?.some((o) => o.name === file);
}

async function deleteObject(path: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.storage.from("project-media").remove([path]);
}

export const listPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listRoomsSchema.parse(d))
  .handler(async ({ data, context }): Promise<PhotoDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    let q = sb
      .from("project_photos")
      .select("*")
      .eq("organization_id", org)
      .eq("project_id", data.projectId);
    if (!data.includeArchived) q = q.is("archived_at", null);
    q = q.order("created_at", { ascending: false });
    const { data: rows, error } = await q;
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to load photos");
    return ((rows as unknown[]) ?? []).map((r) => mapPhoto(r as Record<string, unknown>));
  });

export const finalizePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => finalizePhotoSchema.parse(d))
  .handler(async ({ data, context }): Promise<PhotoDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const expectedPrefix = `${org}/${data.projectId}/photos/`;
    if (!data.storagePath.startsWith(expectedPrefix))
      throw new Error("Invalid storage path");
    const exists = await verifyObjectExists(`${org}/${data.projectId}/photos`, data.storagePath);
    if (!exists) throw new Error("Uploaded object not found");
    /* Idempotency: a retried finalize for the same uploaded object must not
       create a second record — return the row that already owns the path. */
    const { data: existingRow } = await sb
      .from("project_photos")
      .select("*")
      .eq("project_id", data.projectId)
      .eq("storage_path", data.storagePath)
      .maybeSingle();
    if (existingRow) return mapPhoto(existingRow as Record<string, unknown>);
    const { data: row, error } = await sb

      .from("project_photos")
      .insert({
        organization_id: org,
        project_id: data.projectId,
        room_id: data.roomId ?? null,
        storage_path: data.storagePath,
        file_name: data.fileName,
        mime_type: data.mimeType,
        file_size: data.fileSize,
        caption: data.caption ?? null,
        alt_text: data.altText ?? null,
        photo_type: data.photoType,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) {
      await deleteObject(data.storagePath).catch(() => undefined);
      throw new Error((error as { message?: string }).message ?? "Failed to save photo");
    }
    return mapPhoto(row as Record<string, unknown>);
  });

export const updatePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updatePhotoSchema.parse(d))
  .handler(async ({ data, context }): Promise<PhotoDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const { data: row, error } = await sb
      .from("project_photos")
      .update({
        room_id: data.roomId ?? null,
        caption: data.caption ?? null,
        alt_text: data.altText ?? null,
        photo_type: data.photoType,
      })
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org)
      .select("*")
      .single();
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to update photo");
    return mapPhoto(row as Record<string, unknown>);
  });

export const archivePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archivePhotoSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb
      .from("project_photos")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to archive");
    return { ok: true };
  });

export const restorePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archivePhotoSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb
      .from("project_photos")
      .update({ archived_at: null })
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to restore");
    return { ok: true };
  });

/* ================= DOCUMENTS ================= */

export const listDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listRoomsSchema.parse(d))
  .handler(async ({ data, context }): Promise<DocumentDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    let q = sb
      .from("project_documents")
      .select("*")
      .eq("organization_id", org)
      .eq("project_id", data.projectId);
    if (!data.includeArchived) q = q.is("archived_at", null);
    q = q.order("created_at", { ascending: false });
    const { data: rows, error } = await q;
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to load documents");
    return ((rows as unknown[]) ?? []).map((r) => mapDocument(r as Record<string, unknown>));
  });

export const finalizeDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => finalizeDocumentSchema.parse(d))
  .handler(async ({ data, context }): Promise<DocumentDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const expectedPrefix = `${org}/${data.projectId}/documents/`;
    if (!data.storagePath.startsWith(expectedPrefix)) throw new Error("Invalid storage path");
    const exists = await verifyObjectExists(`${org}/${data.projectId}/documents`, data.storagePath);
    if (!exists) throw new Error("Uploaded object not found");
    const { data: row, error } = await sb
      .from("project_documents")
      .insert({
        organization_id: org,
        project_id: data.projectId,
        room_id: data.roomId ?? null,
        storage_path: data.storagePath,
        file_name: data.fileName,
        mime_type: data.mimeType,
        file_size: data.fileSize,
        document_type: data.documentType,
        description: data.description ?? null,
        created_by: context.userId,
      })
      .select("*")
      .single();
    if (error) {
      await deleteObject(data.storagePath).catch(() => undefined);
      throw new Error((error as { message?: string }).message ?? "Failed to save document");
    }
    return mapDocument(row as Record<string, unknown>);
  });

export const updateDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateDocumentSchema.parse(d))
  .handler(async ({ data, context }): Promise<DocumentDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    if (data.roomId) await assertRoomInProject(sb, data.roomId, data.projectId, org);
    const { data: row, error } = await sb
      .from("project_documents")
      .update({
        room_id: data.roomId ?? null,
        description: data.description ?? null,
        document_type: data.documentType,
      })
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org)
      .select("*")
      .single();
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to update document");
    return mapDocument(row as Record<string, unknown>);
  });

export const archiveDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveDocumentSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb
      .from("project_documents")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to archive");
    return { ok: true };
  });

export const restoreDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveDocumentSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { error } = await sb
      .from("project_documents")
      .update({ archived_at: null })
      .eq("id", data.id)
      .eq("project_id", data.projectId)
      .eq("organization_id", org);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to restore");
    return { ok: true };
  });

/* ================= SIGNED VIEW/DOWNLOAD ================= */

export const getSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => signedUrlSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const prefix = `${org}/${data.projectId}/`;
    if (!data.storagePath.startsWith(prefix)) throw new Error("Invalid storage path");
    const { data: signed, error } = await sb.storage
      .from("project-media")
      .createSignedUrl(data.storagePath, 300);
    if (error || !signed)
      throw new Error((error as { message?: string })?.message ?? "Failed to sign url");
    return { url: signed.signedUrl };
  });

export const getDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => signedUrlSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const prefix = `${org}/${data.projectId}/`;
    if (!data.storagePath.startsWith(prefix)) throw new Error("Invalid storage path");
    const { data: signed, error } = await sb.storage
      .from("project-media")
      .createSignedUrl(data.storagePath, 60, { download: true });
    if (error || !signed)
      throw new Error((error as { message?: string })?.message ?? "Failed to sign url");
    return { url: signed.signedUrl };
  });

/* ================= ACTIVITY ================= */

export const listActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => projectIdSchema.parse(d))
  .handler(async ({ data, context }): Promise<ActivityDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { data: rows, error } = await sb
      .from("project_activity")
      .select("*")
      .eq("organization_id", org)
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to load activity");
    const list = ((rows as unknown[]) ?? []) as Record<string, unknown>[];
    const actorIds = Array.from(
      new Set(list.map((r) => r.actor_user_id as string).filter(Boolean)),
    );
    let actors = new Map<string, { first_name?: string; last_name?: string; display_name?: string }>();
    if (actorIds.length) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id,first_name,last_name,display_name")
        .in("id", actorIds);
      for (const p of (profs as any[]) ?? []) {
        actors.set(p.id, {
          first_name: p.first_name,
          last_name: p.last_name,
          display_name: p.display_name,
        });
      }
    }
    return list.map((r) => mapActivity({ ...r, actor: actors.get(r.actor_user_id as string) ?? null }));
  });

export const listOrgActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => orgActivitySchema.parse(d))
  .handler(async ({ data, context }): Promise<OrgActivityItem[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const limit = data.limit ?? 15;
    const { data: rows, error } = await sb
      .from("project_activity")
      .select("*")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .limit(Math.max(limit * 2, 50));
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to load activity");
    const list = ((rows as unknown[]) ?? []) as Record<string, unknown>[];

    const projectIds = Array.from(new Set(list.map((r) => r.project_id as string).filter(Boolean)));
    const projectNames = new Map<string, string>();
    if (projectIds.length) {
      const { data: projects } = await sb.from("projects").select("id,name").in("id", projectIds);
      for (const p of ((projects as unknown[]) ?? []) as Record<string, unknown>[]) {
        projectNames.set(p.id as string, (p.name as string) ?? "");
      }
    }

    const actorIds = Array.from(new Set(list.map((r) => r.actor_user_id as string).filter(Boolean)));
    const actors = new Map<string, ActorRecord>();
    if (actorIds.length) {
      const { data: profs } = await sb
        .from("profiles")
        .select("id,first_name,last_name,display_name")
        .in("id", actorIds);
      for (const p of ((profs as unknown[]) ?? []) as Record<string, unknown>[]) {
        actors.set(p.id as string, {
          first_name: (p.first_name as string) ?? null,
          last_name: (p.last_name as string) ?? null,
          display_name: (p.display_name as string) ?? null,
        });
      }
    }

    return buildOrgActivityFeed(list, projectNames, actors, limit);
  });



/* ================= COVER PHOTO ================= */

export const setProjectCover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setProjectCoverSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true; photoId: string }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { data: photo, error: photoErr } = await sb
      .from("project_photos")
      .select("id, archived_at, project_id, organization_id")
      .eq("id", data.photoId)
      .eq("project_id", data.projectId)
      .eq("organization_id", org)
      .maybeSingle();
    if (photoErr)
      throw new Error((photoErr as { message?: string }).message ?? "Photo lookup failed");
    if (!photo) throw new Error("Photo not in project");
    if ((photo as { archived_at?: string | null }).archived_at)
      throw new Error("Cannot set an archived photo as cover");
    const { error } = await sb
      .from("projects")
      .update({ cover_photo_id: data.photoId })
      .eq("id", data.projectId)
      .eq("organization_id", org);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to set cover");
    await sb.from("project_activity").insert({
      organization_id: org,
      project_id: data.projectId,
      actor_user_id: context.userId,
      activity_type: "updated",
      entity_type: "photo",
      entity_id: data.photoId,
      summary: "Project cover selected",
      metadata: { action: "cover_set" },
    });
    return { ok: true, photoId: data.photoId };
  });

export const clearProjectCover = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => clearProjectCoverSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await assertProjectInOrg(sb, data.projectId, org);
    const { data: prev } = await sb
      .from("projects")
      .select("cover_photo_id")
      .eq("id", data.projectId)
      .eq("organization_id", org)
      .maybeSingle();
    const prevId = (prev as { cover_photo_id?: string | null } | null)?.cover_photo_id ?? null;
    const { error } = await sb
      .from("projects")
      .update({ cover_photo_id: null })
      .eq("id", data.projectId)
      .eq("organization_id", org);
    if (error) throw new Error((error as { message?: string }).message ?? "Failed to clear cover");
    if (prevId) {
      await sb.from("project_activity").insert({
        organization_id: org,
        project_id: data.projectId,
        actor_user_id: context.userId,
        activity_type: "updated",
        entity_type: "photo",
        entity_id: prevId,
        summary: "Project cover removed",
        metadata: { action: "cover_cleared" },
      });
    }
    return { ok: true };
  });
