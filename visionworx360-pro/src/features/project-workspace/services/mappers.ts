import type {
  ActivityDTO,
  DocumentDTO,
  NoteDTO,
  PhotoDTO,
  RoomDTO,
  RoomType,
  RoomStatus,
  NoteType,
  PhotoType,
  DocumentType,
  ActivityType,
  ActivityEntityType,
} from "../types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null ? null : String(v));

export function mapRoom(row: Row): RoomDTO {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    projectId: row.project_id as string,
    name: (row.name as string) ?? "",
    roomType: (row.room_type as RoomType) ?? "other",
    floorLevel: s(row.floor_level),
    description: s(row.description),
    sortOrder: Number(row.sort_order ?? 0),
    status: (row.status as RoomStatus) ?? "active",
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    archivedAt: s(row.archived_at),
  };
}

export function mapNote(row: Row): NoteDTO {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    projectId: row.project_id as string,
    roomId: s(row.room_id),
    body: (row.body as string) ?? "",
    noteType: (row.note_type as NoteType) ?? "general",
    isInternal: Boolean(row.is_internal),
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    archivedAt: s(row.archived_at),
  };
}

export function mapPhoto(row: Row): PhotoDTO {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    projectId: row.project_id as string,
    roomId: s(row.room_id),
    storagePath: row.storage_path as string,
    fileName: (row.file_name as string) ?? "",
    mimeType: (row.mime_type as string) ?? "",
    fileSize: Number(row.file_size ?? 0),
    caption: s(row.caption),
    altText: s(row.alt_text),
    photoType: (row.photo_type as PhotoType) ?? "existing",
    sortOrder: Number(row.sort_order ?? 0),
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    archivedAt: s(row.archived_at),
  };
}

export function mapDocument(row: Row): DocumentDTO {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    projectId: row.project_id as string,
    roomId: s(row.room_id),
    storagePath: row.storage_path as string,
    fileName: (row.file_name as string) ?? "",
    mimeType: (row.mime_type as string) ?? "",
    fileSize: Number(row.file_size ?? 0),
    documentType: (row.document_type as DocumentType) ?? "other",
    description: s(row.description),
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    archivedAt: s(row.archived_at),
  };
}

export function mapActivity(row: Row): ActivityDTO {
  const actor = row.actor as { first_name?: string; last_name?: string; display_name?: string } | null;
  const actorName = actor
    ? actor.display_name ||
      [actor.first_name, actor.last_name].filter(Boolean).join(" ") ||
      null
    : null;
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    projectId: row.project_id as string,
    actorUserId: row.actor_user_id as string,
    actorName,
    activityType: (row.activity_type as ActivityType) ?? "updated",
    entityType: (row.entity_type as ActivityEntityType) ?? "project",
    entityId: s(row.entity_id),
    summary: s(row.summary),
    metadata: (row.metadata as import("../types").JsonValue) ?? {},
    createdAt: row.created_at as string,
  };
}
