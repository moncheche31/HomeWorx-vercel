export type ScopeUnit =
  | "each" | "linear_foot" | "square_foot" | "cubic_foot" | "cubic_yard"
  | "sheet" | "board_foot" | "gallon" | "pound" | "hour" | "day"
  | "allowance" | "lump_sum" | "other";

export type ScopeAction =
  | "install" | "remove" | "replace" | "repair" | "refinish" | "paint"
  | "clean" | "relocate" | "modify" | "build" | "inspect" | "protect"
  | "supply_only" | "labor_only" | "other";

export type ScopeConfidence =
  | "confirmed" | "needs_verification" | "assumed" | "customer_decision_required" | "not_applicable";

export type ScopeCompletion =
  | "draft" | "ready" | "approved" | "deferred" | "completed";

export type ScopePriority = "low" | "normal" | "high" | "urgent";

export interface ScopeSectionDTO {
  id: string;
  organizationId: string;
  projectId: string;
  roomId: string | null;
  name: string;
  sectionKey: string | null;
  tradeKey: string | null;
  description: string | null;
  sortOrder: number;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface ScopeItemDTO {
  id: string;
  organizationId: string;
  projectId: string;
  roomId: string | null;
  sectionId: string;
  title: string;
  scopeItemKey: string | null;
  tradeKey: string | null;
  categoryKey: string | null;
  subcategoryKey: string | null;
  actionKey: ScopeAction | null;
  description: string | null;
  quantity: number | null;
  unitKey: ScopeUnit | null;
  materialSelection: string | null;
  finishSelection: string | null;
  laborNotes: string | null;
  customerNotes: string | null;
  internalNotes: string | null;
  assumptions: string | null;
  exclusions: string | null;
  isIncluded: boolean;
  isCustomerSelection: boolean;
  isClientVisible: boolean;
  priority: ScopePriority;
  confidenceStatus: ScopeConfidence | null;
  completionStatus: ScopeCompletion;
  sortOrder: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  linkedPhotoIds: string[];
  linkedDocumentIds: string[];
}

export interface ScopeTemplateSummaryDTO {
  id: string;
  templateKey: string;
  name: string;
  description: string | null;
  isSystemTemplate: boolean;
  organizationId: string | null;
  projectCategoryKey: string | null;
  projectTypeKey: string | null;
  projectSubtypeKey: string | null;
  businessTypeKey: string | null;
}

export interface ScopeTemplatePreviewDTO extends ScopeTemplateSummaryDTO {
  sections: Array<{
    /** Position of the section inside the template payload (stable insert handle). */
    index: number;
    name: string;
    sectionKey: string | null;
    tradeKey: string | null;
    items: Array<{
      index: number;
      title: string;
      scopeItemKey: string | null;
      tradeKey: string | null;
    }>;
  }>;
}

export interface ApplyTemplateResult {
  sectionsCreated: number;
  itemsCreated: number;
}
