/**
 * Module 014C — Proposal template registry (realtor-oriented modes).
 *
 * A template changes *presentation only*: which sections appear, their
 * headings and their static copy. It never touches project, scope, estimate,
 * pricing, ballpark or photo data. Pricing always comes from the centralized
 * active-pricing resolver and is rendered by the shared investment component.
 *
 * All copy is centralized and versioned here so future config can override it
 * without touching components.
 */
import { bi, pick } from "./content";
import type { ProposalBilingual, ProposalLocale } from "./types";

export type ProposalTemplateKey =
  | "contractor"
  | "buyer_transformation"
  | "realtor_brief";

export const PROPOSAL_TEMPLATES: ProposalTemplateKey[] = [
  "contractor",
  "buyer_transformation",
  "realtor_brief",
];

/** How a template section is rendered by the view layer. */
export type ProposalTemplateRender =
  | "text"
  | "gallery_before"
  | "gallery_after"
  | "gallery_pair"
  | "investment"
  | "notice";

interface TemplateSectionTemplate {
  key: string;
  heading: ProposalBilingual;
  body?: ProposalBilingual;
  render: ProposalTemplateRender;
}

export interface ProposalTemplateDefinition {
  key: ProposalTemplateKey;
  /** Copy version — bump whenever wording changes. */
  version: string;
  label: ProposalBilingual;
  description: ProposalBilingual;
  /** True when the document is not meant to be handed to a customer. */
  internalOnly: boolean;
  /** Document title shown above the assembled sections. */
  title: ProposalBilingual;
  intro: { heading: ProposalBilingual; body: ProposalBilingual };
  sections: TemplateSectionTemplate[];
  disclaimer: { heading: ProposalBilingual; body: ProposalBilingual };
}

/* ------------------------------------------------------- shared notices */

export const CONCEPTUAL_VISUALIZATION_NOTICE = bi(
  "Renderings are conceptual representations intended for visualization and planning purposes. They are not architectural, engineering, permitting, or construction documents. Dimensions, materials, finishes, structural conditions, code requirements, product availability, and final costs must be independently verified before construction.",
  "Las representaciones son conceptuales y están destinadas a la visualización y la planificación. No son documentos arquitectónicos, de ingeniería, de permisos ni de construcción. Las dimensiones, los materiales, los acabados, las condiciones estructurales, los requisitos del código, la disponibilidad de productos y los costos finales deben verificarse de forma independiente antes de construir.",
);

export const REALTOR_INTERNAL_NOTICE = bi(
  "Internal real-estate planning use only. This brief is not a construction proposal and the renovation figures shown are preliminary, not guaranteed. Do not present this document to a buyer as a final price or as a construction agreement.",
  "Solo para uso interno de planificación inmobiliaria. Este resumen no es una propuesta de construcción y las cifras de renovación mostradas son preliminares, no garantizadas. No presente este documento a un comprador como precio final ni como acuerdo de construcción.",
);

/**
 * Construction-experience credibility copy (realtor templates only).
 * Deliberately makes no licensing, code-compliance, permitting, engineering,
 * constructability, pricing or product-availability claims.
 */
export const BUYER_CREDIBILITY_SECTION = {
  key: "construction_experience",
  heading: bi(
    "Built from Real Construction Experience",
    "Creado a partir de experiencia real en construcción",
  ),
  body: bi(
    "VisionWorx 360 Design Studio was founded by a practicing contractor with hands-on experience in residential construction and remodeling. The platform was created to solve real problems seen in the field—helping buyers, homeowners, real estate professionals, and contractors better visualize renovation possibilities and better understand the practical considerations behind them.\n\nOur concepts are developed with an understanding of real construction methods, project sequencing, materials, labor, and site conditions—not just visual design. The goal is to help you see the possibilities more clearly before any renovation decisions are made.",
    "VisionWorx 360 Design Studio fue fundado por un contratista en ejercicio con experiencia práctica en construcción y remodelación residencial. La plataforma nació para resolver problemas reales observados en obra: ayudar a compradores, propietarios, profesionales inmobiliarios y contratistas a visualizar mejor las posibilidades de renovación y a comprender mejor las consideraciones prácticas detrás de ellas.\n\nNuestros conceptos se desarrollan con conocimiento de métodos constructivos reales, secuencia de obra, materiales, mano de obra y condiciones del sitio, y no solo de diseño visual. El objetivo es ayudarle a ver las posibilidades con mayor claridad antes de tomar cualquier decisión de renovación.",
  ),
  render: "text" as const,
};

export const REALTOR_CREDIBILITY_SECTION = {
  key: "construction_experience",
  heading: bi("Built on Construction Experience", "Respaldado por experiencia en construcción"),
  body: bi(
    "VisionWorx 360 Design Studio combines construction experience with visualization technology. It was founded by a practicing contractor who understands both what a renovation could look like and what it may take to actually build it.\n\nThis gives real estate professionals a more grounded way to present property potential, renovation possibilities, and preliminary cost context to prospective buyers.",
    "VisionWorx 360 Design Studio combina experiencia en construcción con tecnología de visualización. Fue fundado por un contratista en ejercicio que entiende tanto cómo podría verse una renovación como lo que puede implicar ejecutarla.\n\nEsto le da a los profesionales inmobiliarios una forma más fundamentada de presentar el potencial de la propiedad, las posibilidades de renovación y el contexto preliminar de costos a compradores potenciales.",
  ),
  render: "text" as const,
};

/* --------------------------------------------------------- definitions */

const CONTRACTOR: ProposalTemplateDefinition = {
  key: "contractor",
  version: "1.0.0",
  label: bi("Contractor / Homeowner Proposal", "Propuesta para contratista / propietario"),
  description: bi(
    "The standard construction proposal: scope, investment options, schedule, warranty and acceptance.",
    "La propuesta de construcción estándar: alcance, opciones de inversión, calendario, garantía y aceptación.",
  ),
  internalOnly: false,
  title: bi("Proposal", "Propuesta"),
  intro: {
    heading: bi("Proposal", "Propuesta"),
    body: bi("", ""),
  },
  sections: [],
  disclaimer: {
    heading: bi("Estimate terms", "Términos de la estimación"),
    body: bi("", ""),
  },
};

const BUYER_TRANSFORMATION: ProposalTemplateDefinition = {
  key: "buyer_transformation",
  version: "1.1.0",
  label: bi(
    "Property Transformation Proposal — Buyer Facing",
    "Propuesta de transformación de la propiedad — para el comprador",
  ),
  description: bi(
    "Aspirational, buyer-facing visualization package. Existing condition, conceptual transformation and preliminary renovation context.",
    "Paquete de visualización dirigido al comprador. Condición existente, transformación conceptual y contexto preliminar de renovación.",
  ),
  internalOnly: false,
  title: bi("See the Possibilities", "Vea las posibilidades"),
  intro: {
    heading: bi("See the Possibilities", "Vea las posibilidades"),
    body: bi(
      "This presentation was prepared to help you visualize the potential of this property. The existing-condition photographs and conceptual renderings show how selected spaces could be transformed through renovation, updating, or redesign. Instead of having to imagine what a dated, unfinished, or underused space might become, you can compare the property as it exists today with one possible vision for its future. Where available, preliminary renovation pricing is included to help place the proposed transformation into financial context.",
      "Esta presentación se preparó para ayudarle a visualizar el potencial de esta propiedad. Las fotografías de la condición existente y las representaciones conceptuales muestran cómo ciertos espacios podrían transformarse mediante renovación, actualización o rediseño. En lugar de tener que imaginar en qué podría convertirse un espacio anticuado, sin terminar o poco aprovechado, usted puede comparar la propiedad tal como está hoy con una posible visión de su futuro. Cuando está disponible, se incluye un precio preliminar de renovación para dar contexto financiero a la transformación propuesta.",
    ),
  },
  sections: [
    {
      key: "existing_condition",
      heading: bi("Existing Condition", "Condición existente"),
      body: bi(
        "These photographs show the property as it exists today, before any renovation work.",
        "Estas fotografías muestran la propiedad tal como está hoy, antes de cualquier trabajo de renovación.",
      ),
      render: "gallery_before",
    },
    {
      key: "conceptual_transformation",
      heading: bi("Conceptual Transformation", "Transformación conceptual"),
      body: bi(
        "These conceptual images show one possible outcome for the same spaces after renovation.",
        "Estas imágenes conceptuales muestran un posible resultado para los mismos espacios después de la renovación.",
      ),
      render: "gallery_after",
    },
    {
      key: "design_vision",
      heading: bi("Design Vision", "Visión de diseño"),
      body: bi(
        "This concept illustrates one possible approach to updating this space. It is intended to help you understand how the existing area could look and function after renovation. Final design, materials, layout, engineering, permitting, and construction decisions would be confirmed separately before work begins.",
        "Este concepto ilustra un posible enfoque para actualizar este espacio. Su propósito es ayudarle a comprender cómo podría verse y funcionar el área existente después de la renovación. El diseño final, los materiales, la distribución, la ingeniería, los permisos y las decisiones de construcción se confirmarían por separado antes de comenzar el trabajo.",
      ),
      render: "text",
    },
    {
      key: "investment",
      heading: bi("Preliminary Renovation Investment", "Inversión preliminar de renovación"),
      body: bi(
        "The figures below are preliminary renovation context, not a construction contract or a final price.",
        "Las cifras siguientes son un contexto preliminar de renovación, no un contrato de construcción ni un precio final.",
      ),
      render: "investment",
    },
    {
      key: "value_proposition",
      heading: bi(
        "Helping You See Beyond the Existing Condition",
        "Ayudándole a ver más allá de la condición existente",
      ),
      body: bi(
        "Properties are often judged by how they look today. A dated kitchen, unfinished room, outdated exterior, or poorly configured space can make it difficult to see the underlying potential. VisionWorx 360 Design Studio combines property imagery, conceptual visualization, and preliminary renovation information to help bridge that gap—so you can evaluate not only what the property is today, but what it could become.",
        "Las propiedades suelen juzgarse por cómo se ven hoy. Una cocina anticuada, una habitación sin terminar, un exterior desactualizado o un espacio mal distribuido pueden dificultar ver el potencial subyacente. VisionWorx 360 Design Studio combina imágenes de la propiedad, visualización conceptual e información preliminar de renovación para ayudar a cerrar esa brecha, de modo que usted pueda evaluar no solo lo que la propiedad es hoy, sino lo que podría llegar a ser.",
      ),
      render: "text",
    },
    BUYER_CREDIBILITY_SECTION,
    {
      key: "call_to_action",
      heading: bi(
        "Interested in Exploring the Possibilities?",
        "¿Le interesa explorar las posibilidades?",
      ),
      body: bi(
        "If any of these concepts interest you, the next step is a conversation. We can review the spaces that matter most to you, refine the direction, and confirm what a renovation would actually involve before any commitment is made.",
        "Si alguno de estos conceptos le interesa, el siguiente paso es una conversación. Podemos revisar los espacios que más le importan, afinar la dirección y confirmar lo que realmente implicaría una renovación antes de cualquier compromiso.",
      ),
      render: "text",
    },
    {
      key: "conceptual_notice",
      heading: bi("Conceptual Visualization Notice", "Aviso de visualización conceptual"),
      body: CONCEPTUAL_VISUALIZATION_NOTICE,
      render: "notice",
    },
  ],
  disclaimer: {
    heading: bi("Conceptual Visualization Notice", "Aviso de visualización conceptual"),
    body: CONCEPTUAL_VISUALIZATION_NOTICE,
  },
};

const REALTOR_BRIEF: ProposalTemplateDefinition = {
  key: "realtor_brief",
  version: "1.1.0",
  label: bi(
    "Property Opportunity Brief — Realtor Internal",
    "Resumen de oportunidad de la propiedad — uso interno del agente",
  ),
  description: bi(
    "Internal agent brief: buyer objections, transformation opportunities, preliminary cost context and positioning notes.",
    "Resumen interno para el agente: objeciones del comprador, oportunidades de transformación, contexto preliminar de costos y notas de posicionamiento.",
  ),
  internalOnly: true,
  title: bi("Property Opportunity Brief", "Resumen de oportunidad de la propiedad"),
  intro: {
    heading: bi("Property Opportunity Summary", "Resumen de oportunidad de la propiedad"),
    body: bi(
      "Use this brief to help position the property around potential rather than current condition. The visual concepts can be used to address common buyer objections, demonstrate how dated or unfinished spaces might be transformed, and provide preliminary renovation-cost context during buyer conversations. This document is intended for internal real-estate planning and should not be represented as a final construction proposal or guaranteed renovation price.",
      "Use este resumen para posicionar la propiedad en torno a su potencial y no a su condición actual. Los conceptos visuales pueden usarse para atender objeciones comunes del comprador, demostrar cómo podrían transformarse los espacios anticuados o sin terminar y aportar contexto preliminar de costos de renovación durante las conversaciones con compradores. Este documento es para planificación inmobiliaria interna y no debe presentarse como una propuesta final de construcción ni como un precio de renovación garantizado.",
    ),
  },
  sections: [
    {
      key: "buyer_objections",
      heading: bi(
        "Current Buyer Objections / Visual Barriers",
        "Objeciones actuales del comprador / barreras visuales",
      ),
      body: bi(
        "Note what buyers react to first: dated finishes, unfinished or underused rooms, poor configuration, or exterior curb appeal. These are the barriers the visual concepts are meant to overcome.",
        "Anote a qué reaccionan primero los compradores: acabados anticuados, habitaciones sin terminar o poco aprovechadas, mala distribución o poco atractivo exterior. Estas son las barreras que los conceptos visuales buscan superar.",
      ),
      render: "text",
    },
    {
      key: "transformation_opportunities",
      heading: bi("Transformation Opportunities", "Oportunidades de transformación"),
      body: bi(
        "The scope captured for this property outlines the transformation opportunities available to a buyer.",
        "El alcance capturado para esta propiedad describe las oportunidades de transformación disponibles para un comprador.",
      ),
      render: "text",
    },
    {
      key: "before_after",
      heading: bi("Before / Possible After", "Antes / posible después"),
      body: bi(
        "Existing-condition imagery paired with conceptual renderings, in presentation order.",
        "Imágenes de la condición existente junto con representaciones conceptuales, en orden de presentación.",
      ),
      render: "gallery_pair",
    },
    {
      key: "cost_context",
      heading: bi("Preliminary Renovation Cost Context", "Contexto preliminar de costos de renovación"),
      body: bi(
        "Preliminary figures for buyer conversations only. These are not quotes and are not guaranteed.",
        "Cifras preliminares solo para conversaciones con compradores. No son cotizaciones y no están garantizadas.",
      ),
      render: "investment",
    },
    {
      key: "positioning_notes",
      heading: bi("Buyer Positioning Notes", "Notas de posicionamiento para el comprador"),
      body: bi(
        "Lead with potential, not apologies for condition. Pair each known objection with the corresponding concept image, then place the preliminary renovation range next to the asking price so the buyer can evaluate total investment rather than current condition alone.",
        "Empiece por el potencial, no por disculpas sobre la condición. Relacione cada objeción conocida con la imagen conceptual correspondiente y luego coloque el rango preliminar de renovación junto al precio de venta para que el comprador evalúe la inversión total y no solo la condición actual.",
      ),
      render: "text",
    },
    {
      key: "marketing_use",
      heading: bi("Marketing / Listing Use Ideas", "Ideas de uso en marketing / anuncio"),
      body: bi(
        "Use concept imagery in listing updates, open-house handouts, buyer follow-up emails and social posts — always labelled as conceptual. Consider a \"see the possibilities\" callout for a stale listing to reset buyer interest.",
        "Use las imágenes conceptuales en actualizaciones del anuncio, folletos de casa abierta, correos de seguimiento y publicaciones sociales, siempre etiquetadas como conceptuales. Considere un mensaje de \"vea las posibilidades\" para reactivar el interés en un anuncio estancado.",
      ),
      render: "text",
    },
    REALTOR_CREDIBILITY_SECTION,
    {
      key: "next_steps",
      heading: bi("Follow-up / Next Steps", "Seguimiento / próximos pasos"),
      body: bi(
        "Share the buyer-facing version with interested parties, capture which concepts resonated, and request a refined renovation review for any buyer who moves forward.",
        "Comparta la versión para el comprador con las partes interesadas, registre qué conceptos generaron interés y solicite una revisión de renovación más detallada para cualquier comprador que avance.",
      ),
      render: "text",
    },
    {
      key: "internal_notice",
      heading: bi("Internal Use Notice", "Aviso de uso interno"),
      body: REALTOR_INTERNAL_NOTICE,
      render: "notice",
    },
  ],
  disclaimer: {
    heading: bi("Internal Use Notice", "Aviso de uso interno"),
    body: REALTOR_INTERNAL_NOTICE,
  },
};

export const PROPOSAL_TEMPLATE_DEFINITIONS: Record<
  ProposalTemplateKey,
  ProposalTemplateDefinition
> = {
  contractor: CONTRACTOR,
  buyer_transformation: BUYER_TRANSFORMATION,
  realtor_brief: REALTOR_BRIEF,
};

export const isRealtorTemplate = (key: ProposalTemplateKey): boolean =>
  key === "buyer_transformation" || key === "realtor_brief";

/* ------------------------------------------------------------ resolving */

export interface ProposalTemplateSection {
  key: string;
  heading: string;
  body: string | null;
  render: ProposalTemplateRender;
}

export interface ProposalTemplateContent {
  key: ProposalTemplateKey;
  version: string;
  label: string;
  internalOnly: boolean;
  title: string;
  intro: { heading: string; body: string };
  sections: ProposalTemplateSection[];
  disclaimer: { heading: string; body: string };
}

/** Resolves a template definition into locale-specific copy. */
export function resolveProposalTemplate(
  key: ProposalTemplateKey,
  locale: ProposalLocale,
): ProposalTemplateContent {
  const def = PROPOSAL_TEMPLATE_DEFINITIONS[key] ?? CONTRACTOR;
  return {
    key: def.key,
    version: def.version,
    label: pick(def.label, locale),
    internalOnly: def.internalOnly,
    title: pick(def.title, locale),
    intro: { heading: pick(def.intro.heading, locale), body: pick(def.intro.body, locale) },
    sections: def.sections.map((s) => ({
      key: s.key,
      heading: pick(s.heading, locale),
      body: s.body ? pick(s.body, locale) : null,
      render: s.render,
    })),
    disclaimer: {
      heading: pick(def.disclaimer.heading, locale),
      body: pick(def.disclaimer.body, locale),
    },
  };
}
