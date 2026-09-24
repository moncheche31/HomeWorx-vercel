/**
 * ASSEMBLY EXPANSION — engine core (plain module, no server-fn declarations).
 *
 * Three responsibilities, deliberately separated:
 *   1. `runExpansion`      — cache-first component list for one estimate line.
 *   2. `runReview`         — contractor include/exclude + quantity edits.
 *   3. `materializeExpansion` — turn REVIEWED components into real priced
 *      child lines, priced exclusively by the Part 1 book matcher and the
 *      existing location/labor-rate pipeline.
 *
 * The model never supplies money or hours. Every dollar on a child line comes
 * from `cost_reference_nce2026` through `apply_book_line_pricing`,
 * `apply_book_labor_rates` and `apply_location_equipment_factor`.
 *
 * Double counting is prevented structurally: a component whose book row is the
 * SAME row the parent line already prices from is skipped, so the parent keeps
 * owning the primary work and children only add the missing assembly steps.
 */

import {
  EXPANSION_PROMPT_VERSION,
  INCLUSION_KINDS,
  QUANTITY_BASES,
  expansionSignature,
  expansionTradeForLine,
  isExpansionEnabledForTrade,
} from "./assemblyExpansion.shared";
import {
  type AssemblyGeometry,
  type QuantitySource,
  parseAssemblyGeometry,
  parseComponentQuantities,
  resolveComponentQuantity,
} from "./assemblyQuantities";
import { applyTerminologyMemory, inferCorrectionContext } from "@/domains/terminologyMemory";
import {
  bumpTerminologyCorrectionUse,
  loadActiveTerminologyCorrections,
} from "@/features/terminology/services/terminologyMemory.server";



export type SB = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const msg = (e: unknown, fallback: string) => (e as { message?: string } | null)?.message ?? fallback;

export interface BookCandidateDTO {
  referenceId: number;
  description: string;
  unit: string | null;
  section: string | null;
  score: number;
  isAmbiguous: boolean;
  material: number | null;
  labor: number | null;
  craftHours: string | null;
}

export interface ExpansionComponentDTO {
  id: string;
  sequence: number;
  name: string;
  searchTerms: string[];
  typicalUnit: string | null;
  inclusion: (typeof INCLUSION_KINDS)[number];
  quantityBasis: (typeof QUANTITY_BASES)[number];
  reason: string | null;
  isIncluded: boolean;
  quantity: number | null;
  isContractorAuthored: boolean;
  bookMatch: {
    referenceId: number;
    description: string;
    unit: string | null;
    section: string | null;
    score: number;
    isAmbiguous: boolean;
    /** True when the contractor picked this row from ambiguous candidates. */
    isContractorSelected: boolean;
    /** True when the engine picked a sound-but-borderline row on its own. */
    isSystemResolved?: boolean;

  } | null;
  /** Alternative book rows the contractor may pick from when the match is unsure. */
  bookCandidates: BookCandidateDTO[];
  /** The book row the contractor explicitly chose, if any. */
  selectedReferenceId: number | null;
  /** Quantity resolved for THIS line: entered, calculated, or still needed. */
  resolvedQuantity: number | null;
  quantitySource: QuantitySource;
  /** Plain-language derivation shown next to a calculated quantity. */
  quantityDerivation: string;
  /** Geometry inputs that would unlock a calculated quantity. */
  quantityNeeds: (keyof AssemblyGeometry)[];
  /** Whole dollars already on the estimate, or the book preview before approval. */
  estimatedCost: number | null;
  /** Where that dollar figure comes from, so the panel never implies precision. */
  costSource: "materialized" | "book_preview" | "estimate_on_approval" | "none";
  /** True when no defensible default exists, so the component starts switched off. */
  autoExcludedNoQuantity: boolean;
}


export interface AssemblyExpansionDTO {
  id: string;
  tradeKey: string;
  scopePhrase: string;
  assemblyLabel: string;
  model: string;
  promptVersion: string;
  reviewStatus: "unreviewed" | "reviewed";
  isContractorEdited: boolean;
  origin: "cache" | "generated" | "unavailable";
  error: string | null;
  components: ExpansionComponentDTO[];
  /** Takeoff numbers entered for the estimate line this DTO was loaded for. */
  lineGeometry: AssemblyGeometry;
  /** True once this line's own quantities/geometry were reviewed here. */
  lineReviewed: boolean;
  /**
   * True when the parent line's OWN quantity is an assumption rather than a
   * measurement. Every component derived from it inherits that uncertainty and
   * must say so — a derived number is never firmer than its base.
   */
  parentQuantityIsPlaceholder: boolean;
  /** Pricing tier this line is being estimated at. */
  mode: "ballpark" | "detailed";

}

export interface MaterializeResult {
  estimateId: string;
  parentLineId: string;
  componentsIncluded: number;
  linesCreated: number;
  pricedFromBook: number;
  /** Borderline book rows the engine resolved on its own judgment. */
  systemResolved: number;
  /** Components priced with a labelled AI material estimate (no book row). */
  materialEstimated: number;
  contractorResolved: number;
  flaggedNeedsData: number;

  skippedSameAsParent: number;
  /** Components the parent's own full-scope price already covers. */
  skippedCoveredByParent: number;
}

const mapComponent = (r: Record<string, unknown>): ExpansionComponentDTO => ({
  id: String(r.id),
  sequence: Number(r.sequence),
  name: String(r.name),
  searchTerms: (r.search_terms as string[] | null) ?? [],
  typicalUnit: (r.typical_unit as string | null) ?? null,
  inclusion: r.inclusion as ExpansionComponentDTO["inclusion"],
  quantityBasis: r.quantity_basis as ExpansionComponentDTO["quantityBasis"],
  reason: (r.reason as string | null) ?? null,
  isIncluded: r.is_included === true,
  quantity: r.quantity == null ? null : Number(r.quantity),
  isContractorAuthored: r.is_contractor_authored === true,
  bookMatch: null,
  bookCandidates: [],
  selectedReferenceId: r.selected_reference_id == null ? null : Number(r.selected_reference_id),
  resolvedQuantity: null,
  quantitySource: "needs_input",
  quantityDerivation: "",
  quantityNeeds: [],
  estimatedCost: null,
  costSource: "none",
  autoExcludedNoQuantity: false,
});


/**
 * Bind a shared (cached) expansion to ONE estimate line: pre-fill every
 * quantity that can be calculated from that line's own measured quantity and
 * takeoff numbers, and mark the rest as needing a single input.
 *
 * Nothing here reads another project. The cached expansion supplies the
 * component LIST only; every number comes from this line.
 */
export async function applyLineContext(
  sb: SB,
  estimateLineId: string,
  dto: AssemblyExpansionDTO,
): Promise<void> {
  const { data: line } = await sb
    .from("estimate_line_items")
    .select(
      "estimate_id, trade_key, quantity, unit_key, assembly_geometry, assembly_component_quantities, assembly_expansion_status, is_quantity_placeholder",
    )
    .eq("id", estimateLineId)
    .maybeSingle();

  /* Ballpark fills every gap with a standard industry ratio; a detailed
     estimate holds out for the contractor's own measurement. */
  let mode: "ballpark" | "detailed" = "ballpark";
  if (line?.estimate_id) {
    const { data: est } = await sb
      .from("estimates")
      .select("intake_mode")
      .eq("id", line.estimate_id)
      .maybeSingle();
    mode = String(est?.intake_mode ?? "") === "detailed" ? "detailed" : "ballpark";
  }

  const geometry = parseAssemblyGeometry(line?.assembly_geometry);
  const entered = parseComponentQuantities(line?.assembly_component_quantities);
  dto.lineGeometry = geometry;
  dto.lineReviewed = line?.assembly_expansion_status === "reviewed";
  dto.parentQuantityIsPlaceholder = line?.is_quantity_placeholder === true;
  dto.mode = mode;

  for (const c of dto.components) {
    const resolved = resolveComponentQuantity({
      quantityBasis: c.quantityBasis,
      entered: entered[c.id] ?? null,
      parentQuantity: line?.quantity == null ? null : Number(line.quantity),
      parentUnitKey: (line?.unit_key as string | null) ?? null,
      geometry,
      mode,
      tradeKey: (line?.trade_key as string | null) ?? dto.tradeKey,
    });
    c.resolvedQuantity = resolved.quantity;
    c.quantitySource = resolved.source;
    c.quantityDerivation = resolved.derivation;
    c.quantityNeeds = resolved.needs;

    /* NO BLANK BOX, EVER. A component the app cannot default honestly (a
       steep-pitch adder, a valley length on an unseen roof) is switched OFF
       instead of demanding a number before the contractor can approve. He can
       still tick it on and type the one figure if this job has that work. */
    if (resolved.quantity == null) {
      c.autoExcludedNoQuantity = true;
      c.isIncluded = false;
    }
  }

  await attachComponentCosts(sb, estimateLineId, dto, {
    tradeKey: (line?.trade_key as string | null) ?? dto.tradeKey,
  });
}

/**
 * PRICE IS PART OF THE REVIEW, NOT A REWARD FOR FINISHING IT.
 *
 * Once components are materialized, the real child-line cost is shown. Before
 * that, the book row and this line's quantity give a preview at the same unit
 * money the materializer will use, so the contractor is looking at dollars the
 * first time he opens the panel rather than a parts list with empty boxes.
 */
async function attachComponentCosts(
  sb: SB,
  estimateLineId: string,
  dto: AssemblyExpansionDTO,
  ctx: { tradeKey: string },
): Promise<void> {
  const { data: kids } = await sb
    .from("estimate_line_items")
    .select("assembly_component_id, direct_cost")
    .eq("parent_line_id", estimateLineId)
    .is("archived_at", null);
  const actual = new Map<string, number>();
  for (const k of ((kids as Record<string, unknown>[] | null) ?? [])) {
    if (k.assembly_component_id) {
      actual.set(String(k.assembly_component_id), Number(k.direct_cost ?? 0));
    }
  }

  for (const c of dto.components) {
    const hit = actual.get(c.id);
    if (hit != null) {
      c.estimatedCost = Math.round(hit);
      c.costSource = "materialized";
      continue;
    }
    const preview = previewComponentCost(c, ctx.tradeKey);
    if (preview != null) {
      c.estimatedCost = preview;
      c.costSource = "book_preview";
    } else if (c.resolvedQuantity != null) {
      /* No book row: the material is estimated at approval and labelled "Est." */
      c.estimatedCost = null;
      c.costSource = "estimate_on_approval";
    }
  }
}

/**
 * Book-priced preview for one component, using the same unit conversions the
 * materializer applies, so the number the contractor approves is the number he
 * saw. Returns null when there is no priced book row to preview.
 */
export function previewComponentCost(
  c: ExpansionComponentDTO,
  tradeKey: string,
): number | null {
  const qty0 = c.resolvedQuantity;
  if (qty0 == null || qty0 <= 0 || !c.bookMatch) return null;
  const row = c.bookCandidates.find((r) => r.referenceId === c.bookMatch!.referenceId);
  if (!row) return null;
  const craftHrs = Number(/@\s*([\d.]+)/.exec(row.craftHours ?? "")?.[1] ?? 0);
  const unitLabor = Math.max(row.labor ?? 0, (Number.isFinite(craftHrs) ? craftHrs : 0) * 60);
  const unitCost = (row.material ?? 0) + unitLabor;
  if (unitCost <= 0) return null;

  const basisUnit =
    c.quantityBasis === "same_as_parent" || c.quantityBasis === "factor"
      ? null
      : (BASIS_UNIT[c.quantityBasis] ?? null);
  const consumable = consumableQuantity(c.name, qty0, {
    tradeKey,
    parentUnit: basisUnit ?? "square_foot",
  });
  const roll = basisUnit === "linear_foot" ? rollCoverageSf(c.name, qty0) : null;
  const qty = consumable ? consumable.quantity : (roll ?? qty0);
  return Math.round(unitCost * qty);
}





export async function loadExpansion(
  sb: SB,
  id: string,
  origin: AssemblyExpansionDTO["origin"],
): Promise<AssemblyExpansionDTO> {
  const { data: head, error } = await sb
    .from("assembly_expansions")
    .select("id, trade_key, scope_phrase, assembly_label, model, prompt_version, review_status, is_contractor_edited")
    .eq("id", id)
    .single();
  if (error || !head) throw new Error(msg(error, "Expansion not found"));
  const { data: rows } = await sb
    .from("assembly_expansion_components")
    .select("*")
    .eq("expansion_id", id)
    .order("sequence", { ascending: true });
  return {
    id: String(head.id),
    tradeKey: String(head.trade_key),
    scopePhrase: String(head.scope_phrase),
    assemblyLabel: String(head.assembly_label),
    model: String(head.model),
    promptVersion: String(head.prompt_version),
    reviewStatus: head.review_status as "unreviewed" | "reviewed",
    isContractorEdited: head.is_contractor_edited === true,
    origin,
    error: null,
    components: ((rows ?? []) as Record<string, unknown>[]).map(mapComponent),
    lineGeometry: {},
    lineReviewed: false,
    parentQuantityIsPlaceholder: false,
    mode: "ballpark",
  };

}

/** Book units map onto the app's scope units; unknown units stay `each`. */
const UNIT_MAP: Record<string, string> = {
  sf: "square_foot",
  csf: "square_foot",
  msf: "square_foot",
  sq: "square_foot",
  sy: "square_foot",
  lf: "linear_foot",
  clf: "linear_foot",
  mlf: "linear_foot",
  ea: "each",
  each: "each",
  set: "each",
  pr: "each",
  cy: "cubic_yard",
  cf: "cubic_foot",
  bf: "board_foot",
  gal: "gallon",
  lb: "pound",
  hr: "hour",
  day: "day",
  ls: "lump_sum",
  sheet: "sheet",
};

const scopeUnitForBookUnit = (unit: string | null): string => {
  const key = (unit ?? "").trim().toLowerCase().replace(/[^a-z]/g, "");
  return UNIT_MAP[key] ?? "each";
};

/** Scope unit implied by a component's quantity basis, when it is determinate. */
const BASIS_UNIT: Record<string, string> = {
  eave_lf: "linear_foot",
  ridge_lf: "linear_foot",
  perimeter_lf: "linear_foot",
  corner_lf: "linear_foot",
  wall_sf: "square_foot",
  per_penetration: "each",
  opening_count: "each",
};

const STOPWORDS = new Set([
  "and", "the", "with", "for", "per", "system", "material", "materials", "standard",
  "install", "installed", "installation", "type", "size", "grade", "each", "including",
]);

const distinctTokens = (s: string): string[] =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));

/**
 * SYSTEM RESOLUTION OF A BORDERLINE BOOK MATCH.
 *
 * The strict auto-match threshold exists to stop nonsense from being priced.
 * It is not a reason to leave a component at zero when the right book row is
 * obvious from its description. This encodes the judgment a estimator makes by
 * eye, and only accepts a candidate when ALL of it holds:
 *
 *   1. the candidate's description shares a distinctive word with the
 *      component's name or search terms (no cross-trade coincidences);
 *   2. the book row actually carries a price or craft hours;
 *   3. the row's unit family agrees with the component's quantity basis, or is
 *      the one honest conversion (a length takeoff onto piece-priced trim).
 *
 * A row chosen this way is recorded as `system_resolved`, never as a clean
 * auto-match and never as a contractor pick.
 */
export function systemMatchIsSound(
  component: Pick<ExpansionComponentDTO, "name" | "searchTerms" | "quantityBasis">,
  candidate: BookCandidateDTO,
): boolean {
  const wanted = new Set([
    ...distinctTokens(component.name),
    ...component.searchTerms.flatMap(distinctTokens),
  ]);
  if (wanted.size === 0) return false;

  const shares = distinctTokens(candidate.description).some((t) =>
    [...wanted].some((w) => w === t || w.startsWith(t) || t.startsWith(w)),
  );
  if (!shares) return false;

  const hasPrice =
    (candidate.material ?? 0) > 0 || (candidate.labor ?? 0) > 0 || !!candidate.craftHours;
  if (!hasPrice) return false;

  const basisUnit = BASIS_UNIT[component.quantityBasis] ?? null;
  if (basisUnit) {
    const rowUnit = scopeUnitForBookUnit(candidate.unit);
    const pieceConvertible = basisUnit === "linear_foot" && rowUnit === "each";
    if (basisUnit !== rowUnit && !pieceConvertible) return false;
  }
  return true;
}

/* Book rows that only exist on one side of the building envelope. Baseboard
   and casing are interior-only; fascia, soffit and decking are exterior-only.
   A roofing component must never bind to a fire-alarm row either — that is the
   same failure: a book row from a section the work cannot belong to. */
const INTERIOR_ONLY_ROW =
  /\bbaseboard|\bcasing\b|\bcrown mould|\bcrown mold|\bchair rail\b|\bwainscot|\bcloset\b|\bstair skirt\b|\bdrywall\b|\binterior door\b/i;
const EXTERIOR_ONLY_ROW =
  /\bfascia\b|\bsoffit\b|\brake board\b|\bdeck(ing)?\b|\bsiding\b|\broofing\b|\bshingle|\bgutter\b|\bexterior\b/i;
const EXTERIOR_CONTEXT =
  /\b(exterior|outdoor|outside|deck|porch|patio|fascia|soffit|siding|roof|vinyl|pvc|azek|composite|hardie|fiber ?cement|aluminum)\b/i;
const INTERIOR_CONTEXT =
  /\b(interior|indoor|baseboard|casing|crown|wainscot|room|closet|drywall|ceiling)\b/i;

/**
 * True when the book row belongs to the opposite side of the envelope from the
 * work being priced. Pure, so it is testable on its own: exterior deck trim can
 * never price from an interior baseboard/casing row, and vice versa.
 */
export function bookRowContextConflicts(
  component: Pick<ExpansionComponentDTO, "name" | "searchTerms">,
  candidate: Pick<BookCandidateDTO, "description" | "section">,
): boolean {
  const context = [component.name, ...component.searchTerms].join(" ");
  const row = `${candidate.description} ${candidate.section ?? ""}`;
  const wantsExterior = EXTERIOR_CONTEXT.test(context);
  const wantsInterior = INTERIOR_CONTEXT.test(context);
  if (wantsExterior && !wantsInterior && INTERIOR_ONLY_ROW.test(row) && !EXTERIOR_ONLY_ROW.test(row)) {
    return true;
  }
  if (wantsInterior && !wantsExterior && EXTERIOR_ONLY_ROW.test(row) && !INTERIOR_ONLY_ROW.test(row)) {
    return true;
  }
  return false;
}

/**
 * Attach the book row each component would price from, plus the alternative
 * candidates the contractor can choose between when the match is unsure.
 *
 * A contractor-selected row always wins and is never treated as ambiguous:
 * a human picked it, so it is an explicit selection rather than a machine guess.
 */

export async function attachBookMatches(
  sb: SB,
  tradeKey: string,
  dto: AssemblyExpansionDTO,
): Promise<void> {
  /* Correction memory is consulted FIRST, and only ever rewrites the WORDING
     we search the book with. When nothing matches, matching is byte-for-byte
     what it was before this layer existed. */
  const corrections = await loadActiveTerminologyCorrections(sb);
  const firedCorrections: string[] = [];
  const correctTerm = (value: string): string => {
    if (corrections.length === 0) return value;
    const { term, match } = applyTerminologyMemory(corrections, {
      candidateTerm: value,
      narration: `${dto.components.map((c) => `${c.name} ${c.searchTerms.join(" ")}`).join(" ")}`,
      context: inferCorrectionContext(value),
      tradeKey,
    });
    if (match) firedCorrections.push(match.correction.id);
    return term;
  };

  /* Book descriptions are terse ("Drip edge, 6\" x 10'"), so a single long
     needle dilutes keyword coverage. Probe several phrasings and keep the
     strongest: an unambiguous hit always beats a higher-scoring ambiguous one. */
  const probe = async (needle: string, extra: string | null): Promise<BookCandidateDTO[]> => {
    const { data } = await sb.rpc("nce_book_lookup", {
      _description: needle,
      _category: null,
      _min_score: 0.45,
      _trade_key: tradeKey,
      _extra_terms: extra,
    });
    return ((data as Record<string, unknown>[] | null) ?? []).map((row) => ({
      referenceId: Number(row.reference_id),
      description: String(row.description),
      unit: (row.unit as string | null) ?? null,
      section: (row.section as string | null) ?? null,
      score: Number(row.score ?? 0),
      isAmbiguous: row.is_ambiguous === true,
      material: row.material == null ? null : Number(row.material),
      labor: row.labor == null ? null : Number(row.labor),
      craftHours: (row.craft_hours as string | null) ?? null,
    }));
  };

  for (const c of dto.components) {
    const name = correctTerm(c.name);
    const searchTerms = c.searchTerms.map(correctTerm);
    const needles: [string, string | null][] = [
      [name, searchTerms.join(" ")],
      [name, null],
      ...searchTerms.map((t): [string, string | null] => [t, null]),
    ];
    const all = (await Promise.all(needles.map(([n, e]) => probe(n, e)))).flat();


    const byRef = new Map<number, BookCandidateDTO>();
    for (const r of all) {
      const seen = byRef.get(r.referenceId);
      /* Same row found by two needles: keep the confident reading. */
      if (!seen || (seen.isAmbiguous && !r.isAmbiguous) || (seen.isAmbiguous === r.isAmbiguous && r.score > seen.score)) {
        byRef.set(r.referenceId, r);
      }
    }
    /* The envelope guard reads the corrected wording, so a saved correction can
       redirect which book section a component is allowed to match against. */
    const guardComponent = { name, searchTerms };
    const results = [...byRef.values()]
      /* Never offer, and never auto-pick, a row from the wrong side of the
         envelope — that is how exterior trim became baseboard and casing. */
      .filter((r) => !bookRowContextConflicts(guardComponent, r))
      .sort((a, b) => (a.isAmbiguous === b.isAmbiguous ? b.score - a.score : a.isAmbiguous ? 1 : -1));



    c.bookCandidates = results.slice(0, 4);

    const chosen = c.selectedReferenceId
      ? (results.find((r) => r.referenceId === c.selectedReferenceId) ??
        (await fetchBookRow(sb, c.selectedReferenceId)))
      : null;
    const best = results[0] ?? null;

    if (chosen) {
      c.bookMatch = {
        referenceId: chosen.referenceId,
        description: chosen.description,
        unit: chosen.unit,
        section: chosen.section,
        score: chosen.score,
        isAmbiguous: false,
        isContractorSelected: true,
      };
      if (!c.bookCandidates.some((r) => r.referenceId === chosen.referenceId)) {
        c.bookCandidates = [chosen, ...c.bookCandidates].slice(0, 4);
      }
    } else if (best && !best.isAmbiguous) {
      c.bookMatch = { ...best, isContractorSelected: false };
    } else if (best) {
      /* Borderline hit: take it only when it survives the judgment test, and
         record that the engine — not the contractor — made the call. */
      const sound = results.find((r) => systemMatchIsSound(c, r));
      c.bookMatch = sound
        ? { ...sound, isAmbiguous: false, isContractorSelected: false, isSystemResolved: true }
        : { ...best, isContractorSelected: false };
    } else {
      c.bookMatch = null;
    }

  }

  await bumpTerminologyCorrectionUse(sb, firedCorrections);
}


/** Read one book row directly, for a selection the matcher no longer surfaces. */
async function fetchBookRow(sb: SB, refId: number): Promise<BookCandidateDTO | null> {
  const { data } = await sb
    .from("cost_reference_nce2026")
    .select("id, description, unit, section, material, labor, craft_hours")
    .eq("id", refId)
    .maybeSingle();
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    referenceId: Number(r.id),
    description: String(r.description),
    unit: (r.unit as string | null) ?? null,
    section: (r.section as string | null) ?? null,
    score: 1,
    isAmbiguous: false,
    material: r.material == null ? null : Number(r.material),
    labor: r.labor == null ? null : Number(r.labor),
    craftHours: (r.craft_hours as string | null) ?? null,
  };
}


export async function linkLine(sb: SB, lineId: string, dto: AssemblyExpansionDTO): Promise<void> {
  await sb
    .from("estimate_line_items")
    .update({
      assembly_expansion_id: dto.id,
      assembly_expansion_status: dto.reviewStatus === "reviewed" ? "reviewed" : "auto_expanded_unreviewed",
    })
    .eq("id", lineId);
}

/**
 * Cache-first expansion of one estimate line.
 *
 * Lookup order: contractor-edited expansion for this signature -> unedited
 * cached expansion -> fresh model call. A contractor-edited expansion is never
 * silently overwritten.
 */
export async function runExpansion(
  sb: SB,
  input: { estimateLineId: string; userId: string; regenerate?: boolean },
): Promise<AssemblyExpansionDTO> {
  const { data: line, error: lineErr } = await sb
    .from("estimate_line_items")
    .select(
      "id, organization_id, description, trade_key, category_key, unit_key, assembly_expansion_id, pricing_provenance",
    )
    .eq("id", input.estimateLineId)
    .single();
  if (lineErr || !line) throw new Error(msg(lineErr, "Estimate line not found"));

  const tradeKey =
    expansionTradeForLine(line.trade_key as string | null, line.description as string | null) ?? "";
  if (!tradeKey) {
    throw new Error(
      `Assembly expansion is not enabled for trade "${String(line.trade_key ?? "unknown")}" yet`,
    );
  }


  const orgId = String(line.organization_id);
  const scopePhrase = String(line.description ?? "").trim();
  /* "Roofing" alone would expand into a generic asphalt roof. The book row the
     parent already prices from names the real material family (metal panel,
     shingle, membrane), so the expansion matches the roof actually being built. */
  const book = (line.pricing_provenance as Record<string, any> | null)?.bookSource ?? null;
  const provenance = (line.pricing_provenance as Record<string, any> | null) ?? null;
  const materialFamily =
    [book?.searchTerms, book?.section, book?.description ?? book?.ref, provenance?.catalogNote]
      .filter((v) => typeof v === "string" && v.trim())
      .join(" - ")
      .slice(0, 240) || null;
  const signature = expansionSignature({ tradeKey, scopePhrase, materialFamily });

  const { data: cached } = await sb
    .from("assembly_expansions")
    .select("id, is_contractor_edited")
    .eq("organization_id", orgId)
    .eq("signature", signature)
    .maybeSingle();

  /* Contractor-edited expansions are authoritative; regeneration cannot clobber them. */
  if (cached && (!input.regenerate || cached.is_contractor_edited === true)) {
    const dto = await loadExpansion(sb, String(cached.id), "cache");
    await attachBookMatches(sb, tradeKey, dto);
    await linkLine(sb, input.estimateLineId, dto);
    await applyLineContext(sb, input.estimateLineId, dto);
    return dto;
  }


  const { data: sections } = await sb.rpc("nce_section_patterns", {
    _trade_key: tradeKey,
    _category_key: (line.category_key as string | null) ?? null,
  });

  const { expandAssemblyWithModel } = await import("./assemblyExpansion.server");
  const result = await expandAssemblyWithModel({
    tradeKey,
    scopePhrase,
    unit: (line.unit_key as string | null) ?? null,
    constructionType: null,
    materialFamily,
    contextNotes: null,
    bookSections: ((sections as string[] | null) ?? [])
      .map((s) => s.replace(/%/g, "").trim())
      .filter(Boolean),
  });

  if (!result.payload) {
    /* Expansion never blocks an estimate: the line prices as it does today. */
    await sb
      .from("estimate_line_items")
      .update({ assembly_expansion_status: "not_expanded" })
      .eq("id", input.estimateLineId);
    return {
      lineGeometry: {},
      lineReviewed: false,
    parentQuantityIsPlaceholder: false,
      mode: "ballpark",
      id: "",
      tradeKey,
      scopePhrase,
      assemblyLabel: scopePhrase,
      model: result.model,
      promptVersion: EXPANSION_PROMPT_VERSION,
      reviewStatus: "unreviewed",
      isContractorEdited: false,
      origin: "unavailable",
      error: result.error,
      components: [],
    };
  }

  const { data: head, error: headErr } = await sb
    .from("assembly_expansions")
    .upsert(
      {
        organization_id: orgId,
        trade_key: tradeKey,
        signature,
        scope_phrase: scopePhrase,
        assembly_label: result.payload.assembly_label,
        model: result.model,
        prompt_version: EXPANSION_PROMPT_VERSION,
        review_status: "unreviewed",
        is_contractor_edited: false,
        created_by: input.userId,
      },
      { onConflict: "organization_id,signature" },
    )
    .select("id")
    .single();
  if (headErr || !head) throw new Error(msg(headErr, "Failed to save expansion"));

  const expansionId = String(head.id);
  await sb.from("assembly_expansion_components").delete().eq("expansion_id", expansionId);
  const { error: compErr } = await sb.from("assembly_expansion_components").insert(
    result.payload.components.map((c) => ({
      expansion_id: expansionId,
      organization_id: orgId,
      sequence: c.sequence,
      name: c.name,
      search_terms: c.search_terms,
      typical_unit: c.typical_unit,
      inclusion: c.inclusion,
      quantity_basis: c.quantity_basis,
      reason: c.reason,
      /* Ballpark safety: only 'standard' components are included by default. */
      is_included: c.inclusion === "standard",
    })),
  );
  if (compErr) {
    /* A header with no components would be cached forever as an empty
       assembly. Remove it so the next attempt regenerates cleanly. */
    await sb.from("assembly_expansions").delete().eq("id", expansionId);
    throw new Error(msg(compErr, "Failed to save expansion components"));
  }


  const dto = await loadExpansion(sb, expansionId, "generated");
  await attachBookMatches(sb, tradeKey, dto);
  await linkLine(sb, input.estimateLineId, dto);
  await applyLineContext(sb, input.estimateLineId, dto);
  return dto;
}

export interface ReviewInput {
  expansionId: string;
  /** The line being reviewed. Quantities and geometry are stored on it. */
  estimateLineId?: string;
  components: {
    id: string;
    isIncluded?: boolean;
    quantity?: number | null;
    /** Book row picked by the contractor from ambiguous candidates; null clears it. */
    selectedReferenceId?: number | null;
  }[];
  /** Takeoff numbers for this line (eave/ridge/penetrations...). */
  geometry?: AssemblyGeometry | null;
  markReviewed?: boolean;
  userId: string;
}

export async function runReview(sb: SB, data: ReviewInput): Promise<AssemblyExpansionDTO> {
  for (const c of data.components) {
    const patch: Record<string, unknown> = {};
    if (c.isIncluded !== undefined) patch.is_included = c.isIncluded;
    if (c.selectedReferenceId !== undefined) {
      patch.selected_reference_id = c.selectedReferenceId;
      patch.selected_by = c.selectedReferenceId == null ? null : data.userId;
      patch.selected_at = c.selectedReferenceId == null ? null : new Date().toISOString();
    }
    if (Object.keys(patch).length === 0) continue;

    const { error } = await sb
      .from("assembly_expansion_components")
      .update(patch)
      .eq("id", c.id)
      .eq("expansion_id", data.expansionId);
    if (error) throw new Error(msg(error, "Failed to save component review"));
  }

  /*
   * Quantities and takeoff numbers belong to THIS job, never to the shared
   * cached assembly: a ridge length from one roof must never appear on another.
   */
  if (data.estimateLineId) {
    const { data: line } = await sb
      .from("estimate_line_items")
      .select("assembly_component_quantities, assembly_geometry")
      .eq("id", data.estimateLineId)
      .maybeSingle();

    const quantities = parseComponentQuantities(line?.assembly_component_quantities) as Record<
      string,
      number | null
    >;
    for (const c of data.components) {
      if (c.quantity === undefined) continue;
      if (c.quantity == null || !(c.quantity > 0)) delete quantities[c.id];
      else quantities[c.id] = c.quantity;
    }

    const geometry = data.geometry
      ? { ...parseAssemblyGeometry(line?.assembly_geometry), ...parseAssemblyGeometry(data.geometry) }
      : parseAssemblyGeometry(line?.assembly_geometry);

    const { error } = await sb
      .from("estimate_line_items")
      .update({ assembly_component_quantities: quantities, assembly_geometry: geometry })
      .eq("id", data.estimateLineId);
    if (error) throw new Error(msg(error, "Failed to save assembly quantities"));
  }

  const headPatch: Record<string, unknown> = {};
  if (data.components.length > 0) headPatch.is_contractor_edited = true;
  if (data.markReviewed) {
    headPatch.review_status = "reviewed";
    headPatch.reviewed_by = data.userId;
    headPatch.reviewed_at = new Date().toISOString();
  }
  if (Object.keys(headPatch).length > 0) {
    const { error } = await sb.from("assembly_expansions").update(headPatch).eq("id", data.expansionId);
    if (error) throw new Error(msg(error, "Failed to save expansion review"));
  }

  const dto = await loadExpansion(sb, data.expansionId, "cache");
  await attachBookMatches(sb, dto.tradeKey, dto);
  if (data.markReviewed) {
    /* Only the reviewed line is marked; other jobs sharing the cached list
       still get their own quantities and their own approval. */
    const q = sb
      .from("estimate_line_items")
      .update({ assembly_expansion_status: "reviewed" });
    await (data.estimateLineId
      ? q.eq("id", data.estimateLineId)
      : q.eq("assembly_expansion_id", data.expansionId));
  }
  if (data.estimateLineId) await applyLineContext(sb, data.estimateLineId, dto);
  return dto;
}

/* ================= MATERIALIZATION ================= */

/**
 * CONSUMABLES ARE NOT BOUGHT BY THE SQUARE FOOT.
 *
 * A component whose own unit is a consumable unit (pounds of fasteners, tubes
 * of sealant, a disposal charge) can never take the parent's area or length
 * straight across — that is how 2,250 SF of roof became 2,250 lb of nails.
 * These are the ordinary field ratios per 100 units of the parent takeoff,
 * used as a ballpark assumption and always written on the line.
 */
interface ConsumableRule {
  test: RegExp;
  per100: number;
  min: number;
  unit: string;
  /** Only for these trades, when the ratio is a trade convention. */
  trades?: string[];
  /** Only when the parent takeoff is in one of these units. */
  parentUnits?: string[];
}

const CONSUMABLE_PER_100: ConsumableRule[] = [
  /* ---- Trade conventions first: a drywall taping ratio is not a roof's. ---- */
  {
    test: /(joint compound|taping compound|topping|drywall mud|\bmud\b)/i,
    trades: ["drywall"],
    per100: 0.45,
    min: 1,
    unit: "gallon",
  },
  { test: /\btape\b/i, trades: ["drywall"], per100: 40, min: 50, unit: "linear_foot" },
  /* Masking for a paint job: tape and film follow the painted area. */
  { test: /(masking|\btape\b|plastic|drop cloth|film|paper)/i, trades: ["painting"], per100: 25, min: 50, unit: "linear_foot" },
  /* Counted trades buy their small parts per device / per fixture. */
  {
    test: /(wire ?nut|wire connector|connector|staple|cable clamp|pigtail)/i,
    trades: ["electrical"],
    parentUnits: ["each"],
    per100: 500,
    min: 5,
    unit: "each",
  },
  {
    test: /(fitting|coupling|elbow|solder|flux|pipe strap|hanger)/i,
    trades: ["plumbing"],
    parentUnits: ["each"],
    per100: 800,
    min: 4,
    unit: "each",
  },
  /* ---- Generic field ratios ---- */
  /* Roughly a pound of fasteners per 100 SF/LF of work. */
  { test: /(fastener|nail|screw|clip|staple)/i, per100: 1, min: 1, unit: "pound" },
  /* Cartridge goods before tape: "sealant and butyl tape" is bought in tubes. */
  { test: /(sealant|caulk|adhesive|butyl)/i, per100: 0.7, min: 2, unit: "each" },
  /* House-wrap seams run about 0.15 LF of tape per SF of wall. */
  { test: /\btape\b/i, per100: 15, min: 10, unit: "linear_foot" },
  /* One disposal unit (pickup load / small container) per ~1,400 SF. */
  { test: /(disposal|debris|dumpster|haul|cleanup|clean-up)/i, per100: 0.07, min: 1, unit: "each" },
];

/**
 * Convert a parent-sized takeoff into a plausible consumable quantity and the
 * unit that consumable is actually bought in. Returns null when the component
 * is not a recognised consumable, so the caller flags a takeoff gap instead of
 * inventing a number.
 */
export function consumableQuantity(
  name: string,
  parentQty: number,
  context?: { tradeKey?: string | null; parentUnit?: string | null },
): { quantity: number; unit: string } | null {
  const trade = (context?.tradeKey ?? "").toLowerCase();
  const parentUnit = (context?.parentUnit ?? "").toLowerCase();
  const rule = CONSUMABLE_PER_100.find(
    (r) =>
      r.test.test(name) &&
      (!r.trades || r.trades.includes(trade)) &&
      (!r.parentUnits || r.parentUnits.includes(parentUnit)),
  );
  if (!rule || !(parentQty > 0)) return null;
  const raw = (parentQty / 100) * rule.per100;
  /* Things counted one at a time are bought whole: 1.58 dumpsters is not a
     purchase order. Anything measured continuously keeps its precision. */
  const rounded = rule.unit === "each" ? Math.ceil(raw) : Math.round(raw * 100) / 100;
  return { quantity: Math.max(rule.min, rounded), unit: rule.unit };
}


/**
 * ROLL GOODS ARE PRICED BY AREA AND TAKEN OFF BY LENGTH.
 *
 * Ice-and-water shield, underlayment and wrap come in 3-foot-wide rolls, so a
 * length of eave becomes square feet of coverage. One standard course is
 * assumed; the assumption is written on the line.
 */
const ROLL_GOODS = /(ice.{0,3}(and|&).{0,3}water|shield|membrane|underlayment|wrap|weather barrier)/i;
export const ROLL_WIDTH_FT = 3;

export function rollCoverageSf(name: string, lengthFt: number): number | null {
  if (!ROLL_GOODS.test(name) || !(lengthFt > 0)) return null;
  return Math.round(lengthFt * ROLL_WIDTH_FT * 100) / 100;
}





/**
 * Trim and edge metal that the book prices by the piece without stating a
 * stock length is bought in 10-foot sticks in every residential supply house.
 * Used only as a last resort so a length takeoff still converts to pieces
 * instead of collapsing to zero; the assumption is written on the line.
 */
export const DEFAULT_TRIM_PIECE_FT = 10;


/**
 * Book rows for trim-type material are sold by the PIECE of a stated length
 * ("Drip edge, 6\" x 10'"). A length takeoff is then a legitimate quantity: it
 * converts to whole pieces. Only a length that reads as a stock length (4–20
 * ft) is accepted; anything else stays a takeoff gap rather than a guess.
 */
export function pieceLengthFt(description: string | null): number | null {
  if (!description) return null;
  const feet: number[] = [];
  for (const m of description.matchAll(/(\d{1,2}(?:\.\d)?)\s*'/g)) {
    const v = Number(m[1]);
    if (v >= 4 && v <= 20) feet.push(v);
  }
  return feet.length ? Math.max(...feet) : null;
}


/**
 * Turn a REVIEWED expansion into real priced child lines.
 *
 * Only reviewed expansions may write money. Components with no book match are
 * still created, but flagged unresolved at zero so the gap is visible instead
 * of silently missing — never invented.
 */
export async function materializeExpansion(
  sb: SB,
  input: { estimateLineId: string; userId: string },
): Promise<MaterializeResult> {
  const { data: parent, error: parentErr } = await sb
    .from("estimate_line_items")
    .select("*")
    .eq("id", input.estimateLineId)
    .single();
  if (parentErr || !parent) throw new Error(msg(parentErr, "Estimate line not found"));
  if (!parent.assembly_expansion_id) throw new Error("This line has no assembly expansion");

  /* The parent may carry a bucket trade ("exterior"), which scopes the book
     matcher to nothing and drops it back to a whole-book search. Match on the
     real trade the assembly was expanded for. */
  const tradeKey =
    expansionTradeForLine(parent.trade_key as string | null, parent.description as string | null) ??
    String(parent.trade_key ?? "").toLowerCase();

  const dto = await loadExpansion(sb, String(parent.assembly_expansion_id), "cache");
  if (dto.reviewStatus !== "reviewed") {
    throw new Error("Review the assembly before adding its components to the estimate");
  }
  await attachBookMatches(sb, tradeKey, dto);
  await applyLineContext(sb, input.estimateLineId, dto);


  const estimateId = String(parent.estimate_id);
  const orgId = String(parent.organization_id);
  /* ONE location resolution, THREE separate factors (nce_location_factors).
     Book material is factored by the SQL pricing pass; an AI-estimated
     material is priced at US national supply-house pricing by the prompt, so
     it is factored HERE, exactly once, and recorded as such. The book pass
     skips these lines, so the material factor can never be applied twice. */
  const { data: locRow } = await sb.rpc("nce_location_factors", { _estimate_id: estimateId });
  const loc = (Array.isArray(locRow) ? locRow[0] : locRow) as
    | { location?: string; match_source?: string; material_factor?: number }
    | null;
  const materialFactor = Number(loc?.material_factor ?? 1) || 1;
  const parentRefId = Number(
    (parent.pricing_provenance as Record<string, any> | null)?.bookSource?.refId ?? NaN,
  );


  /* Re-materializing replaces the previous machine-made children; a child the
     contractor priced by hand is left exactly as it is. */
  await sb
    .from("estimate_line_items")
    .update({ archived_at: new Date().toISOString() })
    .eq("parent_line_id", input.estimateLineId)
    .is("archived_at", null)
    .eq("is_price_overridden", false);

  const { data: last } = await sb
    .from("estimate_line_items")
    .select("sort_order")
    .eq("estimate_id", estimateId)
    .order("sort_order", { ascending: false })
    .limit(1);
  let sort = Number((last as { sort_order: number }[] | null)?.[0]?.sort_order ?? 0) + 1;

  const included = dto.components.filter((c) => c.isIncluded);
  const rows: Record<string, unknown>[] = [];
  let skippedSameAsParent = 0;
  /* THE PARENT'S PRICE ALREADY BUYS THE TASK.
     An expanded component is an addition to a task the book already priced in
     full, so the components together can never cost more than the task itself.
     Once that budget is spent, the remaining book-priced components are left
     off rather than charged twice. */
  let skippedCoveredByParent = 0;
  let spentOnComponents = 0;
  const parentDirect = Number(parent.direct_cost ?? 0);
  /* One book row prices one component. Three different trims that all land on
     the same row would charge the same product three times. */
  const usedRefIds = new Set<number>();
  /* Components with no usable book row, collected for the material estimate. */
  const needMaterial: { index: number; name: string; unit: string }[] = [];

  for (const c of included) {
    /* Structural anti-double-count: the parent already prices this book row. */
    if (c.bookMatch && Number.isFinite(parentRefId) && c.bookMatch.referenceId === parentRefId) {
      skippedSameAsParent += 1;
      continue;
    }

    const basisUnitRaw =
      c.quantityBasis === "same_as_parent" || c.quantityBasis === "factor"
        ? String(parent.unit_key ?? "")
        : (BASIS_UNIT[c.quantityBasis] ?? null);
    const basisUnit = basisUnitRaw || null;

    /* Consumables decide their own unit: pounds of fasteners, tubes of
       sealant, feet of seam tape, a disposal charge. The takeoff unit is only
       the driver of the ratio, never the unit that gets bought. */
    const consumable =
      basisUnit === "square_foot" || basisUnit === "linear_foot" || basisUnit === "each"
        ? consumableQuantity(c.name, c.resolvedQuantity ?? 0, {
            tradeKey,
            parentUnit: basisUnit,
          })
        : null;


    const componentUnit = scopeUnitForBookUnit(c.typicalUnit);
    /* Roll goods are taken off by length and bought by area. */
    const rollTarget =
      basisUnit === "linear_foot" &&
      (componentUnit === "square_foot" || scopeUnitForBookUnit(c.bookMatch?.unit ?? null) === "square_foot")
        ? rollCoverageSf(c.name, c.resolvedQuantity ?? 0)
        : null;

    const targetUnit = consumable
      ? consumable.unit
      : rollTarget != null
        ? "square_foot"
        : null;

    /* A book row with no money and no craft hours cannot price anything; it is
       a match in name only and must fall through to the estimate path. The row
       is fetched when it is not among the cached candidates, so a priceless
       row can never slip through unchecked and land as a $0 line. */
    const matchCandidate = c.bookMatch
      ? (c.bookCandidates.find((r) => r.referenceId === c.bookMatch!.referenceId) ??
        (await fetchBookRow(sb, c.bookMatch.referenceId)))
      : null;
    const matchCarriesPrice =
      !!matchCandidate &&
      ((matchCandidate.material ?? 0) > 0 ||
        (matchCandidate.labor ?? 0) > 0 ||
        !!matchCandidate.craftHours);


    const duplicateRef = !!c.bookMatch && usedRefIds.has(c.bookMatch.referenceId);
    const matchUnit = c.bookMatch ? scopeUnitForBookUnit(c.bookMatch.unit ?? c.typicalUnit) : null;
    /* When a conversion has decided the unit, only a book row in that same unit
       may price the line — otherwise the row would be charged per wrong unit. */
    const matchUnitUsable =
      targetUnit == null || matchUnit === targetUnit;

    /* A COMPONENT CANNOT DWARF ITS OWN ASSEMBLY.
       A label kit or a cover plate that prices out at several times the whole
       task it belongs to is a wrong row, not a surprise. Such a match is
       rejected here and falls through to the estimated-material path, which is
       honest about being an estimate. The main component of an assembly prices
       at roughly the parent's own scale, so the 3x ceiling never touches it. */
    /* The book's own labor column can be blank where the row carries craft
       hours instead ("BE@.184"); those hours become real money at the craft
       wage, so they are what the scale test has to weigh. */
    const craftHrs = Number(/@\s*([\d.]+)/.exec(matchCandidate?.craftHours ?? "")?.[1] ?? 0);
    const projectedUnitLabor = Math.max(
      matchCandidate?.labor ?? 0,
      (Number.isFinite(craftHrs) ? craftHrs : 0) * 60,
    );
    const projectedCost =
      ((matchCandidate?.material ?? 0) + projectedUnitLabor) *
      Math.max(0, c.resolvedQuantity ?? 0);


    const outOfScale = parentDirect > 0 && projectedCost > parentDirect * 3;

    const hasMatch =
      !!c.bookMatch &&
      !c.bookMatch.isAmbiguous &&
      !duplicateRef &&
      matchCarriesPrice &&
      matchUnitUsable &&
      !outOfScale;

    /* A COMPONENT THE CONTRACTOR APPROVED IS NEVER DELETED SILENTLY. Where the
       running build-up would out-price the task it belongs to, the line still
       appears — visible and flagged unpriced — instead of vanishing with no
       explanation. Same treatment the estimated-material path already gives. */
    const overBudget =
      hasMatch && parentDirect > 0 && spentOnComponents + projectedCost > parentDirect;
    if (overBudget) {
      skippedCoveredByParent += 1;
    } else if (hasMatch) {
      usedRefIds.add(c.bookMatch!.referenceId);
      spentOnComponents += projectedCost;
    }



    const unitKey =
      targetUnit ??
      (hasMatch ? matchUnit! : componentUnit !== "each" ? componentUnit : basisUnit || "each");

    /* Trim sold by the piece: a stated stock length turns a length takeoff into
       whole pieces, and where the book states none, the residential 10-ft stick
       is used and written on the line as the assumption it is. */
    let pieceAssumed = false;
    let pieceFt: number | null = null;
    if (targetUnit == null && basisUnit === "linear_foot" && unitKey === "each") {
      pieceFt = pieceLengthFt(c.bookMatch?.description ?? null);
      if (pieceFt == null) {
        pieceFt = DEFAULT_TRIM_PIECE_FT;
        pieceAssumed = true;
      }
    }

    const unitFamilyAgrees =
      basisUnit === null || basisUnit === unitKey || pieceFt != null || targetUnit != null;

    /* The quantity was already resolved for THIS line (entered by the
       contractor, or calculated from this job's takeoff numbers) and shown on
       the review panel before approval. Nothing is invented here. */
    let quantity = 0;
    let quantityBasis = "needs_evidence";
    let derivation = "";
    /* A ballpark ratio is an honest assumption, not a measurement: it is
       flagged as a placeholder, but it never blocks a price. */
    let assumed = false;
    let missing = true;
    if (c.resolvedQuantity != null && c.resolvedQuantity > 0 && unitFamilyAgrees) {
      quantity = c.resolvedQuantity;
      missing = false;
      if (c.quantitySource === "contractor") {
        quantityBasis = "contractor_entered";
        derivation = "entered on the assembly review";
      } else if (c.quantitySource === "ballpark_default") {
        quantityBasis = "ballpark_allowance";
        derivation = c.quantityDerivation;
        assumed = true;
      } else {
        quantityBasis = "contractor_entered";
        derivation = `calculated for this job (${c.quantityDerivation}), approved on the assembly review`;
      }
      /* A DERIVED NUMBER IS NEVER FIRMER THAN ITS BASE. If the parent's own
         size is an assumption, everything computed from it is an assumption
         too, whatever the component's own basis says. */
      if (dto.parentQuantityIsPlaceholder && c.quantitySource !== "contractor") {
        quantityBasis = "ballpark_allowance";
        assumed = true;
        derivation = `${derivation} — parent quantity is an unconfirmed estimate, so this figure is too`;
      }

      if (consumable) {
        derivation = `${derivation} — standard consumable ratio: ${quantity} ${basisUnit} → ${consumable.quantity} ${consumable.unit}`;
        quantity = consumable.quantity;
        quantityBasis = "ballpark_allowance";
        assumed = true;
      } else if (rollTarget != null) {
        derivation = `${derivation} — ${quantity} LF × ${ROLL_WIDTH_FT} ft roll width = ${rollTarget} SF of coverage`;
        quantity = rollTarget;
        quantityBasis = "ballpark_allowance";
        assumed = true;
      } else if (pieceFt) {
        const pieces = Math.ceil(quantity / pieceFt);
        derivation = `${derivation} — ${quantity} LF ÷ ${pieceFt} ft per piece${
          pieceAssumed ? " (assumed 10 ft stock)" : ""
        } = ${pieces} pieces`;
        quantity = pieces;
        if (pieceAssumed) assumed = true;
      }
    }


    const placeholder = missing || assumed;
    const priceable = hasMatch && !missing && !overBudget;
    if (!hasMatch && !missing) {
      needMaterial.push({ index: rows.length, name: c.name, unit: unitKey });
    }








    rows.push({
      organization_id: orgId,
      project_id: parent.project_id,
      estimate_id: estimateId,
      parent_line_id: input.estimateLineId,
      assembly_component_id: c.id,
      assembly_expansion_id: dto.id,
      assembly_expansion_status: "reviewed",
      /* A component is internal build-up. The contractor can drill into it;
         a client document only ever sees the rolled-up parent line. */
      is_client_visible: false,

      description: c.name,
      group_label: dto.assemblyLabel,
      trade_key: tradeKey,
      trade_source: "inferred",
      category_key: parent.category_key ?? null,
      /* A purchased good with no craft hours in the book (a caulk cartridge, a
         roll of tape) is a material buy, not a production task. Left on a
         labor basis it would be voided for having no productivity rate. */
      ...(priceable && !matchCandidate?.craftHours && (matchCandidate?.material ?? 0) > 0
        ? { cost_basis: "material_unit" }
        : {}),
      quantity,
      unit_key: unitKey,
      labor_rate: Number(parent.labor_rate ?? 0),
      overhead_pct: Number(parent.overhead_pct ?? 0),
      profit_pct: Number(parent.profit_pct ?? 0),
      contingency_pct: Number(parent.contingency_pct ?? 0),
      sort_order: sort++,
      created_by: input.userId,
      is_quantity_placeholder: placeholder,
      quantity_basis: quantityBasis,
      quantity_basis_note: assumed
        ? `Ballpark estimate - ${derivation}. Refine for a detailed estimate to replace it with a measurement.`
        : missing
        ? unitFamilyAgrees
          ? `Assembly component quantity not established (${c.quantityBasis}) - needs a measurement`
          : `Book row is priced per ${c.bookMatch?.unit ?? "unit"}; the ${c.quantityBasis} measurement is a different unit - needs a takeoff conversion`
        : `From reviewed assembly "${dto.assemblyLabel}": ${derivation}`,
      resolution_status: priceable ? "resolved" : "unresolved",
      unresolved_reason: priceable
        ? null
        : overBudget
          ? "assembly_component_exceeds_parent_scope"
          : !hasMatch
            ? c.bookMatch
              ? "assembly_component_ambiguous_book_match"
              : "assembly_component_no_book_match"
            : unitFamilyAgrees
              ? "assembly_component_quantity_unknown"
              : "assembly_component_unit_mismatch",
      pricing_source: priceable ? "nce_2026_book" : "unmatched",

      pricing_provenance: {
        assemblyComponent: {
          expansionId: dto.id,
          componentId: c.id,
          sequence: c.sequence,
          inclusion: c.inclusion,
          quantityBasis: c.quantityBasis,
          quantitySource: c.quantitySource,
          quantityAssumption: assumed ? derivation : null,
          reason: c.reason,
          model: dto.model,
          promptVersion: dto.promptVersion,
        },
        ...(priceable
          ? {
              bookSource: {
                source: "cost_reference_nce2026",
                refId: c.bookMatch!.referenceId,
                description: c.bookMatch!.description,
                section: c.bookMatch!.section,
                unit: c.bookMatch!.unit,
                score: c.bookMatch!.score,
                isAmbiguous: false,
                /* Who made the call stays visible forever: a clean auto-match,
                   the engine's judgment on a borderline row, or a human pick. */
                matchSource: c.bookMatch!.isContractorSelected
                  ? "contractor_resolved_from_ambiguous"
                  : c.bookMatch!.isSystemResolved
                    ? "system_resolved_from_ambiguous"
                    : "auto_match",
                ...(c.bookMatch!.isContractorSelected ? { selectedBy: input.userId } : {}),

              },
            }
          : {}),

        /* Ambiguous hits are kept as a research candidate only — never priced. */
        ...(c.bookMatch && !priceable
          ? {
              bookCandidate: {
                refId: c.bookMatch.referenceId,
                description: c.bookMatch.description,
                unit: c.bookMatch.unit,
                score: c.bookMatch.score,
                isAmbiguous: true,
              },
            }
          : {}),
      },

    });
  }

  /* AI-ESTIMATED MATERIAL FALLBACK.
     Where the book has no row at all, the component is not left at zero: an
     estimated MATERIAL cost is written at insert time — never as an update,
     which the pricing triggers would read as a contractor override — kept in
     its own provenance block and labelled "Est." in the UI. Labor is never
     estimated: these lines carry material only until a book row or a
     contractor rate supplies the hours. */
  let materialEstimated = 0;
  if (needMaterial.length > 0) {
    const { estimateMaterialCosts } = await import("./assemblyMaterialEstimate.server");
    const { results, model } = await estimateMaterialCosts(
      needMaterial.map((n) => ({
        key: String(n.index),
        name: n.name,
        unit: n.unit,
        tradeKey,
        context: dto.assemblyLabel,
      })),
    );
    for (const est of results) {
      const row = rows[Number(est.key)];
      if (!row) continue;
      const prov = (row.pricing_provenance as Record<string, unknown>) ?? {};
      /* The same budget the book-priced components respect: an estimate may
         fill a gap in the assembly, never out-price the task it belongs to.
         Beyond the budget the component stays visible and unpriced instead of
         quietly doubling the job. */
      /* National price in, job-site price out — applied once, here. */
      const nationalPerUnit = est.materialPerUnit;
      const perUnit = Math.round(nationalPerUnit * materialFactor * 100) / 100;
      const extended = perUnit * Number(row.quantity ?? 0);
      if (parentDirect > 0 && spentOnComponents + extended > parentDirect) {
        row.unresolved_reason = "assembly_component_exceeds_parent_scope";
        continue;
      }
      spentOnComponents += extended;
      row.material_cost = perUnit;
      row.cost_basis = "material_unit";
      row.pricing_source = "ai_estimated_material";
      row.resolution_status = "resolved";
      row.unresolved_reason = null;
      row.pricing_provenance = {
        ...prov,
        materialEstimate: {
          isEstimated: true,
          nationalMaterialPerUnit: nationalPerUnit,
          materialPerUnit: perUnit,
          note: est.note,
          model,
          reason: "no_book_row_for_component",
          laborIncluded: false,
          /* Guard against a second application by the book material pass. */
          locationFactorApplied: true,
          factorKind: "material_pct",
          materialFactor,
          location: loc?.location ?? null,
          locationSource: loc?.match_source ?? null,
        },
      };

      materialEstimated += 1;
    }
  }

  let linesCreated = 0;
  if (rows.length > 0) {
    const { data: inserted, error } = await sb
      .from("estimate_line_items")
      .insert(rows)
      .select("id");
    if (error) throw new Error(msg(error, "Failed to add assembly component lines"));
    linesCreated = ((inserted as unknown[]) ?? []).length;
  }

  /* Book -> craft wage -> job-site location: the same pipeline every other
     priced line goes through. Nothing here invents a rate. A pricing failure
     must surface, not leave silently zero-cost children behind. */
  for (const fn of ["apply_book_line_pricing", "apply_book_labor_rates", "apply_location_equipment_factor"]) {
    const { error } = await sb.rpc(fn, { _estimate_id: estimateId });
    if (error) throw new Error(msg(error, `Pricing step ${fn} failed`));
  }


  const { data: after } = await sb
    .from("estimate_line_items")
    .select("id, pricing_source, resolution_status, direct_cost")
    .eq("parent_line_id", input.estimateLineId)
    .is("archived_at", null);


  const children = ((after as Record<string, unknown>[] | null) ?? []).filter(
    (r) => r.resolution_status !== undefined,
  );
  const pricedFromBook = children.filter(
    (r) => r.pricing_source === "nce_2026_book" && Number(r.direct_cost ?? 0) > 0,
  ).length;
  const pricedTotal = children.filter((r) => Number(r.direct_cost ?? 0) > 0).length;

  return {
    estimateId,
    parentLineId: input.estimateLineId,
    componentsIncluded: included.length,
    linesCreated,
    pricedFromBook,
    systemResolved: included.filter((c) => c.bookMatch?.isSystemResolved === true).length,
    materialEstimated,
    contractorResolved: included.filter((c) => c.bookMatch?.isContractorSelected).length,
    flaggedNeedsData: children.length - pricedTotal,
    skippedSameAsParent,
    skippedCoveredByParent,
  };

}





/**
 * Automatic caller. Every editable estimate line whose trade is expansion
 * enabled gets its component list generated once, cache-first. Bounded and
 * failure-tolerant: an estimate never fails to load or refresh because the
 * model was unavailable.
 */
export async function autoExpandEnabledLines(
  sb: SB,
  estimateId: string,
  orgId: string,
  userId: string,
  limit = 5,
): Promise<number> {
  try {
    const { data: rows } = await sb
      .from("estimate_line_items")
      .select("id, trade_key, description, assembly_expansion_id, assembly_expansion_status, parent_line_id")
      .eq("organization_id", orgId)
      .eq("estimate_id", estimateId)
      .is("archived_at", null)
      .is("parent_line_id", null)
      .is("assembly_expansion_id", null);

    const candidates = ((rows as Record<string, unknown>[] | null) ?? [])
      .filter((r) =>
        isExpansionEnabledForTrade(r.trade_key as string | null, r.description as string | null),
      )
      .filter((r) => r.assembly_expansion_status !== "not_expanded")
      .slice(0, limit);

    let expanded = 0;
    for (const r of candidates) {
      try {
        const dto = await runExpansion(sb, { estimateLineId: String(r.id), userId });
        if (dto.components.length > 0) expanded += 1;
      } catch {
        /* One line failing to expand must never break the estimate. */
      }
    }
    return expanded;
  } catch {
    return 0;
  }
}
