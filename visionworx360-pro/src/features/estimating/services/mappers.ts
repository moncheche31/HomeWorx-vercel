import type {
  EstimateAuditEventDTO, EstimateDTO, EstimateDocumentKind, EstimateLineDTO,
  EstimateStatus, JsonValue,
} from "../types";
import { isEstimateIntakeMode } from "../types";
import { normalizePricingMode } from "@/domains/estimating/pricingModes";
import {
  isValidTargetGrossMargin,
  normalizePricingMethod,
} from "@/domains/estimating/pricingStrategy";
import { normalizeLaborSettings } from "@/domains/estimating/laborHours";
import { normalizePricingCopyMode } from "@/domains/estimating/copyPlan";
import type { ScopeUnit } from "@/features/scope/types";

type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (v == null ? null : String(v));
const n = (v: unknown, fallback = 0): number => {
  const x = v == null ? fallback : Number(v);
  return Number.isFinite(x) ? x : fallback;
};

export function mapEstimate(row: Row): EstimateDTO {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    projectId: row.project_id as string,
    version: n(row.version, 1),
    parentEstimateId: s(row.parent_estimate_id),
    documentKind: ((row.document_kind as EstimateDocumentKind) ?? "estimate"),
    lineageRootId: (s(row.lineage_root_id) ?? (row.id as string)),
    revisionNumber: n(row.revision_number, 0),
    optionLabel: s(row.option_label),
    supersededById: s(row.superseded_by_id),
    sentAt: s(row.sent_at),
    acceptedAt: s(row.accepted_at),
    declinedAt: s(row.declined_at),
    lockedAt: s(row.locked_at),
    title: (row.title as string) ?? "Estimate",
    notes: s(row.notes),
    status: ((row.status as EstimateStatus) ?? "draft"),
    currency: (row.currency as string) ?? "USD",
    taxRate: n(row.tax_rate),
    defaultOverheadPct: n(row.default_overhead_pct),
    defaultProfitPct: n(row.default_profit_pct),
    defaultContingencyPct: n(row.default_contingency_pct),
    defaultLaborRate: n(row.default_labor_rate),
    costCatalogRef: s(row.cost_catalog_ref),
    intakeMode: isEstimateIntakeMode(row.intake_mode) ? row.intake_mode : "detailed",
    pricingMode: normalizePricingMode(row.pricing_mode),
    pricingMethod: normalizePricingMethod(row.pricing_method),
    targetGrossMarginPct: isValidTargetGrossMargin(row.target_gross_margin_pct)
      ? n(row.target_gross_margin_pct)
      : 0,
    laborSettings: normalizeLaborSettings(row.labor_settings),
    rangeAssumptions: (row.range_assumptions as Record<string, JsonValue> | null) ?? {},
    rangeSnapshot: (row.range_snapshot as Record<string, JsonValue> | null) ?? null,
    scopeSyncFingerprint: s(row.scope_sync_fingerprint),
    scopeSyncedAt: s(row.scope_synced_at),
    pricingConfirmationRequired: row.pricing_confirmation_required === true,
    pricingConfirmationReason: s(row.pricing_confirmation_reason),
    pricingSource: s(row.pricing_source),
    pricingConfirmedAt: s(row.pricing_confirmed_at),
    pricingSettingsLockedAt: s(row.pricing_settings_locked_at),
    pricingEngineVersion: n(row.pricing_engine_version, 0),
    pricingRepricedAt: s(row.pricing_repriced_at),
    pricingLocation: s(row.pricing_location),
    pricingLocationSource: s(row.pricing_location_source),
    pricingLocationOverride: s(row.pricing_location_override),
    pricingLocationFactors:
      (row.pricing_location_factors as EstimateDTO["pricingLocationFactors"]) ?? null,

    copiedFromEstimateId: s(row.copied_from_estimate_id),
    copiedFromProjectId: s(row.copied_from_project_id),
    copiedFromLabel: s(row.copied_from_label),
    copiedSourceDatedAt: s(row.copied_source_dated_at),
    pricingCopyMode: normalizePricingCopyMode(row.pricing_copy_mode),
    createdBy: row.created_by as string,
    approvedBy: s(row.approved_by),
    approvedAt: s(row.approved_at),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    archivedAt: s(row.archived_at),
  };
}

export function mapLine(row: Row): EstimateLineDTO {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    projectId: row.project_id as string,
    estimateId: row.estimate_id as string,
    scopeItemId: s(row.scope_item_id),
    scopeSectionId: s(row.scope_section_id),
    roomId: s(row.room_id),
    groupLabel: s(row.group_label),
    description: (row.description as string) ?? "",
    categoryKey: s(row.category_key),
    subcategoryKey: s(row.subcategory_key),
    tradeKey: s(row.trade_key),
    quantity: n(row.quantity, 1),
    unitKey: (row.unit_key as ScopeUnit | null) ?? null,
    laborHours: n(row.labor_hours),
    laborRate: n(row.labor_rate),
    materialCost: n(row.material_cost),
    equipmentCost: n(row.equipment_cost),
    subcontractorCost: n(row.subcontractor_cost),
    otherCost: n(row.other_cost),
    overheadPct: n(row.overhead_pct),
    profitPct: n(row.profit_pct),
    contingencyPct: n(row.contingency_pct),
    isTaxable: row.is_taxable == null ? true : Boolean(row.is_taxable),
    isClientVisible: row.is_client_visible == null ? true : Boolean(row.is_client_visible),
    internalNotes: s(row.internal_notes),
    catalogItemKey: s(row.catalog_item_key),
    catalogMappingSource:
      (s(row.catalog_mapping_source) as EstimateLineDTO["catalogMappingSource"]) ?? null,
    catalogConfirmedBy: s(row.catalog_confirmed_by),
    catalogConfirmedAt: s(row.catalog_confirmed_at),
    isQuantityPlaceholder: Boolean(row.is_quantity_placeholder),
    quantityIsAssumedDefault: Boolean(row.quantity_is_assumed_default),
    quantitySourceMeasurementId: s(row.quantity_source_measurement_id),
    quantityReviewedBy: s(row.quantity_reviewed_by),
    quantityReviewedAt: s(row.quantity_reviewed_at),
    pricingSource: (s(row.pricing_source) as EstimateLineDTO["pricingSource"]) ?? null,
    costBasis: (s(row.cost_basis) as EstimateLineDTO["costBasis"]) ?? null,
    costBasisSource: s(row.cost_basis_source),
    laborConvention: s(row.labor_convention),
    laborHoursPerUnit: row.labor_hours_per_unit == null ? null : n(row.labor_hours_per_unit),
    laborHoursSetup: row.labor_hours_setup == null ? null : n(row.labor_hours_setup),
    resolutionStatus:
      (s(row.resolution_status) as EstimateLineDTO["resolutionStatus"]) ?? "resolved",
    unresolvedReason: s(row.unresolved_reason),
    assemblyExpansionId: s(row.assembly_expansion_id),
    assemblyExpansionStatus: s(row.assembly_expansion_status),
    parentLineId: s(row.parent_line_id),


    pricingProvenance: (row.pricing_provenance as EstimateLineDTO["pricingProvenance"] | null) ?? {},
    pricedAt: s(row.priced_at),
    isPriceOverridden: Boolean(row.is_price_overridden),
    sortOrder: n(row.sort_order),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    archivedAt: s(row.archived_at),
  };
}

export function mapAuditEvent(row: Row): EstimateAuditEventDTO {
  return {
    id: row.id as string,
    estimateId: row.estimate_id as string,
    actorUserId: s(row.actor_user_id),
    eventType: (row.event_type as string) ?? "",
    entityType: (row.entity_type as string) ?? "estimate",
    entityId: s(row.entity_id),
    summary: s(row.summary),
    metadata: (row.metadata as Record<string, string | number | boolean | null>) ?? {},
    createdAt: row.created_at as string,
  };
}
