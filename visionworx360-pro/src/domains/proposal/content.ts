/**
 * Module 014 — deterministic bilingual copy tables.
 *
 * All proposal prose is authored here so the domain stays UI-free and both
 * languages ship together. No AI, no network.
 */
import type { ProposalBilingual, ProposalLevelKey, ProposalLocale } from "./types";

export const bi = (en: string, es: string): ProposalBilingual => ({ "en-US": en, "es-US": es });

export const pick = (value: ProposalBilingual, locale: ProposalLocale): string => value[locale];

/* ------------------------------------------------------------- schedule */

export interface SchedulePhaseTemplate {
  key: string;
  label: ProposalBilingual;
  description: ProposalBilingual;
  /** Keywords that make this phase relevant. Empty = always shown. */
  patterns?: RegExp[];
}

export const SCHEDULE_PHASES: SchedulePhaseTemplate[] = [
  {
    key: "preparation",
    label: bi("Preparation", "Preparación"),
    description: bi(
      "We protect your home, set up the work area and confirm the final selections with you.",
      "Protegemos su casa, preparamos el área de trabajo y confirmamos las selecciones finales con usted.",
    ),
  },
  {
    key: "demolition",
    label: bi("Demolition", "Demolición"),
    description: bi(
      "Existing finishes come out carefully, and debris leaves the site the same day.",
      "Los acabados existentes se retiran con cuidado y los escombros salen el mismo día.",
    ),
    patterns: [/\bdemo\w*/i, /\bremove\b/i, /\bdemol/i, /\bretir/i],
  },
  {
    key: "construction",
    label: bi("Construction", "Construcción"),
    description: bi(
      "Rough work, framing, and the trades complete their portion of the project.",
      "Trabajo estructural, armado y los oficios completan su parte del proyecto.",
    ),
  },
  {
    key: "finish_work",
    label: bi("Finish Work", "Acabados"),
    description: bi(
      "Cabinetry, surfaces, fixtures, paint and trim bring the space together.",
      "Gabinetes, superficies, accesorios, pintura y molduras completan el espacio.",
    ),
  },
  {
    key: "final_walkthrough",
    label: bi("Final Walkthrough", "Recorrido final"),
    description: bi(
      "We walk the finished space with you and handle anything on your list before we leave.",
      "Recorremos el espacio terminado con usted y atendemos su lista antes de irnos.",
    ),
  },
];

/* ----------------------------------------------------------- investment */

export interface LevelTemplate {
  key: ProposalLevelKey;
  label: ProposalBilingual;
  summary: ProposalBilingual;
  includes: ProposalBilingual[];
  /** Indicative only — the estimating engine remains the source of truth. */
  multiplier: number;
  recommended: boolean;
}

export const LEVEL_TEMPLATES: LevelTemplate[] = [
  {
    key: "economy",
    label: bi("Economy", "Económico"),
    summary: bi(
      "A clean, durable result using dependable everyday materials.",
      "Un resultado limpio y duradero con materiales confiables de uso diario.",
    ),
    includes: [
      bi("Every item in the Scope of Work above", "Cada punto del Alcance de trabajo anterior"),
      bi("Dependable standard-grade finishes", "Acabados estándar confiables"),
      bi("Full protection of your home", "Protección completa de su casa"),
    ],
    multiplier: 0.85,
    recommended: false,
  },
  {
    key: "good",
    label: bi("Good", "Recomendado"),
    summary: bi(
      "Our recommended balance of quality, longevity and value.",
      "Nuestro equilibrio recomendado entre calidad, durabilidad y valor.",
    ),
    includes: [
      bi("Every item in the Scope of Work above", "Cada punto del Alcance de trabajo anterior"),
      bi("Mid-grade finishes chosen for longevity", "Acabados de gama media elegidos por su durabilidad"),
      bi("Full protection of your home", "Protección completa de su casa"),
      bi("Daily cleanup and debris removal", "Limpieza diaria y retiro de escombros"),
    ],
    multiplier: 1,
    recommended: true,
  },
  {
    key: "premium",
    label: bi("Premium", "Premium"),
    summary: bi(
      "Upgraded materials and detailing for a showcase finish.",
      "Materiales y detalles superiores para un acabado excepcional.",
    ),
    includes: [
      bi("Every item in the Scope of Work above", "Cada punto del Alcance de trabajo anterior"),
      bi("Premium finishes and hardware", "Acabados y herrajes premium"),
      bi("Extended detailing and trim work", "Detalles y molduras ampliados"),
      bi("Priority scheduling", "Programación prioritaria"),
    ],
    multiplier: 1.22,
    recommended: false,
  },
];

/* ------------------------------------------------------------- warranty */

export const DEFAULT_WARRANTY = bi(
  "We stand behind our work. All labor performed under this proposal is warranted for one (1) year from the date of completion. Manufacturer warranties on materials, appliances and fixtures are passed through to you in full. If something isn't right, call us and we'll make it right.",
  "Respaldamos nuestro trabajo. Toda la mano de obra realizada bajo esta propuesta tiene garantía de un (1) año a partir de la fecha de finalización. Las garantías del fabricante sobre materiales, electrodomésticos y accesorios se transfieren íntegramente a usted. Si algo no está bien, llámenos y lo corregimos.",
);

export const ACCEPTANCE_STATEMENT = bi(
  "By accepting this proposal you approve the work described above and authorize us to schedule your project. A signed agreement and deposit schedule will follow.",
  "Al aceptar esta propuesta usted aprueba el trabajo descrito arriba y nos autoriza a programar su proyecto. A continuación se enviará el acuerdo firmado y el calendario de depósitos.",
);

/* --------------------------------------------------------------- vision */

export const GALLERY_LABELS: Record<"before" | "rendering" | "inspiration", ProposalBilingual> = {
  before: bi("Before", "Antes"),
  rendering: bi("After", "Después"),
  inspiration: bi("Inspiration", "Inspiración"),
};
