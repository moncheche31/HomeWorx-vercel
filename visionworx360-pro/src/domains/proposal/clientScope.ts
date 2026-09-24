/**
 * Module 014 — client-facing Scope of Work presentation.
 *
 * A *second presentation* over the SAME canonical narrative scope. There is no
 * second scope data model: this module reads the current approved/edited
 * narrative (Module 010B remains the single source of truth) and renders it as
 * cohesive, complete-sentence proposal prose.
 *
 * Rules enforced here:
 *  - never invent scope: every sentence is built from words already present in
 *    the canonical narrative;
 *  - never expose internal workflow artefacts: decision statuses, `Note:`
 *    lines, reconciliation metadata, estimating terminology and orphan raw
 *    questionnaire answers are dropped before grouping;
 *  - deterministic: same canonical text in, same document out, so nothing has
 *    to be cached or written back.
 */
import { isDecisionLine } from "@/domains/narrativeScope/sanitize";
import { isInternalLine } from "./sanitize";
import type { ProposalLocale, ProposalScopeSection } from "./types";

/* ------------------------------------------------------------ vocabulary */

/** Leading verbs that make a narrative line a complete instruction. */
const VERBS = new RegExp(
  "^(remove|demolish|demo|tear|frame|construct|build|install|reinstall|relocate|move|extend|" +
    "insulate|hang|tape|finish|paint|prime|vent|cut|close|provide|add|replace|connect|apply|" +
    "seal|patch|level|protect|complete|set|run|waterproof|tile|trim|match|verify|prepare|" +
    "retirar|retire|demoler|demuela|instalar|instale|reinstalar|enmarcar|enmarque|reubicar|" +
    "reubique|extender|extienda|aislar|aisle|pintar|pinte|imprimar|conectar|conecte|proveer|" +
    "provea|reemplazar|reemplace|nivelar|nivele|completar|complete|ventilar|ventile|colocar|" +
    "coloque|acabar|termine)\\b",
  "i",
);

/**
 * Orphan questionnaire answers. These are canonical *facts*, not scope prose —
 * when they leak into the narrative as bare fragments they must never reach a
 * customer document. Matched exactly, so real scope lines are never hit.
 */
const RAW_ANSWER_FRAGMENTS = new Set([
  "hardwood",
  "hardwood flooring",
  "through the wall",
  "through the roof",
  "standard",
  "not sure yet",
  "yes match existing",
  "yes, match existing",
  "load-bearing",
  "load bearing",
  "removed and framed in",
  "madera dura",
  "por la pared",
  "estandar",
  "no estoy seguro",
  "de carga",
]);

const NOTE_PREFIX = /^(note|nota|added to scope|agregado al alcance)\s*[:\-]/i;
const METADATA_PREFIX =
  /^(status|estado|source|origen|reconcil|fingerprint|revision|assumption|supuesto|qty|cantidad)\b/i;

/* -------------------------------------------------------------- sections */

interface ClientSectionSpec {
  key: string;
  title: Record<ProposalLocale, string>;
  patterns: RegExp[];
}

/** Ordered the way a construction project actually runs. */
const CLIENT_SECTIONS: ClientSectionSpec[] = [
  {
    key: "demolition",
    title: { "en-US": "Demolition & Preparation", "es-US": "Demolición y preparación" },
    patterns: [/\b(remove|removal|demolish|demo|tear out|dispose|debris|protect)/i, /\b(retir|demol|escombro|proteg)/i],
  },
  {
    key: "framing",
    title: { "en-US": "Framing & Openings", "es-US": "Estructura y aberturas" },
    patterns: [
      /\b(frame(?!less)|framing|platform|beam|post|header|opening|window|door(?!s and trim)|structural|shoring|temporary support|subfloor|joist|stud|lumber|advantech)/i,
      /\b(enmarc|estructur|viga|poste|abertura|ventana|puerta|subpiso|apuntal)/i,
    ],
  },
  {
    key: "bath_plumbing",
    title: { "en-US": "Bathroom & Plumbing", "es-US": "Baño y plomería" },
    patterns: [
      /\b(plumb|shower|toilet|vanity|sink|waterproof|supply line|shutoff|fixture|niche|tub|bath)/i,
      /\b(plomer|ducha|inodoro|lavabo|tocador|impermeab|grifo|bañ)/i,
    ],
  },
  {
    key: "electrical_hvac",
    title: { "en-US": "Electrical & HVAC", "es-US": "Electricidad y climatización" },
    patterns: [
      /\b(electric|circuit|outlet|receptacle|gfci|afci|lighting|light|hvac|duct|exhaust fan|ventilation|vent the)/i,
      /\b(electric|circuito|tomacorriente|iluminac|climatiz|conducto|extractor|ventilac)/i,
    ],
  },
  {
    key: "insulation_finishes",
    title: { "en-US": "Insulation, Drywall & Finishes", "es-US": "Aislamiento, panel de yeso y acabados" },
    patterns: [
      /\b(insulat|drywall|tape|texture|paint|prime|blend|finish level|finishes)/i,
      /\b(aisl|panel de yeso|tabla roca|pintur|pint|acabado)/i,
    ],
  },
  {
    key: "flooring_trim",
    title: { "en-US": "Flooring & Trim", "es-US": "Pisos y molduras" },
    patterns: [
      /\b(floor|hardwood|tile floor|baseboard|trim|transition|threshold|interior door)/i,
      /\b(piso|madera dura|zócalo|zocalo|moldur|umbral)/i,
    ],
  },
  {
    key: "permits",
    title: { "en-US": "Permits & Code Compliance", "es-US": "Permisos y cumplimiento del código" },
    patterns: [/\b(permit|inspection|code)/i, /\b(permiso|inspecc|código|codigo)/i],
  },
];

const FALLBACK_SECTION: ClientSectionSpec = {
  key: "general",
  title: { "en-US": "General Requirements", "es-US": "Requisitos generales" },
  patterns: [],
};

/* --------------------------------------------------------------- helpers */

function normalize(line: string): string {
  return line
    .trim()
    .replace(/^[-•*\u2022]+\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function fingerprint(line: string): string {
  return normalize(line)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.!;,]+$/, "")
    .trim();
}

/** Drops the stacked generator verb in lines like "Install extend HVAC…". */
function unstackVerb(text: string): string {
  const match = text.match(
    /^(install|construct|paint|frame|remove|instale|instalar|construya|pinte)\s+(.+)$/i,
  );
  if (!match) return text;
  const rest = match[2];
  return VERBS.test(rest) ? rest : text;
}

/** Trade acronyms keep their canonical casing in customer prose. */
const ACRONYMS = /\b(hvac|gfci|afci|lvl|pvc|led)\b/gi;

function toSentence(text: string): string {
  text = text.replace(ACRONYMS, (m) => m.toUpperCase());
  const trimmed = text.replace(/[.\s]+$/, "").trim();
  if (!trimmed) return "";
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.`;
}

interface Statement {
  /** Complete instruction, e.g. "Remove the existing garage partition wall". */
  clause: string;
  /** Leading verb, lowercased, used to combine repetitive sentences. */
  verb: string | null;
  /** True when the line is a noun phrase such as "Building permit". */
  nominal: boolean;
}

function classify(text: string, locale: ProposalLocale): ClientSectionSpec {
  for (const section of CLIENT_SECTIONS) {
    if (section.patterns.some((p) => p.test(text))) return section;
  }
  void locale;
  return FALLBACK_SECTION;
}

/** True when a narrative line is workflow exhaust rather than client scope. */
export function isNonScopeLine(line: string, locale: ProposalLocale): boolean {
  const trimmed = normalize(line);
  if (!trimmed) return true;
  if (isDecisionLine(trimmed)) return true;
  if (NOTE_PREFIX.test(trimmed)) return true;
  if (METADATA_PREFIX.test(trimmed)) return true;
  if (isInternalLine(trimmed, locale)) return true;
  if (RAW_ANSWER_FRAGMENTS.has(fingerprint(trimmed))) return true;
  return false;
}

function parseStatements(text: string, locale: ProposalLocale): Statement[] {
  const out: Statement[] = [];
  const seen = new Set<string>();

  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = normalize(raw);
    if (!line) continue;
    if (isNonScopeLine(line, locale)) continue;

    const body = unstackVerb(line.replace(/[.]+$/, "").trim());
    if (!body) continue;

    const print = fingerprint(body);
    if (!print || seen.has(print)) continue;

    const verbMatch = body.match(VERBS);
    const words = body.split(/\s+/);
    /*
     * Section headings from the internal narrative ("Framing & Insulation",
     * "Paint & Trim", "HVAC") are title-case labels, not work. They carry no
     * facts, so dropping them loses nothing — the client sections are rebuilt.
     */
    const titleCased = words.every((w) => /^[^a-z]/.test(w) || /^[A-Z]/.test(w));
    const ended = /[.;:]$/.test(line);
    if (words.length <= 3 && titleCased && !ended) continue;

    const isNominal =
      !verbMatch || (verbMatch.index ?? 0) > 0;
    seen.add(print);
    out.push({
      clause: body,
      verb: !isNominal && verbMatch ? verbMatch[0].toLowerCase() : null,
      /* Long or clausal lines stay standalone sentences, never list items. */
      nominal: isNominal && words.length <= 6 && !/[;(]/.test(body) && !/\bis\b|\bare\b|\bson\b|\bes\b/i.test(body),
    });
  }

  return out;
}

const AND: Record<ProposalLocale, string> = { "en-US": "and", "es-US": "y" };

function joinClauses(parts: string[], locale: ProposalLocale): string {
  if (parts.length === 1) return parts[0];
  const head = parts.slice(0, -1).join(", ");
  return `${head} ${AND[locale]} ${parts[parts.length - 1]}`;
}

/**
 * Combines up to three consecutive same-verb instructions into one sentence so
 * the section does not read "Install… Install… Install…". Only the shared verb
 * is factored out — no wording is invented or reworded.
 */
function composeSentences(statements: Statement[], locale: ProposalLocale): string[] {
  const sentences: string[] = [];
  const verbal = statements.filter((s) => !s.nominal);
  const nominal = statements.filter((s) => s.nominal);

  let index = 0;
  while (index < verbal.length) {
    const current = verbal[index];
    const group = [current];
    while (
      group.length < 3 &&
      index + group.length < verbal.length &&
      verbal[index + group.length].verb === current.verb
    ) {
      group.push(verbal[index + group.length]);
    }
    index += group.length;

    const verb = current.verb ?? "";
    const objects = group.map((s) => s.clause.slice(verb.length).trim()).filter(Boolean);
    /*
     * Only merge when every object is a short, self-contained noun phrase.
     * Anything with its own conjunction, punctuation or parenthetical stays a
     * sentence of its own — a readable proposal beats a clever one.
     */
    const mergeable =
      group.length > 1 &&
      objects.length === group.length &&
      objects.every(
        (o) => o.split(/\s+/).length <= 5 && !/\b(and|y)\b|[;,(/]/.test(o) && /^[a-z]/i.test(o),
      );
    if (!mergeable) {
      sentences.push(toSentence(current.clause));
      index -= group.length - 1;
      continue;
    }
    sentences.push(toSentence(`${verb} ${joinClauses(objects, locale)}`));
  }

  if (nominal.length > 0) {
    const lead =
      locale === "es-US" ? "El trabajo también incluye" : "The work also includes";
    const items = nominal.map((s) => {
      const clause = s.clause.replace(/[.]+$/, "");
      const [first, ...rest] = clause.split(" ");
      /* Preserve acronyms and product names (LVL, GFCI, Advantech). */
      const head = /^[A-Z][a-z]+$/.test(first) ? first.toLowerCase() : first;
      return [head, ...rest].join(" ");
    });
    for (let i = 0; i < items.length; i += 6) {
      sentences.push(toSentence(`${lead} ${joinClauses(items.slice(i, i + 6), locale)}`));
    }
  }

  return sentences;
}

/* ----------------------------------------------------------------- intro */

export function buildScopeIntro(
  projectName: string,
  locale: ProposalLocale,
  hasScope: boolean,
): string | null {
  if (!hasScope) return null;
  const name = projectName.trim();
  return locale === "es-US"
    ? `El siguiente Alcance de trabajo describe el trabajo incluido para ${name || "su proyecto"}, organizado en el orden en que se realizará.`
    : `The following Scope of Work describes the work included for ${name || "your project"}, organized in the order it will be completed.`;
}

/* --------------------------------------------------------------- builder */

/**
 * Client presentation of the canonical narrative: cohesive complete-sentence
 * sections, grouped by phase. Returns [] when nothing presentable remains.
 */
export function buildClientScopeSections(
  text: string | null,
  locale: ProposalLocale,
): ProposalScopeSection[] {
  if (!text || !text.trim()) return [];
  const statements = parseStatements(text, locale);
  if (statements.length === 0) return [];

  const buckets = new Map<string, { spec: ClientSectionSpec; items: Statement[] }>();
  for (const statement of statements) {
    const spec = classify(statement.clause, locale);
    const bucket = buckets.get(spec.key) ?? { spec, items: [] };
    bucket.items.push(statement);
    buckets.set(spec.key, bucket);
  }

  const order = [...CLIENT_SECTIONS, FALLBACK_SECTION];
  return order
    .filter((spec) => buckets.has(spec.key))
    .map((spec) => {
      const items = buckets.get(spec.key)!.items;
      return {
        key: `client-${spec.key}`,
        title: spec.title[locale],
        lines: composeSentences(items, locale),
        presentation: "prose" as const,
      };
    })
    .filter((section) => section.lines.length > 0);
}
