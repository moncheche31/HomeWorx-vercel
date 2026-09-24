/**
 * Module 014 — deterministic Project Vision paragraph.
 *
 * Customer language only. Built from the approved narrative and the room
 * names — never from estimating internals.
 */
import { containsInternalTerms } from "./sanitize";
import type { ProposalLocale } from "./types";

interface VisionSignal {
  key: string;
  patterns: RegExp[];
  en: string;
  es: string;
}

const SIGNALS: VisionSignal[] = [
  {
    key: "cabinetry",
    patterns: [/cabinet/i, /gabinet/i],
    en: "new cabinetry",
    es: "gabinetes nuevos",
  },
  {
    key: "countertops",
    patterns: [/countertop/i, /quartz/i, /granite/i, /encimera/i, /cuarzo/i, /granito/i],
    en: "fresh countertops",
    es: "nuevas encimeras",
  },
  {
    key: "flooring",
    patterns: [/floor/i, /hardwood/i, /\blvp\b/i, /tile/i, /piso/i, /baldos/i],
    en: "premium flooring",
    es: "pisos de calidad",
  },
  {
    key: "lighting",
    patterns: [/light/i, /recessed/i, /ilumina/i, /luz|luces/i],
    en: "upgraded lighting",
    es: "iluminación mejorada",
  },
  {
    key: "paint",
    patterns: [/paint/i, /pintur/i],
    en: "a fresh paint palette",
    es: "una nueva paleta de pintura",
  },
  {
    key: "plumbing",
    patterns: [/plumb/i, /faucet/i, /shower/i, /tub\b/i, /plomer/i, /ducha/i, /grifo/i],
    en: "modern fixtures",
    es: "accesorios modernos",
  },
  {
    key: "openconcept",
    patterns: [/open concept/i, /remove wall/i, /wall removal/i, /concepto abierto/i, /derribar/i],
    en: "a brighter, more open layout",
    es: "una distribución más abierta y luminosa",
  },
  {
    key: "trim",
    patterns: [/trim\b/i, /crown/i, /moldur/i],
    en: "refined trim details",
    es: "detalles de molduras refinados",
  },
];

function listify(parts: string[], locale: ProposalLocale): string {
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  const head = parts.slice(0, -1).join(", ");
  return locale === "es-US" ? `${head} y ${last}` : `${head}, and ${last}`;
}

export interface VisionInput {
  projectName: string;
  locale: ProposalLocale;
  approvedScopeText: string | null;
  roomNames?: string[];
  projectTypeLabel?: string | null;
}

/** Deterministic, customer-safe summary of what the project will feel like. */
export function generateVision(input: VisionInput): string {
  const { locale } = input;
  const corpus = [input.approvedScopeText ?? "", ...(input.roomNames ?? [])].join(" \n ");

  const highlights = SIGNALS.filter((s) => s.patterns.some((p) => p.test(corpus))).map((s) =>
    locale === "es-US" ? s.es : s.en,
  );

  const rooms = (input.roomNames ?? []).filter(Boolean);
  const subject =
    rooms.length > 0
      ? listify(rooms.slice(0, 3), locale)
      : (input.projectTypeLabel ?? input.projectName);

  const highlightText = listify(highlights.slice(0, 4), locale);

  const sentence =
    locale === "es-US"
      ? highlightText
        ? `Nos entusiasma transformar su ${subject} con ${highlightText}, cuidando su casa y su rutina en cada etapa del trabajo.`
        : `Nos entusiasma transformar su ${subject} con un trabajo cuidadoso y acabados de calidad, cuidando su casa y su rutina en cada etapa.`
      : highlightText
        ? `We're excited to transform your ${subject} with ${highlightText} — all while protecting your home and keeping disruption to a minimum.`
        : `We're excited to transform your ${subject} with careful craftsmanship and quality finishes — all while protecting your home and keeping disruption to a minimum.`;

  // Safety net: the vision is customer-facing by definition.
  return containsInternalTerms(sentence)
    ? locale === "es-US"
      ? `Nos entusiasma transformar su ${subject} con un trabajo cuidadoso y acabados de calidad.`
      : `We're excited to transform your ${subject} with careful craftsmanship and quality finishes.`
    : sentence;
}
