/**
 * HANDYMAN TASK LIBRARY.
 *
 * Data, not code: adding a task is a row here, never a new workflow, component
 * or `if (jobType === ...)` branch. Each row states the canonical task id, the
 * plain-English phrasings voice intake should match, the unit the work is
 * actually sold in, the internal pricing primitive that legitimately prices it
 * (when one exists), and the companion work that travels with it.
 *
 * `priceRef` points at an EXISTING internal primitive (ballpark pricebook /
 * canonical assembly). A row with no `priceRef` is deliberate: the task is
 * recognised, but we have no defensible internal rate for it, so the estimator
 * marks it `pricing needed` and asks the contractor rather than inventing a
 * number. See `docs/handyman-coverage.md` for the current split.
 *
 * Pure data + pure functions — no React, no Supabase, no IO.
 */

import type { CompanionWork, HandymanTask, HandymanText, TaskCategory, TaskUnit } from "./types";

const text = (en: string, es: string): HandymanText => ({ "en-US": en, "es-US": es });

const companion = (
  id: string,
  en: string,
  es: string,
  inclusion: CompanionWork["inclusion"] = "standard",
): CompanionWork => ({ id, label: text(en, es), inclusion });

/* Reusable companion work — authored once, referenced everywhere. */
export const COMPANIONS = {
  removeHaul: companion("remove_haul", "Remove and haul away old unit", "Retiro y desecho de la unidad vieja"),
  reconnectSupply: companion("reconnect_supply", "Reconnect water supply and test", "Reconectar suministro de agua y probar"),
  waxRing: companion("wax_ring", "New wax ring, bolts and supply line", "Anillo de cera, pernos y línea de suministro nuevos"),
  caulkFixture: companion("caulk_fixture", "Caulk / seal fixture base", "Sellar con silicona la base del accesorio"),
  reconnectDrain: companion("reconnect_drain", "Reconnect drain and trap", "Reconectar desagüe y sifón"),
  testDevice: companion("test_device", "Reconnect, test and verify", "Reconectar, probar y verificar"),
  tapeMudSand: companion("tape_mud_sand", "Tape, mud, sand", "Cinta, masilla, lijado"),
  texture: companion("texture_match", "Texture match", "Igualar textura", "conditional"),
  primePaint: companion("prime_paint", "Prime and paint patched area", "Sellar y pintar el área reparada", "question"),
  surfacePrep: companion("surface_prep", "Surface prep, patch and mask", "Preparación, resane y enmascarado"),
  removeDispose: companion("remove_dispose", "Remove and dispose existing material", "Retirar y desechar material existente"),
  underlayment: companion("underlayment", "Underlayment as required", "Base/underlayment según se requiera", "conditional"),
  transitions: companion("transitions", "Transition strips at doorways", "Molduras de transición en puertas", "conditional"),
  fasteners: companion("fasteners", "Fasteners and hardware", "Sujetadores y herrajes"),
  debris: companion("debris", "Debris removal", "Retiro de escombros"),
  hiddenDamage: companion("hidden_damage", "Hidden damage — inspect before committing", "Daño oculto — inspeccionar antes de comprometer", "question"),
} as const;

interface TaskSpec {
  unit: TaskUnit;
  priceRef?: string;
  priceFactor?: number;
  typicalQuantity?: number;
  minLaborHours?: number;
  companions?: CompanionWork[];
  questions?: string[];
}

const task = (
  id: string,
  category: TaskCategory,
  label: [string, string],
  aliases: string[],
  spec: TaskSpec,
): HandymanTask => ({
  id,
  category,
  label: text(label[0], label[1]),
  aliases: aliases.map((a) => a.toLowerCase()),
  unit: spec.unit,
  ...(spec.priceRef ? { priceRef: spec.priceRef } : {}),
  ...(spec.priceFactor == null ? {} : { priceFactor: spec.priceFactor }),
  typicalQuantity: spec.typicalQuantity ?? 1,
  ...(spec.minLaborHours == null ? {} : { minLaborHours: spec.minLaborHours }),
  companions: spec.companions ?? [],
  questions: spec.questions ?? [],
});

export const HANDYMAN_TASKS: readonly HandymanTask[] = [
  /* ---------------------------------------------------------- plumbing */
  task("plumbing.toilet.replace", "plumbing", ["Replace toilet", "Reemplazar inodoro"],
    ["replace toilet", "new toilet", "install toilet", "swap toilet", "toilet replacement", "cambiar inodoro", "reemplazar inodoro", "instalar inodoro"],
    { unit: "each", priceRef: "bath.toilet", minLaborHours: 1.5, questions: ["supplyResponsibility", "hiddenDamage"],
      companions: [COMPANIONS.removeHaul, COMPANIONS.waxRing, COMPANIONS.caulkFixture, COMPANIONS.testDevice] }),
  task("plumbing.toilet.reset", "plumbing", ["Reset / re-seal toilet", "Reasentar y sellar inodoro"],
    ["reset toilet", "reseal toilet", "toilet leaking at base", "rocking toilet", "reasentar inodoro"],
    { unit: "each", minLaborHours: 1, companions: [COMPANIONS.waxRing, COMPANIONS.caulkFixture] }),
  task("plumbing.toilet.repair", "plumbing", ["Repair toilet internals", "Reparar mecanismo de inodoro"],
    ["fix toilet", "toilet running", "replace flapper", "toilet fill valve", "repair toilet", "reparar inodoro"],
    { unit: "each", minLaborHours: 0.75 }),
  task("plumbing.faucet.replace.kitchen", "plumbing", ["Replace kitchen faucet", "Reemplazar grifo de cocina"],
    ["replace kitchen faucet", "new kitchen faucet", "kitchen faucet", "install kitchen faucet", "grifo de cocina"],
    { unit: "each", priceRef: "kitchen.sink_faucet", minLaborHours: 1.5, questions: ["supplyResponsibility"],
      companions: [COMPANIONS.removeHaul, COMPANIONS.reconnectSupply, COMPANIONS.reconnectDrain, COMPANIONS.testDevice] }),
  task("plumbing.faucet.replace.bath", "plumbing", ["Replace bath faucet", "Reemplazar grifo de baño"],
    ["replace bathroom faucet", "bathroom faucet", "bath faucet", "lavatory faucet", "grifo de baño"],
    { unit: "each", minLaborHours: 1.25, questions: ["supplyResponsibility"],
      companions: [COMPANIONS.removeHaul, COMPANIONS.reconnectSupply, COMPANIONS.testDevice] }),
  task("plumbing.faucet.repair", "plumbing", ["Repair leaking faucet", "Reparar grifo con fuga"],
    ["fix leaky faucet", "dripping faucet", "faucet cartridge", "repair faucet", "reparar grifo"],
    { unit: "each", minLaborHours: 0.75 }),
  task("plumbing.disposal.replace", "plumbing", ["Replace garbage disposal", "Reemplazar triturador de basura"],
    ["garbage disposal", "replace disposal", "install disposal", "triturador"],
    { unit: "each", minLaborHours: 1.25, companions: [COMPANIONS.removeHaul, COMPANIONS.testDevice] }),
  task("plumbing.supply_line.replace", "plumbing", ["Replace supply lines", "Reemplazar líneas de suministro"],
    ["supply line", "supply lines", "braided line", "replace supply", "líneas de suministro"],
    { unit: "each", priceRef: "plumbing.supply_lines", minLaborHours: 0.5 }),
  task("plumbing.shutoff.replace", "plumbing", ["Replace angle stop / shutoff", "Reemplazar llave de paso"],
    ["shutoff valve", "angle stop", "replace shut off", "llave de paso"],
    { unit: "each", minLaborHours: 0.75 }),
  task("plumbing.trap.replace", "plumbing", ["Replace P-trap / drain assembly", "Reemplazar sifón / desagüe"],
    ["p trap", "p-trap", "drain assembly", "sink drain leaking", "sifón"],
    { unit: "each", minLaborHours: 0.75 }),
  task("plumbing.hose_bib.replace", "plumbing", ["Replace hose bib", "Reemplazar llave de manguera"],
    ["hose bib", "outdoor faucet", "spigot", "llave de manguera"],
    { unit: "each", priceRef: "plumbing.hose_bib", minLaborHours: 1 }),
  task("plumbing.water_heater.replace", "plumbing", ["Replace water heater", "Reemplazar calentador de agua"],
    ["water heater", "hot water heater", "calentador de agua"],
    { unit: "each", priceRef: "plumbing.water_heater", questions: ["supplyResponsibility"],
      companions: [COMPANIONS.removeHaul, COMPANIONS.testDevice] }),
  task("plumbing.caulk.fixture", "plumbing", ["Caulk tub / shower / sink", "Sellar tina, ducha o lavabo"],
    ["recaulk", "re-caulk", "caulk tub", "caulk shower", "caulk around sink", "sellar tina"],
    { unit: "linear_foot", typicalQuantity: 12, minLaborHours: 1 }),

  /* -------------------------------------------------------- electrical */
  task("electrical.switch.replace", "electrical", ["Replace light switch", "Reemplazar interruptor"],
    ["replace switch", "light switch", "change switch", "switches", "cambiar interruptor", "interruptor"],
    { unit: "each", priceRef: "service.device.switch", minLaborHours: 0.5, companions: [COMPANIONS.testDevice] }),
  task("electrical.dimmer.install", "electrical", ["Install dimmer switch", "Instalar interruptor regulable"],
    ["dimmer", "dimmer switch", "atenuador"],
    { unit: "each", priceRef: "service.device.dimmer", minLaborHours: 0.5, companions: [COMPANIONS.testDevice] }),
  task("electrical.receptacle.replace", "electrical", ["Replace receptacle / outlet", "Reemplazar tomacorriente"],
    ["replace outlet", "outlet", "receptacle", "plug outlet", "tomacorriente", "enchufe"],
    { unit: "each", priceRef: "service.device.receptacle", minLaborHours: 0.5, companions: [COMPANIONS.testDevice] }),
  task("electrical.gfci.install", "electrical", ["Install GFCI receptacle", "Instalar tomacorriente GFCI"],
    ["gfci", "gfi outlet", "ground fault outlet", "gfci outlet"],
    { unit: "each", priceRef: "service.device.gfci", minLaborHours: 0.5, companions: [COMPANIONS.testDevice] }),
  task("electrical.receptacle.new", "electrical", ["Add new receptacle", "Agregar tomacorriente nuevo"],
    ["add outlet", "new outlet", "add receptacle", "nuevo tomacorriente"],
    { unit: "each", priceRef: "electrical.device", minLaborHours: 1.5 }),
  task("electrical.device.relocate", "electrical", ["Relocate device / outlet", "Reubicar dispositivo o tomacorriente"],
    ["move outlet", "relocate outlet", "relocate switch", "move receptacle", "mover tomacorriente"],
    { unit: "each", priceRef: "electrical.device.relocate", minLaborHours: 1.4 }),
  task("electrical.fixture.replace", "electrical", ["Replace light fixture", "Reemplazar luminaria"],
    ["replace light fixture", "light fixture", "new light", "change light", "replace lights", "luminaria", "cambiar lámpara"],
    { unit: "each", priceRef: "electrical.fixture", minLaborHours: 1,
      companions: [COMPANIONS.removeHaul, COMPANIONS.testDevice], questions: ["supplyResponsibility"] }),
  task("electrical.ceiling_fan.install", "electrical", ["Install ceiling fan", "Instalar ventilador de techo"],
    ["ceiling fan", "install fan", "replace ceiling fan", "ventilador de techo"],
    { unit: "each", priceRef: "electrical.ceiling_fan", minLaborHours: 2, questions: ["supplyResponsibility", "fixtureBoxRating"] }),
  task("electrical.recessed.install", "electrical", ["Install recessed light", "Instalar luz empotrada"],
    ["recessed light", "can light", "led can", "luz empotrada"],
    { unit: "each", priceRef: "electrical.recessed_light", minLaborHours: 1 }),
  task("electrical.smoke_detector.replace", "electrical", ["Replace smoke / CO detector", "Reemplazar detector de humo"],
    ["smoke detector", "smoke alarm", "carbon monoxide detector", "detector de humo"],
    { unit: "each", priceRef: "electrical.smoke_detector", minLaborHours: 0.5 }),
  task("electrical.exhaust_fan.replace", "electrical", ["Replace bath exhaust fan", "Reemplazar extractor de baño"],
    ["bath fan", "exhaust fan", "bathroom vent fan", "extractor de baño"],
    { unit: "each", priceRef: "hvac.bath_vent", minLaborHours: 2 }),
  task("electrical.doorbell.replace", "electrical", ["Replace doorbell / video doorbell", "Reemplazar timbre"],
    ["doorbell", "video doorbell", "ring doorbell", "timbre"],
    { unit: "each", minLaborHours: 1 }),
  task("electrical.thermostat.replace", "electrical", ["Replace thermostat", "Reemplazar termostato"],
    ["thermostat", "smart thermostat", "termostato"],
    { unit: "each", minLaborHours: 1 }),

  /* ----------------------------------------------------------- drywall */
  task("drywall.patch.small", "drywall", ["Patch drywall hole", "Resanar agujero en tablaroca"],
    ["patch drywall", "drywall hole", "drywall patch", "hole in wall", "patch holes", "resanar pared", "tablaroca"],
    { unit: "square_foot", priceRef: "drywall.patch", typicalQuantity: 4, minLaborHours: 1,
      companions: [COMPANIONS.tapeMudSand, COMPANIONS.texture, COMPANIONS.primePaint],
      questions: ["patchSizeTexture", "paintMatching"] }),
  task("drywall.ceiling.patch", "drywall", ["Patch ceiling drywall", "Resanar techo de tablaroca"],
    ["ceiling patch", "patch ceiling", "ceiling hole", "resanar techo"],
    { unit: "square_foot", priceRef: "drywall.patch", typicalQuantity: 6, minLaborHours: 1.5,
      companions: [COMPANIONS.tapeMudSand, COMPANIONS.texture, COMPANIONS.primePaint], questions: ["paintMatching"] }),
  task("drywall.texture.match", "drywall", ["Match wall / ceiling texture", "Igualar textura"],
    ["texture match", "orange peel", "knockdown texture", "retexture", "igualar textura"],
    { unit: "square_foot", priceRef: "drywall.texture", typicalQuantity: 20 }),
  task("drywall.plaster.repair", "drywall", ["Repair plaster", "Reparar yeso"],
    ["plaster repair", "cracked plaster", "reparar yeso"],
    { unit: "square_foot", typicalQuantity: 8, minLaborHours: 2 }),
  task("drywall.corner_bead.repair", "drywall", ["Repair corner bead", "Reparar esquinero"],
    ["corner bead", "damaged corner", "esquinero"],
    { unit: "linear_foot", typicalQuantity: 8, minLaborHours: 1.5 }),

  /* ------------------------------------------------------------- paint */
  task("paint.room.interior", "paint", ["Paint interior room", "Pintar habitación interior"],
    ["paint room", "paint bedroom", "paint interior", "repaint room", "pintar habitación", "pintar cuarto"],
    { unit: "square_foot", priceRef: "paint.walls_ceiling", typicalQuantity: 400, minLaborHours: 4,
      companions: [COMPANIONS.surfacePrep], questions: ["paintMatching"] }),
  task("paint.touchup", "paint", ["Paint touch-up", "Retoques de pintura"],
    ["touch up paint", "touch-up", "paint touch up", "retoque de pintura"],
    { unit: "square_foot", priceRef: "paint.walls_ceiling", typicalQuantity: 40, minLaborHours: 1,
      questions: ["paintMatching"] }),
  task("paint.ceiling", "paint", ["Paint ceiling", "Pintar techo"],
    ["paint ceiling", "ceiling paint", "pintar techo"],
    { unit: "square_foot", priceRef: "paint.ceiling", typicalQuantity: 150, minLaborHours: 2 }),
  task("paint.trim", "paint", ["Paint trim / baseboard", "Pintar molduras"],
    ["paint trim", "paint baseboards", "paint molding", "pintar molduras"],
    { unit: "linear_foot", priceRef: "paint.trim", typicalQuantity: 60, minLaborHours: 2 }),
  task("paint.doors", "paint", ["Paint door", "Pintar puerta"],
    ["paint door", "paint doors", "pintar puerta"],
    { unit: "each", priceRef: "paint.doors", minLaborHours: 1 }),
  task("paint.cabinets", "paint", ["Paint cabinets", "Pintar gabinetes"],
    ["paint cabinets", "cabinet painting", "refinish cabinets", "pintar gabinetes"],
    { unit: "linear_foot", priceRef: "paint.cabinets", typicalQuantity: 20 }),
  task("paint.exterior.area", "paint", ["Exterior paint", "Pintura exterior"],
    ["exterior paint", "paint outside", "paint siding", "pintura exterior"],
    { unit: "square_foot", priceRef: "paint.exterior", typicalQuantity: 400 }),

  /* ---------------------------------------------------------- flooring */
  task("flooring.lvp.replace", "flooring", ["Install / replace LVP flooring", "Instalar o reemplazar piso LVP"],
    ["lvp", "luxury vinyl", "vinyl plank", "replace flooring", "new flooring", "piso vinílico"],
    { unit: "square_foot", priceRef: "flooring.mid", typicalQuantity: 200,
      companions: [COMPANIONS.removeDispose, COMPANIONS.underlayment, COMPANIONS.transitions],
      questions: ["flooringMaterialArea"] }),
  task("flooring.laminate.replace", "flooring", ["Install / replace laminate", "Instalar o reemplazar laminado"],
    ["laminate floor", "laminate flooring", "piso laminado"],
    { unit: "square_foot", priceRef: "flooring.basic", typicalQuantity: 200,
      companions: [COMPANIONS.removeDispose, COMPANIONS.underlayment, COMPANIONS.transitions],
      questions: ["flooringMaterialArea"] }),
  task("flooring.hardwood.replace", "flooring", ["Install / replace hardwood", "Instalar o reemplazar madera"],
    ["hardwood floor", "wood flooring", "piso de madera"],
    { unit: "square_foot", priceRef: "flooring.premium", typicalQuantity: 200,
      companions: [COMPANIONS.removeDispose, COMPANIONS.transitions], questions: ["flooringMaterialArea"] }),
  task("flooring.tile.replace", "flooring", ["Install / replace tile floor", "Instalar o reemplazar piso de losa"],
    ["tile floor", "floor tile", "ceramic floor", "piso de cerámica", "losa"],
    { unit: "square_foot", priceRef: "flooring.tile", typicalQuantity: 80,
      companions: [COMPANIONS.removeDispose], questions: ["flooringMaterialArea"] }),
  task("flooring.carpet.replace", "flooring", ["Replace carpet", "Reemplazar alfombra"],
    ["carpet", "new carpet", "replace carpet", "alfombra"],
    { unit: "square_foot", priceRef: "flooring.carpet", typicalQuantity: 200,
      companions: [COMPANIONS.removeDispose] }),
  task("flooring.patch", "flooring", ["Patch damaged flooring", "Reparar piso dañado"],
    ["floor patch", "patch flooring", "damaged floor board", "replace floor boards", "reparar piso"],
    { unit: "square_foot", priceRef: "flooring.mid", typicalQuantity: 16, minLaborHours: 2,
      companions: [COMPANIONS.removeDispose, COMPANIONS.hiddenDamage], questions: ["flooringMaterialArea"] }),
  task("flooring.transition.install", "flooring", ["Install floor transition", "Instalar transición de piso"],
    ["transition strip", "threshold strip", "t-molding", "transición de piso"],
    { unit: "each", priceRef: "trim.transitions" }),
  task("flooring.demo", "flooring", ["Remove existing flooring", "Retirar piso existente"],
    ["remove flooring", "tear out floor", "floor demo", "retirar piso"],
    { unit: "square_foot", priceRef: "demolition.flooring", typicalQuantity: 200, companions: [COMPANIONS.debris] }),
  task("flooring.subfloor.repair", "flooring", ["Repair subfloor", "Reparar contrapiso"],
    ["subfloor repair", "soft subfloor", "rotten subfloor", "contrapiso"],
    { unit: "square_foot", typicalQuantity: 16, companions: [COMPANIONS.hiddenDamage] }),

  /* ---------------------------------------------------------- cabinets */
  task("cabinets.door.adjust", "cabinets", ["Adjust cabinet doors / drawers", "Ajustar puertas de gabinete"],
    ["adjust cabinet door", "cabinet doors not closing", "align cabinet doors", "fix cabinet doors", "adjust drawers", "ajustar gabinetes"],
    { unit: "each", minLaborHours: 0.5 }),
  task("cabinets.hinge.replace", "cabinets", ["Replace cabinet hinges", "Reemplazar bisagras"],
    ["cabinet hinges", "replace hinges", "broken hinge", "bisagras"],
    { unit: "each", minLaborHours: 0.5 }),
  task("cabinets.hardware.install", "cabinets", ["Install cabinet pulls / knobs", "Instalar jaladeras o perillas"],
    ["cabinet pulls", "cabinet knobs", "cabinet hardware", "install pulls", "jaladeras"],
    { unit: "each", priceRef: "kitchen.cabinet_hardware", minLaborHours: 1 }),
  task("cabinets.drawer.repair", "cabinets", ["Repair drawer / slides", "Reparar cajón o correderas"],
    ["drawer slide", "broken drawer", "drawer repair", "reparar cajón"],
    { unit: "each", minLaborHours: 0.75 }),
  task("cabinets.shelf.add", "cabinets", ["Add cabinet shelf", "Agregar repisa en gabinete"],
    ["cabinet shelf", "add shelf in cabinet", "repisa de gabinete"],
    { unit: "each", minLaborHours: 0.5 }),
  task("cabinets.toekick.repair", "cabinets", ["Repair cabinet / toe kick", "Reparar gabinete o zócalo"],
    ["cabinet repair", "toe kick", "water damaged cabinet", "reparar gabinete"],
    { unit: "each", companions: [COMPANIONS.hiddenDamage] }),

  /* --------------------------------------------- doors, windows & trim */
  task("doors.interior.replace", "doors_windows_trim", ["Replace interior door", "Reemplazar puerta interior"],
    ["interior door", "replace door", "new door", "bedroom door", "puerta interior"],
    { unit: "each", priceRef: "door.interior", minLaborHours: 2,
      companions: [COMPANIONS.removeHaul], questions: ["supplyResponsibility"] }),
  task("doors.exterior.replace", "doors_windows_trim", ["Replace exterior door", "Reemplazar puerta exterior"],
    ["exterior door", "front door", "back door", "puerta exterior"],
    { unit: "each", priceRef: "door.exterior", companions: [COMPANIONS.removeHaul, COMPANIONS.fasteners] }),
  task("doors.adjust", "doors_windows_trim", ["Adjust / plane sticking door", "Ajustar puerta que roza"],
    ["door sticking", "door won't close", "adjust door", "plane door", "puerta atorada"],
    { unit: "each", minLaborHours: 0.75 }),
  task("doors.hardware.replace", "doors_windows_trim", ["Replace door knob / lockset", "Reemplazar chapa o perilla"],
    ["door knob", "doorknob", "lockset", "deadbolt", "change locks", "rekey", "chapa", "cerradura"],
    { unit: "each", minLaborHours: 0.5 }),
  task("doors.closer.install", "doors_windows_trim", ["Install door closer / stop", "Instalar cierrapuertas o tope"],
    ["door closer", "door stop", "tope de puerta"],
    { unit: "each", minLaborHours: 0.5 }),
  task("doors.weatherstrip", "weatherproofing", ["Replace weatherstripping / sweep", "Reemplazar burlete"],
    ["weatherstrip", "weather stripping", "door sweep", "draft under door", "burlete"],
    { unit: "each", minLaborHours: 0.75 }),
  task("windows.replace", "doors_windows_trim", ["Replace window", "Reemplazar ventana"],
    ["replace window", "new window", "window replacement", "reemplazar ventana"],
    { unit: "each", priceRef: "window.replacement", companions: [COMPANIONS.removeHaul] }),
  task("windows.screen.repair", "doors_windows_trim", ["Repair / replace window screen", "Reparar o reemplazar mosquitero"],
    ["window screen", "screen repair", "rescreen", "mosquitero"],
    { unit: "each", minLaborHours: 0.5 }),
  task("windows.glass.replace", "doors_windows_trim", ["Replace broken glass pane", "Reemplazar vidrio roto"],
    ["broken window", "glass pane", "replace glass", "vidrio roto"],
    { unit: "each" }),
  task("trim.base.install", "doors_windows_trim", ["Install baseboard", "Instalar zócalo"],
    ["baseboard", "base trim", "install base", "zócalo", "rodapié"],
    { unit: "linear_foot", priceRef: "trim.base", typicalQuantity: 40 }),
  task("trim.casing.install", "doors_windows_trim", ["Install door / window casing", "Instalar marcos"],
    ["door casing", "window casing", "trim around door", "marco de puerta"],
    { unit: "each", priceRef: "trim.door_casing" }),
  task("trim.crown.install", "doors_windows_trim", ["Install crown molding", "Instalar moldura de corona"],
    ["crown molding", "crown", "moldura de corona"],
    { unit: "linear_foot", priceRef: "trim.crown", typicalQuantity: 40 }),
  task("trim.repair", "doors_windows_trim", ["Repair damaged trim", "Reparar moldura dañada"],
    ["trim repair", "damaged baseboard", "replace trim piece", "reparar moldura"],
    { unit: "linear_foot", priceRef: "trim.base", typicalQuantity: 10, minLaborHours: 1 }),

  /* ----------------------------------------------- decks, porches, fences */
  task("deck.board.replace", "deck_fence", ["Replace deck boards", "Reemplazar tablas de terraza"],
    ["deck boards", "replace deck board", "rotten deck board", "decking replacement", "tablas de terraza"],
    { unit: "square_foot", priceRef: "deck.decking", typicalQuantity: 40, minLaborHours: 2,
      companions: [COMPANIONS.fasteners, COMPANIONS.debris, COMPANIONS.hiddenDamage], questions: ["deckBoardMaterial"] }),
  task("deck.railing.replace", "deck_fence", ["Replace deck / porch railing", "Reemplazar barandal"],
    ["deck railing", "porch railing", "handrail", "replace handrail", "rail repair", "barandal", "pasamanos"],
    { unit: "linear_foot", priceRef: "deck.railing", typicalQuantity: 12, minLaborHours: 2,
      companions: [COMPANIONS.fasteners, COMPANIONS.debris] }),
  task("deck.stair.repair", "deck_fence", ["Repair deck stairs / stringers", "Reparar escalones de terraza"],
    ["deck stairs", "stair repair", "stringer", "escalones"],
    { unit: "each", companions: [COMPANIONS.hiddenDamage] }),
  task("deck.framing.repair", "deck_fence", ["Repair deck framing", "Reparar estructura de terraza"],
    ["deck framing", "joist repair", "deck structure", "estructura de terraza"],
    { unit: "square_foot", priceRef: "deck.framing", typicalQuantity: 32, companions: [COMPANIONS.hiddenDamage] }),
  task("deck.seal", "deck_fence", ["Clean and seal deck", "Limpiar y sellar terraza"],
    ["seal deck", "stain deck", "deck sealing", "sellar terraza"],
    { unit: "square_foot", typicalQuantity: 250 }),
  task("fence.repair", "deck_fence", ["Repair fence section", "Reparar sección de cerca"],
    ["fence repair", "fence panel", "broken fence", "reparar cerca"],
    { unit: "linear_foot", priceRef: "fence.install", typicalQuantity: 16, companions: [COMPANIONS.debris] }),
  task("fence.gate.repair", "deck_fence", ["Repair / rehang gate", "Reparar o reinstalar portón"],
    ["gate sagging", "fix gate", "gate repair", "portón"],
    { unit: "each", minLaborHours: 1.5 }),

  /* -------------------------------------------------------- exterior */
  task("exterior.siding.repair", "exterior", ["Repair siding", "Reparar revestimiento"],
    ["siding repair", "replace siding", "damaged siding", "reparar siding"],
    { unit: "square_foot", priceRef: "siding.install", typicalQuantity: 40, companions: [COMPANIONS.hiddenDamage] }),
  task("exterior.soffit_fascia.repair", "exterior", ["Repair soffit / fascia", "Reparar sofito o fascia"],
    ["soffit", "fascia", "rotten fascia", "sofito"],
    { unit: "linear_foot", priceRef: "siding.soffit_fascia", typicalQuantity: 16, companions: [COMPANIONS.hiddenDamage] }),
  task("exterior.gutter.replace", "exterior", ["Replace gutter run", "Reemplazar canaleta"],
    ["gutter", "gutters", "replace gutter", "downspout", "canaleta"],
    { unit: "linear_foot", priceRef: "gutters.install", typicalQuantity: 40 }),
  task("exterior.gutter.clean", "exterior", ["Clean gutters", "Limpiar canaletas"],
    ["clean gutters", "gutter cleaning", "limpiar canaletas"],
    { unit: "linear_foot", typicalQuantity: 100 }),
  task("exterior.flashing.repair", "exterior", ["Repair flashing", "Reparar tapajuntas"],
    ["flashing", "roof flashing leak", "tapajuntas"],
    { unit: "linear_foot", priceRef: "roofing.flashing", typicalQuantity: 12 }),
  task("exterior.pressure_wash", "exterior", ["Pressure wash", "Lavado a presión"],
    ["pressure wash", "power wash", "lavado a presión"],
    { unit: "square_foot", typicalQuantity: 500 }),
  task("exterior.dryer_vent.clean", "exterior", ["Clean / replace dryer vent", "Limpiar o reemplazar ducto de secadora"],
    ["dryer vent", "dryer duct", "ducto de secadora"],
    { unit: "each", minLaborHours: 1 }),

  /* ------------------------------------------------- bath accessories */
  task("bath.grab_bar.install", "bath_accessories", ["Install grab bar", "Instalar barra de apoyo"],
    ["grab bar", "safety bar", "barra de apoyo"],
    { unit: "each", priceRef: "accessibility.grab_bar", minLaborHours: 1 }),
  task("bath.accessory.install", "bath_accessories", ["Install bath accessory", "Instalar accesorio de baño"],
    ["towel bar", "toilet paper holder", "towel ring", "robe hook", "toallero"],
    { unit: "each", priceRef: "bath.accessories", minLaborHours: 0.5 }),
  task("bath.mirror.install", "bath_accessories", ["Install mirror / medicine cabinet", "Instalar espejo o botiquín"],
    ["mirror", "medicine cabinet", "espejo", "botiquín"],
    { unit: "each", minLaborHours: 1 }),
  task("bath.shower_door.install", "bath_accessories", ["Install shower door", "Instalar puerta de ducha"],
    ["shower door", "shower enclosure", "puerta de ducha"],
    { unit: "each", priceRef: "bath.shower_door" }),
  task("bath.vanity.replace", "bath_accessories", ["Replace vanity", "Reemplazar mueble de baño"],
    ["vanity", "bathroom vanity", "mueble de baño"],
    { unit: "each", priceRef: "bath.vanity", companions: [COMPANIONS.removeHaul, COMPANIONS.reconnectSupply, COMPANIONS.reconnectDrain] }),

  /* ------------------------------------------------ shelving & storage */
  task("shelving.closet.install", "shelving_storage", ["Install closet shelving", "Instalar repisas de clóset"],
    ["closet shelf", "closet shelving", "wire shelving", "closet rod", "repisas de clóset"],
    { unit: "linear_foot", priceRef: "closet.shelving", typicalQuantity: 8, minLaborHours: 1.5 }),
  task("shelving.wall.install", "shelving_storage", ["Install wall shelving", "Instalar repisas de pared"],
    ["floating shelf", "wall shelf", "shelving", "repisa de pared"],
    { unit: "linear_foot", priceRef: "trim.shelving", typicalQuantity: 6, minLaborHours: 1 }),
  task("shelving.garage.install", "shelving_storage", ["Install garage storage / racks", "Instalar estantería de garaje"],
    ["garage shelving", "storage rack", "overhead rack", "estantería de garaje"],
    { unit: "linear_foot", priceRef: "trim.shelving", typicalQuantity: 12 }),

  /* ---------------------------------------------------------- mounting */
  task("mounting.tv", "mounting", ["Mount TV", "Montar televisor"],
    ["mount tv", "tv mount", "hang tv", "montar tele", "televisor"],
    { unit: "each", minLaborHours: 1.5, questions: ["supplyResponsibility"] }),
  task("mounting.art", "mounting", ["Hang art / mirrors", "Colgar cuadros o espejos"],
    ["hang pictures", "hang art", "hang mirror", "colgar cuadros"],
    { unit: "each", minLaborHours: 0.5 }),
  task("mounting.appliance", "mounting", ["Install appliance", "Instalar electrodoméstico"],
    ["install microwave", "install dishwasher", "appliance install", "range hood", "instalar electrodoméstico"],
    { unit: "each", priceRef: "kitchen.appliance_install", minLaborHours: 1.5 }),
  task("mounting.childproof", "mounting", ["Install safety / childproof hardware", "Instalar herrajes de seguridad"],
    ["baby gate", "childproof", "anchor furniture", "furniture anchor"],
    { unit: "each", minLaborHours: 0.5 }),

  /* --------------------------------------------------- weatherproofing */
  task("weatherproofing.caulk.exterior", "weatherproofing", ["Exterior caulking / sealing", "Sellado exterior"],
    ["exterior caulk", "seal gaps", "caulking outside", "sellado exterior"],
    { unit: "linear_foot", typicalQuantity: 40, minLaborHours: 1.5 }),
  task("weatherproofing.attic_seal", "weatherproofing", ["Seal / insulate small area", "Sellar o aislar área pequeña"],
    ["air seal", "insulate attic hatch", "seal drafts", "sellar corrientes"],
    { unit: "square_foot", priceRef: "insulation.ceiling", typicalQuantity: 60 }),
  task("weatherproofing.pest_block", "weatherproofing", ["Block pest entry points", "Bloquear entradas de plagas"],
    ["pest entry", "seal rodent hole", "critter entry", "bloquear plagas"],
    { unit: "each", minLaborHours: 1 }),

  /* ---------------------------------------------------- minor carpentry */
  task("carpentry.framing.minor", "carpentry", ["Minor framing repair", "Reparación menor de estructura"],
    ["framing repair", "sister a joist", "stud repair", "reparación de estructura"],
    { unit: "linear_foot", priceRef: "framing.partition_wall", typicalQuantity: 8, companions: [COMPANIONS.hiddenDamage] }),
  task("carpentry.blocking", "carpentry", ["Add blocking / backing", "Agregar bloqueo o refuerzo"],
    ["add blocking", "backing for grab bar", "bloqueo"],
    { unit: "each", minLaborHours: 1 }),
  task("carpentry.builtin.minor", "carpentry", ["Small built-in / bench", "Mueble pequeño a la medida"],
    ["built in shelf", "bench", "small built in", "mueble a la medida"],
    { unit: "linear_foot", typicalQuantity: 6 }),
  task("carpentry.rot.repair", "carpentry", ["Wood rot repair", "Reparar madera podrida"],
    ["wood rot", "rotted wood", "dry rot", "madera podrida"],
    { unit: "linear_foot", typicalQuantity: 8, companions: [COMPANIONS.hiddenDamage] }),

  /* ------------------------------------------------------------ general */
  task("general.punch_list.misc", "general", ["Miscellaneous punch-list item", "Trabajo diverso de lista de pendientes"],
    ["punch list", "misc repair", "odd job", "handyman work", "small repair", "trabajo pendiente"],
    { unit: "hour", typicalQuantity: 1, minLaborHours: 1 }),
  task("general.haul_away", "general", ["Haul away / disposal", "Retiro y desecho"],
    ["haul away", "dump run", "disposal", "debris removal", "retiro de escombros"],
    { unit: "each", priceRef: "general.cleanup" }),
  task("general.assembly", "general", ["Furniture / equipment assembly", "Ensamble de muebles"],
    ["furniture assembly", "assemble", "put together", "ensamblar muebles"],
    { unit: "each", minLaborHours: 1 }),
];

const BY_ID = new Map(HANDYMAN_TASKS.map((t) => [t.id, t]));

export function getHandymanTask(taskId: string | null | undefined): HandymanTask | null {
  if (!taskId) return null;
  return BY_ID.get(taskId) ?? null;
}

/** Lowercase, accent-free, punctuation-free comparison text. */
export function normalizeTaskText(value: string | null | undefined): string {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface TaskSearchResult {
  task: HandymanTask;
  score: number;
}

/**
 * Plain-English search across labels, aliases, category and id. Ranked, so a
 * picker shows the ten right answers instead of two hundred rows.
 */
export function searchHandymanTasks(
  query: string,
  options: { category?: TaskCategory | "all"; limit?: number } = {},
): TaskSearchResult[] {
  const q = normalizeTaskText(query);
  const limit = options.limit ?? 25;
  const category = options.category && options.category !== "all" ? options.category : null;
  const pool = HANDYMAN_TASKS.filter((t) => !category || t.category === category);

  if (!q) return pool.slice(0, limit).map((task) => ({ task, score: 0 }));

  const words = q.split(" ").filter(Boolean);
  const results: TaskSearchResult[] = [];

  for (const task of pool) {
    const haystacks = [
      normalizeTaskText(task.label["en-US"]),
      normalizeTaskText(task.label["es-US"]),
      ...task.aliases.map(normalizeTaskText),
      normalizeTaskText(task.id.replace(/[._]/g, " ")),
      normalizeTaskText(task.category.replace(/_/g, " ")),
    ];
    let score = 0;
    for (const hay of haystacks) {
      if (!hay) continue;
      /* A short haystack that contains the query is a tighter match than a
       * long one: "toilet" should rank "Replace toilet" above "toilet paper
       * holder". The bonus is small so it only breaks ties. */
      const tightness = Math.max(0, 8 - Math.round((hay.length - q.length) / 4));
      if (hay === q) score = Math.max(score, 100);
      else if (hay.startsWith(q)) score = Math.max(score, 85 + tightness);
      else if (hay.includes(q)) score = Math.max(score, 60 + tightness);
      else {
        const hit = words.filter((w) => hay.includes(w)).length;
        if (hit) score = Math.max(score, Math.round((hit / words.length) * 55));
      }
    }
    if (score > 0) results.push({ task, score });
  }

  return results
    .sort((a, b) => b.score - a.score || a.task.id.localeCompare(b.task.id))
    .slice(0, limit);
}

export const TASK_CATEGORIES: readonly TaskCategory[] = [
  "plumbing", "electrical", "drywall", "paint", "flooring", "cabinets",
  "doors_windows_trim", "deck_fence", "exterior", "bath_accessories",
  "shelving_storage", "mounting", "weatherproofing", "carpentry", "general",
];

/**
 * Business-type aware ordering. A handyman sees plumbing, electrical, drywall
 * and doors first; nobody's categories are hidden — remodeling work stays one
 * tap away. Presentation only: never a filter on what can be estimated.
 */
const BUSINESS_TYPE_PRIORITY: Record<string, TaskCategory[]> = {
  HANDYMAN: ["plumbing", "electrical", "drywall", "doors_windows_trim", "paint", "mounting", "cabinets", "general"],
  PROPERTY_MAINTENANCE: ["plumbing", "electrical", "exterior", "weatherproofing", "drywall", "paint", "general"],
  PAINTING: ["paint", "drywall", "doors_windows_trim", "exterior"],
  PLUMBING: ["plumbing", "bath_accessories", "drywall"],
  ELECTRICAL: ["electrical", "mounting", "drywall"],
  FLOORING: ["flooring", "doors_windows_trim", "carpentry"],
  DECKS_OUTDOOR_LIVING: ["deck_fence", "exterior", "carpentry"],
  EXTERIOR_CONTRACTOR: ["exterior", "deck_fence", "weatherproofing"],
  ACCESSIBILITY_AGING_IN_PLACE: ["bath_accessories", "doors_windows_trim", "carpentry"],
};

export function suggestedCategoriesFor(businessType: string | null | undefined): TaskCategory[] {
  const preferred = BUSINESS_TYPE_PRIORITY[String(businessType ?? "").toUpperCase()] ?? [];
  return [...preferred, ...TASK_CATEGORIES.filter((c) => !preferred.includes(c))];
}
