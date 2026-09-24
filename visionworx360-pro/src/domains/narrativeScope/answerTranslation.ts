/**
 * Semantic answer -> scope-statement translation.
 *
 * A raw answer value is NOT scope prose. "through the wall", "hardwood",
 * "Yes, match existing" and "accepted" are canonical facts recorded against a
 * question; dropping the bare value into the Scope of Work produced orphan
 * fragments with no subject.
 *
 * This module is the ONLY path from an answer to visible narrative text. It
 * receives the question context (the semantic key encoded in the answer id)
 * plus the answer value, and returns either:
 *   1. a complete contractor-readable sentence with a section hint, or
 *   2. nothing at all — the fact stays canonical and invisible.
 *
 * It never falls back to echoing the raw answer.
 */
import type { NarrativeLocale } from "./types";
import { isDecisionAnswer } from "./sanitize";

export interface TranslatedAnswer {
  /** Complete contractor sentence, already punctuated. */
  text: string;
  /**
   * Lowercase keywords used to place the sentence under the right section.
   * The first matching section wins; no match means the sentence is appended
   * to the general/last group.
   */
  sectionHints: string[];
  /** Phrases that mean "already said" — used to avoid duplicate prose. */
  dedupe: string[];
}

type Bilingual = { "en-US": string; "es-US": string };

interface Rule {
  /** Answer value matcher, tested against the normalized value. */
  match: RegExp;
  sentence: Bilingual;
  sectionHints: string[];
  dedupe: string[];
}

const norm = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.!;,]+$/g, "")
    .trim();

/** Values that mean "no decision yet" — never rendered, in any topic. */
const UNKNOWN = /^(not sure|not sure yet|unknown|tbd|n\/a|no se|no se aun|aun no se|pendiente|skip|omitir)$/;

const TOPIC_RULES: Record<string, Rule[]> = {
  garage_door_disposition: [
    {
      match: /keep|se quedan/,
      sentence: {
        "en-US": "Existing garage door remains in place.",
        "es-US": "La puerta de garaje existente se conserva.",
      },
      sectionHints: ["fram", "demo", "exterior"],
      dedupe: ["garage door remains", "puerta de garaje existente"],
    },
    {
      match: /remove|framed in|infill|se quitan/,
      sentence: {
        "en-US": "Remove the existing garage door and frame in the opening.",
        "es-US": "Retirar la puerta de garaje existente y cerrar la abertura con estructura.",
      },
      sectionHints: ["fram", "demo", "exterior"],
      dedupe: ["garage door and frame in", "puerta de garaje existente y cerrar"],
    },
    {
      match: /window|ventana/,
      sentence: {
        "en-US": "Remove the existing garage door and infill the opening with a new window.",
        "es-US": "Retirar la puerta de garaje existente y cerrar la abertura con una ventana nueva.",
      },
      sectionHints: ["fram", "exterior", "window"],
      dedupe: ["garage door and infill", "abertura con una ventana nueva"],
    },
  ],
  bath_fixture_type: [
    {
      match: /shower only|solo ducha/,
      sentence: {
        "en-US": "Bathroom is fitted with a shower only; no tub is included.",
        "es-US": "El baño lleva solo ducha; no se incluye tina.",
      },
      sectionHints: ["bath", "plumb", "bano"],
      dedupe: ["shower only", "solo ducha"],
    },
    {
      match: /tub/,
      sentence: {
        "en-US": "Bathroom is fitted with a tub and shower combination.",
        "es-US": "El baño lleva combinación de tina con ducha.",
      },
      sectionHints: ["bath", "plumb", "bano"],
      dedupe: ["tub and shower", "tina con ducha"],
    },
    {
      match: /no bath|sin bano/,
      sentence: {
        "en-US": "No bathroom is included in this scope.",
        "es-US": "No se incluye baño en este alcance.",
      },
      sectionHints: ["bath", "plumb", "bano"],
      dedupe: ["no bathroom is included", "no se incluye bano"],
    },
  ],
  hvac_strategy: [
    {
      match: /extend|existing|extender/,
      sentence: {
        "en-US": "Extend the existing heating and cooling system to serve the new space.",
        "es-US": "Extender el sistema de climatización existente al espacio nuevo.",
      },
      sectionHints: ["hvac", "mechanical", "climat"],
      dedupe: ["extend the existing heating", "extender el sistema de climatizacion"],
    },
    {
      match: /mini.?split/,
      sentence: {
        "en-US": "Install a ductless mini-split system to condition the new space.",
        "es-US": "Instalar un sistema mini-split para climatizar el espacio nuevo.",
      },
      sectionHints: ["hvac", "mechanical", "climat"],
      dedupe: ["mini-split", "mini split"],
    },
    {
      match: /separate|aparte/,
      sentence: {
        "en-US": "Install a separate heating and cooling system for the new space.",
        "es-US": "Instalar un sistema de climatización independiente para el espacio nuevo.",
      },
      sectionHints: ["hvac", "mechanical", "climat"],
      dedupe: ["separate heating and cooling", "climatizacion independiente"],
    },
  ],
  opening_disposition: [
    {
      match: /reuse|reutiliz/,
      sentence: {
        "en-US": "Existing windows are reused in place.",
        "es-US": "Las ventanas existentes se reutilizan en su lugar.",
      },
      sectionHints: ["window", "fram", "exterior", "ventana"],
      dedupe: ["windows are reused", "ventanas existentes se reutilizan"],
    },
    {
      match: /replace|reemplaz/,
      sentence: {
        "en-US": "Replace the existing windows with new units.",
        "es-US": "Reemplazar las ventanas existentes por unidades nuevas.",
      },
      sectionHints: ["window", "fram", "exterior", "ventana"],
      dedupe: ["replace the existing windows", "reemplazar las ventanas existentes"],
    },
    {
      match: /relocat|reubic/,
      sentence: {
        "en-US": "Relocate and reframe the existing window openings.",
        "es-US": "Reubicar y reestructurar las aberturas de ventana existentes.",
      },
      sectionHints: ["window", "fram", "exterior", "ventana"],
      dedupe: ["relocate and reframe", "reubicar y reestructurar"],
    },
  ],
  structural_wall: [
    {
      match: /^load.?bearing|de carga/,
      sentence: {
        "en-US":
          "The wall being removed is load-bearing; provide temporary support and a new beam with posts per structural design.",
        "es-US":
          "La pared que se retira es de carga; proveer soporte temporal y una viga nueva con postes según el diseño estructural.",
      },
      sectionHints: ["fram", "demo", "structur", "estructur"],
      dedupe: ["is load-bearing", "es de carga"],
    },
    {
      match: /non.?load|no es de carga/,
      sentence: {
        "en-US": "The wall being removed is non-load-bearing; no structural beam is required.",
        "es-US": "La pared que se retira no es de carga; no se requiere viga estructural.",
      },
      sectionHints: ["fram", "demo", "structur", "estructur"],
      dedupe: ["non-load-bearing", "no es de carga"],
    },
  ],
  electrical_service: [
    {
      match: /existing panel|panel existente/,
      sentence: {
        "en-US": "New circuits are fed from the existing electrical panel.",
        "es-US": "Los circuitos nuevos se alimentan del panel eléctrico existente.",
      },
      sectionHints: ["electric", "electr"],
      dedupe: ["existing electrical panel", "panel electrico existente"],
    },
    {
      match: /subpanel/,
      sentence: {
        "en-US": "Install a new subpanel to feed the new circuits.",
        "es-US": "Instalar un subpanel nuevo para alimentar los circuitos nuevos.",
      },
      sectionHints: ["electric", "electr"],
      dedupe: ["new subpanel", "subpanel nuevo"],
    },
    {
      match: /service upgrade|mejora de servicio/,
      sentence: {
        "en-US": "Upgrade the electrical service to support the new load.",
        "es-US": "Mejorar el servicio eléctrico para soportar la carga nueva.",
      },
      sectionHints: ["electric", "electr"],
      dedupe: ["upgrade the electrical service", "mejorar el servicio electrico"],
    },
  ],
  interior_door_style: [
    {
      match: /^yes|match|si,? que coincidan|^si$/,
      sentence: {
        "en-US": "New interior doors and trim match the existing interior door style.",
        "es-US": "Las puertas y molduras interiores nuevas coinciden con el estilo existente.",
      },
      sectionHints: ["carpentry", "door", "trim", "carpinter", "puerta"],
      dedupe: ["match the existing interior door", "coinciden con el estilo existente"],
    },
    {
      match: /^no/,
      sentence: {
        "en-US": "New interior doors are a new style and do not match the existing doors.",
        "es-US": "Las puertas interiores nuevas son de un estilo nuevo y no coinciden con las existentes.",
      },
      sectionHints: ["carpentry", "door", "trim", "carpinter", "puerta"],
      dedupe: ["do not match the existing doors", "no coinciden con las existentes"],
    },
  ],
  bath_exhaust_venting: [
    {
      match: /wall|pared/,
      sentence: {
        "en-US": "Vent the bathroom exhaust fan through the exterior wall.",
        "es-US": "Ventilar el extractor del baño por la pared exterior.",
      },
      sectionHints: ["bath", "electric", "hvac", "vent", "bano"],
      dedupe: ["exhaust fan through the exterior wall", "extractor del bano por la pared"],
    },
    {
      match: /roof|techo/,
      sentence: {
        "en-US": "Vent the bathroom exhaust fan through the roof.",
        "es-US": "Ventilar el extractor del baño por el techo.",
      },
      sectionHints: ["bath", "electric", "hvac", "vent", "bano"],
      dedupe: ["exhaust fan through the roof", "extractor del bano por el techo"],
    },
    {
      match: /soffit|alero/,
      sentence: {
        "en-US": "Vent the bathroom exhaust fan through the soffit.",
        "es-US": "Ventilar el extractor del baño por el alero.",
      },
      sectionHints: ["bath", "electric", "hvac", "vent", "bano"],
      dedupe: ["exhaust fan through the soffit", "extractor del bano por el alero"],
    },
  ],
  flooring_selection: [
    {
      match: /hardwood|madera/,
      sentence: {
        "en-US": "Install hardwood flooring in the finished space.",
        "es-US": "Instalar piso de madera en el espacio terminado.",
      },
      sectionHints: ["floor", "piso"],
      dedupe: ["hardwood flooring", "piso de madera"],
    },
    {
      match: /lvp|luxury vinyl|vinilo/,
      sentence: {
        "en-US": "Install luxury vinyl plank flooring in the finished space.",
        "es-US": "Instalar piso vinílico de lujo (LVP) en el espacio terminado.",
      },
      sectionHints: ["floor", "piso"],
      dedupe: ["luxury vinyl plank", "vinilico de lujo"],
    },
    {
      match: /tile|azulejo/,
      sentence: {
        "en-US": "Install tile flooring in the finished space.",
        "es-US": "Instalar piso de azulejo en el espacio terminado.",
      },
      sectionHints: ["floor", "piso"],
      dedupe: ["tile flooring", "piso de azulejo"],
    },
    {
      match: /carpet|alfombra/,
      sentence: {
        "en-US": "Install carpet in the finished space.",
        "es-US": "Instalar alfombra en el espacio terminado.",
      },
      sectionHints: ["floor", "piso"],
      dedupe: ["install carpet", "instalar alfombra"],
    },
  ],
  finish_level: [
    {
      match: /builder|basic|basico/,
      sentence: {
        "en-US": "Finishes and fixtures are builder-grade throughout.",
        "es-US": "Los acabados y accesorios son de nivel básico en todo el proyecto.",
      },
      sectionHints: ["paint", "trim", "finish", "acabado", "pintura"],
      dedupe: ["builder-grade", "nivel basico"],
    },
    {
      match: /standard|estandar/,
      sentence: {
        "en-US": "Finishes and fixtures are standard-grade throughout.",
        "es-US": "Los acabados y accesorios son de nivel estándar en todo el proyecto.",
      },
      sectionHints: ["paint", "trim", "finish", "acabado", "pintura"],
      dedupe: ["standard-grade", "nivel estandar"],
    },
    {
      match: /premium/,
      sentence: {
        "en-US": "Finishes and fixtures are premium-grade throughout.",
        "es-US": "Los acabados y accesorios son de nivel premium en todo el proyecto.",
      },
      sectionHints: ["paint", "trim", "finish", "acabado", "pintura"],
      dedupe: ["premium-grade", "nivel premium"],
    },
  ],
};

/** Every raw option label the translation layer knows how to recognise. */
export function isKnownAnswerKey(key: string): boolean {
  return key.startsWith("topic:") || key.startsWith("review.") || key.startsWith("selection:");
}

const MIN_PROSE_WORDS = 4;

/** A free-text answer is prose only when it reads like a full statement. */
function isProse(value: string): boolean {
  const words = value.trim().split(/\s+/);
  if (words.length < MIN_PROSE_WORDS) return false;
  return /[a-z]/i.test(value);
}

/**
 * Translate a single persisted answer into visible scope prose, or nothing.
 *
 * `key` carries the question context (`topic:<semantic topic>`,
 * `decision:<scope item id>`, `review.<...>`, `selection:<item id>:<...>`).
 */
export function translateAnswer(
  key: string,
  rawValue: string,
  locale: NarrativeLocale,
): TranslatedAnswer | null {
  const value = (rawValue ?? "").trim();
  if (!value) return null;

  /* Review decisions and status labels are audit facts, never scope prose. */
  if (isDecisionAnswer(key, value)) return null;

  const normalized = norm(value);
  if (UNKNOWN.test(normalized)) return null;

  if (key.startsWith("topic:")) {
    const topic = key.slice("topic:".length);
    const rules = TOPIC_RULES[topic];
    if (!rules) return null; // unknown context -> canonical fact only
    const rule = rules.find((r) => r.match.test(normalized));
    if (!rule) return null;
    return {
      text: rule.sentence[locale],
      sectionHints: rule.sectionHints,
      dedupe: [...rule.dedupe, norm(rule.sentence[locale])],
    };
  }

  /* Material/product selections belong to their scope item, not to prose. */
  if (key.startsWith("selection:")) return null;

  /* Contractor free text against an item decision: prose only if complete. */
  if (key.startsWith("decision:")) {
    if (!isProse(value)) return null;
    const text = `${value[0].toUpperCase()}${value.slice(1).replace(/\.+$/, "")}.`;
    return { text, sectionHints: [], dedupe: [norm(text)] };
  }

  /* Unrecognised namespace: never echo the raw answer. */
  return null;
}

/**
 * Translate the full answer map, dropping anything already represented in the
 * narrative and collapsing duplicates.
 */
export function translateAnswers(
  answers: Record<string, string> | null | undefined,
  locale: NarrativeLocale,
  existingText: string,
): TranslatedAnswer[] {
  const haystack = norm(existingText).replace(/\s+/g, " ");
  const out: TranslatedAnswer[] = [];
  const seen = new Set<string>();

  for (const [key, value] of Object.entries(answers ?? {}).sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const translated = translateAnswer(key, value ?? "", locale);
    if (!translated) continue;
    const fingerprint = norm(translated.text);
    if (seen.has(fingerprint)) continue;
    if (translated.dedupe.some((phrase) => haystack.includes(norm(phrase)))) continue;
    seen.add(fingerprint);
    out.push(translated);
  }
  return out;
}

/** Every raw answer value, normalized — used to scrub legacy orphan lines. */
export function rawAnswerFragments(
  answers: Record<string, string> | null | undefined,
): Set<string> {
  const set = new Set<string>();
  for (const [key, value] of Object.entries(answers ?? {})) {
    if (!value?.trim()) continue;
    if (key.startsWith("decision:") && isProse(value)) continue;
    set.add(norm(value));
    if (key.startsWith("selection:")) {
      const suffix = key.split(":").slice(2).join(":");
      if (suffix) set.add(norm(suffix));
    }
  }
  return set;
}
