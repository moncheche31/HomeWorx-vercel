import { z } from "zod";

const uuid = z.string().uuid();

export const sourceSchema = z.enum(["spoken", "typed", "plan", "manual"]);
export const statusSchema = z.enum(["candidate", "ambiguous", "confirmed"]);

export const listMeasurementCaptureSchema = z.object({ projectId: uuid });

export const measurementItemInputSchema = z.object({
  label: z.string().trim().min(1).max(160),
  subject: z.string().trim().max(60).nullable().optional(),
  kind: z.enum(["single", "pair"]).default("single"),
  inches: z.number().min(0).max(500 * 12),
  secondaryInches: z.number().min(0).max(500 * 12).nullable().optional(),
  rawText: z.string().trim().max(400).nullable().optional(),
  source: sourceSchema,
  status: statusSchema.default("candidate"),
  flag: z.string().trim().max(40).nullable().optional(),
  captureId: uuid.nullable().optional(),
  documentId: uuid.nullable().optional(),
});

export const saveMeasurementItemsSchema = z.object({
  projectId: uuid,
  items: z.array(measurementItemInputSchema).min(1).max(200),
});

export const updateMeasurementItemSchema = z.object({
  projectId: uuid,
  id: uuid,
  label: z.string().trim().min(1).max(160).optional(),
  inches: z.number().min(0).max(500 * 12).optional(),
  secondaryInches: z.number().min(0).max(500 * 12).nullable().optional(),
  status: statusSchema.optional(),
  flag: z.string().trim().max(40).nullable().optional(),
  overridden: z.boolean().optional(),
});

export const deleteMeasurementItemSchema = z.object({ projectId: uuid, id: uuid });

export const saveMeasurementCaptureSchema = z.object({
  projectId: uuid,
  source: sourceSchema,
  transcript: z.string().trim().max(20_000).nullable().optional(),
  documentId: uuid.nullable().optional(),
  fileName: z.string().trim().max(200).nullable().optional(),
});

export const extractPlanMeasurementsSchema = z.object({
  projectId: uuid,
  storagePath: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(120),
});
