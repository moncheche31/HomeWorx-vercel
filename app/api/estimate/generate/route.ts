import { NextRequest, NextResponse } from "next/server";

interface GenerateBody {
  trade: string;
  description: string;
  city: string;
  state: string;
  zip: string;
  language: "en" | "es";
  photos?: string[];
}

interface LineItemResult {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  estimatedHours: number;
}

interface EstimateResult {
  scopeOfWork: string;
  lineItems: LineItemResult[];
  totalEstimatedHours: number;
  notes: string;
  taxRate: number;
  estimateSummary: string;
}

export async function POST(req: NextRequest) {
  const body: GenerateBody = await req.json();
  const { trade, description, city, state, zip, language, photos } = body;

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return NextResponse.json(buildDemoResponse(trade, language));
  }

  const location = [city, state, zip].filter(Boolean).join(", ");
  const tradeName = TRADE_NAMES[trade] ?? trade;

  const systemPrompt = language === "es"
    ? `Eres un estimador experto de contratistas. Siempre respondes con JSON válido únicamente, sin texto adicional. Escribes en lenguaje profesional de contratista.`
    : `You are an expert contractor estimating assistant. You always respond with valid JSON only, no additional text. You write in professional contractor language.`;

  const userPrompt = language === "es"
    ? `Un contratista de ${tradeName} describió verbalmente este trabajo en ${location}:

"${description}"

Tu tarea:
1. Reescribe la descripción como un alcance de trabajo PROFESIONAL (sin "um", "uh", ni lenguaje informal. Usa terminología técnica de contratista. Escríbelo en tercera persona, como aparecería en un contrato formal.)
2. Crea líneas de artículo detalladas con precios típicos del mercado para ${location || "EE.UU."}
3. Incluye estimación de horas por tarea (SOLO para el contratista, no se mostrará al cliente)

Responde SOLO con JSON válido con esta estructura exacta:
{
  "scopeOfWork": "Alcance de trabajo profesional reescrito aquí...",
  "lineItems": [
    {
      "description": "Descripción profesional del artículo",
      "quantity": number,
      "unit": "string (ej: pie², pie lineal, c/u, hora)",
      "unitPrice": number,
      "total": number,
      "estimatedHours": number
    }
  ],
  "totalEstimatedHours": number,
  "notes": "Notas importantes para el cliente",
  "taxRate": number,
  "estimateSummary": "Resumen breve"
}`
    : `A ${tradeName} contractor verbally described this job in ${location}:

"${description}"

Your tasks:
1. Rewrite the description as a PROFESSIONAL scope of work. Remove all filler words (um, uh, gonna, kinda, etc.), casual speech, and first-person language. Use formal contractor/construction terminology. Write in third person as it would appear in a professional contract or proposal.
2. Create detailed line items with typical market pricing for ${location || "the US"}.
3. Include an estimated number of hours per line item (for the CONTRACTOR's internal reference only — never shown to the customer).

Respond ONLY with a valid JSON object with this exact structure:
{
  "scopeOfWork": "Professional rewritten scope of work here...",
  "lineItems": [
    {
      "description": "Professional item description",
      "quantity": number,
      "unit": "string (e.g. sq ft, linear ft, each, hour)",
      "unitPrice": number,
      "total": number,
      "estimatedHours": number
    }
  ],
  "totalEstimatedHours": number,
  "notes": "Important notes for the customer",
  "taxRate": number,
  "estimateSummary": "Brief summary"
}`;

  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

  const content: ContentBlock[] = [];

  if (photos && photos.length > 0) {
    for (const dataUrl of photos.slice(0, 3)) {
      const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
      if (match) {
        const mediaType = match[1] as "image/jpeg" | "image/png" | "image/gif" | "image/webp";
        content.push({ type: "image", source: { type: "base64", media_type: mediaType, data: match[2] } });
      }
    }
    content.push({
      type: "text",
      text: (language === "es"
        ? "Las imágenes muestran el área de trabajo. "
        : "The images show the work area. ") + userPrompt,
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
        max_tokens: 3000,
        system: systemPrompt,
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Anthropic API error:", response.status, errorBody);
      let detail = `API error ${response.status}`;
      try {
        const parsed = JSON.parse(errorBody);
        detail = parsed?.error?.message ?? detail;
      } catch {}
      return NextResponse.json({ error: detail }, { status: 502 });
    }

    const data = await response.json();
    const text: string = data.content?.[0]?.text ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("No JSON in API response:", text);
      return NextResponse.json({ error: "Model returned an unexpected response. Please try again." }, { status: 502 });
    }

    const result: EstimateResult = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Estimate generation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
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
  const isEs = language === "es";

  const demoItems: Record<string, LineItemResult[]> = {
    painting: [
      { description: isEs ? "Aplicación de pintura en paredes interiores" : "Application of interior wall paint — two coats", quantity: 500, unit: "sq ft", unitPrice: 2.50, total: 1250, estimatedHours: 8 },
      { description: isEs ? "Pintura de cielo raso" : "Ceiling paint application — two coats", quantity: 200, unit: "sq ft", unitPrice: 2.75, total: 550, estimatedHours: 3 },
      { description: isEs ? "Pintura de molduras y zócalos" : "Trim and baseboard painting", quantity: 80, unit: "linear ft", unitPrice: 3.00, total: 240, estimatedHours: 2 },
    ],
    roofing: [
      { description: isEs ? "Retiro e instalación de tejas de asfalto" : "Removal and replacement of asphalt shingles", quantity: 18, unit: "square", unitPrice: 350, total: 6300, estimatedHours: 16 },
      { description: isEs ? "Instalación de canaletas de aluminio de 5\"" : "Installation of 5\" aluminum gutters", quantity: 120, unit: "linear ft", unitPrice: 12, total: 1440, estimatedHours: 4 },
    ],
    plumbing: [
      { description: isEs ? "Instalación de accesorios de plomería" : "Plumbing fixture installation", quantity: 2, unit: "each", unitPrice: 225, total: 450, estimatedHours: 3 },
      { description: isEs ? "Mano de obra — plomero licenciado" : "Licensed plumber labor", quantity: 4, unit: "hour", unitPrice: 95, total: 380, estimatedHours: 4 },
    ],
    electrical: [
      { description: isEs ? "Instalación de tomacorrientes estándar" : "Standard electrical outlet installation", quantity: 6, unit: "each", unitPrice: 150, total: 900, estimatedHours: 3 },
      { description: isEs ? "Instalación de luminarias" : "Light fixture installation", quantity: 4, unit: "each", unitPrice: 125, total: 500, estimatedHours: 2 },
    ],
    drywall: [
      { description: isEs ? "Instalación de tablaroca 1/2\"" : "Installation of 1/2\" drywall panels", quantity: 400, unit: "sq ft", unitPrice: 1.75, total: 700, estimatedHours: 8 },
      { description: isEs ? "Acabado — cinta, masilla y lijado" : "Finishing — tape, mud, and sanding", quantity: 400, unit: "sq ft", unitPrice: 1.50, total: 600, estimatedHours: 6 },
    ],
  };

  const lineItems = demoItems[trade] ?? [
    { description: isEs ? "Mano de obra — contratista licenciado" : "Labor — licensed contractor", quantity: 8, unit: "hour", unitPrice: 75, total: 600, estimatedHours: 8 },
    { description: isEs ? "Materiales y suministros" : "Materials and supplies", quantity: 1, unit: "lot", unitPrice: 350, total: 350, estimatedHours: 0 },
  ];

  const totalEstimatedHours = lineItems.reduce((s, i) => s + i.estimatedHours, 0);

  return {
    scopeOfWork: isEs
      ? "⚠️ Estimación de demostración. Agrega tu clave API de Anthropic para obtener un alcance de trabajo profesional generado por IA."
      : "⚠️ Demo estimate. Add your Anthropic API key to get a professionally written AI-generated scope of work.",
    lineItems,
    totalEstimatedHours,
    notes: isEs
      ? "⚠️ Esta es una estimación de demostración. Agrega tu clave API de Anthropic para estimaciones precisas."
      : "⚠️ This is a demo estimate. Add your Anthropic API key for accurate AI-powered estimates.",
    taxRate: 0.08,
    estimateSummary: isEs ? "Estimación de demostración." : "Demo estimate.",
  };
}
