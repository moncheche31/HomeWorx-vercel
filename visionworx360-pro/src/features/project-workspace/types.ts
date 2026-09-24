export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

export type RoomType =
  | "kitchen"
  | "bathroom"
  | "bedroom"
  | "living_room"
  | "dining_room"
  | "basement"
  | "garage"
  | "exterior"
  | "roof"
  | "addition"
  | "whole_house"
  | "other";

export type RoomStatus = "active" | "archived";
export type NoteType = "general" | "field" | "followup" | "decision" | "issue" | "project_description";
export type PhotoType =
  | "existing"
  | "design"
  | "rendering"
  | "progress"
  | "completed"
  | "damage"
  | "inspiration"
  | "other";
export type DocumentType =
  | "pdf"
  | "plan"
  | "contract"
  | "permit"
  | "inspection"
  | "survey"
  | "specification"
  | "image"
  | "other";
export type ActivityType =
  | "created"
  | "updated"
  | "status_changed"
  | "archived"
  | "restored"
  | "uploaded"
  | "reordered";
export type ActivityEntityType = "project" | "room" | "note" | "photo" | "document";

export interface RoomDTO {
  id: string;
  organizationId: string;
  projectId: string;
  name: string;
  roomType: RoomType;
  floorLevel: string | null;
  description: string | null;
  sortOrder: number;
  status: RoomStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  noteCount?: number;
  photoCount?: number;
}

export interface NoteDTO {
  id: string;
  organizationId: string;
  projectId: string;
  roomId: string | null;
  body: string;
  noteType: NoteType;
  isInternal: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface PhotoDTO {
  id: string;
  organizationId: string;
  projectId: string;
  roomId: string | null;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  caption: string | null;
  altText: string | null;
  photoType: PhotoType;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface DocumentDTO {
  id: string;
  organizationId: string;
  projectId: string;
  roomId: string | null;
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  documentType: DocumentType;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ActivityDTO {
  id: string;
  organizationId: string;
  projectId: string;
  actorUserId: string;
  actorName: string | null;
  activityType: ActivityType;
  entityType: ActivityEntityType;
  entityId: string | null;
  summary: string | null;
  metadata: JsonValue;
  createdAt: string;
}

/** Upload constraints (Version 1). */
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;
export const DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
/** Prerecorded walkthrough video intake (Remote Vision). */
export const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/3gpp",
] as const;
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
