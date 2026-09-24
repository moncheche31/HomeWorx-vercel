/**
 * Product Selections domain — CONTRACT ONLY (Module 007A).
 *
 * Deliberately separate from estimate calculation. A selection records what the
 * client/contractor chose; the estimate records money. A selection is tied to a
 * project (and optionally room / scope item / estimate line), never coupled to
 * a single estimate version.
 */

import type { ProductPriceSnapshot } from "@/domains/supplierCatalog/snapshot";

export type ProductSelectionStatus =
  | "suggested"
  | "shortlisted"
  | "client-selected"
  | "contractor-approved"
  | "ordered"
  | "received"
  | "installed"
  | "substituted"
  | "discontinued";

export type ApprovalState = "pending" | "approved" | "rejected";

/** Assets a selection can hand to rendering/visualization. */
export interface RenderingAsset {
  kind: "product-image" | "texture" | "material" | "swatch" | "model";
  url: string;
  notes?: string | null;
}

/** Honesty labels for visual concepts. Renderings are always conceptual. */
export type RenderingFidelity =
  | "actual-product"
  | "visually-similar-substitute"
  | "generic-placeholder"
  | "not-renderable";

export interface ProductSelection {
  id: string;
  organizationId: string;
  projectId: string;
  roomId?: string | null;
  scopeItemId?: string | null;
  /** Optional link; a selection survives estimate versioning. */
  estimateLineItemId?: string | null;
  productId?: string | null;
  providerKey?: string | null;
  status: ProductSelectionStatus;
  quantity: number;
  /** Budgeted allowance amount for this selection. */
  allowanceAmount?: number | null;
  /** Price actually quoted for the chosen product. */
  actualProductPrice?: number | null;
  /** actualProductPrice - allowanceAmount (upgrade positive, credit negative). */
  allowanceVariance?: number | null;
  customerApproval: ApprovalState;
  contractorApproval: ApprovalState;
  notes?: string | null;
  /** Other candidate products (good/better/best, comparisons). */
  alternativeProductIds?: string[];
  renderingAssets?: RenderingAsset[];
  renderingFidelity?: RenderingFidelity;
  priceSnapshot?: ProductPriceSnapshot | null;
  selectedBy?: string | null;
  selectedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export function computeAllowanceVariance(
  selection: Pick<ProductSelection, "allowanceAmount" | "actualProductPrice" | "quantity">,
): number | null {
  const { allowanceAmount, actualProductPrice } = selection;
  if (allowanceAmount == null || actualProductPrice == null) return null;
  return (actualProductPrice - allowanceAmount) * (selection.quantity || 1);
}

/**
 * Extension points (not implemented in 007A):
 * - client-facing product boards & room-by-room selection views
 * - good/better/best comparison and approval workflows
 * - proposal inclusion, purchasing (selection → PO), change orders
 * - substitutions and discontinued-product handling
 * - rendering integration consuming `renderingAssets` + `renderingFidelity`
 */
export interface ProductSelectionRepository {
  listByProject(projectId: string): Promise<ProductSelection[]>;
  save(selection: ProductSelection): Promise<ProductSelection>;
}
