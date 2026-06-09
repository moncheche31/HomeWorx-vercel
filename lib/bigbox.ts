import { getLocalizedPrices } from "./materials";

/**
 * Retail Material Price Lookup
 *
 * Priority chain:
 *  1. BigBox API  (BIGBOX_API_KEY)  — Home Depot product search, most reliable
 *  2. SerpAPI     (SERPAPI_KEY)     — Home Depot via SerpAPI engine
 *  3. lib/materials.ts              — Built-in regional simulation (always available)
 *
 * Both live APIs are optional. The app works without them; it just uses
 * pre-built regional price simulation instead.
 */

export interface RetailProduct {
  title: string;
  price: number;
  unit?: string;
  brand?: string;
  sku?: string;
  retailer: "Home Depot" | "Lowe's" | "Generic";
  link?: string;
  rating?: number;
}

export interface MaterialLookupResult {
  term: string;
  zip: string;
  products: RetailProduct[];
  source: "bigbox" | "serpapi" | "simulated";
}

// ── Common search terms per trade ────────────────────────────────────────────
// Used to pre-fetch relevant prices BEFORE the AI call so prices can be
// injected into the prompt as context.
export const TRADE_SEARCH_TERMS: Record<string, string[]> = {
  painting:        ["interior latex paint gallon premium", "paint primer gallon", "paint roller 9 inch kit", "painter tape 1.5 inch"],
  roofing:         ["architectural shingles bundle", "roofing felt 15lb roll", "ice water shield roll", "drip edge galvanized"],
  drywall:         ["drywall sheet 4x8 half inch", "joint compound bucket", "drywall tape paper", "corner bead metal"],
  electrical:      ["duplex outlet 15 amp", "GFCI outlet 15 amp", "romex wire 12/2", "single pole switch"],
  plumbing:        ["PVC pipe 3 inch", "copper pipe 3/4 inch", "SharkBite fitting coupler", "toilet wax ring kit"],
  siding:          ["vinyl siding double 4 inch", "house wrap 9x150", "vinyl j-channel", "fiber cement plank"],
  "doors-windows": ["prehung exterior door", "window replacement double hung", "door lockset", "weatherstrip door"],
  remodeling:      ["luxury vinyl plank flooring", "ceramic tile 12x12", "thinset mortar 50lb", "underlayment roll"],
};

// ── BigBox API (Home Depot) ──────────────────────────────────────────────────
async function searchBigBox(
  apiKey: string,
  term: string,
  zip: string,
): Promise<RetailProduct[]> {
  const url = new URL("https://api.bigboxapi.com/v2/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("type", "search");
  url.searchParams.set("search_term", term);
  url.searchParams.set("zip_code", zip);
  url.searchParams.set("sort_by", "best_match");

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`BigBox ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const data = await res.json() as {
    search_results?: Array<{
      product?: {
        title?: string;
        price_raw?: number;
        unit?: string;
        brand?: string;
        model_number?: string;
        link?: string;
        rating?: number;
      };
    }>;
  };

  return (data.search_results ?? []).slice(0, 4).flatMap((r) => {
    const p = r.product;
    if (!p || !p.title || (p.price_raw ?? 0) <= 0) return [];
    return [{
      title: p.title,
      price: p.price_raw ?? 0,
      unit: p.unit,
      brand: p.brand,
      sku: p.model_number,
      retailer: "Home Depot" as const,
      link: p.link,
      rating: p.rating,
    }];
  });
}

// ── SerpAPI Home Depot engine ────────────────────────────────────────────────
async function searchSerpAPI(
  apiKey: string,
  term: string,
  zip: string,
): Promise<RetailProduct[]> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "home_depot");
  url.searchParams.set("q", term);
  url.searchParams.set("delivery_zip", zip);
  url.searchParams.set("api_key", apiKey);

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok) {
    throw new Error(`SerpAPI ${res.status}: ${await res.text().catch(() => "")}`);
  }

  const data = await res.json() as {
    products?: Array<{
      title?: string;
      price?: number;
      brand?: string;
      product_id?: string;
      link?: string;
      rating?: number;
    }>;
  };

  return (data.products ?? []).slice(0, 4).flatMap((p) => {
    if (!p.title || (p.price ?? 0) <= 0) return [];
    return [{
      title: p.title,
      price: p.price ?? 0,
      brand: p.brand,
      sku: p.product_id,
      retailer: "Home Depot" as const,
      link: p.link,
      rating: p.rating,
    }];
  });
}

// ── Simulated fallback ───────────────────────────────────────────────────────
async function searchSimulated(term: string, zip: string): Promise<RetailProduct[]> {
  const keyword = term.split(" ")[0].toLowerCase();
  const matches = getLocalizedPrices(zip, keyword).slice(0, 3);
  return matches.map((m) => ({
    title: m.name,
    price: m.localPrice,
    unit: m.unit,
    retailer: m.retailer as "Home Depot" | "Lowe's",
  }));
}

// ── Single-term lookup with fallback chain ───────────────────────────────────
export async function lookupMaterialPrice(
  term: string,
  zip: string,
  bigboxKey?: string,
  serpapiKey?: string,
): Promise<MaterialLookupResult> {
  if (bigboxKey) {
    try {
      const products = await searchBigBox(bigboxKey, term, zip);
      if (products.length > 0) return { term, zip, products, source: "bigbox" };
    } catch (err) {
      console.warn("[BigBox] lookup failed for:", term, (err as Error).message);
    }
  }

  if (serpapiKey) {
    try {
      const products = await searchSerpAPI(serpapiKey, term, zip);
      if (products.length > 0) return { term, zip, products, source: "serpapi" };
    } catch (err) {
      console.warn("[SerpAPI] lookup failed for:", term, (err as Error).message);
    }
  }

  const products = await searchSimulated(term, zip);
  return { term, zip, products, source: "simulated" };
}

// ── Batch lookup (max concurrency = 3 to avoid rate limiting) ───────────────
export async function lookupTradeMaterials(
  trade: string,
  zip: string,
  bigboxKey?: string,
  serpapiKey?: string,
): Promise<MaterialLookupResult[]> {
  const terms = (TRADE_SEARCH_TERMS[trade] ?? []).slice(0, 4);
  if (terms.length === 0) return [];

  // Run up to 3 at a time
  const results: MaterialLookupResult[] = [];
  for (let i = 0; i < terms.length; i += 3) {
    const batch = terms.slice(i, i + 3);
    const settled = await Promise.allSettled(
      batch.map((t) => lookupMaterialPrice(t, zip, bigboxKey, serpapiKey)),
    );
    for (const r of settled) {
      if (r.status === "fulfilled") results.push(r.value);
    }
  }
  return results;
}

// ── Format for AI prompt injection ──────────────────────────────────────────
export function formatMaterialContext(
  results: MaterialLookupResult[],
  lang: "en" | "es" = "en",
): string {
  const lines: string[] = [];
  for (const r of results) {
    if (r.products.length === 0) continue;
    const best = r.products[0];
    if (best.price <= 0) continue;
    const unit = best.unit ? ` / ${best.unit}` : "";
    const liveTag = r.source !== "simulated" ? " (LIVE)" : " (est.)";
    lines.push(`  • ${best.title}: $${best.price.toFixed(2)}${unit} — ${best.retailer}${liveTag}`);
  }
  if (lines.length === 0) return "";

  const header = lang === "es"
    ? "PRECIOS ACTUALES DE MATERIALES EN TU ÁREA:"
    : "CURRENT LOCAL MATERIAL PRICES:";
  return `\n\n${header}\n${lines.join("\n")}`;
}
