/**
 * Module 015 — shared knowledge item library.
 *
 * Every item is authored once here and referenced by key from the catalog, so
 * "floor protection" reads identically on a kitchen, a deck and a roof. Text is
 * bilingual at the source; contractor wording and customer wording are always
 * separate strings.
 */
import type {
  Bilingual,
  KnowledgeConfidence,
  KnowledgeImpactCategory,
  KnowledgeItem,
  KnowledgeSalesOpportunity,
  KnowledgeStandardItem,
  KnowledgeValueEngineering,
} from "./types";

export const bi = (en: string, es: string): Bilingual => ({ "en-US": en, "es-US": es });

type Pair = [en: string, es: string];

interface ItemSpec {
  trade: string;
  category: string;
  confidence: KnowledgeConfidence;
  label: Pair;
  customerLabel: Pair;
  contractor: Pair;
  customer: Pair;
  quantity?: { value: number | null; unitKey: string };
}

function item(itemKey: string, spec: ItemSpec): KnowledgeItem {
  return {
    itemKey,
    tradeKey: spec.trade,
    categoryKey: spec.category,
    confidence: spec.confidence,
    label: bi(...spec.label),
    customerLabel: bi(...spec.customerLabel),
    contractorRationale: bi(...spec.contractor),
    customerValueStatement: bi(...spec.customer),
    suggestedQuantity: spec.quantity ?? null,
  };
}

/* ------------------------------------------------------------------ items */

const GENERAL: Record<string, KnowledgeItem> = {
  "general.floor_protection": item("general.floor_protection", {
    trade: "general",
    category: "protection",
    confidence: "high",
    label: ["Floor protection", "Protección de pisos"],
    customerLabel: ["Floor protection throughout the work path", "Protección de pisos en el área de trabajo"],
    contractor: ["Occupied-home work always needs protected travel paths.", "El trabajo en casa habitada siempre necesita caminos protegidos."],
    customer: [
      "We include floor protection to reduce damage, control debris, and keep the rest of your home usable during construction.",
      "Incluimos protección de pisos para reducir daños, controlar los escombros y mantener el resto de su casa utilizable durante la obra.",
    ],
    quantity: { value: null, unitKey: "square_foot" },
  }),
  "general.dust_containment": item("general.dust_containment", {
    trade: "general",
    category: "protection",
    confidence: "high",
    label: ["Dust containment", "Contención de polvo"],
    customerLabel: ["Dust containment barriers", "Barreras de contención de polvo"],
    contractor: ["Demolition, sanding and cutting always generate dust.", "La demolición, el lijado y los cortes siempre generan polvo."],
    customer: [
      "We isolate the work area to reduce dust migration into occupied parts of the home.",
      "Aislamos el área de trabajo para reducir el paso de polvo a las zonas habitadas de la casa.",
    ],
  }),
  "general.daily_cleanup": item("general.daily_cleanup", {
    trade: "general",
    category: "cleanup",
    confidence: "high",
    label: ["Daily cleanup", "Limpieza diaria"],
    customerLabel: ["Daily cleanup", "Limpieza diaria"],
    contractor: ["Crew cleanup time is real labor and is rarely captured.", "El tiempo de limpieza de la cuadrilla es mano de obra real y rara vez se captura."],
    customer: [
      "The work area is cleaned at the end of every working day.",
      "El área de trabajo se limpia al final de cada jornada.",
    ],
  }),
  "general.final_cleaning": item("general.final_cleaning", {
    trade: "general",
    category: "cleanup",
    confidence: "high",
    label: ["Final cleaning", "Limpieza final"],
    customerLabel: ["Final detail cleaning at completion", "Limpieza final de detalle al terminar"],
    contractor: ["Construction clean is a separate labor task from daily cleanup.", "La limpieza final es una tarea distinta de la limpieza diaria."],
    customer: [
      "Your space is detail-cleaned before we hand it back to you.",
      "Su espacio recibe una limpieza de detalle antes de entregárselo.",
    ],
  }),
  "general.debris_removal": item("general.debris_removal", {
    trade: "general",
    category: "cleanup",
    confidence: "high",
    label: ["Debris removal and hauling", "Retiro y acarreo de escombros"],
    customerLabel: ["Debris removal", "Retiro de escombros"],
    contractor: ["Hauling labor and disposal fees are separate from the dumpster.", "El acarreo y las tarifas de disposición son aparte del contenedor."],
    customer: [
      "All construction debris is removed and disposed of responsibly.",
      "Todos los escombros de la obra se retiran y desechan de forma responsable.",
    ],
  }),
  "general.dumpster": item("general.dumpster", {
    trade: "general",
    category: "cleanup",
    confidence: "high",
    label: ["Dumpster allowance", "Provisión de contenedor"],
    customerLabel: ["On-site waste container", "Contenedor de residuos en obra"],
    contractor: ["Container rental, delivery and swap-outs.", "Renta, entrega e intercambio del contenedor."],
    customer: [
      "A waste container keeps the site orderly and your driveway clear of loose debris.",
      "Un contenedor mantiene la obra ordenada y su entrada libre de escombros sueltos.",
    ],
    quantity: { value: 1, unitKey: "allowance" },
  }),
  "general.material_delivery": item("general.material_delivery", {
    trade: "general",
    category: "logistics",
    confidence: "high",
    label: ["Material delivery and unloading", "Entrega y descarga de materiales"],
    customerLabel: ["Material delivery", "Entrega de materiales"],
    contractor: ["Delivery fees and unloading labor are routinely omitted.", "Las tarifas de entrega y la descarga suelen omitirse."],
    customer: [
      "Materials are delivered and staged so work starts without delay.",
      "Los materiales se entregan y organizan para que el trabajo comience sin retrasos.",
    ],
  }),
  "general.fasteners": item("general.fasteners", {
    trade: "general",
    category: "consumables",
    confidence: "high",
    label: ["Fasteners and connectors", "Fijaciones y conectores"],
    customerLabel: ["Fasteners and hardware", "Fijaciones y herrajes"],
    contractor: ["Screws, nails, anchors and structural connectors.", "Tornillos, clavos, anclajes y conectores estructurales."],
    customer: [
      "Correct fasteners and connectors are included so the work meets its intended strength.",
      "Se incluyen las fijaciones y conectores correctos para lograr la resistencia prevista.",
    ],
  }),
  "general.consumables": item("general.consumables", {
    trade: "general",
    category: "consumables",
    confidence: "high",
    label: ["Consumables", "Consumibles"],
    customerLabel: ["Job consumables", "Consumibles de obra"],
    contractor: ["Blades, tape, caulk, adhesives, sandpaper, plastic.", "Discos, cinta, sellador, adhesivos, lija, plástico."],
    customer: [
      "Everyday job supplies are included so the crew never pauses for small items.",
      "Los suministros diarios están incluidos para que la cuadrilla no se detenga por artículos menores.",
    ],
  }),
  "general.equipment_setup": item("general.equipment_setup", {
    trade: "general",
    category: "logistics",
    confidence: "medium",
    label: ["Equipment setup and mobilization", "Instalación de equipo y movilización"],
    customerLabel: ["Equipment setup", "Instalación de equipo"],
    contractor: ["Mobilization, staging and equipment rental time.", "Movilización, organización y tiempo de renta de equipo."],
    customer: [
      "The right equipment is on site and set up before work begins.",
      "El equipo adecuado está en sitio e instalado antes de comenzar.",
    ],
  }),
  "general.permit": item("general.permit", {
    trade: "general",
    category: "compliance",
    confidence: "contractor_decision_required",
    label: ["Permit allowance", "Provisión de permiso"],
    customerLabel: ["Permit coordination", "Gestión de permisos"],
    contractor: ["Confirm jurisdiction requirements before pricing.", "Confirme los requisitos de la jurisdicción antes de cotizar."],
    customer: [
      "We coordinate the permits your project requires with the local authority.",
      "Coordinamos con la autoridad local los permisos que su proyecto requiera.",
    ],
    quantity: { value: 1, unitKey: "allowance" },
  }),
  "general.inspection": item("general.inspection", {
    trade: "general",
    category: "compliance",
    confidence: "contractor_decision_required",
    label: ["Inspection coordination", "Coordinación de inspecciones"],
    customerLabel: ["Inspection coordination", "Coordinación de inspecciones"],
    contractor: ["Schedule holds and re-inspection time affect the schedule.", "Las esperas y reinspecciones afectan el calendario."],
    customer: [
      "We schedule and meet the required inspections so the work is properly signed off.",
      "Programamos y atendemos las inspecciones requeridas para que la obra quede aprobada.",
    ],
  }),
  "general.drywall_repair": item("general.drywall_repair", {
    trade: "drywall",
    category: "repair",
    confidence: "high",
    label: ["Drywall repair", "Reparación de tablaroca"],
    customerLabel: ["Wall and ceiling repair", "Reparación de paredes y techos"],
    contractor: ["Openings, patching and texture matching after demolition.", "Aberturas, resanes y texturizado después de la demolición."],
    customer: [
      "Walls and ceilings are repaired and blended so the finished space looks seamless.",
      "Las paredes y techos se reparan e integran para que el espacio final se vea uniforme.",
    ],
  }),
  "general.paint_touchup": item("general.paint_touchup", {
    trade: "painting",
    category: "finish",
    confidence: "high",
    label: ["Paint blending and touch-up", "Integración y retoque de pintura"],
    customerLabel: ["Paint blending", "Integración de pintura"],
    contractor: ["Adjacent surfaces rarely match after repair.", "Las superficies adyacentes rara vez coinciden tras la reparación."],
    customer: [
      "Repaired surfaces are painted and blended into the surrounding finish.",
      "Las superficies reparadas se pintan e integran con el acabado existente.",
    ],
  }),
  "general.trim_repair": item("general.trim_repair", {
    trade: "carpentry",
    category: "finish",
    confidence: "medium",
    label: ["Trim repair and replacement", "Reparación y reemplazo de molduras"],
    customerLabel: ["Trim finishing", "Acabado de molduras"],
    contractor: ["Base, casing and shoe rarely survive demolition intact.", "Zoclos, marcos y molduras rara vez sobreviven la demolición."],
    customer: [
      "Trim is repaired or replaced so edges and transitions look finished.",
      "Las molduras se reparan o reemplazan para que los bordes y transiciones se vean terminados.",
    ],
  }),
  "general.flooring_repair": item("general.flooring_repair", {
    trade: "flooring",
    category: "repair",
    confidence: "medium",
    label: ["Flooring repair and transition", "Reparación y transición de pisos"],
    customerLabel: ["Flooring transitions", "Transiciones de piso"],
    contractor: ["Removed walls and fixtures leave gaps in the floor.", "Los muros y muebles retirados dejan huecos en el piso."],
    customer: [
      "Floors are patched and transitioned so the space reads as one continuous room.",
      "Los pisos se resanan y se integran para que el espacio se vea como una sola habitación continua.",
    ],
  }),
  "general.temporary_protection_hvac": item("general.temporary_protection_hvac", {
    trade: "hvac",
    category: "protection",
    confidence: "medium",
    label: ["HVAC register protection", "Protección de rejillas HVAC"],
    customerLabel: ["Air system protection", "Protección del sistema de aire"],
    contractor: ["Sealing registers prevents dust in the duct system.", "Sellar rejillas evita polvo en los ductos."],
    customer: [
      "Vents are sealed during construction so dust does not enter your air system.",
      "Las rejillas se sellan durante la obra para que el polvo no entre a su sistema de aire.",
    ],
  }),
};

const MEP: Record<string, KnowledgeItem> = {
  "electrical.relocation": item("electrical.relocation", {
    trade: "electrical",
    category: "rough_in",
    confidence: "high",
    label: ["Electrical relocation", "Reubicación eléctrica"],
    customerLabel: ["Electrical adjustments", "Ajustes eléctricos"],
    contractor: ["Circuits inside removed walls must be rerouted.", "Los circuitos dentro de muros retirados deben redirigirse."],
    customer: [
      "Wiring in the affected area is safely rerouted and brought up to current standards.",
      "El cableado del área afectada se redirige con seguridad y se ajusta a las normas vigentes.",
    ],
  }),
  "electrical.adjustments": item("electrical.adjustments", {
    trade: "electrical",
    category: "rough_in",
    confidence: "medium",
    label: ["Electrical adjustments", "Ajustes eléctricos"],
    customerLabel: ["Electrical adjustments", "Ajustes eléctricos"],
    contractor: ["New layouts move outlets, switches and dedicated circuits.", "Los nuevos diseños mueven contactos, apagadores y circuitos dedicados."],
    customer: [
      "Outlets, switches and lighting circuits are adapted to the new layout.",
      "Contactos, apagadores y circuitos de iluminación se adaptan al nuevo diseño.",
    ],
  }),
  "plumbing.relocation": item("plumbing.relocation", {
    trade: "plumbing",
    category: "rough_in",
    confidence: "medium",
    label: ["Plumbing relocation", "Reubicación de plomería"],
    customerLabel: ["Plumbing adjustments", "Ajustes de plomería"],
    contractor: ["Supply and drain lines inside affected walls.", "Líneas de suministro y drenaje dentro de los muros afectados."],
    customer: [
      "Water and drain lines are adjusted to serve the new layout correctly.",
      "Las líneas de agua y drenaje se ajustan para servir correctamente el nuevo diseño.",
    ],
  }),
  "hvac.relocation": item("hvac.relocation", {
    trade: "hvac",
    category: "rough_in",
    confidence: "medium",
    label: ["HVAC relocation", "Reubicación de HVAC"],
    customerLabel: ["Heating and cooling adjustments", "Ajustes de calefacción y aire"],
    contractor: ["Ducts and returns in removed walls need rerouting.", "Los ductos y retornos en muros retirados requieren redirección."],
    customer: [
      "Ducts and vents are re-routed so every area stays comfortable.",
      "Los ductos y rejillas se redirigen para que cada área siga siendo confortable.",
    ],
  }),
  "plumbing.temp_sink": item("plumbing.temp_sink", {
    trade: "plumbing",
    category: "logistics",
    confidence: "optional",
    label: ["Temporary sink setup", "Fregadero temporal"],
    customerLabel: ["Temporary kitchen setup", "Cocina temporal"],
    contractor: ["Occupied kitchen remodels often need interim water.", "Las remodelaciones de cocina habitada suelen necesitar agua provisional."],
    customer: [
      "A temporary sink keeps daily life workable while your kitchen is out of service.",
      "Un fregadero temporal hace más llevadera la vida diaria mientras su cocina está fuera de servicio.",
    ],
  }),
  "appliance.disconnect": item("appliance.disconnect", {
    trade: "general",
    category: "demolition",
    confidence: "high",
    label: ["Appliance disconnect", "Desconexión de electrodomésticos"],
    customerLabel: ["Appliance disconnection", "Desconexión de electrodomésticos"],
    contractor: ["Gas and water disconnects need a licensed trade.", "Las desconexiones de gas y agua requieren un oficio con licencia."],
    customer: [
      "Existing appliances are disconnected safely before demolition begins.",
      "Los electrodomésticos existentes se desconectan con seguridad antes de la demolición.",
    ],
  }),
  "appliance.removal": item("appliance.removal", {
    trade: "general",
    category: "demolition",
    confidence: "medium",
    label: ["Appliance removal and storage", "Retiro y resguardo de electrodomésticos"],
    customerLabel: ["Appliance removal", "Retiro de electrodomésticos"],
    contractor: ["Moving, storing and re-setting appliances is real labor.", "Mover, resguardar y reinstalar electrodomésticos es mano de obra real."],
    customer: [
      "Appliances are removed, protected and re-set when the space is ready.",
      "Los electrodomésticos se retiran, protegen y reinstalan cuando el espacio está listo.",
    ],
  }),
};

const STRUCTURAL: Record<string, KnowledgeItem> = {
  "structural.temporary_support": item("structural.temporary_support", {
    trade: "framing",
    category: "structural",
    confidence: "high",
    label: ["Temporary support walls", "Muros de soporte temporal"],
    customerLabel: ["Temporary structural support", "Soporte estructural temporal"],
    contractor: ["Never remove bearing framing without shoring both sides.", "Nunca retire estructura de carga sin apuntalar ambos lados."],
    customer: [
      "Temporary structural support is included to keep the home safely supported while the new beam is installed.",
      "Se incluye soporte estructural temporal para mantener la casa segura mientras se instala la nueva viga.",
    ],
  }),
  "structural.engineering": item("structural.engineering", {
    trade: "engineering",
    category: "structural",
    confidence: "high",
    label: ["Structural engineering", "Ingeniería estructural"],
    customerLabel: ["Engineered structural design", "Diseño estructural profesional"],
    contractor: ["Beam sizing and bearing details require a stamped design.", "El dimensionamiento de la viga y los apoyos requieren diseño sellado."],
    customer: [
      "A licensed engineer specifies the beam and supports so the change is safe and permanent.",
      "Un ingeniero con licencia especifica la viga y los apoyos para que el cambio sea seguro y permanente.",
    ],
  }),
  "structural.beam": item("structural.beam", {
    trade: "framing",
    category: "structural",
    confidence: "high",
    label: ["LVL or engineered beam", "Viga LVL o de ingeniería"],
    customerLabel: ["New structural beam", "Nueva viga estructural"],
    contractor: ["Beam material, hoisting and install labor.", "Material de la viga, izaje y mano de obra de instalación."],
    customer: [
      "A new engineered beam carries the load the wall used to carry.",
      "Una nueva viga de ingeniería soporta la carga que antes llevaba el muro.",
    ],
  }),
  "structural.posts": item("structural.posts", {
    trade: "framing",
    category: "structural",
    confidence: "high",
    label: ["Posts and bearing points", "Postes y puntos de apoyo"],
    customerLabel: ["Support posts", "Postes de soporte"],
    contractor: ["Load path must continue to the foundation.", "La trayectoria de carga debe continuar hasta la cimentación."],
    customer: [
      "Support posts carry the load safely down to the foundation.",
      "Los postes de soporte llevan la carga con seguridad hasta la cimentación.",
    ],
  }),
  "structural.jack_studs": item("structural.jack_studs", {
    trade: "framing",
    category: "structural",
    confidence: "medium",
    label: ["Jack studs and headers", "Pies derechos y cabezales"],
    customerLabel: ["Framing supports", "Soportes de estructura"],
    contractor: ["Bearing framing at each end of the new beam.", "Estructura de apoyo en cada extremo de la nueva viga."],
    customer: [
      "Framing at each end transfers the beam load correctly.",
      "La estructura en cada extremo transfiere correctamente la carga de la viga.",
    ],
  }),
};

const KITCHEN: Record<string, KnowledgeItem> = {
  "cabinet.fillers": item("cabinet.fillers", {
    trade: "carpentry",
    category: "cabinetry",
    confidence: "high",
    label: ["Fillers and scribe material", "Rellenos y material de ajuste"],
    customerLabel: ["Custom-fitted cabinet trim", "Ajuste a medida de gabinetes"],
    contractor: ["Walls are never square; fillers close the gaps.", "Los muros nunca están a escuadra; los rellenos cierran los huecos."],
    customer: [
      "Cabinets are scribed to your walls so the finished run looks built-in.",
      "Los gabinetes se ajustan a sus muros para que el conjunto se vea integrado.",
    ],
  }),
  "cabinet.end_panels": item("cabinet.end_panels", {
    trade: "carpentry",
    category: "cabinetry",
    confidence: "high",
    label: ["Finished end panels", "Paneles laterales terminados"],
    customerLabel: ["Finished cabinet ends", "Costados de gabinete terminados"],
    contractor: ["Exposed cabinet sides need matching finished panels.", "Los costados expuestos requieren paneles terminados a juego."],
    customer: [
      "Exposed cabinet sides get finished panels that match the door style.",
      "Los costados expuestos reciben paneles terminados que combinan con las puertas.",
    ],
  }),
  "cabinet.toe_kicks": item("cabinet.toe_kicks", {
    trade: "carpentry",
    category: "cabinetry",
    confidence: "high",
    label: ["Toe kicks", "Zócalos de gabinete"],
    customerLabel: ["Toe-kick finishing", "Acabado del zócalo"],
    contractor: ["Toe kick material and install labor ship separately.", "El material del zócalo y su instalación se manejan aparte."],
    customer: [
      "Toe kicks are finished to match, closing the base of every cabinet run.",
      "Los zócalos se terminan a juego, cerrando la base de cada línea de gabinetes.",
    ],
  }),
  "cabinet.crown": item("cabinet.crown", {
    trade: "carpentry",
    category: "cabinetry",
    confidence: "optional",
    label: ["Cabinet crown molding", "Moldura corona de gabinete"],
    customerLabel: ["Crown molding on upper cabinets", "Moldura corona en gabinetes altos"],
    contractor: ["Material plus mitered install labor.", "Material más mano de obra de cortes a inglete."],
    customer: [
      "Crown molding closes the gap at the ceiling and gives the kitchen a custom look.",
      "La moldura corona cierra el espacio al techo y da a la cocina un aspecto a medida.",
    ],
  }),
  "cabinet.hardware": item("cabinet.hardware", {
    trade: "carpentry",
    category: "cabinetry",
    confidence: "high",
    label: ["Cabinet hardware", "Herrajes de gabinete"],
    customerLabel: ["Handles and knobs", "Jaladeras y perillas"],
    contractor: ["Knobs, pulls and the labor to drill and set them.", "Perillas, jaladeras y la mano de obra para perforarlas y colocarlas."],
    customer: [
      "Handles and knobs are supplied and installed with consistent alignment.",
      "Las jaladeras y perillas se suministran e instalan con alineación uniforme.",
    ],
  }),
  "cabinet.appliance_panels": item("cabinet.appliance_panels", {
    trade: "carpentry",
    category: "cabinetry",
    confidence: "optional",
    label: ["Appliance panels", "Paneles de electrodomésticos"],
    customerLabel: ["Paneled appliance fronts", "Frentes de electrodoméstico con panel"],
    contractor: ["Panel-ready appliances need matched cabinet fronts.", "Los electrodomésticos panelables requieren frentes a juego."],
    customer: [
      "Matching panels let appliances blend into the cabinetry.",
      "Los paneles a juego permiten que los electrodomésticos se integren a la carpintería.",
    ],
  }),
  "cabinet.delivery": item("cabinet.delivery", {
    trade: "carpentry",
    category: "logistics",
    confidence: "high",
    label: ["Cabinet delivery and unloading", "Entrega y descarga de gabinetes"],
    customerLabel: ["Cabinet delivery", "Entrega de gabinetes"],
    contractor: ["Freight, inspection and staging labor.", "Flete, inspección y mano de obra de acomodo."],
    customer: [
      "Cabinets are received, inspected and staged before installation day.",
      "Los gabinetes se reciben, inspeccionan y organizan antes del día de instalación.",
    ],
  }),
  "countertop.template": item("countertop.template", {
    trade: "countertops",
    category: "coordination",
    confidence: "high",
    label: ["Countertop template coordination", "Coordinación de plantilla de cubierta"],
    customerLabel: ["Countertop measuring visit", "Visita de medición de cubiertas"],
    contractor: ["Template happens after cabinets are set — schedule it.", "La plantilla se toma después de instalar gabinetes: prográmela."],
    customer: [
      "Your countertops are templated on site for an exact fit.",
      "Sus cubiertas se miden en sitio con plantilla para un ajuste exacto.",
    ],
  }),
  "backsplash.prep": item("backsplash.prep", {
    trade: "tile",
    category: "prep",
    confidence: "medium",
    label: ["Backsplash preparation", "Preparación de salpicadero"],
    customerLabel: ["Backsplash preparation", "Preparación del salpicadero"],
    contractor: ["Wall flattening and substrate before tile.", "Nivelación del muro y sustrato antes del azulejo."],
    customer: [
      "The wall is prepared so the backsplash sits flat and grout lines stay straight.",
      "El muro se prepara para que el salpicadero quede plano y las juntas rectas.",
    ],
  }),
  "lighting.undercabinet_coordination": item("lighting.undercabinet_coordination", {
    trade: "electrical",
    category: "coordination",
    confidence: "medium",
    label: ["Under-cabinet lighting coordination", "Coordinación de luz bajo gabinete"],
    customerLabel: ["Under-cabinet lighting rough-in", "Preparación de luz bajo gabinete"],
    contractor: ["Wiring must be roughed in before cabinets are set.", "El cableado debe quedar antes de instalar los gabinetes."],
    customer: [
      "Wiring is prepared before cabinets go in so lighting can be added cleanly.",
      "El cableado se prepara antes de los gabinetes para poder añadir iluminación sin obra extra.",
    ],
  }),
};

const EXTERIOR: Record<string, KnowledgeItem> = {
  "deck.footings": item("deck.footings", {
    trade: "concrete",
    category: "structural",
    confidence: "high",
    label: ["Footings and post bases", "Zapatas y bases de poste"],
    customerLabel: ["Foundation footings", "Cimentación del deck"],
    contractor: ["Depth is set by the local frost line.", "La profundidad la define la línea de congelación local."],
    customer: [
      "Properly sized footings keep the deck stable and level for the long term.",
      "Zapatas del tamaño correcto mantienen el deck estable y nivelado a largo plazo.",
    ],
  }),
  "deck.ledger_flashing": item("deck.ledger_flashing", {
    trade: "carpentry",
    category: "waterproofing",
    confidence: "high",
    label: ["Ledger flashing", "Tapajuntas del larguero"],
    customerLabel: ["Weatherproof house connection", "Conexión impermeable a la casa"],
    contractor: ["Most deck failures start at an unflashed ledger.", "La mayoría de las fallas de deck comienzan en un larguero sin tapajuntas."],
    customer: [
      "Flashing at the house connection keeps water out of the structure.",
      "El tapajuntas en la conexión con la casa mantiene el agua fuera de la estructura.",
    ],
  }),
  "roofing.underlayment": item("roofing.underlayment", {
    trade: "roofing",
    category: "waterproofing",
    confidence: "high",
    label: ["Underlayment and ice barrier", "Membrana y barrera de hielo"],
    customerLabel: ["Secondary water barrier", "Barrera secundaria contra agua"],
    contractor: ["Code often requires ice barrier at eaves and valleys.", "El código suele exigir barrera de hielo en aleros y limahoyas."],
    customer: [
      "A secondary water barrier protects the roof deck if wind drives water under the shingles.",
      "Una barrera secundaria protege la cubierta si el viento mete agua bajo las tejas.",
    ],
  }),
  "roofing.deck_repair": item("roofing.deck_repair", {
    trade: "roofing",
    category: "repair",
    confidence: "contractor_decision_required",
    label: ["Sheathing repair allowance", "Provisión de reparación de entablado"],
    customerLabel: ["Roof deck repair", "Reparación de la cubierta del techo"],
    contractor: ["Rot is only visible after tear-off — carry an allowance.", "La pudrición solo se ve tras el retiro: considere una provisión."],
    customer: [
      "If damaged decking is found once the old roof is off, it is repaired before the new roof goes on.",
      "Si se encuentra entablado dañado al retirar el techo viejo, se repara antes de instalar el nuevo.",
    ],
    quantity: { value: null, unitKey: "sheet" },
  }),
  "roofing.gutter_protection": item("roofing.gutter_protection", {
    trade: "roofing",
    category: "protection",
    confidence: "medium",
    label: ["Landscape and gutter protection", "Protección de jardín y canaletas"],
    customerLabel: ["Landscaping protection", "Protección del jardín"],
    contractor: ["Tear-off debris damages plantings and gutters.", "Los escombros del retiro dañan plantas y canaletas."],
    customer: [
      "Plantings and gutters are protected during tear-off and cleaned afterward.",
      "Las plantas y canaletas se protegen durante el retiro y se limpian al terminar.",
    ],
  }),
  "exterior.magnetic_sweep": item("exterior.magnetic_sweep", {
    trade: "general",
    category: "cleanup",
    confidence: "high",
    label: ["Magnetic nail sweep", "Barrido magnético de clavos"],
    customerLabel: ["Nail sweep of the property", "Barrido de clavos en la propiedad"],
    contractor: ["Standard closeout task on any tear-off.", "Tarea estándar de cierre en cualquier retiro de techo."],
    customer: [
      "The yard and driveway are swept with a magnet so no fasteners are left behind.",
      "El jardín y la entrada se barren con imán para no dejar fijaciones sueltas.",
    ],
  }),
};

const OPENINGS: Record<string, KnowledgeItem> = {
  "window.flashing": item("window.flashing", {
    trade: "carpentry",
    category: "waterproofing",
    confidence: "high",
    label: ["Window flashing and sealing", "Tapajuntas y sellado de ventana"],
    customerLabel: ["Weatherproof window sealing", "Sellado impermeable de ventanas"],
    contractor: ["Sill pan, flashing tape and exterior sealant.", "Charola de alféizar, cinta de tapajuntas y sellador exterior."],
    customer: [
      "Each opening is flashed and sealed so wind-driven rain stays outside.",
      "Cada abertura se sella e impermeabiliza para que la lluvia con viento quede fuera.",
    ],
  }),
  "window.interior_trim": item("window.interior_trim", {
    trade: "carpentry",
    category: "finish",
    confidence: "high",
    label: ["Interior trim and casing", "Molduras y marcos interiores"],
    customerLabel: ["Interior finishing", "Acabado interior"],
    contractor: ["Old casing rarely survives removal intact.", "Los marcos viejos rara vez sobreviven el retiro."],
    customer: [
      "Interior trim is finished around every opening for a clean, complete look.",
      "Las molduras interiores se terminan en cada abertura para un aspecto limpio y completo.",
    ],
  }),
  "opening.lead_safe": item("opening.lead_safe", {
    trade: "general",
    category: "compliance",
    confidence: "contractor_decision_required",
    label: ["Lead-safe work practices (pre-1978)", "Prácticas seguras con plomo (antes de 1978)"],
    customerLabel: ["Safe handling of older finishes", "Manejo seguro de acabados antiguos"],
    contractor: ["RRP rules apply to pre-1978 homes — verify before work.", "Las reglas RRP aplican a casas anteriores a 1978: verifique antes."],
    customer: [
      "Older homes are handled with certified safe practices to protect your household.",
      "Las casas antiguas se manejan con prácticas certificadas para proteger a su familia.",
    ],
  }),
  "door.hardware": item("door.hardware", {
    trade: "carpentry",
    category: "finish",
    confidence: "high",
    label: ["Door hardware and strike adjustment", "Herrajes de puerta y ajuste de cerradero"],
    customerLabel: ["Door hardware", "Herrajes de puerta"],
    contractor: ["Hinges, locksets, strikes and final adjustment labor.", "Bisagras, cerraduras, cerraderos y ajuste final."],
    customer: [
      "Hardware is installed and adjusted so every door latches smoothly.",
      "Los herrajes se instalan y ajustan para que cada puerta cierre suavemente.",
    ],
  }),
};

const INTERIOR: Record<string, KnowledgeItem> = {
  "flooring.subfloor_prep": item("flooring.subfloor_prep", {
    trade: "flooring",
    category: "prep",
    confidence: "high",
    label: ["Subfloor preparation and leveling", "Preparación y nivelación de contrapiso"],
    customerLabel: ["Floor leveling", "Nivelación del piso"],
    contractor: ["Flatness tolerance drives most flooring warranties.", "La planitud determina la mayoría de las garantías de piso."],
    customer: [
      "The floor beneath is leveled so your new flooring sits flat and lasts.",
      "El piso base se nivela para que su nuevo piso quede plano y dure.",
    ],
  }),
  "flooring.transitions": item("flooring.transitions", {
    trade: "flooring",
    category: "finish",
    confidence: "high",
    label: ["Transitions and thresholds", "Transiciones y umbrales"],
    customerLabel: ["Doorway transitions", "Transiciones en puertas"],
    contractor: ["Every room change and doorway needs a transition piece.", "Cada cambio de cuarto y puerta requiere una pieza de transición."],
    customer: [
      "Doorways and room changes get proper transitions for a safe, finished edge.",
      "Las puertas y cambios de cuarto reciben transiciones adecuadas para un borde seguro y terminado.",
    ],
  }),
  "flooring.door_undercut": item("flooring.door_undercut", {
    trade: "carpentry",
    category: "finish",
    confidence: "medium",
    label: ["Door undercut and re-hang", "Rebaje y recolocación de puertas"],
    customerLabel: ["Door adjustment", "Ajuste de puertas"],
    contractor: ["New floor height changes door clearance.", "La nueva altura del piso cambia el claro de las puertas."],
    customer: [
      "Doors are trimmed and re-hung so they clear the new floor.",
      "Las puertas se recortan y recolocan para librar el nuevo piso.",
    ],
  }),
  "flooring.baseboard_shoe": item("flooring.baseboard_shoe", {
    trade: "carpentry",
    category: "finish",
    confidence: "high",
    label: ["Baseboard or shoe molding", "Zoclo o moldura de remate"],
    customerLabel: ["Baseboard finishing", "Acabado de zoclos"],
    contractor: ["Expansion gap has to be covered at every wall.", "El espacio de expansión debe cubrirse en cada muro."],
    customer: [
      "Baseboard or shoe molding finishes the edge where floor meets wall.",
      "El zoclo o la moldura de remate termina el borde entre piso y muro.",
    ],
  }),
  "paint.surface_prep": item("paint.surface_prep", {
    trade: "painting",
    category: "prep",
    confidence: "high",
    label: ["Surface preparation", "Preparación de superficies"],
    customerLabel: ["Surface preparation", "Preparación de superficies"],
    contractor: ["Patching, sanding and caulking is most of the labor.", "Resanar, lijar y sellar es la mayor parte de la mano de obra."],
    customer: [
      "Surfaces are patched, sanded and caulked so the finish looks even and lasts.",
      "Las superficies se resanan, lijan y sellan para que el acabado se vea parejo y dure.",
    ],
  }),
  "paint.primer": item("paint.primer", {
    trade: "painting",
    category: "finish",
    confidence: "high",
    label: ["Primer coat", "Capa de sellador"],
    customerLabel: ["Primer coat", "Capa de sellador"],
    contractor: ["Required over repairs, bare substrate or color changes.", "Requerido sobre resanes, sustrato desnudo o cambios de color."],
    customer: [
      "A primer coat gives the color a uniform base so it holds true over time.",
      "Una capa de sellador da una base uniforme para que el color se mantenga en el tiempo.",
    ],
  }),
  "paint.masking": item("paint.masking", {
    trade: "painting",
    category: "protection",
    confidence: "high",
    label: ["Masking and covering", "Enmascarado y cubiertas"],
    customerLabel: ["Furniture and fixture protection", "Protección de muebles y accesorios"],
    contractor: ["Masking labor is routinely under-counted.", "La mano de obra de enmascarado suele subestimarse."],
    customer: [
      "Furniture, fixtures and floors are covered before any paint is opened.",
      "Muebles, accesorios y pisos se cubren antes de abrir la pintura.",
    ],
  }),
  "bath.waterproofing": item("bath.waterproofing", {
    trade: "tile",
    category: "waterproofing",
    confidence: "high",
    label: ["Shower waterproofing system", "Sistema de impermeabilización de regadera"],
    customerLabel: ["Waterproofing behind the tile", "Impermeabilización detrás del azulejo"],
    contractor: ["Pan, membrane and seams — the highest-risk detail in a bath.", "Charola, membrana y juntas: el detalle de mayor riesgo del baño."],
    customer: [
      "A complete waterproofing system behind the tile protects the structure for decades.",
      "Un sistema completo de impermeabilización detrás del azulejo protege la estructura por décadas.",
    ],
  }),
  "bath.ventilation": item("bath.ventilation", {
    trade: "hvac",
    category: "ventilation",
    confidence: "high",
    label: ["Exhaust ventilation", "Ventilación de extracción"],
    customerLabel: ["Bathroom ventilation", "Ventilación del baño"],
    contractor: ["Vent must terminate outside, not into the attic.", "La descarga debe salir al exterior, no al ático."],
    customer: [
      "Proper ventilation removes moisture and protects your finishes from mildew.",
      "La ventilación adecuada retira la humedad y protege sus acabados del moho.",
    ],
  }),
  "basement.egress": item("basement.egress", {
    trade: "general",
    category: "compliance",
    confidence: "contractor_decision_required",
    label: ["Egress window requirement", "Requisito de ventana de escape"],
    customerLabel: ["Safe exit window", "Ventana de salida segura"],
    contractor: ["Sleeping areas below grade require compliant egress.", "Las áreas de dormir bajo nivel requieren salida conforme."],
    customer: [
      "A compliant exit window makes the finished space safe and usable as intended.",
      "Una ventana de salida conforme hace el espacio terminado seguro y utilizable.",
    ],
  }),
  "basement.moisture": item("basement.moisture", {
    trade: "general",
    category: "waterproofing",
    confidence: "high",
    label: ["Moisture management", "Manejo de humedad"],
    customerLabel: ["Moisture protection", "Protección contra humedad"],
    contractor: ["Test and address moisture before finishing below grade.", "Pruebe y resuelva la humedad antes de acabar bajo nivel."],
    customer: [
      "Moisture is addressed before finishes go in so the new space stays dry.",
      "La humedad se atiende antes de los acabados para que el nuevo espacio permanezca seco.",
    ],
  }),
  "insulation.air_sealing": item("insulation.air_sealing", {
    trade: "insulation",
    category: "envelope",
    confidence: "medium",
    label: ["Insulation and air sealing", "Aislamiento y sellado de aire"],
    customerLabel: ["Insulation and draft sealing", "Aislamiento y sellado de corrientes"],
    contractor: ["Open framing is the only chance to seal cheaply.", "La estructura abierta es la única oportunidad de sellar a bajo costo."],
    customer: [
      "Insulation and air sealing make the space quieter and cheaper to heat and cool.",
      "El aislamiento y el sellado hacen el espacio más silencioso y económico de climatizar.",
    ],
  }),
  "garage.floor_prep": item("garage.floor_prep", {
    trade: "concrete",
    category: "prep",
    confidence: "high",
    label: ["Slab moisture barrier and leveling", "Barrera de humedad y nivelación de losa"],
    customerLabel: ["Floor moisture barrier", "Barrera de humedad del piso"],
    contractor: ["Garage slabs slope to the door and wick moisture.", "Las losas de cochera tienen pendiente y transmiten humedad."],
    customer: [
      "The slab is sealed and leveled so the finished room feels like part of the house.",
      "La losa se sella y nivela para que el cuarto terminado se sienta parte de la casa.",
    ],
  }),
  "addition.foundation": item("addition.foundation", {
    trade: "concrete",
    category: "structural",
    confidence: "high",
    label: ["Foundation and slab", "Cimentación y losa"],
    customerLabel: ["New foundation", "Nueva cimentación"],
    contractor: ["Excavation, footing, wall and backfill sequence.", "Secuencia de excavación, zapata, muro y relleno."],
    customer: [
      "A new foundation is built to carry the addition for the life of the home.",
      "Se construye una nueva cimentación para sostener la ampliación durante la vida de la casa.",
    ],
  }),
  "addition.tie_in": item("addition.tie_in", {
    trade: "framing",
    category: "structural",
    confidence: "high",
    label: ["Roof and wall tie-in", "Conexión de techo y muros"],
    customerLabel: ["Connection to the existing home", "Conexión con la casa existente"],
    contractor: ["Weatherproof tie-in detailing drives most callbacks.", "El detalle de conexión impermeable causa la mayoría de los retornos."],
    customer: [
      "The addition is tied into the existing roof and walls so it looks and performs as one home.",
      "La ampliación se conecta al techo y muros existentes para que se vea y funcione como una sola casa.",
    ],
  }),
  "handyman.trip_charge": item("handyman.trip_charge", {
    trade: "general",
    category: "logistics",
    confidence: "medium",
    label: ["Trip charge and minimum service call", "Cargo de viaje y visita mínima"],
    customerLabel: ["Service visit", "Visita de servicio"],
    contractor: ["Small jobs lose money without a minimum.", "Los trabajos pequeños pierden dinero sin un mínimo."],
    customer: [
      "A scheduled service visit covers travel, setup and the small parts needed.",
      "Una visita programada cubre traslado, preparación y las piezas pequeñas necesarias.",
    ],
  }),
};

export const ITEM_LIBRARY: Readonly<Record<string, KnowledgeItem>> = Object.freeze({
  ...GENERAL,
  ...MEP,
  ...STRUCTURAL,
  ...KITCHEN,
  ...EXTERIOR,
  ...OPENINGS,
  ...INTERIOR,
});

/* --------------------------------------------------- standard item reasons */

const STANDARD_REASONS: Record<string, Pair> = {
  "general.floor_protection": [
    "Applies whenever crews work inside an occupied home.",
    "Aplica siempre que la cuadrilla trabaje en una casa habitada.",
  ],
  "general.dust_containment": [
    "Applies whenever demolition, sanding or cutting occurs.",
    "Aplica cuando hay demolición, lijado o cortes.",
  ],
  "general.daily_cleanup": ["Applies to every multi-day project.", "Aplica a todo proyecto de varios días."],
  "general.final_cleaning": ["Applies at completion of every project.", "Aplica al terminar cualquier proyecto."],
  "general.debris_removal": ["Applies whenever material is removed.", "Aplica cuando se retira material."],
  "general.dumpster": ["Applies when demolition volume exceeds curbside disposal.", "Aplica cuando el volumen supera la recolección normal."],
  "general.material_delivery": ["Applies to any project with bulk material.", "Aplica a cualquier proyecto con material a granel."],
  "general.fasteners": ["Applies to every installation.", "Aplica a toda instalación."],
  "general.consumables": ["Applies to every project.", "Aplica a todo proyecto."],
  "general.equipment_setup": ["Applies when tools or lifts must be mobilized.", "Aplica cuando hay que movilizar herramienta o equipo de elevación."],
};

/** Promote a library item to a standard (one-tap) addition. */
export function toStandardItem(itemKey: string): KnowledgeStandardItem | null {
  const base = ITEM_LIBRARY[itemKey];
  if (!base) return null;
  const reason = STANDARD_REASONS[itemKey] ?? [
    base.contractorRationale["en-US"],
    base.contractorRationale["es-US"],
  ];
  return { ...base, reason: bi(...(reason as Pair)) };
}

/* ------------------------------------------------- sales opportunities */

interface UpgradeSpec extends ItemSpec {
  impact: KnowledgeImpactCategory;
}

function upgrade(itemKey: string, spec: UpgradeSpec): KnowledgeSalesOpportunity {
  return {
    ...item(itemKey, { ...spec, confidence: "optional" }),
    impactCategory: spec.impact,
    isOptional: true,
  };
}

const up = (
  key: string,
  trade: string,
  impact: KnowledgeImpactCategory,
  label: Pair,
  customerLabel: Pair,
  contractor: Pair,
  customer: Pair,
): KnowledgeSalesOpportunity =>
  upgrade(key, {
    trade,
    category: "upgrade",
    confidence: "optional",
    label,
    customerLabel,
    contractor,
    customer,
    impact,
  });

export const UPGRADE_LIBRARY: Readonly<Record<string, KnowledgeSalesOpportunity>> = Object.freeze(
  Object.fromEntries(
    [
      up("upgrade.undercabinet_lighting", "electrical", "function",
        ["Under-cabinet lighting", "Iluminación bajo gabinete"],
        ["Under-cabinet lighting", "Iluminación bajo gabinete"],
        ["High close rate; rough-in must happen before cabinets.", "Alta conversión; el cableado debe ir antes de los gabinetes."],
        ["Task lighting makes counters easier to work on and gives the kitchen a warm evening glow.", "La luz de tarea facilita el trabajo en la cubierta y da un ambiente cálido por la noche."]),
      up("upgrade.soft_close", "carpentry", "comfort",
        ["Soft-close drawers and doors", "Cajones y puertas de cierre suave"],
        ["Soft-close drawers and doors", "Cajones y puertas de cierre suave"],
        ["Low cost, high perceived value.", "Bajo costo y alto valor percibido."],
        ["Soft-close hardware keeps the kitchen quiet and protects the cabinet finish.", "Los herrajes de cierre suave mantienen la cocina silenciosa y protegen el acabado."]),
      up("upgrade.pullout_shelves", "carpentry", "function",
        ["Pull-out shelves", "Charolas extraíbles"],
        ["Pull-out shelves", "Charolas extraíbles"],
        ["Sells well in base cabinets and pantries.", "Se vende bien en gabinetes bajos y despensas."],
        ["Pull-out shelves put the back of every cabinet within easy reach.", "Las charolas extraíbles ponen el fondo de cada gabinete a su alcance."]),
      up("upgrade.pantry_storage", "carpentry", "function",
        ["Pantry storage system", "Sistema de despensa"],
        ["Pantry storage", "Almacenamiento de despensa"],
        ["Pairs naturally with a cabinet order.", "Combina naturalmente con un pedido de gabinetes."],
        ["Dedicated pantry storage keeps countertops clear and everyday items organized.", "La despensa dedicada mantiene las cubiertas despejadas y todo organizado."]),
      up("upgrade.quartz", "countertops", "durability",
        ["Quartz countertop upgrade", "Mejora a cubierta de cuarzo"],
        ["Quartz countertops", "Cubiertas de cuarzo"],
        ["Common step up from laminate or entry granite.", "Paso común desde laminado o granito básico."],
        ["Quartz resists stains and needs no sealing, so it stays looking new with simple care.", "El cuarzo resiste manchas y no requiere sellado, por lo que se mantiene como nuevo con cuidados simples."]),
      up("upgrade.pot_filler", "plumbing", "comfort",
        ["Pot filler", "Llave para ollas"],
        ["Pot filler over the range", "Llave para ollas sobre la estufa"],
        ["Requires a supply line before tile.", "Requiere línea de suministro antes del azulejo."],
        ["A pot filler saves carrying heavy pots across the kitchen.", "Una llave para ollas evita cargar ollas pesadas por la cocina."]),
      up("upgrade.water_filtration", "plumbing", "comfort",
        ["Water filtration", "Filtración de agua"],
        ["Filtered drinking water", "Agua potable filtrada"],
        ["Under-sink unit; coordinate with the sink order.", "Unidad bajo fregadero; coordine con el pedido del fregadero."],
        ["Filtered water at the tap improves taste and reduces bottled water use.", "El agua filtrada en el grifo mejora el sabor y reduce el uso de botellas."]),
      up("upgrade.island_outlets", "electrical", "function",
        ["Island outlets", "Contactos en la isla"],
        ["Island power outlets", "Contactos eléctricos en la isla"],
        ["Often required by code on islands with seating.", "A menudo requerido por código en islas con asientos."],
        ["Power at the island makes it usable for cooking, homework and hosting.", "La energía en la isla la hace útil para cocinar, tareas y recibir invitados."]),
      up("upgrade.usb_outlets", "electrical", "comfort",
        ["USB outlets", "Contactos USB"],
        ["USB charging outlets", "Contactos de carga USB"],
        ["Cheap add-on during device swap.", "Adición económica durante el cambio de dispositivos."],
        ["Built-in USB charging keeps counters free of adapters.", "La carga USB integrada mantiene las cubiertas libres de adaptadores."]),
      up("upgrade.hidden_trash", "carpentry", "function",
        ["Hidden trash pull-out", "Bote de basura oculto"],
        ["Concealed waste and recycling", "Basura y reciclaje ocultos"],
        ["Requires a dedicated base cabinet.", "Requiere un gabinete base dedicado."],
        ["A concealed pull-out keeps waste and recycling out of sight.", "Un cajón oculto mantiene la basura y el reciclaje fuera de la vista."]),
      up("upgrade.heated_floor", "tile", "comfort",
        ["Heated flooring", "Piso radiante"],
        ["Heated bathroom floor", "Piso radiante en el baño"],
        ["Installed under tile; needs a dedicated circuit.", "Se instala bajo el azulejo; requiere circuito dedicado."],
        ["A heated floor makes tile comfortable underfoot on cold mornings.", "El piso radiante hace el azulejo cómodo en las mañanas frías."]),
      up("upgrade.frameless_glass", "glass", "aesthetics",
        ["Frameless shower glass", "Cristal de regadera sin marco"],
        ["Frameless glass enclosure", "Cancel de cristal sin marco"],
        ["Measured after tile; longer lead time.", "Se mide después del azulejo; mayor tiempo de entrega."],
        ["Frameless glass opens up the room visually and is easier to keep clean.", "El cristal sin marco abre visualmente el espacio y es más fácil de limpiar."]),
      up("upgrade.shower_niche", "tile", "function",
        ["Shower niche", "Nicho de regadera"],
        ["Built-in shower niche", "Nicho integrado en la regadera"],
        ["Framed during rough-in, waterproofed with the pan.", "Se estructura en obra gris y se impermeabiliza con la charola."],
        ["A recessed niche keeps bottles off the floor and within reach.", "Un nicho empotrado mantiene los frascos fuera del piso y a la mano."]),
      up("upgrade.niche_lighting", "electrical", "aesthetics",
        ["Niche lighting", "Iluminación de nicho"],
        ["Lighted shower niche", "Nicho iluminado"],
        ["Low-voltage wiring before tile.", "Cableado de bajo voltaje antes del azulejo."],
        ["A lit niche adds a soft accent and makes the shower easier to use at night.", "Un nicho iluminado añade un acento suave y facilita el uso nocturno."]),
      up("upgrade.rain_shower", "plumbing", "comfort",
        ["Rain shower head", "Regadera tipo lluvia"],
        ["Rain shower head", "Regadera tipo lluvia"],
        ["May require valve and supply changes.", "Puede requerir cambios de válvula y suministro."],
        ["A rain head turns the daily shower into a more relaxing experience.", "Una regadera tipo lluvia convierte la ducha diaria en una experiencia más relajante."]),
      up("upgrade.comfort_toilet", "plumbing", "comfort",
        ["Comfort-height toilet", "Inodoro de altura confort"],
        ["Comfort-height toilet", "Inodoro de altura confort"],
        ["Simple swap at fixture selection.", "Cambio sencillo al elegir muebles."],
        ["Comfort height is easier to use and supports aging in place.", "La altura confort es más fácil de usar y apoya la permanencia en el hogar."]),
      up("upgrade.wall_accessories", "general", "function",
        ["Wall-mounted accessories", "Accesorios de pared"],
        ["Towel bars, hooks and grab supports", "Toalleros, ganchos y soportes"],
        ["Blocking must be added before drywall.", "El refuerzo debe colocarse antes de la tablaroca."],
        ["Solid blocking now means towel bars and supports can be mounted securely anywhere.", "El refuerzo ahora permite montar toalleros y soportes con firmeza en cualquier punto."]),
      up("upgrade.ventilation", "hvac", "durability",
        ["Upgraded ventilation", "Ventilación mejorada"],
        ["Quiet high-capacity ventilation", "Ventilación silenciosa de alta capacidad"],
        ["Quieter unit with humidity sensing.", "Unidad más silenciosa con sensor de humedad."],
        ["A quieter, stronger fan clears humidity faster and protects your new finishes.", "Un extractor más silencioso y potente retira la humedad más rápido y protege sus acabados."]),
      up("upgrade.composite_decking", "carpentry", "durability",
        ["Composite decking", "Deck compuesto"],
        ["Composite decking boards", "Tablas de deck compuesto"],
        ["Higher material cost, lower callback rate.", "Mayor costo de material, menos retornos."],
        ["Composite boards resist splintering and fading, with almost no annual upkeep.", "Las tablas compuestas resisten astillas y decoloración, casi sin mantenimiento anual."]),
      up("upgrade.cable_railing", "carpentry", "aesthetics",
        ["Cable railing", "Barandal de cable"],
        ["Cable railing", "Barandal de cable"],
        ["Posts need extra bracing for cable tension.", "Los postes requieren refuerzo por la tensión del cable."],
        ["Cable railing preserves the view while meeting safety requirements.", "El barandal de cable conserva la vista y cumple los requisitos de seguridad."]),
      up("upgrade.stair_lighting", "electrical", "safety",
        ["Stair lighting", "Iluminación de escalones"],
        ["Lighted stair treads", "Escalones iluminados"],
        ["Wire during framing.", "Cablee durante la estructura."],
        ["Lit steps make the deck safe to use after dark.", "Los escalones iluminados hacen seguro el uso del deck de noche."]),
      up("upgrade.post_lighting", "electrical", "aesthetics",
        ["Post cap lighting", "Iluminación en postes"],
        ["Post cap lights", "Luces en remates de poste"],
        ["Low-voltage run with the railing.", "Circuito de bajo voltaje junto con el barandal."],
        ["Post lighting extends evening use and highlights the deck's outline.", "La iluminación en postes extiende el uso nocturno y resalta el contorno del deck."]),
      up("upgrade.pergola", "carpentry", "comfort",
        ["Pergola", "Pérgola"],
        ["Shade pergola", "Pérgola de sombra"],
        ["Check footing and attachment requirements.", "Verifique requisitos de zapatas y anclaje."],
        ["A pergola creates usable shade so the deck works through the hottest part of the day.", "Una pérgola crea sombra útil para que el deck funcione en las horas más calurosas."]),
      up("upgrade.privacy_screen", "carpentry", "comfort",
        ["Privacy screen", "Panel de privacidad"],
        ["Privacy screening", "Pantalla de privacidad"],
        ["Wind load affects post sizing.", "La carga de viento afecta el tamaño de los postes."],
        ["Screening makes the outdoor space feel private from neighbors.", "La pantalla hace que el espacio exterior se sienta privado de los vecinos."]),
      up("upgrade.built_in_seating", "carpentry", "function",
        ["Built-in seating", "Bancas integradas"],
        ["Built-in bench seating", "Bancas integradas"],
        ["Framed with the deck; adds storage options.", "Se estructura con el deck; permite almacenamiento."],
        ["Built-in benches seat more guests without filling the deck with furniture.", "Las bancas integradas acomodan más invitados sin llenar el deck de muebles."]),
      up("upgrade.attic_insulation", "insulation", "efficiency",
        ["Attic insulation top-up", "Refuerzo de aislamiento en ático"],
        ["Added attic insulation", "Aislamiento adicional en ático"],
        ["Efficient add-on while crews are already on the roof.", "Adición eficiente mientras la cuadrilla ya está en el techo."],
        ["Extra insulation lowers heating and cooling costs year round.", "El aislamiento adicional reduce los costos de climatización todo el año."]),
      up("upgrade.smart_thermostat", "hvac", "efficiency",
        ["Smart thermostat", "Termostato inteligente"],
        ["Smart thermostat", "Termostato inteligente"],
        ["Quick add during electrical work.", "Adición rápida durante el trabajo eléctrico."],
        ["A smart thermostat trims energy use without changing how you live.", "Un termostato inteligente reduce el consumo sin cambiar su rutina."]),
      up("upgrade.recessed_lighting", "electrical", "aesthetics",
        ["Recessed lighting", "Iluminación empotrada"],
        ["Recessed ceiling lighting", "Iluminación empotrada en techo"],
        ["Best installed while ceilings are open.", "Mejor instalarla con techos abiertos."],
        ["Even ceiling light makes the whole room feel larger and brighter.", "La luz pareja en el techo hace que el cuarto se sienta más amplio y luminoso."]),
      up("upgrade.solid_core_doors", "carpentry", "comfort",
        ["Solid-core doors", "Puertas de alma sólida"],
        ["Solid-core doors", "Puertas de alma sólida"],
        ["Heavier doors need upgraded hinges.", "Las puertas pesadas requieren bisagras reforzadas."],
        ["Solid doors feel substantial and noticeably reduce noise between rooms.", "Las puertas sólidas se sienten firmes y reducen notablemente el ruido entre cuartos."]),
      up("upgrade.low_e_glass", "windows", "efficiency",
        ["Low-E glass package", "Paquete de vidrio Low-E"],
        ["Energy-efficient glass", "Vidrio de alta eficiencia"],
        ["Confirm orientation and climate zone.", "Confirme orientación y zona climática."],
        ["High-performance glass keeps rooms comfortable and reduces fading of furnishings.", "El vidrio de alto desempeño mantiene el confort y reduce la decoloración de los muebles."]),
    ].map((u) => [u.itemKey, u]),
  ),
);

/* ------------------------------------------------- value engineering */

const ve = (
  ruleKey: string,
  originalKey: string,
  alternativeKey: string,
  originalLabel: Pair,
  alternativeLabel: Pair,
  tradeoff: Pair,
  customerExplanation: Pair,
  impacts: {
    durability: KnowledgeValueEngineering["durabilityImpact"];
    appearance: KnowledgeValueEngineering["appearanceImpact"];
    maintenance: KnowledgeValueEngineering["maintenanceImpact"];
  },
): KnowledgeValueEngineering => ({
  ruleKey,
  originalKey,
  alternativeKey,
  originalLabel: bi(...originalLabel),
  alternativeLabel: bi(...alternativeLabel),
  tradeoff: bi(...tradeoff),
  customerExplanation: bi(...customerExplanation),
  costImpact: "lower",
  durabilityImpact: impacts.durability,
  appearanceImpact: impacts.appearance,
  maintenanceImpact: impacts.maintenance,
  confidence: "contractor_decision_required",
});

export const VALUE_ENGINEERING_LIBRARY: Readonly<Record<string, KnowledgeValueEngineering>> =
  Object.freeze(
    Object.fromEntries(
      [
        ve("ve.quartz_to_granite", "material.quartz", "material.granite",
          ["Quartz", "Cuarzo"], ["Granite", "Granito"],
          ["Natural stone requires periodic sealing.", "La piedra natural requiere sellado periódico."],
          ["Granite offers natural stone character at a lower investment, with simple periodic sealing.", "El granito ofrece el carácter de la piedra natural con menor inversión y un sellado periódico simple."],
          { durability: "similar", appearance: "similar", maintenance: "higher" }),
        ve("ve.quartz_to_laminate", "material.quartz", "material.laminate",
          ["Quartz", "Cuarzo"], ["Laminate", "Laminado"],
          ["Less heat and scratch resistance; seams are visible.", "Menor resistencia al calor y rayones; las uniones se notan."],
          ["Modern laminate looks far better than it used to and keeps the budget focused on layout and cabinets.", "El laminado moderno luce mucho mejor que antes y mantiene el presupuesto en el diseño y los gabinetes."],
          { durability: "lower", appearance: "lower", maintenance: "similar" }),
        ve("ve.hardwood_to_engineered", "material.hardwood", "material.engineered_hardwood",
          ["Solid hardwood", "Madera sólida"], ["Engineered hardwood", "Madera de ingeniería"],
          ["Fewer future refinishes available.", "Menos posibilidades de relijado futuro."],
          ["Engineered hardwood gives you a real wood surface with better stability in changing humidity.", "La madera de ingeniería ofrece una superficie de madera real con mejor estabilidad ante la humedad."],
          { durability: "similar", appearance: "similar", maintenance: "similar" }),
        ve("ve.hardwood_to_lvp", "material.hardwood", "material.lvp",
          ["Solid hardwood", "Madera sólida"], ["Luxury vinyl plank", "Vinil de lujo (LVP)"],
          ["Not refinishable; resale perception is lower.", "No se puede relijar; menor percepción en reventa."],
          ["Luxury vinyl is waterproof and very forgiving with pets and children.", "El vinil de lujo es impermeable y muy tolerante con mascotas y niños."],
          { durability: "higher", appearance: "lower", maintenance: "lower" }),
        ve("ve.custom_to_semi_custom", "material.custom_cabinets", "material.semi_custom_cabinets",
          ["Custom cabinets", "Gabinetes a medida"], ["Semi-custom cabinets", "Gabinetes semi a medida"],
          ["Fixed size increments; fillers absorb the difference.", "Medidas fijas; los rellenos absorben la diferencia."],
          ["Semi-custom cabinets offer most of the same finishes and storage options with a shorter lead time.", "Los gabinetes semi a medida ofrecen casi los mismos acabados y opciones con menor tiempo de entrega."],
          { durability: "similar", appearance: "similar", maintenance: "similar" }),
        ve("ve.semi_custom_to_stock", "material.semi_custom_cabinets", "material.stock_cabinets",
          ["Semi-custom cabinets", "Gabinetes semi a medida"], ["Builder-grade cabinets", "Gabinetes de línea"],
          ["Limited sizes, finishes and interior options.", "Tamaños, acabados y opciones interiores limitados."],
          ["Stock cabinets deliver a clean, durable kitchen and free up budget for countertops and lighting.", "Los gabinetes de línea dan una cocina limpia y duradera, liberando presupuesto para cubiertas e iluminación."],
          { durability: "lower", appearance: "lower", maintenance: "similar" }),
        ve("ve.tile_to_solid_surface", "material.tile_shower", "material.solid_surface_panels",
          ["Tile shower walls", "Muros de regadera en azulejo"], ["Solid-surface panels", "Paneles de superficie sólida"],
          ["Fewer design options; seams at corners.", "Menos opciones de diseño; uniones en esquinas."],
          ["Solid-surface panels have no grout lines, so the shower is much faster to clean.", "Los paneles de superficie sólida no tienen juntas, por lo que la regadera se limpia mucho más rápido."],
          { durability: "similar", appearance: "lower", maintenance: "lower" }),
        ve("ve.tile_to_acrylic", "material.tile_shower", "material.acrylic_surround",
          ["Tile shower walls", "Muros de regadera en azulejo"], ["Acrylic surround", "Panel acrílico"],
          ["Most economical; least custom appearance.", "El más económico; apariencia menos personalizada."],
          ["An acrylic surround is watertight from day one and the most economical way to renew a shower.", "Un panel acrílico es hermético desde el primer día y la forma más económica de renovar una regadera."],
          { durability: "lower", appearance: "lower", maintenance: "lower" }),
        ve("ve.composite_to_pressure_treated", "material.composite_decking", "material.pressure_treated",
          ["Composite decking", "Deck compuesto"], ["Pressure-treated lumber", "Madera tratada"],
          ["Requires cleaning and sealing every one to two years.", "Requiere limpieza y sellado cada uno o dos años."],
          ["Treated lumber builds the same deck layout for less, with routine sealing to keep it looking good.", "La madera tratada construye el mismo diseño por menos, con sellado periódico para conservarlo bien."],
          { durability: "lower", appearance: "lower", maintenance: "higher" }),
        ve("ve.architectural_to_three_tab", "material.architectural_shingle", "material.three_tab_shingle",
          ["Architectural shingles", "Teja arquitectónica"], ["Three-tab shingles", "Teja de tres pestañas"],
          ["Shorter expected service life and lower wind rating.", "Menor vida útil esperada y menor resistencia al viento."],
          ["Three-tab shingles provide full weather protection at the most accessible price point.", "La teja de tres pestañas ofrece protección total contra el clima al precio más accesible."],
          { durability: "lower", appearance: "lower", maintenance: "similar" }),
        ve("ve.fiberglass_to_vinyl_window", "material.fiberglass_window", "material.vinyl_window",
          ["Fiberglass windows", "Ventanas de fibra de vidrio"], ["Vinyl windows", "Ventanas de vinil"],
          ["Fewer color options; frames are wider.", "Menos opciones de color; marcos más anchos."],
          ["Quality vinyl windows deliver the same energy performance with a strong warranty.", "Las ventanas de vinil de calidad ofrecen el mismo desempeño energético con buena garantía."],
          { durability: "lower", appearance: "similar", maintenance: "lower" }),
      ].map((v) => [v.ruleKey, v]),
    ),
  );
