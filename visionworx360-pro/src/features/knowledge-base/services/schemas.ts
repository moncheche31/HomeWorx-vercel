import { z } from "zod";

export const searchAssembliesSchema = z.object({
  search: z.string().trim().max(120).optional().nullable(),
  tradeKey: z.string().trim().max(64).optional().nullable(),
  categoryKey: z.string().trim().max(64).optional().nullable(),
  includeDisabled: z.boolean().optional().default(false),
  limit: z.number().int().min(1).max(500).optional().default(200),
  offset: z.number().int().min(0).optional().default(0),
});

const nullableNumber = z.number().finite().nullable().optional();
const nullableText = z.string().max(4000).nullable().optional();

export const overridePatchSchema = z.object({
  workItem: z.string().max(200).nullable().optional(),
  defaultScopeDescription: nullableText,
  clientDescription: nullableText,
  measurementMethod: nullableText,
  productionRate: nullableNumber,
  defaultLaborHours: nullableNumber,
  crewSize: nullableNumber,
  skillLevel: z.string().max(64).nullable().optional(),
  materialAllowance: nullableNumber,
  wasteFactor: nullableNumber,
  equipmentRequirements: nullableText,
  suggestedMarkupPct: nullableNumber,
  defaultOverheadPct: nullableNumber,
  suggestedProfitPct: nullableNumber,
  estimatedDurationHours: nullableNumber,
  internalNotes: nullableText,
  safetyNotes: nullableText,
  codeReference: nullableText,
  inspectionNotes: nullableText,
});

export const saveAssemblySchema = z.object({
  assemblyKey: z.string().min(1).max(160),
  origin: z.enum(["library", "organization"]),
  patch: overridePatchSchema,
});

export const assemblyStateSchema = z.object({
  assemblyKey: z.string().min(1).max(160),
  origin: z.enum(["library", "organization"]),
  isDisabled: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export const duplicateAssemblySchema = z.object({
  assemblyKey: z.string().min(1).max(160),
  newKey: z.string().max(160).optional().nullable(),
});

export const favoriteSchema = z.object({
  assemblyKey: z.string().min(1).max(160),
  isFavorite: z.boolean(),
  isPinned: z.boolean().optional().default(false),
});

export const recordUsageSchema = z.object({
  assemblyKeys: z.array(z.string().min(1).max(160)).min(1).max(500),
});

export const templateItemsSchema = z.object({
  templateId: z.string().uuid(),
});

export const applyTemplateSchema = z.object({
  projectId: z.string().uuid(),
  templateId: z.string().uuid(),
  roomId: z.string().uuid().nullable().optional(),
});

export const createOrgAssemblySchema = z.object({
  assemblyKey: z.string().max(160).optional().nullable(),
  tradeKey: z.string().min(1).max(64),
  categoryKey: z.string().min(1).max(64),
  subcategoryKey: z.string().max(64).nullable().optional(),
  workItem: z.string().min(1).max(200),
  defaultScopeDescription: z.string().min(1).max(4000),
  unitKey: z.string().min(1).max(32),
  keywords: z.array(z.string().max(60)).max(30).optional().default([]),
});
