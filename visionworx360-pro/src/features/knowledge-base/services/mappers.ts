import type {
  AssemblyDTO, AssemblyOverrideInput, AssemblyTemplateDTO, AssemblyTemplateItemDTO,
} from "../types";

const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));
const strOrNull = (v: unknown) => (v === null || v === undefined ? null : String(v));

export function mapAssembly(r: Record<string, unknown>): AssemblyDTO {
  return {
    assemblyKey: String(r.assembly_key),
    origin: (r.origin as AssemblyDTO["origin"]) ?? "library",
    tradeKey: String(r.trade_key),
    categoryKey: String(r.category_key),
    subcategoryKey: strOrNull(r.subcategory_key),
    workItem: String(r.work_item),
    defaultScopeDescription: String(r.default_scope_description ?? ""),
    clientDescription: strOrNull(r.client_description),
    unitKey: String(r.unit_key),
    measurementMethod: strOrNull(r.measurement_method),
    productionRate: numOrNull(r.production_rate),
    defaultLaborHours: numOrNull(r.default_labor_hours),
    crewSize: numOrNull(r.crew_size),
    skillLevel: strOrNull(r.skill_level),
    materialAllowance: numOrNull(r.material_allowance),
    wasteFactor: numOrNull(r.waste_factor),
    equipmentRequirements: strOrNull(r.equipment_requirements),
    suggestedMarkupPct: numOrNull(r.suggested_markup_pct),
    defaultOverheadPct: numOrNull(r.default_overhead_pct),
    suggestedProfitPct: numOrNull(r.suggested_profit_pct),
    estimatedDurationHours: numOrNull(r.estimated_duration_hours),
    typicalDependencies: (r.typical_dependencies as string[]) ?? [],
    internalNotes: strOrNull(r.internal_notes),
    safetyNotes: strOrNull(r.safety_notes),
    codeReference: strOrNull(r.code_reference),
    inspectionNotes: strOrNull(r.inspection_notes),
    keywords: (r.keywords as string[]) ?? [],
    isCustomized: Boolean(r.is_customized),
    isDisabled: Boolean(r.is_disabled),
    isArchived: Boolean(r.is_archived),
    isFavorite: Boolean(r.is_favorite),
    isPinned: Boolean(r.is_pinned),
    useCount: Number(r.use_count ?? 0),
    lastUsedAt: strOrNull(r.last_used_at),
  };
}

export function mapTemplate(r: Record<string, unknown>): AssemblyTemplateDTO {
  const counts = r.assembly_template_items as { count?: number }[] | undefined;
  return {
    id: String(r.id),
    templateKey: String(r.template_key),
    name: String(r.name),
    description: strOrNull(r.description),
    categoryKey: strOrNull(r.category_key),
    isSystemTemplate: Boolean(r.is_system_template),
    itemCount: Number(counts?.[0]?.count ?? 0),
  };
}

export function mapTemplateItem(r: Record<string, unknown>): AssemblyTemplateItemDTO {
  return {
    id: String(r.id),
    sectionLabel: String(r.section_label),
    assemblyKey: String(r.assembly_key),
    quantity: numOrNull(r.quantity),
    unitKey: strOrNull(r.unit_key),
    sortOrder: Number(r.sort_order ?? 0),
  };
}

/** Translate a camelCase override patch into database columns. */
export function toOverrideRow(patch: AssemblyOverrideInput): Record<string, unknown> {
  const map: Record<keyof AssemblyOverrideInput, string> = {
    workItem: "work_item",
    defaultScopeDescription: "default_scope_description",
    clientDescription: "client_description",
    measurementMethod: "measurement_method",
    productionRate: "production_rate",
    defaultLaborHours: "default_labor_hours",
    crewSize: "crew_size",
    skillLevel: "skill_level",
    materialAllowance: "material_allowance",
    wasteFactor: "waste_factor",
    equipmentRequirements: "equipment_requirements",
    suggestedMarkupPct: "suggested_markup_pct",
    defaultOverheadPct: "default_overhead_pct",
    suggestedProfitPct: "suggested_profit_pct",
    estimatedDurationHours: "estimated_duration_hours",
    internalNotes: "internal_notes",
    safetyNotes: "safety_notes",
    codeReference: "code_reference",
    inspectionNotes: "inspection_notes",
  };
  const row: Record<string, unknown> = {};
  for (const [k, column] of Object.entries(map)) {
    const value = patch[k as keyof AssemblyOverrideInput];
    if (value !== undefined) row[column] = value;
  }
  return row;
}
