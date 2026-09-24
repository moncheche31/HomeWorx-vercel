/**
 * Supplier / manufacturer product catalog — CONTRACT ONLY (Module 007A).
 *
 * HARD RULES
 * - No scraping of retailer sites, ever. Only authorized APIs, approved
 *   affiliate feeds, licensed product feeds, manufacturer data, distributor
 *   integrations or formal supplier partnerships.
 * - Credentials live server-side. Never in browser code.
 * - Live pricing is never authoritative for an issued estimate: capture a
 *   ProductPriceSnapshot at selection time (see snapshot.ts).
 * - Respect caching, image and attribution restrictions of each source.
 * - Organization-negotiated pricing is isolated per organization and must
 *   never leak across tenants.
 */

export interface ProductImage {
  url: string;
  role: "primary" | "additional" | "swatch" | "texture";
  width?: number | null;
  height?: number | null;
  /** Attribution/usage restriction text required by the source, if any. */
  usageNotes?: string | null;
}

export interface ProductDocument {
  url: string;
  kind: "spec-sheet" | "installation" | "warranty" | "other";
  title?: string | null;
}

export interface ProductDimensions {
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
  depthIn?: number | null;
  weightLb?: number | null;
}

/** Normalized product record. Populated only from authorized sources. */
export interface NormalizedProduct {
  /** Internal stable id assigned by VisionWorx360. */
  productId: string;
  /** Provider key, e.g. "lowes", "manufacturer-feed", "sample". */
  providerKey: string;
  supplierProductId: string;
  manufacturer?: string | null;
  brand?: string | null;
  modelNumber?: string | null;
  sku?: string | null;
  /** UPC or GTIN, when the source supplies one. */
  gtin?: string | null;
  name: string;
  shortDescription?: string | null;
  specifications?: Record<string, string | number | boolean | null>;
  categoryKey?: string | null;
  subcategoryKey?: string | null;
  tradeKey?: string | null;
  unitKey?: string | null;
  packageQuantity?: number | null;
  finish?: string | null;
  color?: string | null;
  dimensions?: ProductDimensions | null;
  productUrl?: string | null;
  images: ProductImage[];
  documents?: ProductDocument[];
  warranty?: string | null;
  dataSource: string;
  attributionRequirement?: string | null;
  isDiscontinued?: boolean;
  isArchived?: boolean;
  lastSyncedAt?: string | null;
}

export interface ProductPricing {
  productId: string;
  providerKey: string;
  currency: string;
  price: number | null;
  salePrice?: number | null;
  /** Contractor/pro pricing, only when the source authorizes exposing it. */
  contractorPrice?: number | null;
  /** Organization the contractor pricing belongs to; never cross-tenant. */
  organizationId?: string | null;
  storeId?: string | null;
  storeName?: string | null;
  priceEffectiveAt: string;
  retrievedAt: string;
  /** Never present live pricing as guaranteed. */
  isEstimateOnly: true;
}

export interface ProductAvailability {
  productId: string;
  providerKey: string;
  storeId?: string | null;
  status: "in-stock" | "limited" | "out-of-stock" | "special-order" | "unknown";
  quantityAvailable?: number | null;
  pickupAvailable?: boolean | null;
  deliveryAvailable?: boolean | null;
  leadTimeDays?: number | null;
  retrievedAt: string;
}

export interface ProductSearchQuery {
  organizationId: string;
  term?: string | null;
  categoryKey?: string | null;
  subcategoryKey?: string | null;
  tradeKey?: string | null;
  brand?: string | null;
  finish?: string | null;
  color?: string | null;
  postalCode?: string | null;
  storeId?: string | null;
  priceMin?: number | null;
  priceMax?: number | null;
  page?: number;
  pageSize?: number;
}

export interface ProductSearchResult {
  items: NormalizedProduct[];
  total: number;
  page: number;
  pageSize: number;
  providerKey: string;
  /** Attribution the UI must render for this result set, when required. */
  attribution?: string | null;
}

export interface ProductSearchProvider {
  readonly id: string;
  search(query: ProductSearchQuery): Promise<ProductSearchResult>;
}

export interface ProductPricingProvider {
  readonly id: string;
  getPricing(args: {
    organizationId: string;
    productIds: string[];
    storeId?: string | null;
    postalCode?: string | null;
  }): Promise<ProductPricing[]>;
}

export interface ProductAvailabilityProvider {
  readonly id: string;
  getAvailability(args: {
    productIds: string[];
    storeId?: string | null;
    postalCode?: string | null;
  }): Promise<ProductAvailability[]>;
}

export interface ProductImageProvider {
  readonly id: string;
  getImages(productId: string): Promise<ProductImage[]>;
}

/** A full supplier adapter. Individual capabilities may be omitted. */
export interface SupplierCatalogProvider {
  readonly id: string;
  readonly displayName: string;
  /** False until credentials/licensing are approved and configured. */
  readonly isConfigured: boolean;
  readonly attribution?: string | null;
  readonly search?: ProductSearchProvider;
  readonly pricing?: ProductPricingProvider;
  readonly availability?: ProductAvailabilityProvider;
  readonly images?: ProductImageProvider;
  getProduct?(productId: string): Promise<NormalizedProduct | null>;
}
