import { resolveComponentQuantity } from "@/features/estimating/services/assemblyQuantities";
const roof = [["Drip Edge Metal","perimeter_lf"],["Ice & Water Shield","eave_lf"],["Synthetic Underlayment","same_as_parent"],["Steel Panel Roofing","same_as_parent"],["Fasteners and Clips","factor"],["Pipe Boot Flashing","per_penetration"],["Ridge Cap","ridge_lf"],["Sealant/Butyl","factor"],["Debris Disposal","factor"]];
const wall = [["House Wrap","wall_sf"],["Seam Tape","factor"],["Starter Strip","perimeter_lf"],["Outside Corner Post","corner_lf"],["J-Channel","perimeter_lf"],["Vinyl Siding Panels","wall_sf"],["Undersill Trim","perimeter_lf"],["Fasteners","wall_sf"],["Sealant","perimeter_lf"]];
for (const [label, list, qty, trade] of [["ROOFING 2250 SF", roof, 2250, "roofing"],["SIDING 1780 SF", wall, 1780, "exterior"]] as const) {
  console.log("==", label);
  for (const [n, b] of list as any) {
    const r = resolveComponentQuantity({ quantityBasis: b, parentQuantity: qty, parentUnitKey: "square_foot", tradeKey: trade });
    console.log(`${n} | ${b} | ${r.quantity} | ${r.source} | ${r.derivation}`);
  }
}
