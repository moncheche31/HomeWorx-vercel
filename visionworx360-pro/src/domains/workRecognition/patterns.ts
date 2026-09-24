import { standardFor, type TradeStandard } from "./standards";
import type { ActionKey, DerivationKey, UnitFamily } from "./types";

/**
 * Declarative work RECOGNITION rules.
 *
 * A rule only answers "which task family is this clause talking about?".
 * The estimating unit, derivation, waste and assumptions come from the trade
 * standards registry (`standards.ts`), so unit conventions live in one data
 * table instead of being scattered through regex-specific code paths.
 *
 * `requireAction` is the guard against loose keyword collisions: a subject on
 * its own ("there is a roof over the porch") is never scope; an action applied
 * to that subject is.
 */

export interface RecognitionRule {
  workTypeKey: string;
  /** Trade standard that supplies unit + derivation. Defaults to workTypeKey. */
  standardKey?: string;
  /** Subject noun this rule owns. */
  subject: RegExp;
  /** Must the sentence contain an action verb for this to be scope? */
  requireAction: boolean;
  /** Only these actions produce scope (e.g. demolition needs `remove`). */
  requiredActions?: ActionKey[];
  /** Extra phrase the clause must contain (new opening vs replacement). */
  requirePhrase?: RegExp;
  /** Phrases that mean this rule does NOT own the clause. */
  disqualifiers?: RegExp;
  /** Label override; otherwise the standard's label is used. */
  label?: string;
}

export interface WorkPattern extends RecognitionRule {
  label: string;
  trade: string;
  unitKey: string;
  baseUnitKey: string;
  family: UnitFamily;
  defaultAction: ActionKey;
  derivation: DerivationKey;
  zoneKeys?: string[];
  wastePct?: number;
  standingAssumption?: string;
  allowance?: { quantity: number; note: string };
  houseAreaRatio?: number;
  standard: TradeStandard;
}

/**
 * Subject words that belong to a component, not to the building. Any rule
 * can opt into this list; it is what stops "raised panel door" from becoming
 * an electrical panel or an architectural door.
 */
export const COMPONENT_CONTEXT =
  /\b(cabinet|cabinetry|upper|uppers|bread\s?box|wine|glass|raised[- ]panel|shaker|slab|drawer|door style|pantry|vanity door|bay|shelf|shelves)\b/i;

/**
 * Words that place a trim run OUTSIDE. Either an exterior-only trim material
 * (nobody runs vinyl or AZEK baseboard indoors) or an exterior location.
 */
export const EXTERIOR_TRIM_CONTEXT =
  /\b(vinyl|pvc|azek|cellular pvc|composite|aluminum|aluminium|fiber ?cement|hardie)\b|\b(deck|decks|porch|patio|exterior|outside|outdoor|fascia|soffit|rake board|railing|stair(s)? outside)\b/i;

/** Phrases that mean a brand-new opening is being cut, not a replacement. */
export const NEW_OPENING_PHRASE =
  /\b(new (window|door|opening)s?|add (a |an )?(window|door)|cut (in|a new)|rough opening|frame (a |an )?(new )?opening|widen the opening)\b/i;


const RECOGNITION_RULES: RecognitionRule[] = [
  /* ------------------------------------------------------------ exterior */
  {
    workTypeKey: "deck.surface",
    subject: /\bdeck(ing)?\b|\bporch\b|\bterraza\b/i,
    requireAction: true,
  },
  {
    workTypeKey: "deck.railing",
    subject: /\brail(ing)?s?\b|\bguard ?rail\b|\bbarandal\b/i,
    requireAction: false,
  },
  {
    workTypeKey: "deck.stairs",
    subject: /\bstairs?\b|\bsteps?\b|\bescaleras?\b/i,
    requireAction: false,
  },
  {
    workTypeKey: "roofing.covering",
    subject: /\broof(ing)?\b|\bshingles?\b|\btejado\b/i,
    requireAction: true,
  },
  {
    workTypeKey: "siding.covering",
    subject: /\bsiding\b|\bcladding\b|\brevestimiento\b/i,
    requireAction: true,
  },
  {
    workTypeKey: "siding.trim",
    subject: /\bsoffits?\b|\bfascia\b|\bcorner boards?\b|\bfrisos?\b/i,
    requireAction: false,
  },

  /* -------------------------------------------------------------- interior */
  {
    workTypeKey: "flooring.carpet",
    subject: /\bcarpet(ing)?\b|\balfombra\b/i,
    requireAction: true,
  },
  {
    workTypeKey: "flooring.surface",
    subject: /\bfloor(ing|s)?\b|\blvp\b|\bhardwood\b|\btile floor\b|\bpiso(s)?\b/i,
    requireAction: true,
    // Carpet has its own square-yard convention.
    disqualifiers:
      /\bcarpet\b|\bfloor\s*(level|height|plan|joist|outlet|receptacle|line|space)\b|\b(from|at|above|below|off)\s+(the\s+)?floor\b/i,
  },
  {
    workTypeKey: "paint.walls",
    subject: /\bpaint(ing)?\b|\bpintar\b|\bpintura\b/i,
    requireAction: false,
  },
  {
    workTypeKey: "paint.ceilings",
    // Ceilings are only in scope when the contractor names them.
    subject: /\bceilings?\b|\btechos?\b/i,
    requireAction: true,
  },
  {
    workTypeKey: "drywall.surface",
    subject: /\bdrywall\b|\bsheetrock\b|\btablaroca\b/i,
    requireAction: true,
  },
  {
    /* Insulation the contractor put on a CEILING plane, priced as ceiling area. */
    workTypeKey: "insulation.ceiling",
    subject: /\binsulat(e|ion|ing)\b|\brigid foam\b|\baislamiento\b/i,
    requireAction: true,
    requirePhrase: /\bceiling|\bjoists?\b|\bunderside\b|\blid\b|\btecho/i,
  },
  {
    workTypeKey: "insulation.surface",
    subject: /\binsulat(e|ion|ing)\b|\baislamiento\b/i,
    requireAction: true,
    disqualifiers: /\bceiling|\bunderside\b|\btecho/i,
  },

  {
    workTypeKey: "framing.walls",
    subject: /\bfram(e|ing)\b|\bstud walls?\b|\bpartitions?\b/i,
    requireAction: true,
  },
  {
    /*
     * EXTERIOR trim is a different trade section from interior trim. Baseboard
     * and casing live indoors; deck edge / fascia / PVC trim boards live
     * outdoors and price from exterior book sections. Recognizing both as one
     * "finish carpentry" family is what turned "white vinyl trim around the
     * deck edge" into "baseboard and casing trim".
     */
    workTypeKey: "trim.exterior",
    subject: /\btrim\b|\btrim\s?board(s)?\b|\bfascia\b|\brake board\b/i,
    requireAction: false,
    requirePhrase: EXTERIOR_TRIM_CONTEXT,
  },
  {
    workTypeKey: "trim.finish_carpentry",
    subject: /\btrim\b|\bbaseboards?\b|\bcrown\b|\bcasing\b|\bwainscot\w*\b|\bmoldur/i,
    requireAction: false,
    disqualifiers: EXTERIOR_TRIM_CONTEXT,
  },

  {
    workTypeKey: "carpentry.builtin",
    subject: /\bbuilt[- ]?ins?\b|\bbookcases?\b|\bbookshel(f|ves)\b|\bmillwork\b|\bmantel\b/i,
    requireAction: false,
  },
  {
    workTypeKey: "demolition.wall",
    subject: /\bwall\b|\bpared\b|\bmuro\b/i,
    requireAction: true,
    requiredActions: ["remove"],
  },
  {
    workTypeKey: "demolition.finishes",
    // Demolition quantity follows the thing being removed.
    subject: /\b(flooring|carpet|tile|drywall|siding|roofing|decking|countertops?)\b/i,
    requireAction: true,
    requiredActions: ["remove"],
  },

  /* ---------------------------------------------------------- openings */
  {
    workTypeKey: "windows.new_opening",
    subject: /\bwindows?\b|\bventanas?\b/i,
    requireAction: true,
    requirePhrase: NEW_OPENING_PHRASE,
  },
  {
    workTypeKey: "windows.openings",
    subject: /\bwindows?\b|\bventanas?\b/i,
    requireAction: true,
    disqualifiers: NEW_OPENING_PHRASE,
  },
  {
    workTypeKey: "doors.new_opening",
    subject: /\bdoors?\b|\bpuertas?\b/i,
    requireAction: true,
    requirePhrase: NEW_OPENING_PHRASE,
    disqualifiers: COMPONENT_CONTEXT,
  },
  {
    workTypeKey: "doors.openings",
    subject: /\bdoors?\b|\bpuertas?\b/i,
    requireAction: true,
    disqualifiers: new RegExp(`${COMPONENT_CONTEXT.source}|${NEW_OPENING_PHRASE.source}`, "i"),
  },

  /* -------------------------------------------------------------- MEP */
  {
    workTypeKey: "plumbing.rough_in",
    subject: /\brough[- ]?in\b|\bwater lines?\b|\bdrain lines?\b|\bsupply lines?\b/i,
    requireAction: false,
  },
  {
    workTypeKey: "plumbing.piping",
    subject: /\bpip(e|es|ing)\b|\bpex\b|\bcopper line\b|\btuber[íi]a\b/i,
    requireAction: true,
  },
  {
    workTypeKey: "plumbing.fixtures",
    subject:
      /\btoilets?\b|\bvanit(y|ies)\b|\bsinks?\b|\bfaucets?\b|\bshower(s| valve| head)?\b|\btubs?\b|\binodoros?\b|\bregaderas?\b/i,
    requireAction: true,
  },
  {
    workTypeKey: "electrical.circuits",
    subject: /\bcircuits?\b|\bbreakers?\b/i,
    requireAction: true,
  },
  {
    workTypeKey: "electrical.service",
    subject: /\b(service|electrical|sub)\s?panel\b|\bpanel upgrade\b|\bservice upgrade\b|\bamp service\b/i,
    requireAction: true,
    // "raised panel cabinet doors" is cabinetry, not an electrical panel.
    disqualifiers: COMPONENT_CONTEXT,
  },
  {
    workTypeKey: "electrical.wiring",
    subject: /\bwir(e|es|ing)\b|\bromex\b|\bconduit\b|\bcableado\b/i,
    requireAction: true,
  },
  {
    workTypeKey: "electrical.devices",
    subject: /\boutlets?\b|\breceptacles?\b|\bswitch(es)?\b|\bdevices?\b|\btomacorrientes?\b/i,
    requireAction: true,
    disqualifiers: COMPONENT_CONTEXT,
  },
  {
    workTypeKey: "electrical.fixtures",
    subject: /\blights?\b|\blighting\b|\brecessed\b|\bcan lights?\b|\bluminarias?\b/i,
    requireAction: true,
  },
  {
    workTypeKey: "hvac.equipment",
    subject: /\bhvac\b|\bfurnace\b|\bmini[- ]?split\b|\bduct(work)?\b|\bair condition/i,
    requireAction: true,
  },

  /* ---------------------------------------------------------- sitework */
  {
    workTypeKey: "concrete.footings",
    subject: /\bfootings?\b|\bfoundation walls?\b|\bstem wall\b/i,
    // "and the footings around it" carries the verb from the prior clause.
    requireAction: false,
  },
  {
    workTypeKey: "concrete.flatwork",
    subject: /\bconcrete\b|\bslab\b|\bdriveway\b|\bwalkway\b|\bsidewalk\b|\bconcreto\b/i,
    requireAction: true,
  },
];

function toPattern(rule: RecognitionRule): WorkPattern {
  const standard = standardFor(rule.standardKey ?? rule.workTypeKey);
  if (!standard) {
    throw new Error(`No trade standard registered for ${rule.workTypeKey}`);
  }
  return {
    ...rule,
    label: rule.label ?? standard.label,
    trade: standard.trade,
    unitKey: standard.unitKey,
    baseUnitKey: standard.baseUnitKey,
    family: standard.family,
    defaultAction: standard.defaultAction,
    derivation: standard.derivation,
    zoneKeys: standard.zoneKeys,
    wastePct: standard.wastePct,
    standingAssumption: standard.standingAssumption,
    allowance: standard.allowance,
    houseAreaRatio: standard.houseAreaRatio,
    standard,
  };
}

export const WORK_PATTERNS: WorkPattern[] = RECOGNITION_RULES.map(toPattern);

export function patternFor(workTypeKey: string): WorkPattern | undefined {
  return WORK_PATTERNS.find((p) => p.workTypeKey === workTypeKey);
}
