import { NextRequest, NextResponse } from "next/server";

interface GenerateBody {
  trade: string;
  description: string;
  city: string;
  state: string;
  zip: string;
  language: "en" | "es";
  photos?: string[]; // base64 data URLs
}

interface LineItemResult {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

interface EstimateResult {
  lineItems: LineItemResult[];
  notes: string;
  taxRate: number;
  estimateSummary: string;
}

export async function POST(req: NextRequest) {
  const body: GenerateBody = await req.json();
  const { trade, description, city, state, zip, language, photos } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    // Return a helpful demo response so the app is usable without a key
    return NextResponse.json(buildDemoResponse(trade, language));
  }

  const location = [city, state, zip].filter(Boolean).join(", ");
  const tradeName = TRADE_NAMES[trade] ?? trade;

  const systemPrompt = language === "es"
    ? `Eres un experto estimador de contratistas. Generas estimaciones detalladas con precios de mercado locales para trabajos de construcción y remodelación en los EE.UU. Siempre respondes con JSON válido únicamente, sin texto adicional.`
    : `You are an expert contractor estimating assistant. You generate detailed estimates with local market pricing for construction and remodeling work across the US. You always respond with valid JSON only, no additional text.`;

  const userPrompt = language === "es"
    ? `Un contratista de ${tradeName} necesita una estimación para un trabajo en ${location}.

Descripción del trabajo: ${description}

Basándote en los precios típicos del mercado para ${location || "los EE.UU."}, crea una estimación detallada por líneas de artículo.

Responde SOLO con un objeto JSON válido con esta estructura exacta:
{
  "lineItems": [
    {
      "description": "string",
      "quantity": number,
      "unit": "string (ej: pie², pie lineal, c/u, hora)",
      "unitPrice": number,
      "total": number
    }
  ],
  "notes": "string con notas importantes",
  "taxRate": number (tasa de impuesto típica para el área, entre 0 y 1, por ejemplo 0.08 para 8%),
  "estimateSummary": "string con resumen breve"
}`
    : `A ${tradeName} contractor needs an estimate for a job in ${location}.

Job description: ${description}

Based on typical market rates for ${location || "the US"}, create a detailed line-item estimate.

Respond ONLY with a valid JSON object with this exact structure:
{
  "lineItems": [
    {
      "description": "string",
      "quantity": number,
      "unit": "string (e.g. sq ft, linear ft, each, hour)",
      "unitPrice": number,
      "total": number
    }
  ],
  "notes": "string with any important notes",
  "taxRate": number (typical sales tax for the area, 0-1, e.g. 0.08 for 8%),
  "estimateSummary": "string with brief summary"
}`;

  // Build message content (with photos if available)
  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

  const content: ContentBlock[] = [];

  // Add photos as vision inputs (max 3 to keep tokens reasonable)
  if (photos && photos.length > 0) {
    const photoSlice = photos.slice(0, 3);
    for (const dataUrl of photoSlice) {
      const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (match) {
        const mediaType = match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        content.push({
          type: "image",
          source: { type: "base64", media_type: mediaType, data: match[2] },
        });
      }
    }
    content.push({
      type: "text",
      text: (language === "es"
        ? "Las imágenes de arriba muestran el área de trabajo. "
        : "The images above show the work area. ") + userPrompt,
    });
  } else {
    content.push({ type: "text", text: userPrompt });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Anthropic API error:", err);
      return NextResponse.json(buildDemoResponse(trade, language));
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text ?? "";

    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(buildDemoResponse(trade, language));
    }

    const result: EstimateResult = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Estimate generation error:", err);
    return NextResponse.json(buildDemoResponse(trade, language));
  }
}

const TRADE_NAMES: Record<string, string> = {
  remodeling: "remodeling",
  painting: "painting",
  roofing: "roofing",
  siding: "siding",
  "doors-windows": "door & window",
  plumbing: "plumbing",
  electrical: "electrical",
  drywall: "drywall",
};

function buildDemoResponse(trade: string, language: "en" | "es"): EstimateResult {
  const demoItems: Record<string, LineItemResult[]> = {
    painting: [
      { description: language === "es" ? "Pintura de paredes interiores" : "Interior wall painting", quantity: 500, unit: "sq ft", unitPrice: 2.50, total: 1250 },
      { description: language === "es" ? "Pintura de cielo raso" : "Ceiling painting", quantity: 200, unit: "sq ft", unitPrice: 2.75, total: 550 },
      { description: language === "es" ? "Pintura de molduras" : "Trim painting", quantity: 80, unit: "linear ft", unitPrice: 3.00, total: 240 },
    ],
    roofing: [
      { description: language === "es" ? "Retiro e instalación de tejas" : "Shingle tear-off & replacement", quantity: 18, unit: "square", unitPrice: 350, total: 6300 },
      { description: language === "es" ? "Canaletas nuevas" : "New gutters (5\" aluminum)", quantity: 120, unit: "linear ft", unitPrice: 12, total: 1440 },
    ],
    plumbing: [
      { description: language === "es" ? "Instalación de accesorios" : "Fixture installation", quantity: 2, unit: "each", unitPrice: 225, total: 450 },
      { description: language === "es" ? "Mano de obra" : "Labor", quantity: 4, unit: "hour", unitPrice: 95, total: 380 },
    ],
    electrical: [
      { description: language === "es" ? "Instalación de tomacorrientes" : "Outlet installation", quantity: 6, unit: "each", unitPrice: 150, total: 900 },
      { description: language === "es" ? "Instalación de luminarias" : "Light fixture installation", quantity: 4, unit: "each", unitPrice: 125, total: 500 },
    ],
    drywall: [
      { description: language === "es" ? "Instalación de tablaroca" : "Drywall installation", quantity: 400, unit: "sq ft", unitPrice: 1.75, total: 700 },
      { description: language === "es" ? "Acabado (cinta y masa)" : "Finishing (tape & mud)", quantity: 400, unit: "sq ft", unitPrice: 1.50, total: 600 },
    ],
  };

  const lineItems = demoItems[trade] ?? [
    { description: language === "es" ? "Mano de obra" : "Labor", quantity: 8, unit: "hour", unitPrice: 75, total: 600 },
    { description: language === "es" ? "Materiales" : "Materials", quantity: 1, unit: "lot", unitPrice: 350, total: 350 },
  ];

  return {
    lineItems,
    notes: language === "es"
      ? "⚠️ Esta es una estimación de demostración. Agrega tu clave API de Anthropic para estimaciones precisas basadas en IA y datos del mercado local."
      : "⚠️ This is a demo estimate. Add your Anthropic API key to get accurate AI-powered estimates based on local market data.",
    taxRate: 0.08,
    estimateSummary: language === "es"
      ? "Estimación de demostración generada sin clave API."
      : "Demo estimate generated without API key.",
  };
}
