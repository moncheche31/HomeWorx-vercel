import type { ClientDTO, PropertyDTO, ProjectDTO } from "./types";

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? null : String(v));
const n = (v: unknown) => (v == null ? null : Number(v));

export function mapClient(row: Row): ClientDTO {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    firstName: s(row.first_name),
    lastName: s(row.last_name),
    company: s(row.company),
    email: s(row.email),
    phone: s(row.phone),
    secondaryPhone: s(row.secondary_phone),
    addressLine1: s(row.address_line1),
    city: s(row.city),
    region: s(row.region),
    postalCode: s(row.postal_code),
    notes: s(row.notes),
    preferredContact: (row.preferred_contact as ClientDTO["preferredContact"]) ?? "any",
    status: (row.status as ClientDTO["status"]) ?? "active",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function mapProperty(row: Row): PropertyDTO {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    clientId: row.client_id as string,
    nickname: s(row.nickname),
    street: s(row.street),
    city: s(row.city),
    region: s(row.region),
    postalCode: s(row.postal_code),
    county: s(row.county),
    yearBuilt: n(row.year_built),
    squareFootage: n(row.square_footage),
    bedrooms: n(row.bedrooms),
    bathrooms: n(row.bathrooms),
    stories: n(row.stories),
    constructionType: s(row.construction_type),
    occupied: (row.occupied as boolean | null) ?? null,
    notes: s(row.notes),
    archivedAt: s(row.archived_at),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function mapProject(row: Row): ProjectDTO {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    clientId: row.client_id as string,
    propertyId: row.property_id as string,
    name: (row.name as string) ?? "",
    projectType: s(row.project_type),
    projectCategoryKey: s(row.project_category_key),
    projectTypeKey: s(row.project_type_key),
    projectTypeCustom: s(row.project_type_custom),
    projectSubtypeKey: s(row.project_subtype_key),
    projectSubtypeCustom: s(row.project_subtype_custom),
    projectScaleKey: s(row.project_scale_key),
    status: (row.status as ProjectDTO["status"]) ?? "lead",
    priority: (row.priority as ProjectDTO["priority"]) ?? "normal",
    budget: n(row.budget),
    targetGrossMargin: n(row.target_gross_margin),
    targetCompletion: s(row.target_completion),
    description: s(row.description),
    internalNotes: s(row.internal_notes),
    thumbnailUrl: s(row.thumbnail_url),
    coverPhotoId: s(row.cover_photo_id),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    lastActivityAt: s(row.last_activity_at) ?? (row.updated_at as string),
  };
}
