import { BALLPARK_ALLOWANCES } from "@/domains/ballpark/quantityResolution";
import type { AssumptionTopic, RemoteVisionLocale } from "./types";

/**
 * Fixed, human-authored rules. No AI, no external services: the contractor's
 * words are matched against this lexicon exactly the way Module 009 matches
 * walkthrough speech.
 */

export type WorkBucket =
  | "cabinets"
  | "flooring"
  | "lighting"
  | "windows"
  | "doors"
  | "appliances"
  | "fixtures"
  | "structuralChanges"
  | "mechanicalChanges"
  | "materials";

export interface LocalizedText {
  "en-US": string;
  "es-US": string;
}

export interface WorkRule {
  featureKey: string;
  bucket: WorkBucket;
  match: RegExp;
  label: LocalizedText;
  /** Plain-language scope sentence subject used for the narrative. */
  scopeTitle: LocalizedText;
  actionKey: string;
  /**
   * Quantity used ONLY when the contractor stated nothing measurable. It is an
   * assumption, never a fact: grounding stamps it `isDefault`, pricing flags the
   * line Needs Review, and any stated/confirmed measurement replaces it. For
   * work whose extent cannot be inferred honestly this must come from the
   * canonical, configurable `BALLPARK_ALLOWANCES` registry rather than a number
   * invented here.
   */
  quantity: number | null;
  unitKey: string | null;

  materialCategory?: "flooring" | "countertop" | "cabinet" | "wall" | "trim" | "other";
  changeKind?: "wall_removal" | "beam" | "opening" | "framing" | "other";
  discipline?: "electrical" | "plumbing" | "hvac" | "other";
  /**
   * Feature keys this more specific rule replaces.
   *
   * Supersession is CLAUSE-SCOPED (see analyze.ts): "56 LF of fascia" must not
   * delete a separately named siding scope elsewhere in the narration. A rule
   * only supersedes a victim whose every matching clause is also this rule's
   * clause.
   */
  supersedes?: string[];
  /**
   * The rule's own quantity is inherent to the work (one opening, one hatch).
   * Numbers spoken in the same sentence belong to something else and are
   * never adopted as its count.
   */
  fixedQuantity?: boolean;
  assumptionTopics?: AssumptionTopic[];
  /**
   * How the priced quantity may be established.
   *
   *   "measured"  — a real quantity exists and the catalog default is only a
   *                 placeholder until evidence is found.
   *   "allowance" — the quantity CANNOT be inferred honestly (custom casework
   *                 has no standard size). Without contractor-stated evidence
   *                 the line is priced as a clearly labelled BALLPARK
   *                 ALLOWANCE that always needs review, is never room-scaled,
   *                 and never borrows another assembly's geometry.
   */
  quantityBasis?: "measured" | "allowance";
  /**
   * Subject the rule's own measurement must be spoken about. Contractors state
   * a dimension in the sentence AFTER the scope ("remove that green wall. It's
   * about six foot length of wall."), so evidence is looked up by subject
   * instead of being taken from whatever number happens to be nearby.
   */
  measurementSubject?: RegExp;
  /**
   * True when final pricing needs specs the narrative cannot carry (member
   * depth/plies, species, finish). The line still prices — as a reviewable
   * allowance — but is always flagged Needs Review.
   */
  requiresSpecReview?: boolean;
  /**
   * Wording the contractor actually used for this same work. A subject may be
   * reached through an ALIAS ("breakfast bar" resolves to the island assembly),
   * and in that case the contractor must see HIS words, never the generic
   * subject name. Showing "Island" for work he explicitly said was "a breakfast
   * bar, not an island" reads as a recognition failure even when the underlying
   * assembly is correct.
   */
  aliasLabels?: { match: RegExp; label: LocalizedText; scopeTitle?: LocalizedText }[];
}

/** Rules whose quantity is an allowance, keyed by feature. */
export function workRuleFor(featureKey: string): WorkRule | undefined {
  return WORK_RULES.find((r) => r.featureKey === featureKey);
}

/**
 * SPOKEN-WORDING PRESERVATION (the general rule, not a trim exception).
 *
 * The app's job is to ORGANIZE what the contractor said and fill in genuinely
 * missing specifics (a derived quantity). It is never to rename his work.
 * So whenever the generic catalog subject introduces vocabulary he did not use
 * — "baseboard and casing trim" for "white vinyl trim", "flooring" for
 * "hardwood floors" — his own noun phrase, lifted verbatim from the evidence
 * sentence, becomes the label and the scope subject.
 *
 * Falls back to the catalog subject only when there is nothing spoken to use,
 * or when he already used the catalog's own word (nothing to preserve).
 */

/** Words allowed to travel with the noun: materials, colours, grades. */
const SUBJECT_MODIFIERS =
  /^(white|black|grey|gray|brown|tan|beige|red|green|blue|natural|vinyl|pvc|azek|cellular|composite|aluminum|aluminium|fiber|fibre|cement|hardie|wood|wooden|cedar|pine|oak|maple|walnut|mahogany|hardwood|softwood|engineered|laminate|luxury|lvp|lvt|tile|ceramic|porcelain|marble|granite|quartz|stone|slate|carpet|metal|steel|copper|galvanized|pressure|treated|exterior|interior|solid|hollow|prehung|custom|stained|painted|prefinished|unfinished|standard|premium|builder|mid|high|low)$/i;

const SUBJECT_STOPWORDS =
  /^(throughout|around|the|a|an|in|on|of|to|and|with|for|all|entire|whole|new|existing|per|each|area|areas|space|spaces|room|rooms)$/i;

const INTERIOR_VOCAB = /\b(baseboard|casing|crown|wainscot|closet|drywall|ceiling|interior)\b/i;
const EXTERIOR_VOCAB =
  /\b(deck|porch|patio|fascia|soffit|siding|roof|gutter|exterior|outdoor|outside)\b/i;

function nonGlobal(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags.replace(/[gy]/g, ""));
}

/**
 * The contractor's own noun phrase for this work, or null when the evidence
 * carries nothing better than the catalog subject. Wording only: this can
 * never change a quantity, a unit, a trade or a price.
 */
export function spokenSubjectFor(
  rule: WorkRule,
  spoken: string | null | undefined,
  genericSubject: string,
): string | null {
  const text = String(spoken ?? "").trim();
  if (!text) return null;

  const m = nonGlobal(rule.match).exec(text);
  if (!m) return null;

  /* His phrase = the matched words plus the modifiers immediately in front. */
  const matched = m[0].replace(/\s+/g, " ").trim().replace(/^[^a-z0-9]+|[^a-z0-9)]+$/gi, "");
  if (!matched || /\d/.test(matched)) return null;
  const before = text
    .slice(0, m.index)
    .split(/[^a-z0-9-]+/i)
    .filter(Boolean);
  const lead: string[] = [];
  for (let i = before.length - 1; i >= 0 && lead.length < 2; i -= 1) {
    const word = before[i]!;
    if (!SUBJECT_MODIFIERS.test(word)) break;
    lead.unshift(word);
  }
  const generic = genericSubject.toLowerCase();

  /* Carry the head noun he actually spoke ("hardwood" -> "hardwood flooring")
     when the very next word is the catalog's own noun. */
  const after = text
    .slice(m.index + m[0].length)
    .split(/[^a-z0-9-]+/i)
    .filter(Boolean);
  const tail: string[] = [];
  for (let i = 0; i < after.length && tail.length < 2; i += 1) {
    const word = after[i]!.toLowerCase();
    if (!new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(generic)) break;
    if (matched.toLowerCase().includes(word)) break;
    if (SUBJECT_STOPWORDS.test(word)) break;
    tail.push(word);
  }

  const phrase = [...lead, matched, ...tail].join(" ").toLowerCase().replace(/\s+/g, " ").trim();
  if (phrase.split(" ").length > 6) return null;

  /* Envelope bleed is always a rename, even if the words line up: interior
     finish vocabulary must never describe exterior work. */
  const envelopeBleed =
    (EXTERIOR_VOCAB.test(text) && !INTERIOR_VOCAB.test(phrase) && INTERIOR_VOCAB.test(generic)) ||
    (INTERIOR_VOCAB.test(text) && !EXTERIOR_VOCAB.test(phrase) && EXTERIOR_VOCAB.test(generic));

  /* Nothing of his own to preserve: the catalog subject already says it,
     allowing for the same word in another form ("cabinets" / "cabinetry"). */
  const stem = (value: string) =>
    value
      .split(/\s+/)
      .map((word) => word.replace(/(ries|ry|ies|es|s|ing)$/i, ""))
      .join(" ");
  if (!envelopeBleed && (generic.includes(phrase) || stem(generic).includes(stem(phrase)))) return null;
  return phrase;
}


/**
 * The label shown to the contractor: an explicit alias first, then his own
 * spoken wording, and only then the rule's generic subject label.
 */
export function ruleLabelFor(
  rule: WorkRule,
  spoken: string | null | undefined,
  locale: RemoteVisionLocale,
): string {
  const text = spoken ?? "";
  const alias = (rule.aliasLabels ?? []).find((a) => a.match.test(text));
  if (alias) return alias.label[locale];
  const generic = rule.label[locale];
  const own = spokenSubjectFor(rule, text, generic);
  if (!own) return generic;
  return own.charAt(0).toUpperCase() + own.slice(1);
}

/**
 * The Scope of Work sentence subject. Same rule as the label: the written
 * scope must read back the contractor's own words ("a pantry cabinet"), never
 * the generic catalog subject ("kitchen base cabinetry").
 */
export function ruleScopeTitleFor(
  rule: WorkRule,
  spoken: string | null | undefined,
  locale: RemoteVisionLocale,
): string {
  const text = spoken ?? "";
  const alias = (rule.aliasLabels ?? []).find((a) => a.match.test(text));
  if (alias) return (alias.scopeTitle ?? alias.label)[locale];
  const generic = rule.scopeTitle[locale];
  return spokenSubjectFor(rule, text, generic) ?? generic;
}



/** True when this feature's quantity may only ever be an allowance. */
export function isAllowanceFeature(featureKey: string): boolean {
  return workRuleFor(featureKey)?.quantityBasis === "allowance";
}

/** True when the feature cannot be finally priced without missing specs. */
export function featureRequiresSpecReview(featureKey: string): boolean {
  return workRuleFor(featureKey)?.requiresSpecReview === true;
}


export interface RoomRule {
  roomTypeKey: string;
  match: RegExp;
  label: LocalizedText;
}

export const ROOM_RULES: RoomRule[] = [
  { roomTypeKey: "kitchen", match: /\bkitchen(s)?\b|\bcocina(s)?\b/i, label: { "en-US": "Kitchen", "es-US": "Cocina" } },
  { roomTypeKey: "bathroom", match: /\bbath(room)?(s)?\b|\bpowder room\b|\bbaño(s)?\b/i, label: { "en-US": "Bathroom", "es-US": "Baño" } },
  { roomTypeKey: "dining_room", match: /\bdining\b|\bcomedor\b/i, label: { "en-US": "Dining room", "es-US": "Comedor" } },
  { roomTypeKey: "living_room", match: /\bliving\b|\bfamily room\b|\bsala\b/i, label: { "en-US": "Living room", "es-US": "Sala" } },
  { roomTypeKey: "bedroom", match: /\bbedroom(s)?\b|\brecámara(s)?\b|\bdormitorio(s)?\b/i, label: { "en-US": "Bedroom", "es-US": "Recámara" } },
  { roomTypeKey: "basement", match: /\bbasement\b|\bsótano\b/i, label: { "en-US": "Basement", "es-US": "Sótano" } },
  { roomTypeKey: "garage", match: /\bgarage\b|\bcochera\b|\bgaraje\b/i, label: { "en-US": "Garage", "es-US": "Garaje" } },
  { roomTypeKey: "exterior", match: /\bexterior\b|\bsiding\b|\bfachada\b/i, label: { "en-US": "Exterior", "es-US": "Exterior" } },
  { roomTypeKey: "whole_house", match: /\bwhole (house|home)\b|\bfirst floor\b|\bcasa completa\b|\bplanta baja\b/i, label: { "en-US": "Whole floor", "es-US": "Planta completa" } },
];

export const WORK_RULES: WorkRule[] = [
  {
    featureKey: "structural.wall_removal",
    bucket: "structuralChanges",
    changeKind: "wall_removal",
    match: /\b(remove|removing|take out|demo(lish)?)\b[^.]*\bwall\b|\bquitar\b[^.]*\bpared\b|\bderribar\b[^.]*\bmuro\b/i,
    label: { "en-US": "Wall removal", "es-US": "Demolición de pared" },
    scopeTitle: { "en-US": "wall between the adjoining rooms", "es-US": "pared entre las áreas contiguas" },
    actionKey: "remove",
    /*
     * Wall demolition is sold by the linear foot of wall run, which is also the
     * unit of the canonical `demo.wall.*` assemblies. An unmeasured run is the
     * canonical wall-demo ALLOWANCE, not a length invented in this file, and it
     * is always superseded by a spoken or confirmed wall length.
     */
    quantity: BALLPARK_ALLOWANCES.wallDemoLf,
    unitKey: "linear_foot",
    quantityBasis: "allowance",
    measurementSubject: /\bwall(s)?\b|\bpared(es)?\b|\bmuro(s)?\b/i,
    assumptionTopics: ["structural_engineering"],
  },
  {
    featureKey: "demolition.closet_removal",
    bucket: "structuralChanges",
    changeKind: "wall_removal",
    match: /\b(remove|removing|take out|demo(lish)?|gut)\b[^.]*\bcloset(s)?\b|\bquitar\b[^.]*\bcl[oó]set(s)?\b/i,
    label: { "en-US": "Closet removal", "es-US": "Demolición de clóset" },
    scopeTitle: { "en-US": "closet enclosure removed back to open framing", "es-US": "clóset demolido hasta la estructura" },
    actionKey: "remove",
    /* Unmeasured closet run comes from the canonical allowance registry. */
    quantity: BALLPARK_ALLOWANCES.closetLf,
    unitKey: "linear_foot",
    quantityBasis: "allowance",
    measurementSubject: /\bcloset(s)?\b|\bcl[oó]set(s)?\b/i,
  },
  {
    featureKey: "structural.lvl_beam",
    bucket: "structuralChanges",
    changeKind: "beam",
    match: /\b(lvl|beam|header)\b|\bviga\b|\bcabezal\b/i,
    label: { "en-US": "Structural beam", "es-US": "Viga estructural" },
    scopeTitle: { "en-US": "engineered LVL beam and supporting posts", "es-US": "viga LVL de ingeniería con postes de apoyo" },
    actionKey: "install",
    /*
     * A beam is priced per linear foot of span — a spoken "26 foot LVL" is a
     * SIZE, never a count of 26 beams. Carrying the canonical `linear_foot`
     * unit here is what lets the stated span become the priced quantity. An
     * unmeasured span is the canonical beam allowance, always Needs Review.
     */
    quantity: BALLPARK_ALLOWANCES.beamLf,
    unitKey: "linear_foot",
    quantityBasis: "allowance",
    measurementSubject: /\b(lvl|beam|header|span)\b|\bviga\b|\bcabezal\b/i,
    assumptionTopics: ["structural_engineering"],
    /* Member depth and ply count are engineering outputs, not narrative. */
    requiresSpecReview: true,
  },
  {
    featureKey: "structural.column",
    bucket: "structuralChanges",
    changeKind: "framing",
    /*
     * Contractors say "two posts" as often as "two columns". A bare "post" is
     * only work when it is counted or installed, so "fence post" style
     * references cannot invent structural framing.
     */
    match:
      /\b(column|columns)\b|\bcolumna(s)?\b|\b(?:\d+|new|steel|wood|wooden|lally|bearing)\s+posts?\b|\b(?:install(?:ing)?|add(?:ing)?|put(?:ting)?|set(?:ting)?|frame|framing)\b[^.]{0,40}\bposts?\b/i,
    label: { "en-US": "Structural columns", "es-US": "Columnas estructurales" },
    scopeTitle: { "en-US": "bearing columns at the new opening", "es-US": "columnas de carga en la nueva abertura" },
    actionKey: "install",
    /* Uncounted point-load posts carry the canonical per-opening allowance. */
    quantity: BALLPARK_ALLOWANCES.structuralPosts,
    unitKey: "each",
    quantityBasis: "allowance",
    measurementSubject: /\b(column|columns|post|posts)\b|\bcolumna(s)?\b|\bposte(s)?\b/i,
    assumptionTopics: ["structural_engineering"],
  },
  {
    featureKey: "trim.builtin_casework",
    bucket: "cabinets",
    materialCategory: "cabinet",
    match: /\bbuilt[- ]?in(s)?\b|\bbookcase(s)?\b|\bbook ?shel(f|ves|ving)\b|\bcasework\b|\blibrero(s)?\b|\bempotrado(s)?\b/i,
    label: { "en-US": "Built-in casework", "es-US": "Carpintería empotrada" },
    scopeTitle: { "en-US": "built-in bookcases and shelving", "es-US": "libreros y estantería empotrada" },
    actionKey: "install",
    /*
     * Custom casework has no standard size, so an un-stated finished length is
     * an explicit BALLPARK ALLOWANCE — never a measurement, never another
     * assembly's geometry, and never $0. The run comes from the canonical,
     * contractor-configurable allowance registry (no LF invented here) and the
     * line always needs review until species, depth, doors and the real
     * finished length are confirmed.
     */
    quantity: BALLPARK_ALLOWANCES.builtInLf,
    unitKey: "linear_foot",
    quantityBasis: "allowance",
    measurementSubject: /\bbuilt[- ]?in(s)?\b|\bbookcase(s)?\b|\bbook ?shel(f|ves|ving)\b|\bcasework\b|\blibrero(s)?\b|\bempotrado(s)?\b/i,
    assumptionTopics: ["cabinet_grade"],
    requiresSpecReview: true,
  },

  {
    featureKey: "cabinets.replace",
    bucket: "cabinets",
    match: /\bcabinet(s|ry)?\b|\bgabinete(s)?\b/i,
    label: { "en-US": "Base cabinetry", "es-US": "Gabinetes base" },
    aliasLabels: [
      {
        match: /\bpantry\b|\bdespensa\b/i,
        label: { "en-US": "Pantry cabinet", "es-US": "Gabinete de despensa" },
        scopeTitle: { "en-US": "a pantry cabinet", "es-US": "un gabinete de despensa" },
      },

    ],
    scopeTitle: { "en-US": "kitchen base cabinetry", "es-US": "gabinetes base de cocina" },

    actionKey: "replace",
    quantity: 24,
    unitKey: "linear_foot",
    /*
     * Base and upper runs are priced separately (they are separate runs and
     * separate quantities). 9,100 + 5,400 and 25 + 15 hours reproduce the
     * previous combined 14,500 / 40 hr kitchen when both runs are present.
     */
    assumptionTopics: ["cabinet_grade"],
  },
  {
    featureKey: "cabinets.upper",
    bucket: "cabinets",
    match: /\bupper(s| cabinet(s)?)?\b|\bwall cabinet(s)?\b|\bgabinete(s)? superior(es)?\b/i,
    label: { "en-US": "Upper cabinetry", "es-US": "Gabinetes superiores" },
    scopeTitle: { "en-US": "upper cabinetry", "es-US": "gabinetes superiores" },
    /* Never assume demolition of existing uppers; the verb is upgraded only
     * when the contractor actually says "replace" or "tear out". */
    actionKey: "install",
    quantity: 24,
    unitKey: "linear_foot",
    assumptionTopics: ["cabinet_grade"],
  },
  {
    featureKey: "countertops.replace",
    bucket: "materials",
    materialCategory: "countertop",
    match: /\bcounter ?top(s)?\b(?!\s+(level|height))|\b(laminate|quartz|granite)\s+counter ?top(s)?\b|\bencimera(s)?\b|\bcuarzo\b|\bgranito\b/i,
    label: { "en-US": "Countertops", "es-US": "Encimeras" },
    scopeTitle: { "en-US": "countertops", "es-US": "encimeras" },
    actionKey: "install",
    quantity: 55,
    unitKey: "square_foot",
    assumptionTopics: ["countertop_material"],
  },
  {
    featureKey: "cabinets.island",
    bucket: "cabinets",
    /*
     * A breakfast bar / eating bar / peninsula is the same base-cabinet-and-top
     * assembly as an island. It must match on the contractor's own words, so a
     * narration that only ever says "breakfast bar" still recognizes the work —
     * and the evidence sentence is the one where he ASKED for it, not the
     * comparison sentence ("almost like an island").
     */
    match: /\bisland\b|\bisla\b|\bbreakfast bar\b|\beating bar\b|\bbar top\b|\bpeninsula\b|\bbarra de desayuno\b/i,
    label: { "en-US": "Island", "es-US": "Isla" },
    aliasLabels: [
      {
        match: /\bbreakfast bar\b|\beating bar\b|\bbarra de desayuno\b/i,
        label: { "en-US": "Breakfast bar", "es-US": "Barra de desayuno" },
        scopeTitle: {
          "en-US": "a new breakfast bar with base cabinets",
          "es-US": "una nueva barra de desayuno con gabinetes base",
        },
      },
      {
        match: /\bbar top\b/i,
        label: { "en-US": "Bar top", "es-US": "Barra" },
        scopeTitle: {
          "en-US": "a new bar top with base cabinets",
          "es-US": "una nueva barra con gabinetes base",
        },
      },
      {
        match: /\bpeninsula\b/i,
        label: { "en-US": "Peninsula", "es-US": "Península" },
        scopeTitle: {
          "en-US": "a new peninsula with base cabinets",
          "es-US": "una nueva península con gabinetes base",
        },
      },

    ],
    scopeTitle: { "en-US": "a new kitchen island with base cabinets", "es-US": "una nueva isla de cocina con gabinetes base" },
    actionKey: "build",
    quantity: 1,
    unitKey: "each",
    assumptionTopics: ["cabinet_grade"],
  },

  {
    featureKey: "flooring.replace",
    bucket: "flooring",
    materialCategory: "flooring",
    /*
     * "open up the floor plan" is a LAYOUT statement, not flooring scope, so
     * the bare-floor branch never matches when "plan" follows it.
     */
    match: /\bfloor(ing|s)?\b(?!\s*plan)|\blvp\b|\bhardwood\b|\btile\b|\bpiso(s)?\b|\bporcelanato\b/i,
    label: { "en-US": "Flooring", "es-US": "Pisos" },
    scopeTitle: { "en-US": "flooring throughout the renovated area", "es-US": "pisos en toda el área renovada" },
    actionKey: "replace",
    quantity: 900,
    unitKey: "square_foot",
    assumptionTopics: ["flooring_type"],
  },
  {
    featureKey: "lighting.recessed",
    bucket: "lighting",
    match: /\blight(ing|s)?\b|\brecessed\b|\bcan lights?\b|\bilumina|\bluminaria(s)?\b|\bluces\b/i,
    label: { "en-US": "Lighting", "es-US": "Iluminación" },
    scopeTitle: { "en-US": "recessed lighting on dimmer control", "es-US": "iluminación empotrada con control de intensidad" },
    actionKey: "install",
    quantity: 10,
    unitKey: "each",
    assumptionTopics: ["lighting_package"],
  },
  {
    featureKey: "mechanical.electrical",
    bucket: "mechanicalChanges",
    discipline: "electrical",
    match: /\belectrical panel\b|\bsub-?panel\b|\bbreaker(s)?\b|\boutlet(s)?\b|\bcircuit(s)?\b|\bwiring\b|\beléctric|\btomacorriente(s)?\b/i,
    label: { "en-US": "Electrical work", "es-US": "Trabajo eléctrico" },
    scopeTitle: { "en-US": "electrical circuits and devices for the new layout", "es-US": "circuitos y dispositivos eléctricos para la nueva distribución" },
    actionKey: "modify",
    quantity: 1,
    unitKey: "lump_sum",
  },
  {
    featureKey: "mechanical.outlet_relocate",
    bucket: "mechanicalChanges",
    discipline: "electrical",
    supersedes: ["mechanical.electrical"],
    match: /\b(move|moving|relocate|relocat(?:e|ed|ing)|raise|rais(?:e|ed|ing))\b[^.;]{0,60}\b(outlet|receptacle|device|tomacorriente)|\b(outlet|receptacle|device|tomacorriente)\b[^.;]{0,60}\b(move|moving|relocate|relocat(?:e|ed|ing)|raise|rais(?:e|ed|ing))/i,
    label: { "en-US": "Relocate electrical device", "es-US": "Reubicar dispositivo eléctrico" },
    scopeTitle: { "en-US": "one electrical device relocated to counter height", "es-US": "un dispositivo eléctrico reubicado a la altura de la encimera" },
    actionKey: "modify",
    quantity: 1,
    unitKey: "each",
  },
  {
    featureKey: "mechanical.plumbing",
    bucket: "mechanicalChanges",
    discipline: "plumbing",
    match: /\bplumb(ing)?\b|\bsink\b|\bfaucet\b|\bshower\b|\bplomer|\bfregadero\b|\bregadera\b|\bgrifo\b/i,
    label: { "en-US": "Plumbing work", "es-US": "Trabajo de plomería" },
    scopeTitle: { "en-US": "plumbing rough-in and fixture connections", "es-US": "instalación de plomería y conexión de accesorios" },
    actionKey: "modify",
    quantity: 1,
    unitKey: "lump_sum",
  },
  {
    featureKey: "fixtures.replace",
    bucket: "fixtures",
    match: /\bfixture(s)?\b|\bvanity\b|\btoilet\b|\bacceso(rio|rios)\b|\btocador\b|\binodoro\b/i,
    label: { "en-US": "Fixtures", "es-US": "Accesorios" },
    scopeTitle: { "en-US": "plumbing fixtures", "es-US": "accesorios de plomería" },
    actionKey: "replace",
    quantity: 3,
    unitKey: "each",
  },
  {
    featureKey: "appliances.install",
    bucket: "appliances",
    /*
     * APPLIANCE WORK REQUIRES AN ACTION. A bare noun is almost always spatial
     * context ("the closets on the backside of that range hood"), and matching
     * it invented four appliance installations nobody sold. The verb (or an
     * explicit "new"/"supply") must appear near the appliance noun.
     */
    match: /\b(install\w*|set|setting|replace\w*|new|add|adding|supply|provide|hook ?up|connect|swap)\b[^.;]{0,40}\b(appliance(s)?|range hood|range|hood|dishwasher|refrigerator|fridge|oven|microwave|cook ?top|electrodoméstico(s)?|campana|lavavajillas)\b|\b(appliance(s)?|range hood|dishwasher|refrigerator|fridge|oven|microwave|cook ?top|electrodoméstico(s)?|lavavajillas)\b[^.;]{0,30}\b(install\w*|replace\w*|new|hook ?up|connect|instalar|nuevo(s)?)\b/i,
    label: { "en-US": "Appliances", "es-US": "Electrodomésticos" },
    scopeTitle: { "en-US": "appliances set and connected", "es-US": "electrodomésticos instalados y conectados" },
    actionKey: "install",
    quantity: 4,
    unitKey: "each",
    assumptionTopics: ["appliance_grade"],
  },
  {
    featureKey: "windows.replace",
    bucket: "windows",
    match: /\bwindow(s)?\b|\bventana(s)?\b/i,
    label: { "en-US": "Windows", "es-US": "Ventanas" },
    scopeTitle: { "en-US": "windows with new trim and sealing", "es-US": "ventanas con nuevo marco y sellado" },
    actionKey: "replace",
    quantity: 4,
    unitKey: "each",
  },
  {
    /*
     * A site-built access door/hatch over a chase. Explicitly stated small
     * carpentry with its own unit (each), never the 5-door catalog default and
     * never a plumbing item just because the chase carries pipes.
     */
    featureKey: "carpentry.access_panel",
    bucket: "doors",
    match: /\baccess\s+(door|panel|hatch)\b|\bchase\s+(door|panel|cover)\b|\bpanel\s+de\s+acceso\b/i,
    label: { "en-US": "Custom access door", "es-US": "Puerta de acceso a medida" },
    scopeTitle: {
      "en-US": "site-built access door with hinges and paint",
      "es-US": "puerta de acceso construida en sitio con bisagras y pintura",
    },
    actionKey: "build",
    quantity: null,
    unitKey: "each",
    supersedes: ["doors.replace"],
  },
  {
    /*
     * Closing up an existing opening: door removal plus framing and infill.
     * Stated as its own work item so it is never priced as a door swap and
     * never inherits the 5-door catalog default.
     */
    featureKey: "carpentry.opening_infill",
    bucket: "doors",
    match:
      /\b(clos(e|es|ing)\s+(up|off)|fill(ing)?\s+in|infill\w*|wall(ing)?\s+(in|off)|board(ing)?\s+up)\b[^.]{0,40}\b(door|doorway|opening|window)\b/i,
    label: { "en-US": "Close up existing opening", "es-US": "Cerrar la abertura existente" },
    scopeTitle: {
      "en-US": "close up the existing opening: remove the door, frame and infill the wall",
      "es-US": "cerrar la abertura existente: quitar la puerta, enmarcar y rellenar la pared",
    },
    actionKey: "build",
    quantity: 1,
    unitKey: "each",
    fixedQuantity: true,
    supersedes: ["doors.replace"],
  },

  {
    featureKey: "doors.replace",
    bucket: "doors",
    match: /\bdoor(s)?\b|\bpuerta(s)?\b/i,
    label: { "en-US": "Doors", "es-US": "Puertas" },
    scopeTitle: { "en-US": "interior doors with hardware", "es-US": "puertas interiores con herrajes" },
    actionKey: "replace",
    quantity: 5,
    unitKey: "each",
  },
  {
    /*
     * Paint STAYS LOCAL to the object the contractor named. "The fascia will be
     * painted" is fascia paint in linear feet — it must never expand into whole
     * room walls, ceilings and trim square footage.
     */
    featureKey: "paint.component",
    bucket: "materials",
    materialCategory: "trim",
    match:
      /\b(paint|painted|painting|repaint\w*|prime|primed)\b[^.]{0,80}\b(fascia|soffit(s)?|shadow board|rake board|trim|casing|baseboard|door|panel|hatch|railing|cabinet(s)?)\b|\b(fascia|soffit(s)?|shadow board|rake board|trim|casing|baseboard|door|panel|hatch|railing|cabinet(s)?)\b[^.]{0,80}\b(paint|painted|painting|repaint\w*|prime|primed)\b/i,
    label: { "en-US": "Paint on stated components", "es-US": "Pintura de componentes indicados" },
    scopeTitle: {
      "en-US": "paint on the components the contractor named",
      "es-US": "pintura de los componentes indicados",
    },
    actionKey: "paint",
    quantity: null,
    unitKey: "linear_foot",
  },
  {
    featureKey: "paint.interior",
    bucket: "materials",
    materialCategory: "wall",
    /*
     * Whole-room painting requires a ROOM SURFACE in the same sentence. Without
     * it, "paint the fascia" used to become 735 SF of interior painting.
     */
    match:
      /\b(paint|painted|painting|repaint\w*|pintura|pintar)\b[^.]{0,80}\b(wall(s)?|ceiling(s)?|room(s)?|interior|drywall|pared(es)?|techo(s)?)\b|\b(wall(s)?|ceiling(s)?|room(s)?|interior|drywall|pared(es)?|techo(s)?)\b[^.]{0,80}\b(paint|painted|painting|repaint\w*|pintura|pintar)\b/i,
    label: { "en-US": "Painting", "es-US": "Pintura" },
    scopeTitle: { "en-US": "walls, ceilings and trim", "es-US": "paredes, techos y molduras" },
    actionKey: "paint",
    quantity: 1800,
    unitKey: "square_foot",
    assumptionTopics: ["paint_grade"],
  },

  {
    /*
     * EXTERIOR TRIM, in the contractor's own words.
     *
     * "White vinyl trim around the deck edge" was being read by the interior
     * trim rule and written back to him as "baseboard and casing trim" — two
     * interior-only terms he never said, on a job with no interior. Exterior
     * trim is its own subject: its own scope wording, its own exterior book
     * section, and it supersedes the interior rule inside the clause it owns.
     */
    featureKey: "trim.exterior",
    bucket: "materials",
    materialCategory: "trim",
    match:
      /\b(vinyl|pvc|azek|cellular pvc|composite|aluminum|aluminium|fiber ?cement|hardie)\b[^.,]{0,24}\btrim\b|\btrim\b[^.,]{0,30}\b(deck|porch|patio|exterior|outside|outdoor)\b|\b(deck|porch|patio|exterior|outdoor)\b[^.,]{0,30}\btrim\b/i,
    label: { "en-US": "Exterior trim", "es-US": "Moldura exterior" },
    scopeTitle: { "en-US": "exterior trim", "es-US": "moldura exterior" },
    actionKey: "install",
    quantity: null,
    unitKey: "linear_foot",
    measurementSubject: /\btrim\b/i,
    supersedes: ["trim.replace"],
    /* His wording is the scope wording — never a re-categorized substitute. */
    aliasLabels: [
      {
        match: /\bvinyl\b/i,
        label: { "en-US": "Vinyl trim", "es-US": "Moldura de vinilo" },
        scopeTitle: { "en-US": "vinyl trim", "es-US": "moldura de vinilo" },
      },
      {
        match: /\b(pvc|azek|cellular pvc)\b/i,
        label: { "en-US": "PVC trim", "es-US": "Moldura de PVC" },
        scopeTitle: { "en-US": "PVC trim", "es-US": "moldura de PVC" },
      },
      {
        match: /\bcomposite\b/i,
        label: { "en-US": "Composite trim", "es-US": "Moldura compuesta" },
        scopeTitle: { "en-US": "composite trim", "es-US": "moldura compuesta" },
      },
      {
        match: /\b(aluminum|aluminium)\b/i,
        label: { "en-US": "Aluminum trim", "es-US": "Moldura de aluminio" },
        scopeTitle: { "en-US": "aluminum trim", "es-US": "moldura de aluminio" },
      },
    ],
  },
  {
    featureKey: "trim.replace",
    bucket: "materials",
    materialCategory: "trim",
    match: /\btrim\b|\bbaseboard(s)?\b|\bcrown\b|\bmolduras?\b|\bzócalo(s)?\b/i,
    label: { "en-US": "Trim", "es-US": "Molduras" },
    scopeTitle: { "en-US": "baseboard and casing trim", "es-US": "zócalos y marcos" },
    actionKey: "install",
    quantity: 220,
    unitKey: "linear_foot",
  },


  /* ------------------------------------------------------------------ *
   * Trades the pricing catalog already carries but the vision lexicon did
   * not, so exterior and general work fell through and was never priced.
   * Every rule requires an ACTION word — a passing mention of a roof or a
   * deck is not scope.
   * ------------------------------------------------------------------ */
  {
    featureKey: "roofing.replace",
    bucket: "materials",
    materialCategory: "other",
    match: /\b(replace|install|new|re-?roof|tear off|strip|repair)\b[^.]{0,40}\b(roof(ing|s)?|shingles?)\b|\b(roof(ing|s)?|shingles?)\b[^.]{0,25}\b(replace|install|new|repair)\b|\bte(ch|j)ado\b/i,
    label: { "en-US": "Roofing", "es-US": "Techado" },
    scopeTitle: { "en-US": "roof covering with underlayment and flashing", "es-US": "cubierta de techo con membrana y tapajuntas" },
    actionKey: "replace",
    /* Sized from the building envelope, never from a fixed interior number. */
    quantity: null,
    unitKey: "square_foot",
    quantityBasis: "allowance",
    measurementSubject: /\broof(ing|s)?\b|\bshingles?\b/i,
  },
  {
    /*
     * A named METAL roof is a different price subject from an asphalt roof:
     * panels, clips and trim cost roughly twice a shingle tear-off-and-replace.
     * Naming it explicitly stops a standing seam roof pricing as shingles.
     */
    featureKey: "roofing.metal.replace",
    bucket: "materials",
    materialCategory: "other",
    match: /\b(standing\s*seam|metal|steel|aluminum|aluminium|techo\s+met[aá]lico)\b[^.]{0,30}\broof(ing|s)?\b|\broof(ing|s)?\b[^.]{0,20}\b(standing\s*seam|metal)\b/i,
    label: { "en-US": "Metal roofing", "es-US": "Techado metálico" },
    scopeTitle: {
      "en-US": "standing seam metal roof with underlayment and flashing",
      "es-US": "techo metálico de junta alzada con membrana y tapajuntas",
    },
    actionKey: "replace",
    quantity: null,
    unitKey: "square_foot",
    quantityBasis: "allowance",
    measurementSubject: /\broof(ing|s)?\b/i,
    supersedes: ["roofing.replace"],
  },

  {
    featureKey: "gutters.replace",
    bucket: "materials",
    materialCategory: "other",
    match: /\bgutter(s)?\b|\bdownspout(s)?\b|\bcanalet(a|as)\b|\bleader(s)?\b/i,
    label: { "en-US": "Gutters", "es-US": "Canaletas" },
    scopeTitle: { "en-US": "gutters and downspouts", "es-US": "canaletas y bajantes" },
    actionKey: "replace",
    quantity: null,
    unitKey: "linear_foot",
    quantityBasis: "allowance",
    measurementSubject: /\bgutter(s)?\b|\bdownspout(s)?\b/i,
  },
  {
    /*
     * Exterior TRIM, in linear feet. Kept separate from siding on purpose: a
     * fascia/soffit/shadow-board run is a linear trim job, and matching it as
     * "siding" is what produced a whole-house 2,800 SF siding replacement from
     * "56 linear feet of 1x6 fascia".
     */
    featureKey: "fascia.replace",
    bucket: "materials",
    materialCategory: "trim",
    match: /\bfascia(s)?\b|\bsoffit(s)?\b|\bshadow board(s)?\b|\brake board(s)?\b|\bfriso(s)?\b/i,
    label: { "en-US": "Fascia and soffit trim", "es-US": "Fascia y sofito" },
    scopeTitle: {
      "en-US": "fascia and soffit trim with fasteners and sealing",
      "es-US": "fascia y sofito con sujetadores y sellado",
    },
    actionKey: "replace",
    quantity: null,
    unitKey: "linear_foot",
    measurementSubject: /\bfascia(s)?\b|\bsoffit(s)?\b|\bshadow board(s)?\b|\brake board(s)?\b/i,
    supersedes: ["siding.replace"],
  },
  {
    featureKey: "siding.replace",
    bucket: "materials",
    materialCategory: "other",
    match: /\bsiding(s)?\b|\bcladding\b|\brevestimiento(s)?\b/i,
    label: { "en-US": "Siding", "es-US": "Revestimiento" },
    scopeTitle: { "en-US": "exterior siding with trim and sealing", "es-US": "revestimiento exterior con molduras y sellado" },
    actionKey: "replace",
    quantity: null,
    unitKey: "square_foot",
    quantityBasis: "allowance",
    measurementSubject: /\bsiding(s)?\b|\bcladding\b/i,
  },

  {
    /*
     * DECK RAILING is its own money. The deck assembly prices framing and
     * decking only ($/SF), so a railing folded into it was free — a 48 LF
     * vinyl rail with aluminum balusters is thousands of dollars of real work.
     */
    featureKey: "deck.railing",
    bucket: "structuralChanges",
    changeKind: "framing",
    match:
      /\brail(ing)?(s)?\b|\bguard\s?rail(s)?\b|\bhand\s?rail(s)?\b|\bbaluster(s)?\b|\bspindle(s)?\b|\bbarandal(es)?\b/i,
    label: { "en-US": "Deck railing", "es-US": "Barandal de terraza" },
    scopeTitle: {
      "en-US": "deck railing with posts and balusters",
      "es-US": "barandal de terraza con postes y balaustres",
    },
    actionKey: "install",
    quantity: null,
    unitKey: "linear_foot",
    measurementSubject: /\brail(ing)?(s)?\b|\bbaluster(s)?\b|\bbarandal(es)?\b/i,
  },
  {
    featureKey: "deck.build",
    bucket: "structuralChanges",
    changeKind: "framing",
    match: /\bdeck(s|ing)?\b|\bporch(es)?\b|\bpergola(s)?\b|\bterraza(s)?\b|\bpórtico(s)?\b/i,
    label: { "en-US": "Deck", "es-US": "Terraza" },
    scopeTitle: { "en-US": "framed deck with decking", "es-US": "terraza estructurada con piso" },
    actionKey: "build",
    quantity: 240,
    unitKey: "square_foot",
  },
  {
    /*
     * WALL / WET-AREA TILE. The ontology and catalog already knew this trade,
     * but no lexicon rule could hear it in speech, so a contractor saying
     * "tile the shower walls" produced no scope at all. Floor tile stays with
     * the flooring rule; this covers vertical and wet-area tile only.
     */
    featureKey: "tile.wet_area",
    bucket: "materials",
    materialCategory: "wall",
    match:
      /\bbacksplash(es)?\b|\b(shower|tub|wall|bathroom|kitchen)\s+tile(s)?\b|\btile\s+(the\s+)?(shower|tub|walls?|backsplash)\b|\btile\s+surround\b|\bshower\s+surround\b|\bazulejo(s)?\b|\bsalpicadero\b/i,
    label: { "en-US": "Wall and wet-area tile", "es-US": "Azulejo de pared y zonas húmedas" },
    scopeTitle: {
      "en-US": "wall and wet-area tile with setting materials and grout",
      "es-US": "azulejo de pared y zonas húmedas con mortero y lechada",
    },
    actionKey: "install",
    /* Tile faces are measured, never assumed from a room's floor area. */
    quantity: null,
    unitKey: "square_foot",
    quantityBasis: "allowance",
    measurementSubject: /\btile\b|\bbacksplash\b|\bshower\b|\bazulejo\b/i,
  },
  {
    /*
     * LANDSCAPING. Previously had zero coverage anywhere in the engine, so
     * "new landscaping" on an exterior remodel was silently dropped instead of
     * being recognized and priced as a disclosed allowance.
     */
    featureKey: "landscaping.install",
    bucket: "materials",
    materialCategory: "other",
    match: /\blandscap(e|es|ed|ing)\b|\bsod\b|\bplanting(s)?\b|\bshrub(s)?\b|\bmulch\b|\bhardscape\b|\bjardiner[íi]a\b|\bpaisajismo\b/i,
    label: { "en-US": "Landscaping", "es-US": "Jardinería" },
    scopeTitle: {
      "en-US": "landscaping with grading, planting and ground cover",
      "es-US": "jardinería con nivelación, plantación y cubierta vegetal",
    },
    actionKey: "install",
    /* Ground area comes from the scale-aware allowance, never a fixed guess. */
    quantity: null,
    unitKey: "square_foot",
    quantityBasis: "allowance",
    measurementSubject: /\blandscap\w*\b|\bsod\b|\byard\b/i,
  },
  {
    featureKey: "fence.install",
    bucket: "structuralChanges",
    changeKind: "framing",
    match: /\bfence(s|ing)?\b|\bcerca(s)?\b|\bcerco(s)?\b/i,
    label: { "en-US": "Fencing", "es-US": "Cerca" },
    scopeTitle: { "en-US": "fencing with posts and gates", "es-US": "cerca con postes y puertas" },
    actionKey: "install",
    quantity: 120,
    unitKey: "linear_foot",
  },
  {
    featureKey: "concrete.flatwork",
    bucket: "structuralChanges",
    changeKind: "other",
    match: /\bconcrete\b|\bslab(s)?\b|\bdriveway(s)?\b|\bwalkway(s)?\b|\bsidewalk(s)?\b|\bpatio(s)?\b|\bfooting(s)?\b|\bconcreto\b|\blosa(s)?\b/i,
    label: { "en-US": "Concrete flatwork", "es-US": "Obra de concreto" },
    scopeTitle: { "en-US": "concrete flatwork with base preparation", "es-US": "obra de concreto con preparación de base" },
    actionKey: "build",
    quantity: 320,
    unitKey: "square_foot",
  },
  {
    featureKey: "mechanical.hvac",
    bucket: "mechanicalChanges",
    discipline: "hvac",
    match: /\bhvac\b|\bfurnace\b|\bair condition(ing|er)?\b|\bmini[- ]?split\b|\bduct(work|s)?\b|\bcalefacción\b|\baire acondicionado\b/i,
    label: { "en-US": "HVAC work", "es-US": "Trabajo de HVAC" },
    scopeTitle: { "en-US": "heating and cooling equipment and distribution", "es-US": "equipo de climatización y distribución" },
    actionKey: "modify",
    quantity: 1,
    unitKey: "lump_sum",
  },
  {
    featureKey: "drywall.replace",
    bucket: "materials",
    materialCategory: "wall",
    match: /\bdrywall\b|\bsheetrock\b|\bplaster\b|\btablaroca\b|\byeso\b/i,
    label: { "en-US": "Drywall", "es-US": "Tablaroca" },
    scopeTitle: { "en-US": "drywall hung, taped and finished", "es-US": "tablaroca instalada, sellada y acabada" },
    actionKey: "install",
    quantity: 1200,
    unitKey: "square_foot",
  },
  {
    featureKey: "insulation.install",
    bucket: "materials",
    materialCategory: "other",
    match: /\binsulat(e|ion|ing)\b|\bbatt(s)?\b|\bspray foam\b|\baisl(ar|amiento)\b/i,
    label: { "en-US": "Insulation", "es-US": "Aislamiento" },
    scopeTitle: { "en-US": "insulation to code at walls and ceilings", "es-US": "aislamiento según código en paredes y techos" },
    actionKey: "install",
    /* Never a 900 SF per-room default: the stated surface decides the area. */
    quantity: null,
    unitKey: "square_foot",
  },
  {
    featureKey: "handyman.general",
    bucket: "materials",
    materialCategory: "other",
    match: /\bhandyman\b|\bpunch ?list\b|\bodd jobs?\b|\bsmall repairs?\b|\bmiscellaneous repairs?\b|\bhoney ?do\b|\breparaciones menores\b/i,
    label: { "en-US": "Handyman work", "es-US": "Trabajo de mantenimiento" },
    scopeTitle: { "en-US": "assorted small repairs on a time-and-materials basis", "es-US": "reparaciones menores por tiempo y materiales" },
    actionKey: "repair",
    /*
     * "three little handyman projects" is a COUNT OF SUBJOBS, not hours. No hour
     * default is ever invented; hours come only from a stated time.
     */
    quantity: null,
    unitKey: "hour",
  },

];

export function localized(text: LocalizedText, locale: RemoteVisionLocale): string {
  return text[locale] ?? text["en-US"];
}
