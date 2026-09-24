// Shared platform types. Distinct from membership roles and business personas.

/** Product editions — which VisionWorx360 product an org may access. */
export const PRODUCT_KEYS = {
  CONTRACTOR: "CONTRACTOR",
} as const;
export type ProductKey = (typeof PRODUCT_KEYS)[keyof typeof PRODUCT_KEYS];

/** Membership role — authorization within an organization. */
export type MembershipRole =
  | "owner"
  | "administrator"
  | "estimator"
  | "sales"
  | "office"
  | "read_only";

export type ProductAccessStatus = "active" | "revoked";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export interface OrganizationProduct {
  productKey: string;
  accessStatus: ProductAccessStatus;
  settings: JsonObject;
}
