"use client";

import { Estimate, AppSettings, TradePriceTable, ContractorProfile, Language } from "@/types";
import { DEFAULT_PRICE_TABLES } from "./pricing";

const ESTIMATES_KEY = "homeworx_estimates";
const SETTINGS_KEY = "homeworx_settings";

export const DEFAULT_CONTRACTOR: ContractorProfile = {
  name: "",
  company: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  license: "",
};

export const DEFAULT_SETTINGS: AppSettings = {
  language: "en",
  contractor: DEFAULT_CONTRACTOR,
  priceTables: DEFAULT_PRICE_TABLES,
};

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

// Estimates

export function loadEstimates(): Estimate[] {
  return load<Estimate[]>(ESTIMATES_KEY, []);
}

export function loadEstimate(id: string): Estimate | null {
  return loadEstimates().find((e) => e.id === id) ?? null;
}

export function saveEstimate(estimate: Estimate): void {
  const estimates = loadEstimates();
  const idx = estimates.findIndex((e) => e.id === estimate.id);
  if (idx >= 0) {
    estimates[idx] = estimate;
  } else {
    estimates.unshift(estimate);
  }
  save(ESTIMATES_KEY, estimates);
}

export function deleteEstimate(id: string): void {
  const estimates = loadEstimates().filter((e) => e.id !== id);
  save(ESTIMATES_KEY, estimates);
}

// Settings

export function loadSettings(): AppSettings {
  const stored = load<Partial<AppSettings>>(SETTINGS_KEY, {});
  return {
    language: stored.language ?? DEFAULT_SETTINGS.language,
    contractor: { ...DEFAULT_SETTINGS.contractor, ...(stored.contractor ?? {}) },
    priceTables: mergePriceTables(stored.priceTables),
  };
}

function mergePriceTables(stored?: TradePriceTable[]): TradePriceTable[] {
  if (!stored) return DEFAULT_PRICE_TABLES;
  return DEFAULT_PRICE_TABLES.map((def) => {
    const override = stored.find((s) => s.trade === def.trade);
    return override ?? def;
  });
}

export function saveSettings(settings: AppSettings): void {
  save(SETTINGS_KEY, settings);
}

export function loadLanguage(): Language {
  return loadSettings().language;
}

export function saveLanguage(lang: Language): void {
  const s = loadSettings();
  saveSettings({ ...s, language: lang });
}

export function loadContractor(): ContractorProfile {
  return loadSettings().contractor;
}

export function saveContractor(contractor: ContractorProfile): void {
  const s = loadSettings();
  saveSettings({ ...s, contractor });
}

export function loadPriceTable(trade: string): TradePriceTable | undefined {
  return loadSettings().priceTables.find((t) => t.trade === trade);
}

export function savePriceTable(table: TradePriceTable): void {
  const s = loadSettings();
  const tables = s.priceTables.map((t) => (t.trade === table.trade ? table : t));
  saveSettings({ ...s, priceTables: tables });
}

export function nextEstimateNumber(): string {
  const estimates = loadEstimates();
  const year = new Date().getFullYear();
  const count = estimates.filter((e) => e.createdAt.startsWith(String(year))).length + 1;
  return `${year}-${String(count).padStart(4, "0")}`;
}
