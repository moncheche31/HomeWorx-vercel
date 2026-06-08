/**
 * Material Cost Simulation Engine
 *
 * Provides localized material pricing estimates based on zip code,
 * designed to simulate Home Depot / Lowe's regional pricing.
 * Replace API_PLACEHOLDER functions below with actual retailer APIs
 * or web-scraped data when available.
 */

export type Retailer = "Home Depot" | "Lowe's" | "Generic";

export interface MaterialPrice {
  name: string;
  sku?: string;
  retailer: Retailer;
  unit: string;
  basePrice: number;
}

export interface LocalizedPrice extends MaterialPrice {
  localPrice: number;
  regionName: string;
  zip: string;
}

// ── Regional cost-of-living multipliers by zip prefix ──────────────────────
// These simulate the regional pricing variance seen on HD/Lowe's websites.
const REGIONAL_MULTIPLIERS: Array<{ prefix: string; multiplier: number; label: string }> = [
  // California & Pacific Coast (high COL)
  { prefix: "900", multiplier: 1.35, label: "Los Angeles, CA" },
  { prefix: "941", multiplier: 1.40, label: "San Francisco, CA" },
  { prefix: "980", multiplier: 1.30, label: "Seattle, WA" },
  { prefix: "970", multiplier: 1.25, label: "Portland, OR" },
  { prefix: "890", multiplier: 1.15, label: "Las Vegas, NV" },
  // Northeast & NYC Metro
  { prefix: "100", multiplier: 1.45, label: "New York City, NY" },
  { prefix: "101", multiplier: 1.40, label: "New York City, NY" },
  { prefix: "021", multiplier: 1.35, label: "Boston, MA" },
  { prefix: "191", multiplier: 1.25, label: "Philadelphia, PA" },
  { prefix: "201", multiplier: 1.30, label: "Northern NJ" },
  { prefix: "208", multiplier: 1.30, label: "Washington DC Metro" },
  // Mid-Atlantic
  { prefix: "211", multiplier: 1.20, label: "Baltimore, MD" },
  { prefix: "221", multiplier: 1.20, label: "Northern Virginia" },
  // Southeast / Florida
  { prefix: "331", multiplier: 1.10, label: "Miami, FL" },
  { prefix: "326", multiplier: 1.00, label: "Jacksonville, FL" },
  { prefix: "302", multiplier: 1.00, label: "Atlanta, GA" },
  // Texas
  { prefix: "770", multiplier: 1.05, label: "Houston, TX" },
  { prefix: "752", multiplier: 1.05, label: "Dallas, TX" },
  { prefix: "782", multiplier: 0.98, label: "San Antonio, TX" },
  // Midwest
  { prefix: "606", multiplier: 1.15, label: "Chicago, IL" },
  { prefix: "481", multiplier: 1.05, label: "Detroit, MI" },
  { prefix: "442", multiplier: 1.00, label: "Cleveland, OH" },
  { prefix: "600", multiplier: 1.00, label: "Midwest" },
  // Mountain West
  { prefix: "800", multiplier: 1.10, label: "Denver, CO" },
  { prefix: "850", multiplier: 1.05, label: "Phoenix, AZ" },
];

export function getRegionalMultiplier(zip: string): { multiplier: number; label: string } {
  const clean = (zip || "").replace(/\D/g, "").padEnd(5, "0");
  // Check 3-digit prefix first, then 2-digit, then 1-digit
  for (const len of [3, 2, 1]) {
    const prefix = clean.slice(0, len);
    const match = REGIONAL_MULTIPLIERS.find((r) => r.prefix === prefix);
    if (match) return { multiplier: match.multiplier, label: match.label };
  }

  // Default by first digit
  const firstDigit = clean[0];
  const defaults: Record<string, { multiplier: number; label: string }> = {
    "9": { multiplier: 1.25, label: "Western US" },
    "8": { multiplier: 1.10, label: "Mountain West" },
    "7": { multiplier: 1.02, label: "South-Central US" },
    "6": { multiplier: 1.05, label: "Midwest" },
    "5": { multiplier: 0.97, label: "Upper Midwest" },
    "4": { multiplier: 1.00, label: "Midwest" },
    "3": { multiplier: 0.97, label: "Southeast US" },
    "2": { multiplier: 1.05, label: "Mid-Atlantic" },
    "1": { multiplier: 1.10, label: "Northeast US" },
    "0": { multiplier: 1.05, label: "New England" },
  };
  return defaults[firstDigit] ?? { multiplier: 1.00, label: "National Average" };
}

// ── Material database ───────────────────────────────────────────────────────
// Base prices are national-average list prices (Jan 2025 approximations).
const MATERIAL_DB: MaterialPrice[] = [
  // Paint & supplies
  { name: "Interior latex paint — 1 gal (premium)", sku: "HDX-LP1", retailer: "Home Depot", unit: "gallon", basePrice: 52.00 },
  { name: "Interior latex paint — 5 gal (premium)", sku: "HDX-LP5", retailer: "Home Depot", unit: "5-gallon", basePrice: 195.00 },
  { name: "Exterior latex paint — 1 gal (premium)", sku: "HDX-EP1", retailer: "Home Depot", unit: "gallon", basePrice: 62.00 },
  { name: "Primer — 1 gal (interior)", sku: "HDX-PR1", retailer: "Home Depot", unit: "gallon", basePrice: 28.00 },
  { name: "Paint roller — 9\" nap kit", sku: "HDX-RK", retailer: "Home Depot", unit: "kit", basePrice: 14.99 },
  { name: "Painter's tape — 1.5\" × 60 yd", sku: "3M-234", retailer: "Lowe's", unit: "roll", basePrice: 7.49 },
  { name: "Drop cloth — 9×12 canvas", sku: "HDX-DC", retailer: "Home Depot", unit: "each", basePrice: 18.99 },

  // Drywall
  { name: "Drywall sheet — 4×8 × 1/2\"", sku: "DW-48H", retailer: "Home Depot", unit: "sheet", basePrice: 14.98 },
  { name: "Drywall sheet — 4×12 × 1/2\"", sku: "DW-412H", retailer: "Home Depot", unit: "sheet", basePrice: 22.50 },
  { name: "Joint compound — 3.5 gal bucket", sku: "USG-JC", retailer: "Home Depot", unit: "bucket", basePrice: 19.97 },
  { name: "Drywall tape — 75 ft paper", sku: "DWT-75", retailer: "Lowe's", unit: "roll", basePrice: 4.98 },
  { name: "Corner bead — 8 ft metal", sku: "CB-8", retailer: "Home Depot", unit: "each", basePrice: 3.98 },
  { name: "Drywall screws — 1-5/8\" (1 lb)", sku: "DWS-1LB", retailer: "Home Depot", unit: "lb", basePrice: 6.98 },

  // Roofing
  { name: "Architectural shingles — bundle (33 sq ft)", sku: "OC-ARCH", retailer: "Home Depot", unit: "bundle", basePrice: 42.00 },
  { name: "Roofing felt (15 lb) — 432 sq ft", sku: "RF-15", retailer: "Lowe's", unit: "roll", basePrice: 38.00 },
  { name: "Roofing nails — 1-3/4\" (1 lb)", sku: "RN-175", retailer: "Home Depot", unit: "lb", basePrice: 5.49 },
  { name: "Ridge cap shingles — bundle", sku: "RC-BUN", retailer: "Home Depot", unit: "bundle", basePrice: 68.00 },
  { name: "Ice & water shield — 200 sq ft", sku: "IWS-200", retailer: "Lowe's", unit: "roll", basePrice: 89.00 },
  { name: "Drip edge — 10 ft galvanized", sku: "DE-10G", retailer: "Home Depot", unit: "each", basePrice: 4.98 },

  // Electrical
  { name: "Standard duplex outlet (15A)", sku: "LV-15A", retailer: "Lowe's", unit: "each", basePrice: 4.49 },
  { name: "GFCI outlet (15A)", sku: "LV-GFCI", retailer: "Lowe's", unit: "each", basePrice: 18.99 },
  { name: "Single-pole switch (15A)", sku: "LV-SW15", retailer: "Home Depot", unit: "each", basePrice: 3.98 },
  { name: "Electrical box — old work plastic", sku: "EB-OW", retailer: "Home Depot", unit: "each", basePrice: 2.49 },
  { name: "Romex wire 12/2 — 50 ft", sku: "NM-122-50", retailer: "Home Depot", unit: "roll", basePrice: 39.00 },
  { name: "Romex wire 14/2 — 50 ft", sku: "NM-142-50", retailer: "Home Depot", unit: "roll", basePrice: 29.00 },
  { name: "Circuit breaker — 20A single pole", sku: "CH-20A", retailer: "Lowe's", unit: "each", basePrice: 12.99 },

  // Plumbing
  { name: "PVC pipe — 3\" × 10 ft", sku: "PVC-3-10", retailer: "Home Depot", unit: "each", basePrice: 12.98 },
  { name: "Copper pipe — 3/4\" × 10 ft", sku: "CU-34-10", retailer: "Home Depot", unit: "each", basePrice: 28.00 },
  { name: "SharkBite push fitting — 3/4\" coupler", sku: "SB-34C", retailer: "Home Depot", unit: "each", basePrice: 9.48 },
  { name: "Toilet wax ring kit", sku: "WR-KIT", retailer: "Lowe's", unit: "each", basePrice: 14.98 },
  { name: "P-trap — 1-1/2\" PVC", sku: "PT-15", retailer: "Home Depot", unit: "each", basePrice: 8.48 },

  // Siding
  { name: "Vinyl siding — double 4\" (100 sq ft)", sku: "VS-D4", retailer: "Home Depot", unit: "box", basePrice: 58.00 },
  { name: "Fiber cement siding — 7.25\"×12 ft plank", sku: "FCS-72", retailer: "Lowe's", unit: "each", basePrice: 11.99 },
  { name: "House wrap — 9×150 ft roll (1350 sq ft)", sku: "TW-9150", retailer: "Home Depot", unit: "roll", basePrice: 129.00 },
  { name: "Vinyl J-channel — 12 ft", sku: "JC-12", retailer: "Home Depot", unit: "each", basePrice: 4.48 },
  { name: "Vinyl corner post — 10 ft", sku: "CP-10", retailer: "Lowe's", unit: "each", basePrice: 12.99 },

  // Flooring
  { name: "LVP flooring — 6mm (20 sq ft/box)", sku: "LVP-6MM", retailer: "Home Depot", unit: "box", basePrice: 48.00 },
  { name: "Tile — 12×12 ceramic (15 sq ft/box)", sku: "TL-1212", retailer: "Lowe's", unit: "box", basePrice: 28.00 },
  { name: "Underlayment — 100 sq ft roll", sku: "UL-100", retailer: "Home Depot", unit: "roll", basePrice: 24.99 },
  { name: "Tile adhesive / thinset — 50 lb", sku: "TS-50", retailer: "Home Depot", unit: "bag", basePrice: 21.98 },
  { name: "Tile grout — 25 lb sanded", sku: "GR-25S", retailer: "Home Depot", unit: "bag", basePrice: 19.99 },
];

export function getLocalizedPrices(zip: string, category?: string): LocalizedPrice[] {
  const { multiplier, label } = getRegionalMultiplier(zip);
  return MATERIAL_DB
    .filter((m) => !category || m.name.toLowerCase().includes(category.toLowerCase()))
    .map((m) => ({
      ...m,
      localPrice: Math.round(m.basePrice * multiplier * 100) / 100,
      regionName: label,
      zip,
    }));
}

/**
 * Returns a concise pricing context string to inject into AI prompts,
 * giving the model localized cost guidance for a specific trade.
 */
export function getMaterialPricingContext(zip: string, trade: string): string {
  const { multiplier, label } = getRegionalMultiplier(zip);
  const tradeKeywords: Record<string, string[]> = {
    painting:      ["paint", "primer", "roller", "tape"],
    drywall:       ["drywall", "joint", "corner", "tape", "screw"],
    roofing:       ["shingle", "felt", "drip", "ridge", "ice"],
    electrical:    ["outlet", "switch", "breaker", "romex", "box"],
    plumbing:      ["pvc", "copper", "fitting", "trap", "wax"],
    siding:        ["vinyl", "fiber", "wrap", "j-channel", "corner"],
    remodeling:    ["lvp", "tile", "underlayment", "thinset", "grout"],
    "doors-windows": ["door", "window", "weatherstrip"],
  };

  const keywords = tradeKeywords[trade] ?? [];
  const relevant = MATERIAL_DB
    .filter((m) => keywords.some((k) => m.name.toLowerCase().includes(k)))
    .slice(0, 6)
    .map((m) => `  • ${m.name}: $${(m.basePrice * multiplier).toFixed(2)} (${m.unit}) — ${m.retailer}`)
    .join("\n");

  if (!relevant) return "";

  return `\n\nCURRENT LOCAL MATERIAL PRICES (${label}, ${(multiplier * 100).toFixed(0)}% of national average):\n${relevant}\nSource: Simulated Home Depot / Lowe's regional pricing.`;
}

// ── API placeholder (for future real retailer integration) ─────────────────
/**
 * Fetch real-time pricing from Home Depot API (placeholder).
 * Replace with actual Home Depot Partner API call when credentials available.
 */
export async function fetchHomeDepotPrices(
  _zipCode: string,
  _skus: string[],
): Promise<Record<string, number>> {
  // TODO: Implement with Home Depot Partner API
  // API docs: https://www.homedepot.com/c/SF_MktplcSellerRegistration
  console.warn("Home Depot API not configured — using simulated prices.");
  return {};
}

/**
 * Fetch real-time pricing from Lowe's API (placeholder).
 * Replace with actual Lowe's API call when credentials available.
 */
export async function fetchLowesPrice(
  _zipCode: string,
  _modelNumber: string,
): Promise<number | null> {
  // TODO: Implement with Lowe's API
  console.warn("Lowe's API not configured — using simulated prices.");
  return null;
}
