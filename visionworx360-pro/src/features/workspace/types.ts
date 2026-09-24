import type { PricingMethod } from "@/domains/estimating/pricingStrategy";

export type AppRole = "owner" | "administrator" | "estimator" | "sales" | "office" | "read_only";
export type MeasurementSystem = "imperial" | "metric";
export type NotificationCategory = "system" | "estimate" | "proposal" | "project" | "ai";

export interface Organization {
  id: string;
  organizationName: string;
  businessName: string | null;
  logoUrl: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  licenseNumber: string | null;
  licenseState: string | null;
  primaryTrade: string | null;
  taxRate: number;
  currency: string;
  measurementSystem: MeasurementSystem;
  timezone: string;
  language: string;
  brandAccentColor: string | null;
  contractorNetworkId: string | null;
  primaryBusinessType: string | null;
  secondaryBusinessTypes: string[];
  serviceSpecialties: string[];
  preferredProjectScale: string | null;
  /* Company labor defaults. Estimates may override these without changing them. */
  defaultLaborRate: number;
  defaultProductivityMultiplier: number;
  defaultCrewSize: number;
  defaultProductiveHoursPerDay: number;
  /* Company pricing method defaults. Estimates copy these at creation. */
  defaultPricingMethod: PricingMethod;
  defaultTargetGrossMarginPct: number;
  defaultOverheadPct: number;
  defaultProfitPct: number;
}

export interface UserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  phone: string | null;
  email: string | null;
  avatarUrl: string | null;
  language: string;
  role: AppRole;
  timezone: string;
  measurementPreference: MeasurementSystem;
}

export interface UserPreferences {
  notificationEmail: boolean;
  notificationPush: boolean;
  notificationSms: boolean;
  marketingOptIn: boolean;
  theme: "light" | "dark" | "system";
}

export interface AppNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  createdAt: string;
  readAt: string | null;
}
