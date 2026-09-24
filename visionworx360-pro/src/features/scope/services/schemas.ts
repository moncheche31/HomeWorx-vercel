import { z } from "zod";
import {
  SCOPE_ACTIONS, SCOPE_COMPLETIONS, SCOPE_CONFIDENCES, SCOPE_PRIORITIES, SCOPE_UNITS,
} from "../catalog";

const uuid = z.string().uuid();
const optStr = (max = 4000) =>
  z.string().trim().max(max).transform((v) => (v === "" ? null : v)).nullable().optional();

export const unitEnum = z.enum(SCOPE_UNITS as unknown as [string, ...string[]]);
export const actionEnum = z.enum(SCOPE_ACTIONS as unknown as [string, ...string[]]);
export const confidenceEnum = z.enum(SCOPE_CONFIDENCES as unknown as [string, ...string[]]);
export const completionEnum = z.enum(SCOPE_COMPLETIONS as unknown as [string, ...string[]]);
export const priorityEnum = z.enum(SCOPE_PRIORITIES as unknown as [string, ...string[]]);


/* sections */
export const listSectionsSchema = z.object({
  projectId: uuid,
  roomId: uuid.nullable().optional(),
  includeArchived: z.boolean().optional().default(false),
});
export const createSectionSchema = z.object({
  projectId: uuid,
  roomId: uuid.nullable().optional(),
  name: z.string().trim().min(1).max(160),
  sectionKey: optStr(60),
  tradeKey: optStr(60),
  description: optStr(2000),
});
export const updateSectionSchema = createSectionSchema.extend({ id: uuid });
export const archiveSectionSchema = z.object({ projectId: uuid, id: uuid });
export const reorderSectionsSchema = z.object({
  projectId: uuid,
  orderedIds: z.array(uuid).min(1),
});

/* items */
export const listItemsSchema = z.object({
  projectId: uuid,
  roomId: uuid.nullable().optional(),
  sectionId: uuid.nullable().optional(),
  tradeKey: z.string().optional(),
  confidence: confidenceEnum.optional(),
  status: completionEnum.optional(),
  priority: priorityEnum.optional(),
  categoryKey: z.string().optional(),
  includedOnly: z.boolean().optional(),
  excludedOnly: z.boolean().optional(),
  search: z.string().trim().max(200).optional(),
  includeArchived: z.boolean().optional().default(false),
});
export const createItemSchema = z.object({
  projectId: uuid,
  sectionId: uuid,
  roomId: uuid.nullable().optional(),
  title: z.string().trim().min(1).max(200),
  scopeItemKey: optStr(80),
  tradeKey: optStr(60),
  categoryKey: optStr(60),
  subcategoryKey: optStr(60),
  actionKey: actionEnum.nullable().optional(),
  description: optStr(4000),
  quantity: z.number().nonnegative().nullable().optional(),
  unitKey: unitEnum.nullable().optional(),
  materialSelection: optStr(500),
  finishSelection: optStr(500),
  laborNotes: optStr(2000),
  customerNotes: optStr(2000),
  internalNotes: optStr(2000),
  assumptions: optStr(2000),
  exclusions: optStr(2000),
  isIncluded: z.boolean().optional().default(true),
  isCustomerSelection: z.boolean().optional().default(false),
  isClientVisible: z.boolean().optional().default(true),
  priority: priorityEnum.optional().default("normal"),
  confidenceStatus: confidenceEnum.nullable().optional(),
  completionStatus: completionEnum.optional().default("draft"),
});
export const updateItemSchema = createItemSchema.extend({ id: uuid });
export const archiveItemSchema = z.object({ projectId: uuid, id: uuid });
export const deleteItemSchema = z.object({ projectId: uuid, id: uuid });
export const duplicateItemSchema = z.object({ projectId: uuid, id: uuid });
export const moveItemSchema = z.object({
  projectId: uuid,
  id: uuid,
  newSectionId: uuid,
  newRoomId: uuid.nullable().optional(),
});
export const moveItemToPositionSchema = moveItemSchema.extend({
  newIndex: z.number().int().min(0),
});
export const reorderItemsSchema = z.object({
  projectId: uuid,
  sectionId: uuid,
  orderedIds: z.array(uuid).min(1),
});

export const bulkInclusionSchema = z.object({
  projectId: uuid,
  itemIds: z.array(uuid).min(1),
  isIncluded: z.boolean(),
});

/* photos */
export const linkPhotoSchema = z.object({ projectId: uuid, itemId: uuid, photoId: uuid });
export const unlinkPhotoSchema = z.object({ projectId: uuid, itemId: uuid, photoId: uuid });

/* documents (attachments) */
export const linkDocumentSchema = z.object({ projectId: uuid, itemId: uuid, documentId: uuid });
export const unlinkDocumentSchema = z.object({ projectId: uuid, itemId: uuid, documentId: uuid });

/* templates */
export const listTemplatesSchema = z.object({
  projectId: uuid.optional(),
  categoryKey: z.string().optional(),
  typeKey: z.string().optional(),
  subtypeKey: z.string().optional(),
}).default({});
export const previewTemplateSchema = z.object({ templateId: uuid });
export const applyTemplateSchema = z.object({
  projectId: uuid,
  templateId: uuid,
  roomId: uuid.nullable().optional(),
  /** v2 always appends; kept for backwards compatibility with existing callers. */
  allowAppend: z.boolean().optional().default(true),
  /**
   * A template built for a different project type is only applied when the
   * contractor explicitly confirms the mismatch. Generic by design: the rule
   * compares project type keys, it never knows what a "kitchen" is.
   */
  confirmMismatch: z.boolean().optional().default(false),
});
export const insertTemplateSectionSchema = z.object({
  projectId: uuid,
  templateId: uuid,
  sectionIndex: z.number().int().min(0),
  roomId: uuid.nullable().optional(),
  /* Partial insertion is still template insertion: same mismatch gate. */
  confirmMismatch: z.boolean().optional().default(false),
});
export const insertTemplateItemSchema = z.object({
  projectId: uuid,
  templateId: uuid,
  sectionIndex: z.number().int().min(0),
  itemIndex: z.number().int().min(0),
  targetSectionId: uuid,
  roomId: uuid.nullable().optional(),
  confirmMismatch: z.boolean().optional().default(false),
});

export const recommendTemplateSchema = z.object({ projectId: uuid });

/* quick add */
export const quickAddSchema = z.object({
  projectId: uuid,
  sectionId: uuid,
  roomId: uuid.nullable().optional(),
  title: z.string().trim().min(1).max(200),
});

export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type CreateItemInput = z.infer<typeof createItemSchema>;
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
export type ListItemsInput = z.infer<typeof listItemsSchema>;
