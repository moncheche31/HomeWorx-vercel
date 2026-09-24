import { BOOK_NATIONAL_LABOR_RATE } from "@/domains/estimating/pricing/bookLaborRates";
import { z } from "zod";
import type { Organization } from "../types";
import { normalizePricingMethod } from "@/domains/estimating/pricingStrategy";

export const saveOrgSchema = z.object({
  organizationName: z.string().trim().min(1).max(200),
  businessName: z.string().trim().max(200).optional().nullable(),
  licenseState: z.string().trim().max(64).optional().nullable(),
  licenseNumber: z.string().trim().max(120).optional().nullable(),
  primaryTrade: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(64).optional().nullable(),
  email: z
    .union([z.literal(""), z.string().trim().email().max(255)])
    .optional()
    .nullable(),
  website: z
    .union([z.literal(""), z.string().trim().url().max(500)])
    .optional()
    .nullable(),
  addressLine1: z.string().trim().max(200).optional().nullable(),
  addressLine2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(120).optional().nullable(),
  region: z.string().trim().max(120).optional().nullable(),
  postalCode: z
    .union([z.literal(""), z.string().trim().regex(/^\d{5}(-\d{4})?$/)])
    .optional()
    .nullable(),
  country: z.string().trim().max(120).optional().nullable(),
  taxRate: z.number().min(0).max(100).optional().nullable(),
  timezone: z.string().trim().max(64).optional().nullable(),
  language: z.string().trim().max(16).optional().nullable(),
  measurementSystem: z.enum(["imperial", "metric"]).optional().nullable(),
  currency: z.string().trim().length(3).optional().nullable(),
  /* Company labor defaults (used as the baseline for every new estimate). */
  defaultLaborRate: z.number().min(0).max(100000).optional().nullable(),
  defaultProductivityMultiplier: z.number().min(0.5).max(2.5).optional().nullable(),
  defaultCrewSize: z.number().min(1).max(50).optional().nullable(),
  defaultProductiveHoursPerDay: z.number().min(1).max(24).optional().nullable(),
  /* Company pricing method defaults (mutually exclusive method + its inputs). */
  defaultPricingMethod: z.enum(["overhead_profit", "target_gross_margin"]).optional().nullable(),
  defaultTargetGrossMarginPct: z.number().min(0).max(99.99).optional().nullable(),
  defaultOverheadPct: z.number().min(0).max(500).optional().nullable(),
  defaultProfitPct: z.number().min(0).max(500).optional().nullable(),
});

export type SaveOrgInput = z.infer<typeof saveOrgSchema>;

export function mapOrgRow(row: Record<string, unknown>): Organization {
  return {
    id: row.id as string,
    organizationName: (row.organization_name as string) ?? "",
    businessName: (row.business_name as string) ?? null,
    logoUrl: (row.logo_url as string) ?? null,
    addressLine1: (row.address_line1 as string) ?? null,
    addressLine2: (row.address_line2 as string) ?? null,
    city: (row.city as string) ?? null,
    region: (row.region as string) ?? null,
    postalCode: (row.postal_code as string) ?? null,
    country: (row.country as string) ?? null,
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    website: (row.website as string) ?? null,
    licenseNumber: (row.license_number as string) ?? null,
    licenseState: (row.license_state as string) ?? null,
    primaryTrade: (row.primary_trade as string) ?? null,
    taxRate: Number(row.tax_rate ?? 0),
    currency: (row.currency as string) ?? "USD",
    measurementSystem: (row.measurement_system as Organization["measurementSystem"]) ?? "imperial",
    timezone: (row.timezone as string) ?? "America/New_York",
    language: (row.language as string) ?? "en-US",
    brandAccentColor: (row.brand_accent_color as string) ?? null,
    contractorNetworkId: (row.contractor_network_id as string) ?? null,
    primaryBusinessType: (row.primary_business_type as string) ?? null,
    secondaryBusinessTypes: Array.isArray(row.secondary_business_types)
      ? (row.secondary_business_types as string[])
      : [],
    serviceSpecialties: Array.isArray(row.service_specialties)
      ? (row.service_specialties as string[])
      : [],
    preferredProjectScale: (row.preferred_project_scale as string) ?? null,
    defaultLaborRate: Number(row.default_labor_rate ?? BOOK_NATIONAL_LABOR_RATE),
    defaultProductivityMultiplier: Number(row.default_productivity_multiplier ?? 1),
    defaultCrewSize: Number(row.default_crew_size ?? 2),
    defaultProductiveHoursPerDay: Number(row.default_productive_hours_per_day ?? 6.5),
    defaultPricingMethod: normalizePricingMethod(row.default_pricing_method),
    defaultTargetGrossMarginPct: Number(row.default_target_gross_margin_pct ?? 30),
    defaultOverheadPct: Number(row.default_overhead_pct ?? 10),
    defaultProfitPct: Number(row.default_profit_pct ?? 10),
  };
}
