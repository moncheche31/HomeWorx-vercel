/** Contractor Knowledge Base (Module 007B) DTOs. */

export type AssemblyOrigin = "library" | "organization";

export interface AssemblyDTO {
  assemblyKey: string;
  origin: AssemblyOrigin;
  tradeKey: string;
  categoryKey: string;
  subcategoryKey: string | null;
  workItem: string;
  defaultScopeDescription: string;
  clientDescription: string | null;
  unitKey: string;
  measurementMethod: string | null;
  productionRate: number | null;
  defaultLaborHours: number | null;
  crewSize: number | null;
  skillLevel: string | null;
  materialAllowance: number | null;
  wasteFactor: number | null;
  equipmentRequirements: string | null;
  suggestedMarkupPct: number | null;
  defaultOverheadPct: number | null;
  suggestedProfitPct: number | null;
  estimatedDurationHours: number | null;
  typicalDependencies: string[];
  internalNotes: string | null;
  safetyNotes: string | null;
  codeReference: string | null;
  inspectionNotes: string | null;
  keywords: string[];
  isCustomized: boolean;
  isDisabled: boolean;
  isArchived: boolean;
  isFavorite: boolean;
  isPinned: boolean;
  useCount: number;
  lastUsedAt: string | null;
}

export interface AssemblyTemplateDTO {
  id: string;
  templateKey: string;
  name: string;
  description: string | null;
  categoryKey: string | null;
  isSystemTemplate: boolean;
  itemCount: number;
}

export interface AssemblyTemplateItemDTO {
  id: string;
  sectionLabel: string;
  assemblyKey: string;
  quantity: number | null;
  unitKey: string | null;
  sortOrder: number;
}

export interface LibraryVersionDTO {
  version: number;
  name: string;
  notes: string | null;
  isCurrent: boolean;
  releasedAt: string;
}

/** Fields a contractor may override on a library assembly (copy-on-write). */
export interface AssemblyOverrideInput {
  workItem?: string | null;
  defaultScopeDescription?: string | null;
  clientDescription?: string | null;
  measurementMethod?: string | null;
  productionRate?: number | null;
  defaultLaborHours?: number | null;
  crewSize?: number | null;
  skillLevel?: string | null;
  materialAllowance?: number | null;
  wasteFactor?: number | null;
  equipmentRequirements?: string | null;
  suggestedMarkupPct?: number | null;
  defaultOverheadPct?: number | null;
  suggestedProfitPct?: number | null;
  estimatedDurationHours?: number | null;
  internalNotes?: string | null;
  safetyNotes?: string | null;
  codeReference?: string | null;
  inspectionNotes?: string | null;
}
