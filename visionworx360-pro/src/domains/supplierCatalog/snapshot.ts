/**
 * Immutable product price snapshots (Module 007A).
 *
 * When a product is attached to an estimate or a selection, we freeze what was
 * quoted. Later supplier updates must never silently change an issued estimate.
 */

import type {
  NormalizedProduct,
  ProductAvailability,
  ProductPricing,
} from "./types";

export interface ProductPriceSnapshot {
  readonly snapshotId: string;
  readonly organizationId: string;
  readonly productId: string;
  readonly providerKey: string;
  readonly supplierProductId: string;
  readonly productName: string;
  readonly manufacturer?: string | null;
  readonly modelNumber?: string | null;
  readonly finish?: string | null;
  readonly color?: string | null;
  readonly imageUrl?: string | null;
  readonly storeId?: string | null;
  readonly storeName?: string | null;
  readonly currency: string;
  readonly quotedUnitPrice: number;
  readonly quantity: number;
  readonly estimatedTax?: number | null;
  readonly deliveryCharge?: number | null;
  readonly availabilityAtSelection?: ProductAvailability["status"] | null;
  readonly snapshotAt: string;
  readonly dataSource: string;
  readonly attribution?: string | null;
  /** Pricing is indicative at snapshot time — never a guarantee. */
  readonly isEstimateOnly: true;
}

export function createProductPriceSnapshot(args: {
  snapshotId: string;
  organizationId: string;
  product: NormalizedProduct;
  pricing: ProductPricing;
  quantity: number;
  availability?: ProductAvailability | null;
  estimatedTax?: number | null;
  deliveryCharge?: number | null;
  now?: string;
}): ProductPriceSnapshot {
  const { product, pricing } = args;
  const unitPrice = pricing.contractorPrice ?? pricing.salePrice ?? pricing.price ?? 0;
  return Object.freeze({
    snapshotId: args.snapshotId,
    organizationId: args.organizationId,
    productId: product.productId,
    providerKey: product.providerKey,
    supplierProductId: product.supplierProductId,
    productName: product.name,
    manufacturer: product.manufacturer ?? null,
    modelNumber: product.modelNumber ?? null,
    finish: product.finish ?? null,
    color: product.color ?? null,
    imageUrl: product.images.find((i) => i.role === "primary")?.url ?? null,
    storeId: pricing.storeId ?? null,
    storeName: pricing.storeName ?? null,
    currency: pricing.currency,
    quotedUnitPrice: unitPrice,
    quantity: args.quantity,
    estimatedTax: args.estimatedTax ?? null,
    deliveryCharge: args.deliveryCharge ?? null,
    availabilityAtSelection: args.availability?.status ?? null,
    snapshotAt: args.now ?? new Date().toISOString(),
    dataSource: product.dataSource,
    attribution: product.attributionRequirement ?? null,
    isEstimateOnly: true,
  });
}

export function snapshotExtendedTotal(snapshot: ProductPriceSnapshot): number {
  return (
    snapshot.quotedUnitPrice * snapshot.quantity +
    (snapshot.estimatedTax ?? 0) +
    (snapshot.deliveryCharge ?? 0)
  );
}
