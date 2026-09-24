import { translateAnswers } from "./answerTranslation";
import type {

  NarrativeDocument,
  NarrativeGroup,
  NarrativeInput,
  NarrativeLine,
  NarrativeLocale,
  NarrativeSourceItem,
} from "./types";

/* ------------------------------ lexicons ------------------------------- */

const ACTION_VERBS: Record<NarrativeLocale, Record<string, string>> = {
  "en-US": {
    install: "Install",
    remove: "Remove",
    replace: "Replace",
    repair: "Repair",
    refinish: "Refinish",
    paint: "Paint",
    clean: "Clean",
    relocate: "Relocate",
    modify: "Modify",
    build: "Construct",
    inspect: "Inspect",
    protect: "Protect",
    supply_only: "Supply",
    labor_only: "Provide labor for",
  },
  "es-US": {
    install: "Instalar",
    remove: "Retirar",
    replace: "Reemplazar",
    repair: "Reparar",
    refinish: "Restaurar",
    paint: "Pintar",
    clean: "Limpiar",
    relocate: "Reubicar",
    modify: "Modificar",
    build: "Construir",
    inspect: "Inspeccionar",
    protect: "Proteger",
    supply_only: "Suministrar",
    labor_only: "Proveer mano de obra para",
  },
};

const UNIT_LABELS: Record<NarrativeLocale, Record<string, [string, string]>> = {
  "en-US": {
    each: ["each", "each"],
    linear_foot: ["linear foot", "linear feet"],
    square_foot: ["square foot", "square feet"],
    cubic_foot: ["cubic foot", "cubic feet"],
    cubic_yard: ["cubic yard", "cubic yards"],
    sheet: ["sheet", "sheets"],
    board_foot: ["board foot", "board feet"],
    gallon: ["gallon", "gallons"],
    pound: ["pound", "pounds"],
    hour: ["hour", "hours"],
    day: ["day", "days"],
  },
  "es-US": {
    each: ["unidad", "unidades"],
    linear_foot: ["pie lineal", "pies lineales"],
    square_foot: ["pie cuadrado", "pies cuadrados"],
    cubic_foot: ["pie cúbico", "pies cúbicos"],
    cubic_yard: ["yarda cúbica", "yardas cúbicas"],
    sheet: ["hoja", "hojas"],
    board_foot: ["pie tabla", "pies tabla"],
    gallon: ["galón", "galones"],
    pound: ["libra", "libras"],
    hour: ["hora", "horas"],
    day: ["día", "días"],
  },
};

const PHRASES: Record<
  NarrativeLocale,
  {
    approximately: string;
    using: string;
    allowance: string;
    general: string;
    closing: string;
    note: string;
  }
> = {
  "en-US": {
    approximately: "approximately",
    using: "using",
    allowance: "allowance",
    general: "General Work",
    closing: "Finish all work in accordance with local building code.",
    note: "Note",
  },
  "es-US": {
    approximately: "aproximadamente",
    using: "con",
    allowance: "presupuesto asignado",
    general: "Trabajo general",
    closing: "Terminar todo el trabajo conforme al código de construcción local.",
    note: "Nota",
  },
};

/* ------------------------------- helpers ------------------------------- */

function formatNumber(value: number, locale: NarrativeLocale): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

function unitLabel(unitKey: string | null, quantity: number, locale: NarrativeLocale): string | null {
  if (!unitKey) return null;
  const pair = UNIT_LABELS[locale][unitKey];
  if (!pair) return null;
  return quantity === 1 ? pair[0] : pair[1];
}

function capitalize(value: string): string {
  return value.length ? value[0].toUpperCase() + value.slice(1) : value;
}

/** Deterministic sentence for a single scope item. */
export function itemSentence(item: NarrativeSourceItem, locale: NarrativeLocale): string {
  const title = item.title.trim().replace(/\.+$/, "");
  const verb = item.actionKey ? ACTION_VERBS[locale][item.actionKey] : undefined;
  const lowerTitle = title.toLowerCase();
  const alreadyLeadsWithVerb =
    !!verb && lowerTitle.startsWith(verb.toLowerCase());

  let sentence = verb && !alreadyLeadsWithVerb ? `${verb} ${lowerTitle}` : capitalize(title);

  const qty = item.quantity;
  if (qty != null && qty > 0 && item.unitKey !== "lump_sum") {
    if (item.unitKey === "allowance") {
      sentence += ` (${PHRASES[locale].allowance}: ${formatNumber(qty, locale)})`;
    } else {
      const label = unitLabel(item.unitKey, qty, locale);
      sentence += label
        ? ` (${PHRASES[locale].approximately} ${formatNumber(qty, locale)} ${label})`
        : ` (${formatNumber(qty, locale)})`;
    }
  }

  if (item.materialSelection?.trim()) {
    sentence += ` ${PHRASES[locale].using} ${item.materialSelection.trim()}`;
  }

  let text = `${capitalize(sentence).replace(/\s+/g, " ").trim()}`;
  if (item.detail?.trim()) {
    text += `: ${item.detail.trim().replace(/\.+$/, "")}`;
  }
  return `${text}.`;

}

/* ------------------------------ generator ------------------------------ */

/** Comparable form of a line, for duplicate detection and section matching. */
function fingerprintText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


/**
 * Render the existing scope records as a narrative Scope of Work.
 * Pure and side-effect free: same input always produces the same document.
 */
export function generateNarrative(input: NarrativeInput): NarrativeDocument {
  const { locale, audience = "contractor" } = input;
  const phrases = PHRASES[locale];
  const roomNames = new Map(input.rooms.map((r) => [r.id, r.name]));
  const sectionById = new Map(input.sections.map((s) => [s.id, s]));

  const visible = input.items
    .filter((it) => it.isIncluded)
    .filter((it) => (audience === "customer" ? it.isClientVisible : true))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const buckets = new Map<string, { title: string; order: number; items: NarrativeSourceItem[] }>();

  for (const item of visible) {
    const section = sectionById.get(item.sectionId);
    const roomId = item.roomId ?? section?.roomId ?? null;
    const key = roomId ?? section?.id ?? "general";
    const title =
      (roomId ? roomNames.get(roomId) : undefined) ?? section?.name ?? phrases.general;
    const order = section?.sortOrder ?? 0;
    const bucket = buckets.get(key);
    if (bucket) bucket.items.push(item);
    else buckets.set(key, { title, order, items: [item] });
  }

  const groups: NarrativeGroup[] = Array.from(buckets.entries())
    .sort((a, b) => a[1].order - b[1].order || a[1].title.localeCompare(b[1].title))
    .map(([key, bucket]) => {
      const lines: NarrativeLine[] = bucket.items.map((item) => ({
        key: `line:${item.id}`,
        itemId: item.id,
        text: itemSentence(item, locale),
      }));
      /**
       * A note is only worth showing when it says something the scope line
       * does not already say. Interpretation used to store the originating
       * phrase here, which produced a "Note:" echo under every added item.
       */
      for (const item of bucket.items) {
        const note = item.customerNotes?.trim();
        if (!note) continue;
        const noteKey = fingerprintText(note);
        const already = lines.some((l) => fingerprintText(l.text).includes(noteKey));
        if (!noteKey || already) continue;
        lines.push({
          key: `note:${item.id}`,
          itemId: item.id,
          text: `${phrases.note}: ${note.replace(/\.+$/, "")}.`,
        });
      }
      return { key, title: bucket.title, lines };
    });

  /**
   * Answers become scope prose only through the semantic translation layer:
   * question context + answer value -> a complete contractor sentence, placed
   * under the section it belongs to. Raw answer values are never echoed, and
   * decision statuses never reach the document at all.
   */
  const baseText = groups.flatMap((g) => g.lines.map((l) => l.text)).join("\n");
  const translated = translateAnswers(input.answers, locale, baseText);

  for (const answer of translated) {
    const target =
      groups.find((g) =>
        answer.sectionHints.some((hint) => fingerprintText(g.title).includes(hint)),
      ) ?? groups[groups.length - 1];
    if (!target) continue;
    target.lines.push({
      key: `answer:${fingerprintText(answer.text).slice(0, 48)}`,
      itemId: null,
      text: answer.text,
    });
  }



  const text = [
    input.projectName,
    "",
    ...groups.flatMap((g) => [
      groups.length > 1 || g.title !== phrases.general ? g.title : "",
      ...g.lines.map((l) => l.text),
      "",
    ]),
    phrases.closing,
  ]
    .filter((line, index, all) => !(line === "" && all[index - 1] === ""))
    .join("\n")
    .trim();

  return { title: input.projectName, groups, closing: phrases.closing, text };
}
