/**
 * Module 013 — deterministic recommendation catalogs.
 *
 * Everything here is a fixed, human-authored rule table. No AI, no network.
 * Text is bilingual at the source so the domain stays UI-free.
 */
import type { Bilingual, CopilotConfidence } from "./types";

export const bi = (en: string, es: string): Bilingual => ({ "en-US": en, "es-US": es });

export interface CatalogEntry {
  itemKey: string;
  tradeKey: string;
  confidence: CopilotConfidence;
  label: Bilingual;
  customerLabel: Bilingual;
  rationale: Bilingual;
  customerRationale: Bilingual;
}

/* -------------------------------------------------- Section 1: standard */

export const STANDARD_ITEMS: CatalogEntry[] = [
  {
    itemKey: "standard.floor_protection",
    tradeKey: "general",
    confidence: "high",
    label: bi("Floor protection", "Protección de pisos"),
    customerLabel: bi("Floor protection throughout", "Protección de pisos en toda la casa"),
    rationale: bi("Required on every occupied-home job.", "Requerido en toda casa habitada."),
    customerRationale: bi(
      "We protect your existing floors along every work path.",
      "Protegemos sus pisos existentes en todo el camino de trabajo.",
    ),
  },
  {
    itemKey: "standard.dust_containment",
    tradeKey: "general",
    confidence: "high",
    label: bi("Dust containment", "Contención de polvo"),
    customerLabel: bi("Dust containment barriers", "Barreras de contención de polvo"),
    rationale: bi("Demolition and sanding always create dust.", "La demolición y el lijado siempre generan polvo."),
    customerRationale: bi(
      "Sealed barriers keep construction dust out of the rest of your home.",
      "Barreras selladas mantienen el polvo fuera del resto de su casa.",
    ),
  },
  {
    itemKey: "standard.daily_cleanup",
    tradeKey: "general",
    confidence: "high",
    label: bi("Daily cleanup", "Limpieza diaria"),
    customerLabel: bi("Daily cleanup", "Limpieza diaria"),
    rationale: bi("Crew time is rarely captured in the scope.", "El tiempo de cuadrilla casi nunca se captura."),
    customerRationale: bi(
      "The work area is cleaned at the end of every day.",
      "El área de trabajo se limpia al final de cada día.",
    ),
  },
  {
    itemKey: "standard.dumpster",
    tradeKey: "general",
    confidence: "high",
    label: bi("Dumpster allowance", "Contenedor de escombros"),
    customerLabel: bi("On-site waste container", "Contenedor de residuos en obra"),
    rationale: bi("Container rental and haul-off fees.", "Renta del contenedor y retiro."),
    customerRationale: bi(
      "A waste container keeps the property tidy during the project.",
      "Un contenedor mantiene la propiedad ordenada durante el proyecto.",
    ),
  },
  {
    itemKey: "standard.debris_removal",
    tradeKey: "general",
    confidence: "high",
    label: bi("Debris removal", "Retiro de escombros"),
    customerLabel: bi("Debris removal", "Retiro de escombros"),
    rationale: bi("Labor to move demo debris off site.", "Mano de obra para retirar escombros."),
    customerRationale: bi(
      "All construction debris is removed from your property.",
      "Todos los escombros se retiran de su propiedad.",
    ),
  },
  {
    itemKey: "standard.material_delivery",
    tradeKey: "general",
    confidence: "medium",
    label: bi("Material delivery", "Entrega de materiales"),
    customerLabel: bi("Material delivery and handling", "Entrega y manejo de materiales"),
    rationale: bi("Delivery and staging fees are commonly missed.", "Las entregas suelen olvidarse."),
    customerRationale: bi(
      "Materials are delivered and staged before work begins.",
      "Los materiales se entregan y organizan antes de comenzar.",
    ),
  },
  {
    itemKey: "standard.fasteners",
    tradeKey: "general",
    confidence: "high",
    label: bi("Fasteners", "Sujetadores"),
    customerLabel: bi("Fasteners and hardware", "Sujetadores y herrajes"),
    rationale: bi("Screws, nails, anchors, adhesives.", "Tornillos, clavos, anclajes, adhesivos."),
    customerRationale: bi(
      "All required fastening hardware is included.",
      "Se incluyen todos los herrajes de fijación necesarios.",
    ),
  },
  {
    itemKey: "standard.consumables",
    tradeKey: "general",
    confidence: "high",
    label: bi("Consumables", "Consumibles"),
    customerLabel: bi("Job supplies", "Suministros de obra"),
    rationale: bi("Blades, tape, caulk, sandpaper, plastic.", "Discos, cinta, sellador, lija, plástico."),
    customerRationale: bi(
      "Everyday job supplies are covered.",
      "Los suministros diarios de obra están cubiertos.",
    ),
  },
  {
    itemKey: "standard.disposal",
    tradeKey: "general",
    confidence: "medium",
    label: bi("Disposal fees", "Cuotas de disposición"),
    customerLabel: bi("Responsible disposal", "Disposición responsable"),
    rationale: bi("Landfill and recycling tipping fees.", "Cuotas de relleno sanitario y reciclaje."),
    customerRationale: bi(
      "Materials are disposed of responsibly and legally.",
      "Los materiales se desechan de forma responsable y legal.",
    ),
  },
  {
    itemKey: "standard.equipment_setup",
    tradeKey: "general",
    confidence: "medium",
    label: bi("Equipment setup", "Instalación de equipo"),
    customerLabel: bi("Equipment setup and takedown", "Montaje y desmontaje de equipo"),
    rationale: bi("Staging, power, ladders, scaffolding.", "Montaje, energía, escaleras, andamios."),
    customerRationale: bi(
      "Crew equipment is set up and removed at completion.",
      "El equipo se instala y se retira al terminar.",
    ),
  },
];

/* ---------------------------------------------- Section 2: missing scope */

export interface MissingScopeRule {
  triggerKey: string;
  /** Case-insensitive patterns matched against scope titles + description. */
  patterns: RegExp[];
  entries: CatalogEntry[];
}

const e = (
  itemKey: string,
  tradeKey: string,
  confidence: CopilotConfidence,
  label: Bilingual,
  customerLabel: Bilingual,
  rationale: Bilingual,
  customerRationale: Bilingual,
): CatalogEntry => ({ itemKey, tradeKey, confidence, label, customerLabel, rationale, customerRationale });

export const MISSING_SCOPE_RULES: MissingScopeRule[] = [
  {
    triggerKey: "structural_wall",
    patterns: [
      /\b(remove|removing|demo(lish)?|open(ing)?)\b[^.]*\bwall\b/i,
      /\b(load[- ]bearing|structural)\b[^.]*\bwall\b/i,
      /\b(quitar|remover|demoler|abrir)\b[^.]*\b(muro|pared)\b/i,
      /\bmuro\s+de\s+carga\b/i,
    ],
    entries: [
      e("missing.temporary_support", "framing", "high",
        bi("Temporary support wall", "Muro de apoyo temporal"),
        bi("Temporary structural support", "Soporte estructural temporal"),
        bi("Required while the bearing wall is open.", "Necesario mientras el muro está abierto."),
        bi("We temporarily support the structure while the wall is opened.", "Soportamos temporalmente la estructura al abrir el muro.")),
      e("missing.lvl_beam", "framing", "high",
        bi("LVL beam and posts", "Viga LVL y postes"),
        bi("New structural beam", "Nueva viga estructural"),
        bi("Bearing wall removal requires a header.", "Quitar un muro de carga requiere cabezal."),
        bi("A new beam carries the load where the wall was.", "Una nueva viga soporta la carga donde estaba el muro.")),
      e("missing.engineering", "professional", "contractor_decision",
        bi("Structural engineering", "Ingeniería estructural"),
        bi("Engineered structural design", "Diseño estructural certificado"),
        bi("Beam sizing usually needs a stamped design.", "El dimensionado de la viga suele requerir sello."),
        bi("A licensed engineer confirms the design.", "Un ingeniero certificado confirma el diseño.")),
      e("missing.permit", "professional", "high",
        bi("Building permit", "Permiso de construcción"),
        bi("Permits and inspections", "Permisos e inspecciones"),
        bi("Structural work is permitted work.", "El trabajo estructural requiere permiso."),
        bi("We handle permits and inspections.", "Nos encargamos de permisos e inspecciones.")),
      e("missing.electrical_relocation", "electrical", "medium",
        bi("Electrical relocation", "Reubicación eléctrica"),
        bi("Electrical relocation", "Reubicación eléctrica"),
        bi("Walls usually carry outlets and switches.", "Los muros suelen llevar contactos e interruptores."),
        bi("Wiring in the wall is safely relocated.", "El cableado del muro se reubica de forma segura.")),
      e("missing.hvac_relocation", "hvac", "medium",
        bi("HVAC relocation", "Reubicación de HVAC"),
        bi("Heating and cooling relocation", "Reubicación de clima"),
        bi("Ducts and returns are often inside the wall.", "Los ductos suelen estar dentro del muro."),
        bi("Air ducts are rerouted to keep comfort even.", "Los ductos se redirigen para mantener el confort.")),
      e("missing.drywall_repair", "drywall", "high",
        bi("Drywall repair", "Reparación de tablaroca"),
        bi("Wall and ceiling repair", "Reparación de muros y techos"),
        bi("Ceiling and adjacent walls always need patching.", "Techo y muros adyacentes siempre requieren parcheo."),
        bi("Surrounding walls and ceilings are made seamless.", "Los muros y techos quedan sin marcas.")),
      e("missing.paint_blending", "painting", "medium",
        bi("Paint blending", "Igualado de pintura"),
        bi("Paint touch-up and blending", "Retoque e igualado de pintura"),
        bi("Patches show unless surfaces are blended.", "Los parches se notan si no se iguala."),
        bi("Paint is blended so repairs are invisible.", "La pintura se iguala para que no se noten reparaciones.")),
      e("missing.floor_patching", "flooring", "medium",
        bi("Floor patching", "Parcheo de piso"),
        bi("Floor patching at the old wall", "Parcheo de piso donde estaba el muro"),
        bi("Removing a wall leaves a flooring gap.", "Quitar un muro deja un hueco en el piso."),
        bi("The floor is patched where the wall stood.", "El piso se repara donde estaba el muro.")),
    ],
  },
  {
    triggerKey: "cabinets",
    patterns: [
      /\bcabinet(s|ry)?\b/i,
      /\bgabinet(e|es)\b/i,
      /\balacena(s)?\b/i,
    ],
    entries: [
      e("missing.cabinet_hardware", "carpentry", "high",
        bi("Cabinet hardware", "Herrajes de gabinete"),
        bi("Cabinet handles and knobs", "Jaladeras y perillas"),
        bi("Pulls and knobs are rarely in the cabinet quote.", "Jaladeras y perillas rara vez vienen incluidas."),
        bi("Handles and knobs are included and installed.", "Jaladeras y perillas incluidas e instaladas.")),
      e("missing.toe_kicks", "carpentry", "high",
        bi("Toe kicks", "Zócalos de gabinete"),
        bi("Finished cabinet bases", "Bases de gabinete terminadas"),
        bi("Finish toe kick material and install labor.", "Material y mano de obra del zócalo."),
        bi("Cabinet bases are finished to match.", "Las bases quedan terminadas a juego.")),
      e("missing.fillers_panels", "carpentry", "high",
        bi("Fillers and finished panels", "Rellenos y paneles terminados"),
        bi("Finished cabinet panels", "Paneles de gabinete terminados"),
        bi("Every run needs fillers and end panels.", "Cada corrida necesita rellenos y paneles."),
        bi("Exposed cabinet sides are finished properly.", "Los costados visibles quedan bien terminados.")),
      e("missing.cabinet_trim", "carpentry", "medium",
        bi("Cabinet trim and light rail", "Molduras y riel de luz"),
        bi("Cabinet trim details", "Detalles de moldura"),
        bi("Scribe, crown and light rail are separate parts.", "Moldura y riel son piezas aparte."),
        bi("Trim details finish the cabinetry cleanly.", "Las molduras dan el acabado final.")),
      e("missing.soft_close", "carpentry", "optional",
        bi("Soft-close upgrade", "Mejora de cierre suave"),
        bi("Soft-close doors and drawers", "Puertas y cajones de cierre suave"),
        bi("Common upgrade at cabinet order time.", "Mejora común al ordenar gabinetes."),
        bi("Doors and drawers close quietly.", "Puertas y cajones cierran en silencio.")),
      e("missing.appliance_fillers", "carpentry", "medium",
        bi("Appliance fillers and panels", "Rellenos y paneles de electrodomésticos"),
        bi("Appliance trim panels", "Paneles de electrodomésticos"),
        bi("Appliance gaps need scribe fillers.", "Los huecos requieren rellenos."),
        bi("Appliances sit flush with the cabinetry.", "Los electrodomésticos quedan a ras.")),
      e("missing.countertop_template", "countertops", "high",
        bi("Countertop template and fabrication", "Plantilla y fabricación de cubierta"),
        bi("Countertop measuring and fabrication", "Medición y fabricación de cubierta"),
        bi("Templating is a separate trip and cost.", "La plantilla es un viaje y costo aparte."),
        bi("Countertops are measured and custom fabricated.", "Las cubiertas se miden y fabrican a medida.")),
      e("missing.backsplash", "tile", "medium",
        bi("Backsplash", "Salpicadero"),
        bi("Backsplash installation", "Instalación de salpicadero"),
        bi("Almost always expected after new counters.", "Casi siempre se espera con cubiertas nuevas."),
        bi("A finished backsplash completes the look.", "Un salpicadero terminado completa el diseño.")),
    ],
  },
  {
    triggerKey: "flooring",
    patterns: [/\bfloor(ing)?\b/i, /\bpiso(s)?\b/i, /\blvp\b/i, /\btile\b/i, /\bazulejo\b/i],
    entries: [
      e("missing.subfloor_prep", "flooring", "high",
        bi("Subfloor prep and leveling", "Preparación y nivelación de contrapiso"),
        bi("Floor preparation", "Preparación del piso"),
        bi("New floors fail over an unlevel subfloor.", "El piso nuevo falla sobre contrapiso desnivelado."),
        bi("The base is leveled so your floor lasts.", "La base se nivela para que el piso dure.")),
      e("missing.transitions", "flooring", "medium",
        bi("Transitions and thresholds", "Transiciones y umbrales"),
        bi("Doorway transitions", "Transiciones en puertas"),
        bi("Every room change needs a transition piece.", "Cada cambio de cuarto necesita transición."),
        bi("Clean transitions at every doorway.", "Transiciones limpias en cada puerta.")),
      e("missing.baseboard", "carpentry", "medium",
        bi("Baseboard removal and reinstall", "Retiro y reinstalación de zoclo"),
        bi("Baseboard work", "Trabajo de zoclo"),
        bi("Baseboards must come off for new flooring.", "Los zoclos deben retirarse para piso nuevo."),
        bi("Baseboards are removed and reinstalled neatly.", "Los zoclos se retiran y reinstalan con cuidado.")),
    ],
  },
  {
    triggerKey: "wet_area",
    patterns: [/\b(shower|bath(room)?|tub)\b/i, /\b(ba(ñ|n)o|regadera|ducha|tina)\b/i],
    entries: [
      e("missing.waterproofing", "tile", "high",
        bi("Shower waterproofing", "Impermeabilización de regadera"),
        bi("Waterproofing system", "Sistema de impermeabilización"),
        bi("Code-required behind all wet walls.", "Requerido por código en muros húmedos."),
        bi("A full waterproofing system protects your home.", "Un sistema completo protege su casa.")),
      e("missing.plumbing_rough", "plumbing", "medium",
        bi("Plumbing rough-in adjustments", "Ajustes de plomería"),
        bi("Plumbing adjustments", "Ajustes de plomería"),
        bi("Fixture changes usually move supply/drain.", "Cambiar muebles suele mover tomas y drenaje."),
        bi("Plumbing is adjusted for the new layout.", "La plomería se ajusta al nuevo diseño.")),
    ],
  },
  {
    triggerKey: "electrical",
    patterns: [/\b(electrical|outlet|wiring|light(ing)?|circuit)\b/i, /\b(el(é|e)ctric|contacto|cableado|iluminaci(ó|o)n)\w*/i],
    entries: [
      e("missing.electrical_permit", "professional", "medium",
        bi("Electrical permit and inspection", "Permiso e inspección eléctrica"),
        bi("Electrical permits and inspections", "Permisos e inspecciones eléctricas"),
        bi("New circuits are inspected work.", "Los circuitos nuevos se inspeccionan."),
        bi("Electrical work is permitted and inspected.", "El trabajo eléctrico se permite e inspecciona.")),
      e("missing.gfci", "electrical", "high",
        bi("GFCI / AFCI protection", "Protección GFCI / AFCI"),
        bi("Modern outlet safety protection", "Protección moderna de contactos"),
        bi("Required by current code in wet and living areas.", "Requerido por código actual."),
        bi("Outlets are upgraded to current safety standards.", "Los contactos cumplen normas actuales de seguridad.")),
    ],
  },
];

/* --------------------------------------------------- Section 3: upsells */

export interface UpsellRule {
  roomKey: string;
  patterns: RegExp[];
  entries: Array<CatalogEntry & { typicalPriceRange?: { low: number; high: number } }>;
}

const up = (
  itemKey: string,
  tradeKey: string,
  label: Bilingual,
  customerLabel: Bilingual,
  customerRationale: Bilingual,
  range?: { low: number; high: number },
): CatalogEntry & { typicalPriceRange?: { low: number; high: number } } => ({
  itemKey,
  tradeKey,
  confidence: "optional",
  label,
  customerLabel,
  rationale: bi("Frequently purchased upgrade.", "Mejora frecuentemente elegida."),
  customerRationale,
  typicalPriceRange: range,
});

export const UPSELL_RULES: UpsellRule[] = [
  {
    roomKey: "kitchen",
    patterns: [/\bkitchen\b/i, /\bcocina\b/i, /\bcabinet/i, /\bcountertop|\bcubierta/i],
    entries: [
      up("upsell.under_cabinet_lighting", "electrical",
        bi("Under-cabinet lighting", "Iluminación bajo gabinete"),
        bi("Under-cabinet lighting", "Iluminación bajo gabinete"),
        bi("Bright, even light across your counters.", "Luz pareja sobre sus cubiertas."), { low: 600, high: 1600 }),
      up("upsell.island_outlets", "electrical",
        bi("Island outlets", "Contactos en isla"),
        bi("Power at the island", "Energía en la isla"),
        bi("Convenient power right where you work.", "Energía donde usted trabaja."), { low: 350, high: 900 }),
      up("upsell.pot_filler", "plumbing",
        bi("Pot filler", "Llave para ollas"),
        bi("Pot filler faucet", "Llave llenadora de ollas"),
        bi("Fill large pots right at the range.", "Llene ollas grandes en la estufa."), { low: 700, high: 1800 }),
      up("upsell.crown_molding", "carpentry",
        bi("Crown molding", "Moldura de corona"),
        bi("Crown molding", "Moldura de corona"),
        bi("A finished, custom look at the ceiling.", "Un acabado a medida en el techo."), { low: 800, high: 2500 }),
      up("upsell.pantry_pullouts", "carpentry",
        bi("Pantry pull-outs", "Extraíbles de despensa"),
        bi("Pull-out pantry shelves", "Repisas extraíbles"),
        bi("Everything reachable, nothing lost in the back.", "Todo al alcance, nada se pierde atrás."), { low: 400, high: 1500 }),
      up("upsell.soft_close_drawers", "carpentry",
        bi("Soft-close drawers", "Cajones de cierre suave"),
        bi("Soft-close drawers", "Cajones de cierre suave"),
        bi("Quiet, gentle closing throughout.", "Cierre suave y silencioso."), { low: 300, high: 1200 }),
      up("upsell.water_filtration", "plumbing",
        bi("Water filtration", "Filtración de agua"),
        bi("Filtered drinking water", "Agua filtrada para beber"),
        bi("Clean filtered water at the sink.", "Agua filtrada en el fregadero."), { low: 400, high: 1400 }),
    ],
  },
  {
    roomKey: "bathroom",
    patterns: [/\bbath(room)?\b|\bshower\b|\btub\b|\bvanity\b/i, /\bba(ñ|n)o\b|\bregadera\b|\btina\b/i],
    entries: [
      up("upsell.heated_floor", "flooring",
        bi("Heated floor", "Piso radiante"),
        bi("Heated bathroom floor", "Piso con calefacción"),
        bi("Warm floors on cold mornings.", "Pisos tibios en mañanas frías."), { low: 900, high: 2800 }),
      up("upsell.glass_shower", "specialty",
        bi("Frameless glass shower", "Regadera de vidrio sin marco"),
        bi("Glass shower enclosure", "Cancel de vidrio"),
        bi("An open, spa-like look.", "Un aspecto abierto tipo spa."), { low: 1200, high: 3800 }),
      up("upsell.shower_niche", "tile",
        bi("Shower niche", "Nicho de regadera"),
        bi("Built-in shower shelf", "Repisa empotrada"),
        bi("Built-in storage with no clutter.", "Almacenamiento sin desorden."), { low: 250, high: 800 }),
      up("upsell.comfort_toilet", "plumbing",
        bi("Comfort-height toilet", "Inodoro de altura confort"),
        bi("Comfort-height toilet", "Inodoro de altura confort"),
        bi("Easier, more comfortable everyday use.", "Uso diario más cómodo."), { low: 350, high: 900 }),
    ],
  },
  {
    roomKey: "living",
    patterns: [/\bliving\b|\bfamily room\b|\bfireplace\b/i, /\bsala\b|\bchimenea\b/i],
    entries: [
      up("upsell.recessed_lighting", "electrical",
        bi("Recessed lighting", "Iluminación empotrada"),
        bi("Recessed ceiling lighting", "Iluminación empotrada en techo"),
        bi("Clean, even light without lamps.", "Luz pareja sin lámparas."), { low: 900, high: 2600 }),
      up("upsell.built_ins", "carpentry",
        bi("Built-ins", "Muebles a medida"),
        bi("Custom built-in shelving", "Repisas a medida"),
        bi("Custom storage that looks original to the home.", "Almacenamiento a medida integrado."), { low: 1800, high: 6000 }),
      up("upsell.fireplace_surround", "specialty",
        bi("Fireplace surround", "Recubrimiento de chimenea"),
        bi("Updated fireplace surround", "Chimenea renovada"),
        bi("A new focal point for the room.", "Un nuevo punto focal."), { low: 1200, high: 4500 }),
    ],
  },
  {
    roomKey: "deck",
    patterns: [/\bdeck\b|\bpatio\b|\brailing\b|\bpergola\b/i, /\bterraza\b|\bbarandal\b|\bp(é|e)rgola\b/i],
    entries: [
      up("upsell.composite_upgrade", "carpentry",
        bi("Composite decking upgrade", "Mejora a madera compuesta"),
        bi("Low-maintenance composite decking", "Terraza compuesta de bajo mantenimiento"),
        bi("No staining, no splinters, decades of life.", "Sin barniz ni astillas, larga vida."), { low: 1500, high: 7000 }),
      up("upsell.deck_lighting", "electrical",
        bi("Deck lighting", "Iluminación de terraza"),
        bi("Outdoor deck lighting", "Iluminación exterior"),
        bi("Safe, welcoming evenings outdoors.", "Noches seguras y acogedoras."), { low: 600, high: 2200 }),
      up("upsell.cable_railing", "specialty",
        bi("Cable railing", "Barandal de cable"),
        bi("Cable railing system", "Sistema de barandal de cable"),
        bi("Keeps your view wide open.", "Mantiene la vista despejada."), { low: 2000, high: 6500 }),
      up("upsell.pergola", "carpentry",
        bi("Pergola", "Pérgola"),
        bi("Shade pergola", "Pérgola de sombra"),
        bi("Shade and structure for outdoor living.", "Sombra y estructura al aire libre."), { low: 3000, high: 12000 }),
    ],
  },
];

/* ----------------------------------------- Section 4: value engineering */

export interface ValueEngineeringRule {
  itemKey: string;
  tradeKey: string;
  patterns: RegExp[];
  label: Bilingual;
  customerLabel: Bilingual;
  /** Ordered best → good. */
  ladder: Array<{ key: string; label: Bilingual }>;
  /** Indicative saving for each downgrade step. */
  stepSavingsPct: number[];
}

export const VALUE_ENGINEERING_RULES: ValueEngineeringRule[] = [
  {
    itemKey: "ve.countertop",
    tradeKey: "countertops",
    patterns: [/\bquartz\b|\bcountertop|\bcubierta|\bcuarzo\b/i],
    label: bi("Countertop material", "Material de cubierta"),
    customerLabel: bi("Countertop options", "Opciones de cubierta"),
    ladder: [
      { key: "quartz", label: bi("Quartz", "Cuarzo") },
      { key: "granite", label: bi("Granite", "Granito") },
      { key: "laminate", label: bi("Laminate", "Laminado") },
    ],
    stepSavingsPct: [18, 45],
  },
  {
    itemKey: "ve.flooring",
    tradeKey: "flooring",
    patterns: [/\bhardwood\b|\bwood floor|\bmadera\b|\bpiso de madera\b/i],
    label: bi("Flooring material", "Material de piso"),
    customerLabel: bi("Flooring options", "Opciones de piso"),
    ladder: [
      { key: "hardwood", label: bi("Solid hardwood", "Madera sólida") },
      { key: "engineered", label: bi("Engineered hardwood", "Madera de ingeniería") },
      { key: "lvp", label: bi("Luxury vinyl plank", "Vinil de lujo (LVP)") },
    ],
    stepSavingsPct: [22, 48],
  },
  {
    itemKey: "ve.cabinets",
    tradeKey: "carpentry",
    patterns: [/\bcabinet|\bgabinet/i],
    label: bi("Cabinet grade", "Grado de gabinete"),
    customerLabel: bi("Cabinet options", "Opciones de gabinete"),
    ladder: [
      { key: "custom", label: bi("Custom cabinets", "Gabinetes a medida") },
      { key: "semi_custom", label: bi("Semi-custom cabinets", "Gabinetes semi a medida") },
      { key: "builder", label: bi("Builder-grade cabinets", "Gabinetes estándar") },
    ],
    stepSavingsPct: [25, 50],
  },
  {
    itemKey: "ve.shower",
    tradeKey: "tile",
    patterns: [/\btile shower\b|\bshower\b|\bregadera\b|\bducha\b/i],
    label: bi("Shower enclosure", "Cancel de regadera"),
    customerLabel: bi("Shower options", "Opciones de regadera"),
    ladder: [
      { key: "custom_tile", label: bi("Custom tile shower", "Regadera de azulejo a medida") },
      { key: "prefab_tile", label: bi("Prefabricated tile base", "Base prefabricada con azulejo") },
      { key: "acrylic", label: bi("Acrylic surround", "Panel acrílico") },
    ],
    stepSavingsPct: [20, 42],
  },
  {
    itemKey: "ve.lighting",
    tradeKey: "electrical",
    patterns: [/\brecessed\b|\blight(ing)?\b|\bilumina/i],
    label: bi("Lighting package", "Paquete de iluminación"),
    customerLabel: bi("Lighting options", "Opciones de iluminación"),
    ladder: [
      { key: "recessed", label: bi("Recessed can lighting", "Luminarias empotradas") },
      { key: "slim_led", label: bi("Slim LED disc lights", "Discos LED delgados") },
      { key: "surface", label: bi("Surface-mount fixtures", "Luminarias de sobreponer") },
    ],
    stepSavingsPct: [15, 35],
  },
];
