export type TradeType =
  | "remodeling"
  | "painting"
  | "roofing"
  | "siding"
  | "doors-windows"
  | "plumbing"
  | "electrical"
  | "drywall";

export type Language = "en" | "es";
export type EstimateStatus = "draft" | "sent" | "accepted" | "declined";
export type DisplayMode = "total-only" | "grouped" | "itemized";

export interface ContractorProfile {
  name: string;
  company: string;
  phone: string;
  email: string;
  website: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  license: string;
  logoDataUrl?: string;
}

export interface CustomerInfo {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

export interface LineItem {
  id: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  estimatedHours?: number; // contractor-only, never printed on client PDF
}

export interface JobLocation {
  city: string;
  state: string;
  zip: string;
}

export interface Estimate {
  id: string;
  estimateNumber: string;
  createdAt: string;
  updatedAt: string;
  status: EstimateStatus;
  trade: TradeType;
  contractor: ContractorProfile;
  customer: CustomerInfo;
  jobDescription: string;   // raw voice transcript — stored, never shown to customer
  scopeOfWork: string;      // AI-rewritten professional version — shown on PDF
  totalEstimatedHours?: number; // contractor-only
  laborRate?: number;           // contractor's hourly rate (default: from price table)
  jobAddress: string;
  location: JobLocation;
  photos: string[];
  lineItems: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  notes: string;
  terms: string;
  validDays: number;
  language: Language;
  displayMode: DisplayMode;
}

export interface PriceTableItem {
  id: string;
  description: string;
  unit: string;
  price: number;
}

export interface TradePriceTable {
  trade: TradeType;
  laborRate: number;
  items: PriceTableItem[];
}

export interface AppSettings {
  language: Language;
  contractor: ContractorProfile;
  priceTables: TradePriceTable[];
}
