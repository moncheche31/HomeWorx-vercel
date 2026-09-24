import type {
  ScopeAction, ScopeCompletion, ScopeConfidence, ScopeItemDTO, ScopePriority,
  ScopeSectionDTO, ScopeTemplateSummaryDTO, ScopeUnit,
} from "../types";


type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null ? null : String(v));
const n = (v: unknown): number | null => (v == null ? null : Number(v));

export function mapSection(row: Row): ScopeSectionDTO {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    projectId: row.project_id as string,
    roomId: s(row.room_id),
    name: (row.name as string) ?? "",
    sectionKey: s(row.section_key),
    tradeKey: s(row.trade_key),
    description: s(row.description),
    sortOrder: Number(row.sort_order ?? 0),
    status: (row.status as string) ?? "active",
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    archivedAt: s(row.archived_at),
  };
}

export function mapItem(
  row: Row,
  linkedPhotoIds: string[] = [],
  linkedDocumentIds: string[] = [],
): ScopeItemDTO {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    projectId: row.project_id as string,
    roomId: s(row.room_id),
    sectionId: row.section_id as string,
    title: (row.title as string) ?? "",
    scopeItemKey: s(row.scope_item_key),
    tradeKey: s(row.trade_key),
    categoryKey: s(row.category_key),
    subcategoryKey: s(row.subcategory_key),

    actionKey: (row.action_key as ScopeAction | null) ?? null,
    description: s(row.description),
    quantity: n(row.quantity),
    unitKey: (row.unit_key as ScopeUnit | null) ?? null,
    materialSelection: s(row.material_selection),
    finishSelection: s(row.finish_selection),
    laborNotes: s(row.labor_notes),
    customerNotes: s(row.customer_notes),
    internalNotes: s(row.internal_notes),
    assumptions: s(row.assumptions),
    exclusions: s(row.exclusions),
    isIncluded: Boolean(row.is_included),
    isCustomerSelection: Boolean(row.is_customer_selection),
    confidenceStatus: (row.confidence_status as ScopeConfidence | null) ?? null,
    completionStatus: (row.completion_status as ScopeCompletion) ?? "draft",
    sortOrder: Number(row.sort_order ?? 0),
    createdBy: row.created_by as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    archivedAt: s(row.archived_at),
    isClientVisible: row.is_client_visible == null ? true : Boolean(row.is_client_visible),
    priority: ((row.priority as ScopePriority | null) ?? "normal") as ScopePriority,
    linkedPhotoIds,
    linkedDocumentIds,

  };
}

export function mapTemplate(row: Row): ScopeTemplateSummaryDTO {
  return {
    id: row.id as string,
    templateKey: (row.template_key as string) ?? "",
    name: (row.name as string) ?? "",
    description: s(row.description),
    isSystemTemplate: Boolean(row.is_system_template),
    organizationId: s(row.organization_id),
    projectCategoryKey: s(row.project_category_key),
    projectTypeKey: s(row.project_type_key),
    projectSubtypeKey: s(row.project_subtype_key),
    businessTypeKey: s(row.business_type_key),
  };
}
