import { z } from "zod";
import { rangeSnapshotSchema } from "@/features/estimating/services/schemas";

const uuid = z.string().uuid();
const jsonObject = z.record(z.unknown());
const savedBallparkSnapshot = z.record(z.unknown()).nullable();

export const getBallparkSessionSchema = z.object({ estimateId: uuid });

export const durableBallparkSessionSchema = z.object({
  schemaKey: z.string().min(1).max(120),
  schemaVersion: z.number().int().positive(),
  estimateId: uuid,
  projectId: uuid,
  intakeSource: z.enum(["onsite", "photos", "description"]),
  currentStage: z.enum(["intake", "review", "questions", "results"]),
  interviewType: z.enum(["initial", "full_refinement", "photo_clarification"]).optional(),
  frozenQuestionIds: z.array(z.string().max(120)).max(1000).optional(),
  currentQuestionId: z.string().max(120).nullable().optional(),
  answers: jsonObject,
  transcripts: jsonObject.default({}),
  photoReferences: z.array(z.unknown()).max(500).default([]),
  photoAnalysis: jsonObject.default({}),
  confirmedValues: jsonObject.default({}),
  inferredValues: jsonObject.default({}),
  assumedValues: jsonObject.default({}),
  contractorOverrides: jsonObject.default({}),
  derivedGeometry: jsonObject.default({}),
  derivedQuantities: z.array(z.unknown()).max(1000).default([]),
  unknowns: z.array(z.unknown()).max(1000).default([]),
  rangeInputs: jsonObject.default({}),
  /*
   * The active estimate can contain a richer scope-recalculation snapshot than
   * the intake writer creates. Draft persistence treats that saved snapshot as
   * opaque history; only an explicit completion validates a newly computed
   * candidate with rangeSnapshotSchema.
   */
  rangeSnapshot: savedBallparkSnapshot.optional().default(null),
  draftPreview: rangeSnapshotSchema.optional().default(null),
  confidence: z.enum(["high", "medium", "low"]).nullable().default(null),
  description: z.string().max(20000).optional(),
  observations: z.array(z.unknown()).max(1000).optional(),
  corrections: jsonObject.optional(),
  clarifications: z.array(z.string().max(120)).max(1000).optional(),
  updatedAt: z.string().max(40),
  recoveredFromEstimateSnapshot: z.boolean().optional(),
}).passthrough();

export const saveBallparkSessionSchema = z.object({
  estimateId: uuid,
  session: durableBallparkSessionSchema,
});

export const saveBallparkSchema = saveBallparkSessionSchema.extend({
  rangeSnapshot: rangeSnapshotSchema.refine(
    (value) => Boolean(value && "kind" in value && value.kind === "ballpark"), {
    message: "A ballpark snapshot is required",
  }),
});

export const discardBallparkDraftSchema = z.object({ estimateId: uuid });
