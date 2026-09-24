export type ContactMethod = "email" | "phone" | "sms" | "any";
export type ClientStatus = "active" | "archived";
export type ProjectStatus =
  | "lead"
  | "site_visit_scheduled"
  | "site_visit_complete"
  | "estimate_in_progress"
  | "estimate_sent"
  | "customer_reviewing"
  | "approved"
  | "scheduled"
  | "construction"
  | "completed"
  | "archived";
export type ProjectPriority = "low" | "normal" | "high" | "urgent";

export interface ClientDTO {
  id: string;
  organizationId: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  secondaryPhone: string | null;
  addressLine1: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  notes: string | null;
  preferredContact: ContactMethod;
  status: ClientStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PropertyDTO {
  id: string;
  organizationId: string;
  clientId: string;
  nickname: string | null;
  street: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  county: string | null;
  yearBuilt: number | null;
  squareFootage: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  stories: number | null;
  constructionType: string | null;
  occupied: boolean | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDTO {
  id: string;
  organizationId: string;
  clientId: string;
  propertyId: string;
  name: string;
  projectType: string | null;
  projectCategoryKey: string | null;
  projectTypeKey: string | null;
  projectTypeCustom: string | null;
  projectSubtypeKey: string | null;
  projectSubtypeCustom: string | null;
  projectScaleKey: string | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  budget: number | null;
  targetGrossMargin: number | null;
  targetCompletion: string | null;
  description: string | null;
  internalNotes: string | null;
  thumbnailUrl: string | null;
  coverPhotoId: string | null;
  createdAt: string;
  updatedAt: string;
  /** Last time real work happened on this project (not just viewing it). */
  lastActivityAt: string | null;
}

export interface ProjectListItem extends ProjectDTO {
  clientName: string | null;
  propertyLabel: string | null;
  coverStoragePath: string | null;
  coverAlt: string | null;
  coverPhotoType: string | null;
  /**
   * Read-only display copy of the canonical estimate's saved band (the current
   * estimate document, exactly as the project detail page picks it). Never a
   * pricing source — list cards only render it.
   */
  ballparkLow?: number | null;
  ballparkHigh?: number | null;
  ballparkCurrency?: string | null;
}

export interface PropertyListItem extends PropertyDTO {
  clientName: string | null;
  addressLabel: string;
  activeProjectCount: number;
}

export interface CrmFilterOptions {
  clientCities: string[];
  propertyCities: string[];
}

/* ---------------------- DELETION DEPENDENCY AUDIT ---------------------- */

/** Machine-readable reasons a record must be retained instead of deleted. */
export type DeletionBlocker = "accepted_or_approved_estimate" | "accepted_client_proposal";

export interface ProjectDeletionAudit {
  kind: "project";
  id: string;
  organizationId: string;
  name: string | null;
  counts: Record<string, number>;
  blockers: DeletionBlocker[];
  canDelete: boolean;
  mayDelete: boolean;
}

export interface ClientDeletionAudit {
  kind: "client";
  id: string;
  organizationId: string;
  counts: { projects: number; properties: number; estimates: number; proposalShares: number };
  hasDependencies: boolean;
  blockers: DeletionBlocker[];
  canDelete: boolean;
  mayDelete: boolean;
}
