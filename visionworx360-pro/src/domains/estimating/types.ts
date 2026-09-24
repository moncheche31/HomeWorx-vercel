/**
 * Estimating engine contracts. The engine is UI-independent and PDF-
 * independent. Contractor Edition will be one client. Product/persona concerns
 * belong to the orchestration/entitlement layer, not the math engine.
 */

export interface EstimateScopeItem {
  id: string;
  title: string;
  quantity: number | null;
  unitKey: string | null;
  materialSelection: string | null;
  isIncluded: boolean;
}

export interface EstimateScopeSection {
  id: string;
  name: string;
  tradeKey: string | null;
  items: EstimateScopeItem[];
}

export interface EstimateInput {
  organization: { id: string; currency: string; taxRate: number };
  project: { id: string; name: string };
  property: { id: string } | null;
  rooms: { id: string; name: string }[];
  sections: EstimateScopeSection[];
  costProfileRef?: string | null;
  config?: { markup?: number; laborRate?: number };
}

export interface EstimateLine {
  scopeItemId: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  extended: number;
  category: "labor" | "material" | "allowance";
}

export interface EstimateResult {
  lines: EstimateLine[];
  labor: number;
  materials: number;
  allowances: number;
  subtotal: number;
  markup: number;
  tax: number;
  total: number;
  warnings: string[];
  assumptions: string[];
  confidence: { level: "high" | "medium" | "low"; notes?: string };
}

export type EstimateEngine = (input: EstimateInput) => Promise<EstimateResult>;
