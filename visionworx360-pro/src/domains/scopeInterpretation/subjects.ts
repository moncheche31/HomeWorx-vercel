/**
 * Construction subject vocabulary (EN + ES).
 *
 * ONE shared table drives both directions:
 *  - narrative text → structured scope item (trade / category / unit), and
 *  - structured scope item → ballpark pricebook key.
 *
 * Keeping a single table is what stops the app from growing a second, divergent
 * scope model. Framework free: no React, no i18n, no network.
 */

export interface ScopeSubject {
  key: string;
  /** Lowercase match terms, English and Spanish. Longest term wins. */
  terms: string[];
  tradeKey: string | null;
  categoryKey: string | null;
  subcategoryKey: string | null;
  unitKey: "each" | "linear_foot" | "square_foot" | null;
  /** Ballpark pricebook item key, or null when nothing can price it yet. */
  ballparkItemKey: string | null;
}

export const SCOPE_SUBJECTS: ScopeSubject[] = [
  {
    key: "wall",
    terms: ["partition wall", "interior wall", "wall", "walls", "muro", "pared", "paredes"],
    tradeKey: "framing", categoryKey: "structural", subcategoryKey: "framing",
    unitKey: "linear_foot", ballparkItemKey: "framing.partition_wall",
  },
  {
    key: "drywall",
    terms: ["drywall", "sheetrock", "tablaroca", "tablarroca"],
    tradeKey: "drywall", categoryKey: "interior_finishes", subcategoryKey: "drywall",
    unitKey: "square_foot", ballparkItemKey: "drywall.hang_finish",
  },
  {
    key: "insulation",
    terms: ["insulation", "aislamiento"],
    tradeKey: "insulation", categoryKey: "envelope", subcategoryKey: "insulation",
    unitKey: "square_foot", ballparkItemKey: "insulation.walls",
  },
  {
    key: "paint",
    terms: ["paint", "painting", "primer", "pintura", "pintar"],
    tradeKey: "painting", categoryKey: "interior_finishes", subcategoryKey: "paint",
    unitKey: "square_foot", ballparkItemKey: "paint.walls_ceiling",
  },
  {
    key: "flooring",
    terms: ["flooring", "floor covering", "floor", "piso", "pisos"],
    tradeKey: "flooring", categoryKey: "interior_finishes", subcategoryKey: "flooring",
    unitKey: "square_foot", ballparkItemKey: "flooring.mid",
  },
  {
    key: "tile",
    terms: ["tile", "tiling", "azulejo", "loseta"],
    tradeKey: "tile", categoryKey: "interior_finishes", subcategoryKey: "tile",
    unitKey: "square_foot", ballparkItemKey: "tile.wall",
  },
  {
    key: "trim",
    terms: ["baseboard", "base trim", "trim", "molding", "molduras", "zoclo"],
    tradeKey: "carpentry", categoryKey: "interior_finishes", subcategoryKey: "trim",
    unitKey: "linear_foot", ballparkItemKey: "trim.base",
  },
  {
    key: "door",
    terms: ["doorway", "door opening", "door", "doors", "puerta", "puertas"],
    tradeKey: "carpentry", categoryKey: "envelope", subcategoryKey: "windows_doors",
    unitKey: "each", ballparkItemKey: "door.interior",
  },
  {
    key: "window",
    terms: ["window", "windows", "ventana", "ventanas"],
    tradeKey: "carpentry", categoryKey: "envelope", subcategoryKey: "windows_doors",
    unitKey: "each", ballparkItemKey: "window.unit",
  },
  {
    key: "electrical",
    terms: [
      "recessed lighting", "light fixture", "lighting", "lights", "outlet", "outlets",
      "receptacle", "switch", "electrical", "eléctrico", "electrico", "luces", "contacto",
    ],
    tradeKey: "electrical", categoryKey: "electrical", subcategoryKey: "devices",
    unitKey: "each", ballparkItemKey: "electrical.basic",
  },
  {
    key: "bath_fixtures",
    terms: [
      "bathroom fixtures", "bathroom fixture", "plumbing fixtures", "plumbing fixture",
      "toilet", "vanity", "shower", "bathtub", "tub", "lavatory", "sink",
      "inodoro", "regadera", "ducha", "tina", "lavabo", "accesorios de baño",
    ],
    tradeKey: "plumbing", categoryKey: "fixtures_appliances", subcategoryKey: "plumbing_fixtures",
    unitKey: "each", ballparkItemKey: "bath.full_fixtures",
  },
  {
    key: "plumbing",
    terms: ["plumbing", "water line", "drain line", "plomería", "plomeria"],
    tradeKey: "plumbing", categoryKey: "plumbing", subcategoryKey: "rough_in",
    unitKey: "each", ballparkItemKey: "plumbing.nearby",
  },
  {
    key: "closet",
    terms: ["closet shelving", "shelving", "closet", "clóset", "closet"],
    tradeKey: "carpentry", categoryKey: "interior_finishes", subcategoryKey: "specialty",
    unitKey: "linear_foot", ballparkItemKey: "closet.shelving",
  },
  {
    key: "cabinets",
    terms: ["cabinetry", "cabinets", "cabinet", "gabinetes", "gabinete"],
    tradeKey: "cabinets", categoryKey: "interior_finishes", subcategoryKey: "cabinets",
    unitKey: "linear_foot", ballparkItemKey: "kitchen.cabinets_base",
  },
  {
    key: "countertops",
    terms: ["countertop", "countertops", "encimera", "encimeras"],
    tradeKey: "countertops", categoryKey: "interior_finishes", subcategoryKey: "countertops",
    unitKey: "square_foot", ballparkItemKey: "kitchen.countertop",
  },
  {
    key: "demolition",
    terms: ["demolition", "demo", "tear out", "demolición", "demolicion", "escombro"],
    tradeKey: "general", categoryKey: "site_prep", subcategoryKey: "demolition",
    /* A bare "demolition" line is not priceable on its own: the specific
       readings (interior gut, flooring, cabinets) carry the money. */
    unitKey: null, ballparkItemKey: null,
  },
  {
    key: "appliances",
    terms: ["appliance", "appliances", "refrigerator", "dishwasher", "range hood", "cooktop", "electrodomésticos", "electrodomesticos"],
    tradeKey: "general", categoryKey: "fixtures_appliances", subcategoryKey: "appliances",
    unitKey: "each", ballparkItemKey: "kitchen.appliance_install",
  },
  {
    key: "roofing",
    terms: ["roofing", "roof", "shingles", "shingle", "techado", "tejas"],
    tradeKey: "roofing", categoryKey: "envelope", subcategoryKey: "roofing",
    unitKey: "square_foot", ballparkItemKey: "roofing.shingle_replace",
  },
  {
    key: "siding",
    terms: ["siding", "hardie", "revestimiento"],
    tradeKey: "siding", categoryKey: "envelope", subcategoryKey: "siding",
    unitKey: "square_foot", ballparkItemKey: "siding.install",
  },
  {
    key: "deck",
    terms: ["deck", "decking", "terraza"],
    tradeKey: "carpentry", categoryKey: "exterior", subcategoryKey: "decking",
    unitKey: "square_foot", ballparkItemKey: "deck.decking",
  },
  {
    key: "hvac",
    terms: ["hvac", "mini-split", "mini split", "ductwork", "furnace", "climatización", "climatizacion"],
    tradeKey: "hvac", categoryKey: "mechanical", subcategoryKey: "hvac_equipment",
    unitKey: "each", ballparkItemKey: "hvac.extension",
  },
];

const ORDERED_TERMS: Array<{ term: string; subject: ScopeSubject }> = SCOPE_SUBJECTS
  .flatMap((subject) => subject.terms.map((term) => ({ term: term.toLowerCase(), subject })))
  .sort((a, b) => b.term.length - a.term.length);

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** The most specific construction subject mentioned, or null. Deterministic. */
export function subjectFor(text: string): ScopeSubject | null {
  const lower = norm(text);
  const hit = ORDERED_TERMS.find(({ term }) => lower.includes(term));
  return hit ? hit.subject : null;
}

/** Every distinct subject mentioned, most specific first. */
export function subjectsIn(text: string): ScopeSubject[] {
  const lower = norm(text);
  const found: ScopeSubject[] = [];
  for (const { term, subject } of ORDERED_TERMS) {
    if (!lower.includes(term)) continue;
    if (!found.some((s) => s.key === subject.key)) found.push(subject);
  }
  return found;
}

export function subjectByKey(key: string): ScopeSubject | null {
  return SCOPE_SUBJECTS.find((s) => s.key === key) ?? null;
}
