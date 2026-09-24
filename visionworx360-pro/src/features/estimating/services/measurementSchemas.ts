import { z } from "zod";

const uuid = z.string().uuid();

export const openingSchema = z.object({
  kind: z.enum(["door", "window", "other"]),
  count: z.number().int().min(0).max(200),
  widthFt: z.number().min(0).max(200),
  heightFt: z.number().min(0).max(60),
  interruptsTrim: z.boolean().optional(),
});

export const getMeasurementsSchema = z.object({ projectId: uuid });

export const saveMeasurementsSchema = z.object({
  projectId: uuid,
  roomId: uuid.nullable().optional(),
  label: z.string().trim().max(160).nullable().optional(),
  lengthFt: z.number().min(0).max(1000).nullable(),
  widthFt: z.number().min(0).max(1000).nullable(),
  ceilingHeightFt: z.number().min(0).max(60).nullable(),
  openings: z.array(openingSchema).max(60).default([]),
  interiorPartitionLf: z.number().min(0).max(10_000).nullable(),
  floorWastePct: z.number().min(0).max(100).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

const unit = z.enum([
  "each", "linear_foot", "square_foot", "cubic_foot", "cubic_yard", "sheet",
  "board_foot", "gallon", "pound", "hour", "day", "allowance", "lump_sum", "other",
]);

const provenance = z.record(z.string(), z.unknown());

/** One propagated quantity, optionally expanding into extra surface lines. */
export const geometryAssignmentSchema = z.object({
  lineId: uuid,
  quantity: z.number().min(0).max(10_000_000),
  unitKey: unit.nullable().optional(),
  description: z.string().trim().max(300).nullable().optional(),
  provenance: provenance.optional(),
  expansions: z
    .array(
      z.object({
        role: z.string().trim().max(40),
        description: z.string().trim().max(300),
        quantity: z.number().min(0).max(10_000_000),
        unitKey: unit.nullable().optional(),
        provenance: provenance.optional(),
      }),
    )
    .max(10)
    .optional(),
});

export const applyGeometryQuantitiesSchema = z.object({
  estimateId: uuid,
  assignments: z.array(geometryAssignmentSchema).min(1).max(500),
});
