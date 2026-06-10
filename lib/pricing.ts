import { TradePriceTable, TradeType } from "@/types";

export const DEFAULT_PRICE_TABLES: TradePriceTable[] = [
  {
    trade: "painting",
    laborRate: 55,
    items: [
      { id: crypto.randomUUID(), description: "Interior wall painting", unit: "sq ft", price: 2.50 },
      { id: crypto.randomUUID(), description: "Exterior painting", unit: "sq ft", price: 3.25 },
      { id: crypto.randomUUID(), description: "Ceiling painting", unit: "sq ft", price: 2.75 },
      { id: crypto.randomUUID(), description: "Trim & baseboard painting", unit: "linear ft", price: 3.00 },
      { id: crypto.randomUUID(), description: "Door painting (both sides)", unit: "each", price: 85.00 },
      { id: crypto.randomUUID(), description: "Primer coat", unit: "sq ft", price: 1.00 },
      { id: crypto.randomUUID(), description: "Paint (premium)", unit: "gallon", price: 55.00 },
    ],
  },
  {
    trade: "roofing",
    laborRate: 75,
    items: [
      { id: crypto.randomUUID(), description: "Asphalt shingle tear-off & replacement", unit: "square (100 sq ft)", price: 350.00 },
      { id: crypto.randomUUID(), description: "Flat roof (TPO/EPDM)", unit: "square", price: 450.00 },
      { id: crypto.randomUUID(), description: "Ridge cap replacement", unit: "linear ft", price: 8.00 },
      { id: crypto.randomUUID(), description: "Gutters (5\" aluminum)", unit: "linear ft", price: 12.00 },
      { id: crypto.randomUUID(), description: "Downspout installation", unit: "each", price: 95.00 },
      { id: crypto.randomUUID(), description: "Roof underlayment (felt paper)", unit: "square", price: 45.00 },
      { id: crypto.randomUUID(), description: "Drip edge", unit: "linear ft", price: 3.50 },
      { id: crypto.randomUUID(), description: "Flashing (step/counter)", unit: "linear ft", price: 12.00 },
    ],
  },
  {
    trade: "siding",
    laborRate: 65,
    items: [
      { id: crypto.randomUUID(), description: "Vinyl siding (install & material)", unit: "sq ft", price: 5.50 },
      { id: crypto.randomUUID(), description: "Fiber cement siding", unit: "sq ft", price: 8.00 },
      { id: crypto.randomUUID(), description: "Wood siding", unit: "sq ft", price: 7.50 },
      { id: crypto.randomUUID(), description: "House wrap / moisture barrier", unit: "sq ft", price: 0.75 },
      { id: crypto.randomUUID(), description: "Corner trim", unit: "linear ft", price: 5.00 },
      { id: crypto.randomUUID(), description: "Fascia board replacement", unit: "linear ft", price: 9.00 },
      { id: crypto.randomUUID(), description: "Siding removal / tear-off", unit: "sq ft", price: 1.25 },
    ],
  },
  {
    trade: "doors-windows",
    laborRate: 70,
    items: [
      { id: crypto.randomUUID(), description: "Interior door installation", unit: "each", price: 250.00 },
      { id: crypto.randomUUID(), description: "Exterior door installation (pre-hung)", unit: "each", price: 450.00 },
      { id: crypto.randomUUID(), description: "Window installation (standard)", unit: "each", price: 350.00 },
      { id: crypto.randomUUID(), description: "Window installation (large/bay)", unit: "each", price: 650.00 },
      { id: crypto.randomUUID(), description: "Sliding glass door installation", unit: "each", price: 750.00 },
      { id: crypto.randomUUID(), description: "Door frame repair", unit: "each", price: 185.00 },
      { id: crypto.randomUUID(), description: "Window trim (casing)", unit: "linear ft", price: 6.00 },
      { id: crypto.randomUUID(), description: "Weatherstripping", unit: "each", price: 65.00 },
    ],
  },
  {
    trade: "plumbing",
    laborRate: 95,
    items: [
      { id: crypto.randomUUID(), description: "Fixture installation (sink/toilet/shower)", unit: "each", price: 225.00 },
      { id: crypto.randomUUID(), description: "Pipe replacement (copper)", unit: "linear ft", price: 28.00 },
      { id: crypto.randomUUID(), description: "Pipe replacement (PVC)", unit: "linear ft", price: 14.00 },
      { id: crypto.randomUUID(), description: "Water heater installation", unit: "each", price: 650.00 },
      { id: crypto.randomUUID(), description: "Drain cleaning", unit: "each", price: 185.00 },
      { id: crypto.randomUUID(), description: "Shut-off valve installation", unit: "each", price: 120.00 },
      { id: crypto.randomUUID(), description: "Garbage disposal installation", unit: "each", price: 250.00 },
      { id: crypto.randomUUID(), description: "Labor (hourly)", unit: "hour", price: 95.00 },
    ],
  },
  {
    trade: "electrical",
    laborRate: 95,
    items: [
      { id: crypto.randomUUID(), description: "Outlet installation (standard)", unit: "each", price: 150.00 },
      { id: crypto.randomUUID(), description: "GFCI outlet installation", unit: "each", price: 185.00 },
      { id: crypto.randomUUID(), description: "Light fixture installation", unit: "each", price: 125.00 },
      { id: crypto.randomUUID(), description: "Ceiling fan installation", unit: "each", price: 225.00 },
      { id: crypto.randomUUID(), description: "Panel upgrade (200A)", unit: "each", price: 2800.00 },
      { id: crypto.randomUUID(), description: "Circuit breaker replacement", unit: "each", price: 185.00 },
      { id: crypto.randomUUID(), description: "Recessed lighting (6 pack)", unit: "each", price: 650.00 },
      { id: crypto.randomUUID(), description: "Labor (hourly)", unit: "hour", price: 95.00 },
    ],
  },
  {
    trade: "drywall",
    laborRate: 55,
    items: [
      { id: crypto.randomUUID(), description: "Drywall installation (hang)", unit: "sq ft", price: 1.75 },
      { id: crypto.randomUUID(), description: "Drywall finishing (tape & mud)", unit: "sq ft", price: 1.50 },
      { id: crypto.randomUUID(), description: "Drywall repair (small hole)", unit: "each", price: 95.00 },
      { id: crypto.randomUUID(), description: "Drywall repair (large section)", unit: "sq ft", price: 8.50 },
      { id: crypto.randomUUID(), description: "Texture (orange peel / knockdown)", unit: "sq ft", price: 1.25 },
      { id: crypto.randomUUID(), description: "Drywall sheet (4x8, 1/2\")", unit: "each", price: 18.00 },
      { id: crypto.randomUUID(), description: "Corner bead installation", unit: "linear ft", price: 2.50 },
    ],
  },
  {
    trade: "remodeling",
    laborRate: 75,
    items: [
      { id: crypto.randomUUID(), description: "Demo / removal labor", unit: "hour", price: 65.00 },
      { id: crypto.randomUUID(), description: "Flooring (LVP)", unit: "sq ft", price: 5.50 },
      { id: crypto.randomUUID(), description: "Tile installation", unit: "sq ft", price: 12.00 },
      { id: crypto.randomUUID(), description: "Cabinet installation", unit: "each", price: 185.00 },
      { id: crypto.randomUUID(), description: "Countertop (laminate)", unit: "linear ft", price: 35.00 },
      { id: crypto.randomUUID(), description: "Countertop (granite/quartz)", unit: "sq ft", price: 85.00 },
      { id: crypto.randomUUID(), description: "Framing labor", unit: "hour", price: 70.00 },
      { id: crypto.randomUUID(), description: "General labor", unit: "hour", price: 65.00 },
    ],
  },
];

export function getDefaultPriceTable(trade: TradeType): TradePriceTable {
  return DEFAULT_PRICE_TABLES.find((t) => t.trade === trade) ?? DEFAULT_PRICE_TABLES[0];
}

export const TRADE_LABELS: Record<TradeType, { en: string; es: string; icon: string }> = {
  remodeling:    { en: "Remodeling",      es: "Remodelación",        icon: "🏠" },
  painting:      { en: "Painting",        es: "Pintura",             icon: "🖌️" },
  roofing:       { en: "Roofing",         es: "Techado",             icon: "🏗️" },
  siding:        { en: "Siding",          es: "Revestimiento",       icon: "🧱" },
  "doors-windows": { en: "Doors & Windows", es: "Puertas y Ventanas", icon: "🚪" },
  plumbing:      { en: "Plumbing",        es: "Plomería",            icon: "🔧" },
  electrical:    { en: "Electrical",      es: "Electricidad",        icon: "⚡" },
  drywall:       { en: "Drywall",         es: "Tablaroca",           icon: "📐" },
};
