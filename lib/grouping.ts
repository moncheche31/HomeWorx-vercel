import { LineItem } from "@/types";

export function isLaborItem(item: LineItem): boolean {
  const u = item.unit.toLowerCase();
  const d = item.description.toLowerCase();
  return (
    /\b(hour|hr|hours|hrs|man.?day|labor|labour|mano de obra)\b/.test(u) ||
    /\b(labor|labour|mano de obra|hourly|per hour|by the hour)\b/.test(d)
  );
}

export function groupLineItems(items: LineItem[]): { laborTotal: number; materialsTotal: number } {
  let laborTotal = 0;
  let materialsTotal = 0;
  for (const item of items) {
    if (isLaborItem(item)) {
      laborTotal += item.total;
    } else {
      materialsTotal += item.total;
    }
  }
  // If everything is classified as one category, split 60/40 labor/materials
  if (laborTotal === 0 && materialsTotal > 0) {
    laborTotal = materialsTotal * 0.6;
    materialsTotal = materialsTotal * 0.4;
  }
  return { laborTotal, materialsTotal };
}
