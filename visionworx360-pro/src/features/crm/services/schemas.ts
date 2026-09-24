import { z } from "zod";
import { ALL_PROJECT_TYPE_KEYS, PROJECT_CATEGORY_KEYS } from "../catalog/projectTypes";
import { PROJECT_SCALES } from "../catalog/businessProfile";

const uuid = z.string().uuid();
const optStr = (max = 500) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();
const optNum = z
  .union([z.number(), z.string()])
  .transform((v) => {
    if (v === "" || v == null) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  })
  .nullable()
  .optional();
const optInt = optNum;

export const contactMethodSchema = z.enum(["email", "phone", "sms", "any"]);
export const clientStatusSchema = z.enum(["active", "archived"]);
export const projectStatusSchema = z.enum([
  "lead",
  "site_visit_scheduled",
  "site_visit_complete",
  "estimate_in_progress",
  "estimate_sent",
  "customer_reviewing",
  "approved",
  "scheduled",
  "construction",
  "completed",
  "archived",
]);
export const projectPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);

/** Every mutating server fn requires the caller's active organization ID from workspace context. */
const orgScope = z.object({ activeOrganizationId: uuid });

export const clientInputSchema = orgScope.extend({
  firstName: optStr(120),
  lastName: optStr(120),
  company: optStr(200),
  email: z
    .union([z.literal(""), z.string().trim().email().max(255)])
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  phone: optStr(64),
  secondaryPhone: optStr(64),
  addressLine1: optStr(200),
  city: optStr(120),
  region: optStr(120),
  postalCode: optStr(20),
  notes: optStr(4000),
  preferredContact: contactMethodSchema.default("any"),
});

export const createClientSchema = clientInputSchema;
export const updateClientSchema = clientInputSchema.extend({ id: uuid });
export const idWithOrgSchema = orgScope.extend({ id: uuid });
/** Project statuses considered "open"/"active" for CRM relationship filters. */
export const OPEN_PROJECT_EXCLUDED_STATUSES = ["completed", "archived"] as const;
const relationFilter = z.enum(["yes", "no"]);

export const clientSortSchema = z.enum([
  "name_asc",
  "name_desc",
  "city_asc",
  "newest",
  "recent",
  // legacy values kept for backwards compatibility
  "oldest",
  "alpha",
]);

export const listClientsSchema = orgScope.extend({
  q: z.string().trim().max(200).optional().default(""),
  city: z.string().trim().max(120).optional(),
  status: clientStatusSchema.optional(),
  hasOpenProjects: relationFilter.optional(),
  includeArchived: z.boolean().optional().default(false),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
  sort: clientSortSchema.optional().default("newest"),
});


export const propertyInputSchema = orgScope.extend({
  clientId: uuid,
  nickname: optStr(200),
  street: optStr(200),
  city: optStr(120),
  region: optStr(120),
  postalCode: optStr(20),
  county: optStr(120),
  yearBuilt: optInt,
  squareFootage: optInt,
  bedrooms: optNum,
  bathrooms: optNum,
  stories: optInt,
  constructionType: optStr(120),
  occupied: z.boolean().optional().nullable(),
  notes: optStr(4000),
});
export const createPropertySchema = propertyInputSchema;
export const updatePropertySchema = propertyInputSchema.extend({ id: uuid });
export const listPropertiesSchema = orgScope.extend({
  clientId: uuid.optional(),
  includeArchived: z.boolean().optional().default(false),
});

export const propertySortSchema = z.enum(["address_asc", "city_asc", "newest", "recent"]);

/** Paged, filterable property listing used by the dedicated Properties page. */
export const listPropertyRecordsSchema = orgScope.extend({
  q: z.string().trim().max(200).optional().default(""),
  clientId: uuid.optional(),
  city: z.string().trim().max(120).optional(),
  hasActiveProjects: relationFilter.optional(),
  includeArchived: z.boolean().optional().default(false),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
  sort: propertySortSchema.optional().default("newest"),
});

export const crmFilterOptionsSchema = orgScope;


export const projectInputSchema = orgScope
  .extend({
    clientId: uuid,
    propertyId: uuid,
    name: z.string().trim().min(1).max(200),
    projectType: optStr(120),
    projectCategoryKey: optStr(64),
    projectTypeKey: optStr(64),
    projectTypeCustom: optStr(200),
    projectSubtypeKey: optStr(64),
    projectSubtypeCustom: optStr(200),
    projectScaleKey: z
      .union([z.literal(""), z.enum(PROJECT_SCALES)])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
    status: projectStatusSchema.default("lead"),
    priority: projectPrioritySchema.default("normal"),
    budget: optNum,
    targetGrossMargin: optNum,
    targetCompletion: optStr(20), // ISO date
    description: optStr(4000),
    internalNotes: optStr(4000),
  })
  .superRefine((val, ctx) => {
    // projectTypeKey: allow null; otherwise must be a known catalog key or OTHER.
    if (val.projectTypeKey && val.projectTypeKey !== "OTHER") {
      if (!(ALL_PROJECT_TYPE_KEYS as readonly string[]).includes(val.projectTypeKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["projectTypeKey"],
          message: "unknownProjectTypeKey",
        });
      }
    }
    if (
      val.projectCategoryKey &&
      !(PROJECT_CATEGORY_KEYS as readonly string[]).includes(val.projectCategoryKey)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["projectCategoryKey"],
        message: "unknownProjectCategoryKey",
      });
    }
    if (val.projectTypeKey === "OTHER") {
      const custom = (val.projectTypeCustom ?? "").trim();
      if (!custom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["projectTypeCustom"],
          message: "customRequired",
        });
      }
    }
    if (val.projectSubtypeKey === "OTHER") {
      const custom = (val.projectSubtypeCustom ?? "").trim();
      if (!custom) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["projectSubtypeCustom"],
          message: "customRequired",
        });
      }
    }
  });
export const createProjectSchema = projectInputSchema;
export const updateProjectSchema = z.intersection(
  projectInputSchema,
  z.object({ id: uuid }),
);
export const projectSortSchema = z.enum([
  "recent",
  "newest",
  "oldest",
  "city_asc",
  "city_desc",
  "name_asc",
  "budget_asc",
  "budget_desc",
  // legacy value kept for backwards compatibility
  "alpha",
]);

export const listProjectsSchema = orgScope.extend({
  q: z.string().trim().max(200).optional().default(""),
  status: projectStatusSchema.optional(),
  projectType: z.string().trim().max(120).optional(),
  projectTypeKey: z.string().trim().max(64).optional(),
  projectCategoryKey: z.string().trim().max(64).optional(),
  priority: projectPrioritySchema.optional(),
  city: z.string().trim().max(120).optional(),
  clientId: uuid.optional(),
  updatedWithinDays: z.number().int().min(1).max(365).optional(),
  budgetMin: z.number().min(0).optional(),
  budgetMax: z.number().min(0).optional(),
  includeArchived: z.boolean().optional().default(false),
  page: z.number().int().min(1).optional().default(1),
  pageSize: z.number().int().min(1).max(100).optional().default(20),
  sort: projectSortSchema.optional().default("recent"),
});

export type ClientInput = z.infer<typeof clientInputSchema>;
export type PropertyInput = z.infer<typeof propertyInputSchema>;
export type ProjectInput = z.infer<typeof projectInputSchema>;
export type ListClientsInput = z.infer<typeof listClientsSchema>;
export type ListPropertyRecordsInput = z.infer<typeof listPropertyRecordsSchema>;
export type ListProjectsInput = z.infer<typeof listProjectsSchema>;
export type ClientSort = z.infer<typeof clientSortSchema>;
export type PropertySort = z.infer<typeof propertySortSchema>;
export type ProjectSort = z.infer<typeof projectSortSchema>;


/* ------------------------ PERMANENT DELETE ------------------------ */
/**
 * Permanent delete is a separate, stronger action than archive: the client
 * must echo the record label so a stray tap can never destroy data.
 */
/* Permanent delete is irreversible, so the typed confirmation is validated on
   the server too — a client that skips the dialog still cannot delete. */
export const DELETE_CONFIRMATION_WORD = "DELETE";
export const deleteRecordSchema = idWithOrgSchema.extend({
  confirmation: z
    .string()
    .trim()
    .refine((v) => v.toUpperCase() === DELETE_CONFIRMATION_WORD, {
      message: "confirmation_required",
    }),
});

export const deleteClientSchema = deleteRecordSchema.extend({
  deleteDependents: z.boolean().default(false),
});
export type DeleteRecordInput = z.infer<typeof deleteRecordSchema>;
export type DeleteClientInput = z.infer<typeof deleteClientSchema>;
