/**
 * Module 015 — seeded knowledge catalog.
 *
 * Deterministic, human-authored entries. Project types and activities share the
 * same `KnowledgeEntry` shape. Items are referenced by key from `items.ts` so a
 * concept ("floor protection") is authored exactly once.
 */
import { bi } from "./items";
import type { Bilingual, KnowledgeEntry, KnowledgeNote } from "./types";

export const KNOWLEDGE_VERSION = "2026.08.1";
export const KNOWLEDGE_EFFECTIVE_DATE = "2026-08-01";

const note = (noteKey: string, en: string, es: string, isPlaceholder = false): KnowledgeNote => ({
  noteKey,
  text: bi(en, es),
  isPlaceholder,
});

/** Placeholder reminders — Version 1 never asserts a specific code section. */
const codePlaceholder = (topicEn: string, topicEs: string): KnowledgeNote =>
  note(
    `code.${topicEn.toLowerCase().replace(/[^a-z]+/g, "_")}`,
    `Verify local code requirements for ${topicEn}.`,
    `Verifique los requisitos del código local para ${topicEs}.`,
    true,
  );

const permitPlaceholder = (scopeEn: string, scopeEs: string): KnowledgeNote =>
  note(
    `permit.${scopeEn.toLowerCase().replace(/[^a-z]+/g, "_")}`,
    `Confirm whether a permit is required for ${scopeEn} in this jurisdiction.`,
    `Confirme si se requiere permiso para ${scopeEs} en esta jurisdicción.`,
    true,
  );

const inspectionPlaceholder = (stageEn: string, stageEs: string): KnowledgeNote =>
  note(
    `inspection.${stageEn.toLowerCase().replace(/[^a-z]+/g, "_")}`,
    `Schedule the ${stageEn} inspection before covering the work.`,
    `Programe la inspección de ${stageEs} antes de cubrir el trabajo.`,
    true,
  );

interface EntryDraft {
  kind: KnowledgeEntry["kind"];
  label: [string, string];
  trade: string;
  category: string;
  subcategory?: string | null;
  projectTypes?: string[];
  triggers: string[];
  synonyms?: string[];
  required?: string[];
  recommended?: string[];
  standard?: string[];
  omissions?: string[];
  upgrades?: string[];
  valueEngineering?: string[];
  safety?: KnowledgeNote[];
  code?: KnowledgeNote[];
  permits?: KnowledgeNote[];
  inspections?: KnowledgeNote[];
  sequencing?: KnowledgeNote[];
  dependencies?: string[];
  confidence?: KnowledgeEntry["confidence"];
}

function entry(entryKey: string, draft: EntryDraft): KnowledgeEntry {
  return {
    entryKey,
    kind: draft.kind,
    label: bi(draft.label[0], draft.label[1]),
    tradeKey: draft.trade,
    categoryKey: draft.category,
    subcategoryKey: draft.subcategory ?? null,
    projectTypeKeys: draft.projectTypes ?? (draft.kind === "project_type" ? [entryKey] : []),
    triggerTerms: draft.triggers,
    synonyms: draft.synonyms ?? [],
    requiredItemKeys: draft.required ?? [],
    recommendedItemKeys: draft.recommended ?? [],
    standardItemKeys: draft.standard ?? BASE_STANDARD_ITEMS,
    commonOmissionKeys: draft.omissions ?? [],
    upgradeKeys: draft.upgrades ?? [],
    valueEngineeringKeys: draft.valueEngineering ?? [],
    safetyNotes: draft.safety ?? [],
    codeReminders: draft.code ?? [],
    permitReminders: draft.permits ?? [],
    inspectionReminders: draft.inspections ?? [],
    sequencingNotes: draft.sequencing ?? [],
    dependencies: draft.dependencies ?? [],
    confidence: draft.confidence ?? "high",
    version: KNOWLEDGE_VERSION,
    sourceType: "platform_seed",
    effectiveDate: KNOWLEDGE_EFFECTIVE_DATE,
    archivedDate: null,
    isActive: true,
    organizationId: null,
  };
}

/** Applies to essentially every occupied-home construction project. */
const BASE_STANDARD_ITEMS = [
  "general.floor_protection",
  "general.dust_containment",
  "general.daily_cleanup",
  "general.debris_removal",
  "general.dumpster",
  "general.material_delivery",
  "general.fasteners",
  "general.consumables",
  "general.equipment_setup",
  "general.final_cleaning",
];

const EXTERIOR_STANDARD_ITEMS = [
  "general.daily_cleanup",
  "general.debris_removal",
  "general.dumpster",
  "general.material_delivery",
  "general.fasteners",
  "general.consumables",
  "general.equipment_setup",
  "general.final_cleaning",
];

/* ------------------------------------------------------------- entries */

export const KNOWLEDGE_ENTRIES: KnowledgeEntry[] = [
  entry("kitchen_remodel", {
    kind: "project_type",
    label: ["Kitchen remodel", "Remodelación de cocina"],
    trade: "general",
    category: "interior_remodel",
    triggers: ["kitchen", "cocina", "kitchen remodel", "remodelación de cocina"],
    synonyms: ["galley", "kitchenette", "cocina integral", "kitchen renovation"],
    required: [
      "appliance.disconnect",
      "electrical.adjustments",
      "plumbing.relocation",
      "general.drywall_repair",
      "general.paint_touchup",
    ],
    recommended: ["general.permit", "general.flooring_repair", "general.temporary_protection_hvac"],
    omissions: [
      "general.floor_protection",
      "general.dust_containment",
      "appliance.disconnect",
      "appliance.removal",
      "plumbing.temp_sink",
      "general.dumpster",
      "general.debris_removal",
      "general.permit",
      "electrical.adjustments",
      "plumbing.relocation",
      "general.drywall_repair",
      "general.paint_touchup",
      "general.final_cleaning",
    ],
    upgrades: [
      "upgrade.undercabinet_lighting",
      "upgrade.soft_close",
      "upgrade.pullout_shelves",
      "upgrade.pantry_storage",
      "cabinet.crown",
      "upgrade.quartz",
      "upgrade.pot_filler",
      "upgrade.water_filtration",
      "upgrade.island_outlets",
      "upgrade.usb_outlets",
      "upgrade.hidden_trash",
    ],
    valueEngineering: [
      "ve.quartz_to_granite",
      "ve.quartz_to_laminate",
      "ve.custom_to_semi_custom",
      "ve.semi_custom_to_stock",
    ],
    safety: [
      note("safety.kitchen_gas", "Cap and test gas lines before demolition.", "Tape y pruebe las líneas de gas antes de la demolición."),
      note("safety.kitchen_circuits", "De-energize and label circuits before opening walls.", "Desenergice y etiquete los circuitos antes de abrir muros."),
    ],
    code: [codePlaceholder("kitchen receptacle spacing and GFCI protection", "espaciado de contactos y protección GFCI en cocina")],
    permits: [permitPlaceholder("kitchen electrical and plumbing alterations", "alteraciones eléctricas y de plomería en cocina")],
    inspections: [inspectionPlaceholder("rough electrical and plumbing", "instalación eléctrica e hidráulica en obra gris")],
    sequencing: [
      note("seq.kitchen_1", "Demolition → rough MEP → drywall → cabinets → countertop template → backsplash → appliances → punch.", "Demolición → instalaciones → tablaroca → gabinetes → plantilla de cubierta → salpicadero → electrodomésticos → detalles."),
      note("seq.kitchen_2", "Countertops cannot be templated until cabinets are set and level.", "Las cubiertas no se pueden medir hasta que los gabinetes estén instalados y nivelados."),
    ],
    dependencies: ["cabinet_installation", "flooring_replacement"],
  }),

  entry("bathroom_remodel", {
    kind: "project_type",
    label: ["Bathroom remodel", "Remodelación de baño"],
    trade: "general",
    category: "interior_remodel",
    triggers: ["bathroom", "baño", "bath remodel", "remodelación de baño", "shower", "regadera"],
    synonyms: ["powder room", "master bath", "medio baño", "ducha", "tub"],
    required: [
      "bath.waterproofing",
      "bath.ventilation",
      "plumbing.relocation",
      "electrical.adjustments",
      "general.drywall_repair",
    ],
    recommended: ["general.permit", "general.paint_touchup", "upgrade.wall_accessories"],
    omissions: [
      "general.floor_protection",
      "general.dust_containment",
      "bath.waterproofing",
      "bath.ventilation",
      "general.debris_removal",
      "general.permit",
      "general.drywall_repair",
      "general.paint_touchup",
      "general.final_cleaning",
    ],
    upgrades: [
      "upgrade.heated_floor",
      "upgrade.frameless_glass",
      "upgrade.shower_niche",
      "upgrade.niche_lighting",
      "upgrade.rain_shower",
      "upgrade.comfort_toilet",
      "upgrade.wall_accessories",
      "upgrade.ventilation",
    ],
    valueEngineering: ["ve.tile_to_solid_surface", "ve.tile_to_acrylic"],
    safety: [
      note("safety.bath_water", "Shut off and verify water before demolition.", "Cierre y verifique el agua antes de la demolición."),
      note("safety.bath_mold", "Assume hidden moisture damage until the wall is open.", "Asuma daño oculto por humedad hasta abrir el muro."),
    ],
    code: [codePlaceholder("bathroom GFCI, ventilation and clearances", "GFCI, ventilación y espacios libres en baños")],
    permits: [permitPlaceholder("bathroom plumbing relocation", "reubicación de plomería en baño")],
    inspections: [inspectionPlaceholder("shower pan water test", "prueba de agua en la charola de regadera")],
    sequencing: [
      note("seq.bath_1", "Demolition → rough plumbing/electrical → waterproofing → tile → fixtures → glass measure → punch.", "Demolición → plomería y electricidad → impermeabilización → azulejo → muebles → medición de cristal → detalles."),
      note("seq.bath_2", "Frameless glass is measured only after tile is complete.", "El cristal sin marco se mide solo después de terminar el azulejo."),
    ],
  }),

  entry("basement_finish", {
    kind: "project_type",
    label: ["Basement finishing", "Acabado de sótano"],
    trade: "general",
    category: "interior_remodel",
    triggers: ["basement", "sótano", "basement finish", "lower level"],
    synonyms: ["cellar", "nivel inferior", "basement remodel"],
    required: ["basement.moisture", "insulation.air_sealing", "electrical.adjustments", "general.drywall_repair"],
    recommended: ["basement.egress", "general.permit", "bath.ventilation"],
    omissions: [
      "basement.moisture",
      "basement.egress",
      "insulation.air_sealing",
      "general.permit",
      "general.dumpster",
      "general.debris_removal",
      "general.final_cleaning",
    ],
    upgrades: ["upgrade.recessed_lighting", "upgrade.solid_core_doors", "upgrade.smart_thermostat"],
    valueEngineering: ["ve.hardwood_to_lvp"],
    safety: [
      note("safety.basement_radon", "Discuss radon testing before enclosing the space.", "Comente la prueba de radón antes de cerrar el espacio."),
      note("safety.basement_combustion", "Maintain combustion air for furnace and water heater.", "Mantenga el aire de combustión para caldera y calentador."),
    ],
    code: [codePlaceholder("egress, ceiling height and smoke alarms", "salidas de emergencia, altura de techo y detectores de humo")],
    permits: [permitPlaceholder("finishing habitable space below grade", "acabado de espacio habitable bajo nivel")],
    inspections: [inspectionPlaceholder("framing and insulation", "estructura y aislamiento")],
    sequencing: [
      note("seq.basement_1", "Moisture control → framing → rough MEP → insulation → drywall → finishes.", "Control de humedad → estructura → instalaciones → aislamiento → tablaroca → acabados."),
    ],
  }),

  entry("home_addition", {
    kind: "project_type",
    label: ["Home addition", "Ampliación de casa"],
    trade: "general",
    category: "structural",
    triggers: ["addition", "ampliación", "bump out", "room addition"],
    synonyms: ["extension", "anexo", "second story", "sunroom"],
    required: [
      "addition.foundation",
      "addition.tie_in",
      "structural.engineering",
      "insulation.air_sealing",
      "general.permit",
    ],
    recommended: ["general.inspection", "hvac.relocation", "electrical.relocation"],
    omissions: [
      "structural.engineering",
      "general.permit",
      "general.inspection",
      "addition.tie_in",
      "hvac.relocation",
      "general.flooring_repair",
      "general.paint_touchup",
      "general.final_cleaning",
    ],
    upgrades: ["upgrade.recessed_lighting", "upgrade.low_e_glass", "upgrade.attic_insulation"],
    valueEngineering: ["ve.fiberglass_to_vinyl_window", "ve.hardwood_to_engineered"],
    safety: [
      note("safety.addition_excavation", "Call for utility locates before any excavation.", "Solicite la localización de servicios antes de excavar."),
      note("safety.addition_weather", "Keep the existing home dried in at every tie-in stage.", "Mantenga la casa existente protegida del clima en cada etapa de conexión."),
    ],
    code: [codePlaceholder("setbacks, energy code and structural connections", "restricciones de terreno, código energético y conexiones estructurales")],
    permits: [permitPlaceholder("new conditioned square footage", "nueva superficie climatizada")],
    inspections: [inspectionPlaceholder("footing, framing and final", "zapatas, estructura y final")],
    sequencing: [
      note("seq.addition_1", "Survey → permit → foundation → framing → dry-in → rough MEP → insulation → drywall → finishes.", "Levantamiento → permiso → cimentación → estructura → cubierta → instalaciones → aislamiento → tablaroca → acabados."),
    ],
    dependencies: ["structural_wall_removal"],
  }),

  entry("garage_conversion", {
    kind: "project_type",
    label: ["Garage conversion", "Conversión de cochera"],
    trade: "general",
    category: "interior_remodel",
    triggers: ["garage conversion", "conversión de cochera", "convert garage", "garage"],
    synonyms: ["adu", "cochera", "carport conversion", "bonus room"],
    required: ["garage.floor_prep", "insulation.air_sealing", "electrical.adjustments", "general.permit"],
    recommended: ["hvac.relocation", "basement.egress", "general.drywall_repair"],
    omissions: [
      "garage.floor_prep",
      "insulation.air_sealing",
      "hvac.relocation",
      "general.permit",
      "general.debris_removal",
      "general.final_cleaning",
    ],
    upgrades: ["upgrade.recessed_lighting", "upgrade.smart_thermostat", "upgrade.solid_core_doors"],
    valueEngineering: ["ve.hardwood_to_lvp"],
    safety: [note("safety.garage_slope", "Account for slab slope and door threshold heights.", "Considere la pendiente de la losa y la altura del umbral.")],
    code: [codePlaceholder("habitable-space ceiling height, light and ventilation", "altura, iluminación y ventilación de espacio habitable")],
    permits: [permitPlaceholder("change of use from garage to living space", "cambio de uso de cochera a espacio habitable")],
    inspections: [inspectionPlaceholder("framing and insulation", "estructura y aislamiento")],
    sequencing: [
      note("seq.garage_1", "Close the door opening → floor prep → framing → MEP → insulation → drywall → finishes.", "Cierre del portón → preparación de piso → estructura → instalaciones → aislamiento → tablaroca → acabados."),
    ],
  }),

  entry("roof_replacement", {
    kind: "project_type",
    label: ["Roof replacement", "Reemplazo de techo"],
    trade: "roofing",
    category: "exterior",
    triggers: ["roof", "techo", "roofing", "shingle", "teja", "reroof"],
    synonyms: ["tear off", "cubierta", "roof replacement", "roof repair"],
    standard: EXTERIOR_STANDARD_ITEMS,
    required: ["roofing.underlayment", "general.fasteners", "exterior.magnetic_sweep"],
    recommended: ["roofing.deck_repair", "roofing.gutter_protection", "general.permit"],
    omissions: [
      "roofing.deck_repair",
      "roofing.underlayment",
      "roofing.gutter_protection",
      "exterior.magnetic_sweep",
      "general.dumpster",
      "general.permit",
      "general.debris_removal",
    ],
    upgrades: ["upgrade.attic_insulation"],
    valueEngineering: ["ve.architectural_to_three_tab"],
    safety: [
      note("safety.roof_fall", "Fall protection and anchor points are mandatory.", "La protección contra caídas y los anclajes son obligatorios."),
      note("safety.roof_weather", "Never tear off more than can be dried in the same day.", "Nunca retire más de lo que pueda cubrirse el mismo día."),
    ],
    code: [codePlaceholder("ice barrier, ventilation and layer limits", "barrera de hielo, ventilación y capas permitidas")],
    permits: [permitPlaceholder("roof covering replacement", "reemplazo de cubierta de techo")],
    inspections: [inspectionPlaceholder("roof deck / in-progress", "entablado de techo / en proceso")],
    sequencing: [
      note("seq.roof_1", "Protect grounds → tear off → deck repair → underlayment → flashing → shingles → sweep.", "Proteger el terreno → retiro → reparación de entablado → membrana → tapajuntas → tejas → barrido."),
    ],
  }),

  entry("deck_build", {
    kind: "project_type",
    label: ["Deck construction", "Construcción de deck"],
    trade: "carpentry",
    category: "exterior",
    triggers: ["deck", "terraza", "porch", "patio deck"],
    synonyms: ["decking", "balcón", "pergola deck", "outdoor living"],
    standard: EXTERIOR_STANDARD_ITEMS,
    required: ["deck.footings", "deck.ledger_flashing", "general.fasteners", "general.permit"],
    recommended: ["general.inspection", "general.flooring_repair"],
    omissions: [
      "deck.footings",
      "deck.ledger_flashing",
      "general.permit",
      "general.inspection",
      "general.debris_removal",
      "general.material_delivery",
    ],
    upgrades: [
      "upgrade.composite_decking",
      "upgrade.cable_railing",
      "upgrade.stair_lighting",
      "upgrade.post_lighting",
      "upgrade.pergola",
      "upgrade.privacy_screen",
      "upgrade.built_in_seating",
    ],
    valueEngineering: ["ve.composite_to_pressure_treated"],
    safety: [
      note("safety.deck_locate", "Call for utility locates before digging footings.", "Solicite localización de servicios antes de excavar zapatas."),
      note("safety.deck_guard", "Guard and stair rail heights are life-safety items.", "Las alturas de barandal y escaleras son elementos de seguridad de vida."),
    ],
    code: [codePlaceholder("footing depth, guard height and ledger attachment", "profundidad de zapata, altura de barandal y anclaje del larguero")],
    permits: [permitPlaceholder("attached deck construction", "construcción de deck adosado")],
    inspections: [inspectionPlaceholder("footing and framing", "zapatas y estructura")],
    sequencing: [
      note("seq.deck_1", "Layout → footings → ledger and flashing → framing → decking → railing → stairs.", "Trazo → zapatas → larguero y tapajuntas → estructura → entablado → barandal → escaleras."),
    ],
  }),

  entry("flooring_replacement", {
    kind: "project_type",
    label: ["Flooring replacement", "Reemplazo de pisos"],
    trade: "flooring",
    category: "interior_finish",
    triggers: ["flooring", "piso", "replace flooring", "reemplazar piso", "hardwood", "tile floor", "lvp"],
    synonyms: ["carpet", "laminado", "vinyl plank", "duela", "floor install"],
    required: ["flooring.subfloor_prep", "flooring.transitions", "flooring.baseboard_shoe"],
    recommended: ["flooring.door_undercut", "general.paint_touchup", "general.debris_removal"],
    omissions: [
      "flooring.subfloor_prep",
      "flooring.transitions",
      "flooring.door_undercut",
      "flooring.baseboard_shoe",
      "general.floor_protection",
      "general.debris_removal",
      "general.final_cleaning",
    ],
    upgrades: ["upgrade.solid_core_doors"],
    valueEngineering: ["ve.hardwood_to_engineered", "ve.hardwood_to_lvp"],
    safety: [note("safety.floor_silica", "Grinding and cutting require silica dust control.", "El esmerilado y el corte requieren control de polvo de sílice.")],
    code: [codePlaceholder("moisture testing and underlayment requirements", "pruebas de humedad y requisitos de base")],
    permits: [],
    inspections: [],
    sequencing: [
      note("seq.floor_1", "Remove old floor → prep and level → acclimate material → install → trim and transitions.", "Retiro del piso viejo → preparación y nivelación → aclimatar material → instalación → molduras y transiciones."),
    ],
  }),

  entry("interior_painting", {
    kind: "project_type",
    label: ["Interior painting", "Pintura interior"],
    trade: "painting",
    category: "interior_finish",
    triggers: ["paint", "pintura", "painting", "pintar", "repaint"],
    synonyms: ["wall color", "pintura interior", "trim paint", "ceiling paint"],
    required: ["paint.surface_prep", "paint.masking", "paint.primer"],
    recommended: ["general.drywall_repair", "general.final_cleaning"],
    omissions: [
      "paint.surface_prep",
      "paint.masking",
      "paint.primer",
      "general.drywall_repair",
      "general.floor_protection",
      "general.final_cleaning",
    ],
    upgrades: ["upgrade.recessed_lighting"],
    valueEngineering: [],
    safety: [note("safety.paint_ventilation", "Ventilate and follow product cure times in occupied homes.", "Ventile y respete los tiempos de curado en casas habitadas.")],
    code: [],
    permits: [],
    inspections: [],
    sequencing: [
      note("seq.paint_1", "Protect → repair → sand → prime → finish coats → touch-up.", "Proteger → reparar → lijar → sellar → capas de acabado → retoques."),
    ],
  }),

  entry("structural_wall_removal", {
    kind: "activity",
    label: ["Remove load-bearing wall", "Retiro de muro de carga"],
    trade: "framing",
    category: "structural",
    subcategory: "load_bearing",
    projectTypes: ["kitchen_remodel", "home_addition", "basement_finish"],
    triggers: [
      "remove wall",
      "load-bearing wall",
      "load bearing",
      "open concept",
      "quitar muro",
      "muro de carga",
      "concepto abierto",
      "knock down wall",
    ],
    synonyms: ["bearing wall", "structural wall", "open up the kitchen", "derribar pared", "tumbar muro"],
    required: [
      "structural.engineering",
      "structural.temporary_support",
      "structural.beam",
      "structural.posts",
      "structural.jack_studs",
      "general.fasteners",
      "general.permit",
      "general.inspection",
    ],
    recommended: [
      "electrical.relocation",
      "hvac.relocation",
      "plumbing.relocation",
      "general.drywall_repair",
      "general.trim_repair",
      "general.flooring_repair",
      "general.paint_touchup",
    ],
    omissions: [
      "structural.engineering",
      "structural.temporary_support",
      "electrical.relocation",
      "hvac.relocation",
      "plumbing.relocation",
      "general.drywall_repair",
      "general.trim_repair",
      "general.flooring_repair",
      "general.paint_touchup",
      "general.permit",
      "general.inspection",
      "general.dust_containment",
      "general.debris_removal",
      "general.final_cleaning",
    ],
    upgrades: ["upgrade.recessed_lighting", "upgrade.island_outlets"],
    valueEngineering: [],
    safety: [
      note("safety.wall_shoring", "Shore both sides of the load path before cutting any framing.", "Apuntale ambos lados de la trayectoria de carga antes de cortar estructura."),
      note("safety.wall_utilities", "Assume live electrical, gas and water inside the wall until proven otherwise.", "Asuma electricidad, gas y agua activos dentro del muro hasta comprobar lo contrario."),
      note("safety.wall_asbestos", "Pre-1980 plaster and texture may require testing.", "El yeso y las texturas anteriores a 1980 pueden requerir pruebas."),
    ],
    code: [codePlaceholder("beam sizing, bearing and load path continuity", "dimensionamiento de viga, apoyos y continuidad de la carga")],
    permits: [permitPlaceholder("structural alteration", "alteración estructural")],
    inspections: [inspectionPlaceholder("structural framing before cover", "estructura antes de cubrir")],
    sequencing: [
      note("seq.wall_1", "Engineering → permit → temporary support → utility relocation → wall removal → beam set → inspection → close up.", "Ingeniería → permiso → soporte temporal → reubicación de instalaciones → retiro del muro → colocación de viga → inspección → cierre."),
      note("seq.wall_2", "Beam must be inspected before drywall closes it in.", "La viga debe inspeccionarse antes de cerrarla con tablaroca."),
    ],
    dependencies: ["kitchen_remodel"],
  }),

  entry("cabinet_installation", {
    kind: "activity",
    label: ["Install cabinets", "Instalación de gabinetes"],
    trade: "carpentry",
    category: "cabinetry",
    subcategory: "install",
    projectTypes: ["kitchen_remodel", "bathroom_remodel", "basement_finish", "garage_conversion"],
    triggers: ["install cabinets", "cabinets", "gabinetes", "instalar gabinetes", "cabinetry", "vanity"],
    synonyms: ["upper cabinets", "base cabinets", "alacenas", "muebles de cocina", "cabinet install"],
    required: [
      "cabinet.delivery",
      "cabinet.fillers",
      "cabinet.end_panels",
      "cabinet.toe_kicks",
      "cabinet.hardware",
      "general.fasteners",
    ],
    recommended: [
      "countertop.template",
      "backsplash.prep",
      "lighting.undercabinet_coordination",
      "cabinet.appliance_panels",
    ],
    omissions: [
      "cabinet.fillers",
      "cabinet.end_panels",
      "cabinet.toe_kicks",
      "cabinet.crown",
      "cabinet.hardware",
      "cabinet.appliance_panels",
      "cabinet.delivery",
      "countertop.template",
      "backsplash.prep",
      "lighting.undercabinet_coordination",
    ],
    upgrades: [
      "upgrade.soft_close",
      "upgrade.pullout_shelves",
      "upgrade.hidden_trash",
      "upgrade.undercabinet_lighting",
    ],
    valueEngineering: ["ve.custom_to_semi_custom", "ve.semi_custom_to_stock"],
    safety: [
      note("safety.cabinet_lifting", "Upper cabinets are a two-person lift with a ledger board.", "Los gabinetes altos requieren dos personas y una regla de apoyo."),
      note("safety.cabinet_anchors", "Anchor into framing, never drywall alone.", "Ancle a la estructura, nunca solo a la tablaroca."),
    ],
    code: [codePlaceholder("clearances above ranges and around appliances", "espacios libres sobre estufas y alrededor de electrodomésticos")],
    permits: [],
    inspections: [],
    sequencing: [
      note("seq.cabinet_1", "Flooring or leveling → layout lines → uppers → bases → fillers and panels → hardware → countertop template.", "Piso o nivelación → líneas de trazo → altos → bajos → rellenos y paneles → herrajes → plantilla de cubierta."),
    ],
    dependencies: ["kitchen_remodel"],
  }),

  entry("window_replacement", {
    kind: "activity",
    label: ["Window replacement", "Reemplazo de ventanas"],
    trade: "windows",
    category: "openings",
    subcategory: "windows",
    projectTypes: ["home_addition", "basement_finish", "garage_conversion"],
    triggers: ["window", "ventana", "replace window", "reemplazar ventana", "windows"],
    synonyms: ["egress window", "ventanal", "sash", "glass replacement"],
    required: ["window.flashing", "window.interior_trim", "general.fasteners"],
    recommended: ["opening.lead_safe", "general.paint_touchup", "general.debris_removal"],
    omissions: [
      "window.flashing",
      "window.interior_trim",
      "opening.lead_safe",
      "general.paint_touchup",
      "general.debris_removal",
      "general.permit",
    ],
    upgrades: ["upgrade.low_e_glass"],
    valueEngineering: ["ve.fiberglass_to_vinyl_window"],
    safety: [
      note("safety.window_glass", "Handle and dispose of glass units with cut protection.", "Manipule y deseche unidades de vidrio con protección contra cortes."),
      note("safety.window_lead", "Pre-1978 homes require lead-safe work practices.", "Las casas anteriores a 1978 requieren prácticas seguras con plomo."),
    ],
    code: [codePlaceholder("egress sizing, tempered glazing and energy ratings", "dimensiones de escape, vidrio templado y valores energéticos")],
    permits: [permitPlaceholder("changing a window opening size", "cambio de tamaño de una abertura de ventana")],
    inspections: [],
    sequencing: [
      note("seq.window_1", "Measure → order → remove → flash → set → insulate and seal → trim → paint.", "Medición → pedido → retiro → tapajuntas → colocación → aislar y sellar → molduras → pintura."),
    ],
  }),

  entry("door_replacement", {
    kind: "activity",
    label: ["Door replacement", "Reemplazo de puertas"],
    trade: "carpentry",
    category: "openings",
    subcategory: "doors",
    projectTypes: ["home_addition", "basement_finish", "garage_conversion", "handyman_services"],
    triggers: ["door", "puerta", "replace door", "reemplazar puerta", "entry door"],
    synonyms: ["slab door", "prehung", "patio door", "puerta corrediza"],
    required: ["door.hardware", "window.interior_trim", "general.fasteners"],
    recommended: ["general.paint_touchup", "flooring.door_undercut", "window.flashing"],
    omissions: [
      "door.hardware",
      "window.interior_trim",
      "window.flashing",
      "flooring.door_undercut",
      "general.paint_touchup",
      "general.debris_removal",
    ],
    upgrades: ["upgrade.solid_core_doors"],
    valueEngineering: [],
    safety: [note("safety.door_weight", "Exterior and solid-core doors need a two-person set.", "Las puertas exteriores y de alma sólida requieren dos personas.")],
    code: [codePlaceholder("egress width, fire rating at garage doors and threshold height", "ancho de salida, resistencia al fuego en puertas de cochera y altura de umbral")],
    permits: [],
    inspections: [],
    sequencing: [
      note("seq.door_1", "Remove → prep opening → shim and set plumb → hardware → trim → paint.", "Retiro → preparar abertura → calzar y aplomar → herrajes → molduras → pintura."),
    ],
  }),

  entry("handyman_services", {
    kind: "project_type",
    label: ["Handyman services", "Servicios de mantenimiento"],
    trade: "general",
    category: "service",
    triggers: ["handyman", "mantenimiento", "small repair", "reparación menor", "punch list"],
    synonyms: ["odd jobs", "honey do", "trabajos varios", "minor repairs"],
    standard: ["general.consumables", "general.fasteners", "general.daily_cleanup", "general.final_cleaning"],
    required: ["handyman.trip_charge", "general.consumables"],
    recommended: ["general.floor_protection", "general.debris_removal", "general.paint_touchup"],
    omissions: [
      "handyman.trip_charge",
      "general.consumables",
      "general.floor_protection",
      "general.debris_removal",
      "general.paint_touchup",
    ],
    upgrades: [],
    valueEngineering: [],
    safety: [note("safety.handyman_scope", "Confirm whether any task crosses into licensed trade work.", "Confirme si alguna tarea requiere un oficio con licencia.")],
    code: [],
    permits: [],
    inspections: [],
    sequencing: [
      note("seq.handyman_1", "Group tasks by trade and room to minimize setups.", "Agrupe tareas por oficio y cuarto para minimizar preparaciones."),
    ],
    confidence: "medium",
  }),
];

/** Convenience: keys used by the inspection page selector, in display order. */
export const KNOWLEDGE_ENTRY_KEYS: string[] = KNOWLEDGE_ENTRIES.map((e) => e.entryKey);

/** Customer-facing value statements are derived from the entry's items. */
export const ENTRY_CUSTOMER_INTRO: Record<string, Bilingual> = {
  kitchen_remodel: bi(
    "Your kitchen project is planned end to end, from protecting the rest of your home to the final detail clean.",
    "Su proyecto de cocina se planea de principio a fin, desde proteger el resto de su casa hasta la limpieza final de detalle.",
  ),
  bathroom_remodel: bi(
    "Your bathroom is built around a complete waterproofing and ventilation system, so the finishes last.",
    "Su baño se construye alrededor de un sistema completo de impermeabilización y ventilación para que los acabados duren.",
  ),
  structural_wall_removal: bi(
    "Opening this wall is engineered and supported so your home stays safe and solid.",
    "La apertura de este muro se diseña y soporta para que su casa permanezca segura y sólida.",
  ),
};
