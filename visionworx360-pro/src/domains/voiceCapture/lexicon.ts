/** Spoken-language lexicon for the deterministic voice parser (en + es). */

export const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
  fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100,
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20,
  treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100,
};

/** Spoken unit phrases → ScopeUnit keys. Longest phrase wins. */
export const UNIT_PHRASES: Array<[string, string]> = [
  ["square feet", "square_foot"], ["square foot", "square_foot"], ["sq ft", "square_foot"],
  ["pies cuadrados", "square_foot"],
  ["linear feet", "linear_foot"], ["linear foot", "linear_foot"], ["lineal feet", "linear_foot"],
  ["pies lineales", "linear_foot"],
  ["cubic yards", "cubic_yard"], ["cubic yard", "cubic_yard"],
  ["cubic feet", "cubic_foot"], ["cubic foot", "cubic_foot"],
  ["board feet", "board_foot"], ["board foot", "board_foot"],
  ["sheets", "sheet"], ["sheet", "sheet"], ["hojas", "sheet"],
  ["gallons", "gallon"], ["gallon", "gallon"], ["galones", "gallon"], ["galón", "gallon"],
  ["pounds", "pound"], ["pound", "pound"], ["libras", "pound"],
  ["hours", "hour"], ["hour", "hour"], ["horas", "hour"],
  ["days", "day"], ["day", "day"], ["días", "day"],
  ["allowance", "allowance"], ["lump sum", "lump_sum"],
  ["each", "each"], ["cada uno", "each"],
];

/** Spoken verbs → ScopeAction keys. */
export const ACTION_PHRASES: Array<[string, string]> = [
  ["remove", "remove"], ["demo", "remove"], ["demolish", "remove"], ["tear out", "remove"],
  ["quitar", "remove"], ["demoler", "remove"], ["remover", "remove"],
  ["replace", "replace"], ["swap", "replace"], ["reemplazar", "replace"], ["cambiar", "replace"],
  ["install", "install"], ["add", "install"], ["set", "install"], ["hang", "install"],
  ["instalar", "install"], ["poner", "install"], ["agregar", "install"],
  ["repair", "repair"], ["fix", "repair"], ["patch", "repair"], ["reparar", "repair"],
  ["refinish", "refinish"], ["sand", "refinish"], ["lijar", "refinish"],
  ["paint", "paint"], ["prime", "paint"], ["pintar", "paint"],
  ["clean", "clean"], ["limpiar", "clean"],
  ["relocate", "relocate"], ["move", "relocate"], ["mover", "relocate"],
  ["modify", "modify"], ["modificar", "modify"],
  ["build", "build"], ["frame", "build"], ["construir", "build"], ["enmarcar", "build"],
  ["inspect", "inspect"], ["inspeccionar", "inspect"],
  ["protect", "protect"], ["mask", "protect"], ["proteger", "protect"],
];

/** Canonical room vocabulary. Keys are aliases, values are display names. */
export const ROOM_ALIASES: Array<[string, string]> = [
  ["master bathroom", "Master Bath"], ["master bath", "Master Bath"],
  ["primary bathroom", "Master Bath"], ["baño principal", "Master Bath"],
  ["half bath", "Half Bath"], ["powder room", "Half Bath"],
  ["guest bathroom", "Guest Bath"], ["guest bath", "Guest Bath"],
  ["bathroom", "Bathroom"], ["bath", "Bathroom"], ["baño", "Bathroom"],
  ["kitchen", "Kitchen"], ["cocina", "Kitchen"],
  ["master bedroom", "Master Bedroom"], ["primary bedroom", "Master Bedroom"],
  ["bedroom", "Bedroom"], ["recámara", "Bedroom"], ["dormitorio", "Bedroom"],
  ["living room", "Living Room"], ["family room", "Family Room"], ["sala", "Living Room"],
  ["dining room", "Dining Room"], ["comedor", "Dining Room"],
  ["laundry room", "Laundry"], ["laundry", "Laundry"], ["lavandería", "Laundry"],
  ["garage", "Garage"], ["garaje", "Garage"], ["cochera", "Garage"],
  ["basement", "Basement"], ["sótano", "Basement"],
  ["attic", "Attic"], ["ático", "Attic"],
  ["hallway", "Hallway"], ["hall", "Hallway"], ["pasillo", "Hallway"],
  ["exterior", "Exterior"], ["outside", "Exterior"], ["exteriores", "Exterior"],
  ["office", "Office"], ["oficina", "Office"],
  ["closet", "Closet"], ["clóset", "Closet"],
  ["stairs", "Stairs"], ["stairway", "Stairs"], ["escaleras", "Stairs"],
];

/** Phrases that only switch context and never create an item. */
export const CONTEXT_PREFIXES = [
  "in the", "moving to", "now in", "next room", "over in", "here in", "this is the",
  "en el", "en la", "ahora en", "siguiente cuarto",
];

/** Utterance separators (spoken punctuation is unreliable, so words count too). */
export const SEGMENT_SPLIT = /(?:[.;!?\n]+|,\s*(?=(?:and\s+)?(?:then|also|next)\b)|\b(?:and then|then also|after that|luego|después)\b)/i;

/** Words stripped before Knowledge Base matching. */
export const STOP_WORDS = new Set([
  "the", "a", "an", "of", "to", "in", "on", "for", "with", "and", "all", "new",
  "existing", "please", "we", "need", "gonna", "going", "just", "some", "that",
  "this", "it", "is", "are", "el", "la", "los", "las", "un", "una", "de", "del",
  "en", "y", "con", "para", "nuevo", "nueva", "existente", "todo", "todas",
]);
