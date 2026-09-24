import { z } from "zod";
import {
  DOCUMENT_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_MIME_TYPES,
} from "../types";

const uuid = z.string().uuid();
const optStr = (max = 4000) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const roomTypeEnum = z.enum([
  "kitchen",
  "bathroom",
  "bedroom",
  "living_room",
  "dining_room",
  "basement",
  "garage",
  "exterior",
  "roof",
  "addition",
  "whole_house",
  "other",
]);
export const noteTypeEnum = z.enum([
  "general",
  "field",
  "followup",
  "decision",
  "issue",
  "project_description",
]);
export const photoTypeEnum = z.enum([
  "existing",
  "design",
  "rendering",
  "progress",
  "completed",
  "damage",
  "inspiration",
  "other",
]);
export const documentTypeEnum = z.enum([
  "pdf",
  "plan",
  "contract",
  "permit",
  "inspection",
  "survey",
  "specification",
  "image",
  "other",
]);

/* --- rooms --- */
export const createRoomSchema = z.object({
  projectId: uuid,
  name: z.string().trim().min(1).max(200),
  roomType: roomTypeEnum.default("other"),
  floorLevel: optStr(60),
  description: optStr(2000),
});
export const updateRoomSchema = createRoomSchema.extend({ id: uuid });
export const archiveRoomSchema = z.object({ projectId: uuid, id: uuid });
export const listRoomsSchema = z.object({
  projectId: uuid,
  includeArchived: z.boolean().optional().default(false),
});
export const reorderRoomsSchema = z.object({
  projectId: uuid,
  orderedIds: z.array(uuid).min(1),
});

/* --- notes --- */
export const createNoteSchema = z.object({
  projectId: uuid,
  roomId: uuid.nullable().optional(),
  body: z.string().trim().min(1).max(10_000),
  noteType: noteTypeEnum.default("general"),
  isInternal: z.boolean().optional().default(false),
});
export const updateNoteSchema = createNoteSchema.extend({ id: uuid });
export const archiveNoteSchema = z.object({ projectId: uuid, id: uuid });
export const listNotesSchema = z.object({
  projectId: uuid,
  roomId: uuid.nullable().optional(),
  includeArchived: z.boolean().optional().default(false),
  internalOnly: z.boolean().optional().default(false),
});

/* --- photos / documents shared --- */
const safeName = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .regex(/^[^/\\\x00]+$/, "Invalid file name");

export const createUploadTicketSchema = z.object({
  kind: z.enum(["photo", "document"]),
  projectId: uuid,
  fileName: safeName,
  mimeType: z.string().min(1).max(120),
  fileSize: z.number().int().positive(),
});

export const finalizePhotoSchema = z.object({
  projectId: uuid,
  roomId: uuid.nullable().optional(),
  storagePath: z.string().min(1),
  fileName: safeName,
  mimeType: z.enum(IMAGE_MIME_TYPES as unknown as [string, ...string[]]),
  fileSize: z.number().int().positive().max(MAX_IMAGE_BYTES),
  caption: optStr(500),
  altText: optStr(300),
  photoType: photoTypeEnum.default("existing"),
});
export const updatePhotoSchema = z.object({
  projectId: uuid,
  id: uuid,
  roomId: uuid.nullable().optional(),
  caption: optStr(500),
  altText: optStr(300),
  photoType: photoTypeEnum,
});
export const archivePhotoSchema = z.object({ projectId: uuid, id: uuid });

export const finalizeDocumentSchema = z.object({
  projectId: uuid,
  roomId: uuid.nullable().optional(),
  storagePath: z.string().min(1),
  fileName: safeName,
  mimeType: z.enum([...DOCUMENT_MIME_TYPES, ...VIDEO_MIME_TYPES] as unknown as [
    string,
    ...string[],
  ]),
  fileSize: z.number().int().positive().max(MAX_VIDEO_BYTES),
  description: optStr(1000),
  documentType: documentTypeEnum.default("other"),
})
  // Video gets the larger cap; every other document type keeps the old one.
  .refine(
    (d) =>
      (VIDEO_MIME_TYPES as readonly string[]).includes(d.mimeType) ||
      d.fileSize <= MAX_DOCUMENT_BYTES,
    { message: "File too large", path: ["fileSize"] },
  );
export const updateDocumentSchema = z.object({
  projectId: uuid,
  id: uuid,
  roomId: uuid.nullable().optional(),
  description: optStr(1000),
  documentType: documentTypeEnum,
});
export const archiveDocumentSchema = z.object({ projectId: uuid, id: uuid });

/* --- cover photo --- */
export const setProjectCoverSchema = z.object({ projectId: uuid, photoId: uuid });
export const clearProjectCoverSchema = z.object({ projectId: uuid });

/* --- getters --- */
export const orgActivitySchema = z.object({ limit: z.number().int().min(1).max(50).optional() });
export const projectIdSchema = z.object({ projectId: uuid });
export const roomIdSchema = z.object({ projectId: uuid, id: uuid });
export const signedUrlSchema = z.object({ projectId: uuid, storagePath: z.string().min(1) });

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
export type FinalizePhotoInput = z.infer<typeof finalizePhotoSchema>;
export type UpdatePhotoInput = z.infer<typeof updatePhotoSchema>;
export type FinalizeDocumentInput = z.infer<typeof finalizeDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
export type CreateUploadTicketInput = z.infer<typeof createUploadTicketSchema>;
