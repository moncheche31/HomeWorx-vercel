/**
 * Local Labor Rate Engine
 *
 * Baseline rates are derived from BLS Occupational Employment & Wage Statistics
 * (OES) 2023 annual survey — national medians for the relevant occupation codes.
 *
 * IMPORTANT: These are EMPLOYEE median hourly wages.
 * Contractor BILLING rates are calculated as:
 *   billing_rate = employee_wage × overhead_multiplier × regional_multiplier
 *
 * Overhead multiplier accounts for: liability insurance (~15%), workers' comp
 * (~10%), self-employment tax (~15%), equipment, vehicles, profit margin (~20%).
 * Typical range: 1.8 – 2.6×. We default to 2.2×.
 *
 * Data source: https://www.bls.gov/oes/current/oes_nat.htm (May 2023)
 */

export interface LaborRateResult {
  trade: string;
  /** Suggested contractor billing rate ($/hr) */
  billingRate: number;
  /** Range: [low, high] */
  billingRateRange: [number, number];
  /** BLS median worker wage for reference */
  blsMedianWage: number;
  /** MSA / region name */
  regionName: string;
  /** Regional multiplier applied */
  regionalMultiplier: number;
  /** BLS occupation code */
  blsCode: string;
  /** Data vintage */
  dataYear: 2023;
  source: "bls_embedded";
}

// ── BLS OES 2023 national medians by trade ───────────────────────────────────
const TRADE_BLS: Record<string, {
  blsCode: string;
  occupation: string;
  medianHourly: number; // national median worker wage
  overheadMultiplier: number; // worker wage → contractor billing rate
}> = {
  painting:        { blsCode: "47-2141", occupation: "Painters, Construction and Maintenance", medianHourly: 22.73, overheadMultiplier: 2.2 },
  roofing:         { blsCode: "47-2181", occupation: "Roofers", medianHourly: 23.22, overheadMultiplier: 2.4 },
  siding:          { blsCode: "47-2053", occupation: "Insulation/Siding Workers", medianHourly: 25.00, overheadMultiplier: 2.2 },
  "doors-windows": { blsCode: "47-2031", occupation: "Carpenters", medianHourly: 24.18, overheadMultiplier: 2.2 },
  plumbing:        { blsCode: "47-2152", occupation: "Plumbers, Pipefitters & Steamfitters", medianHourly: 30.08, overheadMultiplier: 2.6 },
  electrical:      { blsCode: "47-2111", occupation: "Electricians", medianHourly: 30.11, overheadMultiplier: 2.6 },
  drywall:         { blsCode: "47-2081", occupation: "Drywall & Ceiling Tile Installers", medianHourly: 22.84, overheadMultiplier: 2.1 },
  remodeling:      { blsCode: "47-2031", occupation: "Carpenters / General Contractors", medianHourly: 26.50, overheadMultiplier: 2.3 },
};

// ── Metro area regional multipliers ─────────────────────────────────────────
// Derived from BLS OES area wage tables vs. national average.
// Key: 3-digit ZIP prefix(es), value: { multiplier, city label }
const METRO_MULTIPLIERS: Array<{
  prefixes: string[];
  multiplier: number;
  city: string;
}> = [
  // New York / Tri-State Metro (+40-48%)
  { prefixes: ["100","101","102","103","104","110","111","112","113","114"], multiplier: 1.46, city: "New York City, NY" },
  { prefixes: ["070","071","072","073","074","075","076","077","078","079"], multiplier: 1.35, city: "Northern New Jersey" },
  { prefixes: ["200","201","202","203","204","205","206","207","208","209"], multiplier: 1.28, city: "Washington DC Metro" },
  // California (+28-45%)
  { prefixes: ["940","941","942","943","944","945","946","947","948","949"], multiplier: 1.44, city: "San Francisco Bay Area, CA" },
  { prefixes: ["900","901","902","903","904","905","906","907","908","909"], multiplier: 1.32, city: "Los Angeles, CA" },
  { prefixes: ["919","920","921","922"], multiplier: 1.28, city: "San Diego, CA" },
  { prefixes: ["916","917","918"], multiplier: 1.20, city: "Sacramento, CA" },
  // Pacific Northwest (+28-34%)
  { prefixes: ["980","981","982","983","984","985"], multiplier: 1.32, city: "Seattle, WA" },
  { prefixes: ["970","971","972","973","974","975"], multiplier: 1.24, city: "Portland, OR" },
  // Northeast
  { prefixes: ["021","022","023","024","025","026","027","028","029"], multiplier: 1.30, city: "Boston, MA" },
  { prefixes: ["191","192","193","194","195","196"], multiplier: 1.22, city: "Philadelphia, PA" },
  { prefixes: ["220","221","222","223","224","225","226"], multiplier: 1.25, city: "Northern Virginia" },
  { prefixes: ["210","211","212","213","214"], multiplier: 1.18, city: "Baltimore, MD" },
  // Midwest
  { prefixes: ["606","607","608","601","602","603","604","605"], multiplier: 1.18, city: "Chicago, IL" },
  { prefixes: ["480","481","482","483","484","485"], multiplier: 1.08, city: "Detroit, MI" },
  { prefixes: ["441","442","443","444"], multiplier: 1.03, city: "Cleveland, OH" },
  { prefixes: ["612","613","614","615"], multiplier: 1.05, city: "Minneapolis, MN" },
  // South
  { prefixes: ["770","771","772","773","774","775","776","777"], multiplier: 1.08, city: "Houston, TX" },
  { prefixes: ["750","751","752","753","754","755","756","757"], multiplier: 1.05, city: "Dallas-Fort Worth, TX" },
  { prefixes: ["780","781","782","783","784","785","786","787","788"], multiplier: 1.00, city: "San Antonio, TX" },
  { prefixes: ["730","731","732","733","734","735","736","737","738"], multiplier: 1.02, city: "Oklahoma City, OK" },
  { prefixes: ["300","301","302","303","304","305","306","307","308","309"], multiplier: 1.02, city: "Atlanta, GA" },
  { prefixes: ["330","331","332","333","334","335","336","337","338","339"], multiplier: 1.08, city: "Miami-Fort Lauderdale, FL" },
  { prefixes: ["320","321","322","323","324","325","326","327","328","329"], multiplier: 1.00, city: "Jacksonville, FL" },
  { prefixes: ["370","371","372","373","374","375","376","377","378","379"], multiplier: 0.97, city: "Nashville, TN" },
  { prefixes: ["350","351","352","353","354","355","356","357","358","359"], multiplier: 0.95, city: "Birmingham, AL" },
  // Mountain West
  { prefixes: ["800","801","802","803","804","805","806","807","808","809"], multiplier: 1.12, city: "Denver, CO" },
  { prefixes: ["850","851","852","853","854","855","856","857","858","859"], multiplier: 1.03, city: "Phoenix, AZ" },
  { prefixes: ["890","891","892","893","894","895"], multiplier: 1.10, city: "Las Vegas, NV" },
  { prefixes: ["840","841","842","843","844","845","846","847"], multiplier: 1.00, city: "Salt Lake City, UT" },
  // Hawaii / Alaska (high COL)
  { prefixes: ["967","968","969"], multiplier: 1.50, city: "Honolulu, HI" },
  { prefixes: ["995","996","997","998","999"], multiplier: 1.35, city: "Alaska" },
];

// First-digit fallbacks when no 3-digit match
const FIRST_DIGIT_DEFAULTS: Record<string, { multiplier: number; city: string }> = {
  "0": { multiplier: 1.08, city: "New England" },
  "1": { multiplier: 1.18, city: "Northeast US" },
  "2": { multiplier: 1.10, city: "Mid-Atlantic / Southeast" },
  "3": { multiplier: 1.00, city: "Southeast US" },
  "4": { multiplier: 1.00, city: "Midwest" },
  "5": { multiplier: 0.97, city: "Upper Midwest" },
  "6": { multiplier: 1.05, city: "Midwest" },
  "7": { multiplier: 1.02, city: "South-Central US" },
  "8": { multiplier: 1.08, city: "Mountain West" },
  "9": { multiplier: 1.22, city: "Western US" },
};

// ── Core lookup function ─────────────────────────────────────────────────────
export function getLaborRate(trade: string, zip: string): LaborRateResult {
  const bls = TRADE_BLS[trade] ?? TRADE_BLS["remodeling"];
  const clean = (zip || "00000").replace(/\D/g, "").padEnd(5, "0");

  // 3-digit prefix match
  let regional = { multiplier: 1.0, city: "National Average" };
  const prefix3 = clean.slice(0, 3);
  for (const metro of METRO_MULTIPLIERS) {
    if (metro.prefixes.includes(prefix3)) {
      regional = { multiplier: metro.multiplier, city: metro.city };
      break;
    }
  }
  // If no match, use first-digit fallback
  if (regional.city === "National Average") {
    const fd = FIRST_DIGIT_DEFAULTS[clean[0]];
    if (fd) regional = fd;
  }

  const baseRate = bls.medianHourly * bls.overheadMultiplier * regional.multiplier;
  // Round to nearest $5 for cleaner numbers
  const billingRate = Math.round(baseRate / 5) * 5;
  const low  = Math.round((baseRate * 0.85) / 5) * 5;
  const high = Math.round((baseRate * 1.25) / 5) * 5;

  return {
    trade,
    billingRate,
    billingRateRange: [low, high],
    blsMedianWage: bls.medianHourly,
    regionName: regional.city,
    regionalMultiplier: regional.multiplier,
    blsCode: bls.blsCode,
    dataYear: 2023,
    source: "bls_embedded",
  };
}

/** Format labor context for injection into AI estimate prompt */
export function formatLaborContext(rate: LaborRateResult, lang: "en" | "es" = "en"): string {
  if (lang === "es") {
    return `\n\nTARIFA DE MANO DE OBRA LOCAL (${rate.regionName}):
  • Tarifa típica del contratista: $${rate.billingRate}/hora
  • Rango de mercado: $${rate.billingRateRange[0]}–$${rate.billingRateRange[1]}/hora
  • Basado en datos BLS OES 2023 (Código ${rate.blsCode}) con ajuste regional de ${Math.round((rate.regionalMultiplier - 1) * 100)}%
  • Usa estas tarifas para calcular los costos de mano de obra en las líneas de la estimación.`;
  }
  return `\n\nLOCAL LABOR RATES (${rate.regionName}):
  • Typical contractor billing rate: $${rate.billingRate}/hr
  • Local market range: $${rate.billingRateRange[0]}–$${rate.billingRateRange[1]}/hr
  • Source: BLS OES 2023 (Code ${rate.blsCode}), regional adj. ${Math.round((rate.regionalMultiplier - 1) * 100 >= 0 ? (rate.regionalMultiplier - 1) * 100 : 0)}%
  • Use these rates when calculating labor hours and costs in the estimate line items.`;
}
