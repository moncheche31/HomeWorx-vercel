import { NextRequest, NextResponse } from "next/server";
import { lookupTradeMaterials, formatMaterialContext } from "@/lib/bigbox";
import { getLaborRate, formatLaborContext } from "@/lib/labor-rates";

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

  const openAiKey    = process.env.OPENAI_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!openAiKey && !anthropicKey) {
    return NextResponse.json(buildDemoResponse(trade, language));
  }

  const location = [city, state, zip].filter(Boolean).join(", ");
  const tradeName = TRADE_NAMES[trade] ?? trade;

  // ── Pre-fetch live material prices + regional labor rate in parallel ──────
  // Both run concurrently; if either fails the error is swallowed and the
  // estimate generates without that context (graceful degradation).
  const [materialCtx, laborCtx] = await Promise.all([
    (async () => {
      try {
        const bigboxKey  = process.env.BIGBOX_API_KEY;
        const serpapiKey = process.env.SERPAPI_KEY;
        const results = await lookupTradeMaterials(trade, zip || "00000", bigboxKey, serpapiKey);
        return formatMaterialContext(results, language);
      } catch {
        return "";
      }
    })(),
    (async () => {
      try {
        const rate = getLaborRate(trade, zip || "00000");
        return formatLaborContext(rate, language);
      } catch {
        return "";
      }
    })(),
  ]);

  const systemPrompt = language === "es"
    ? "Eres un estimador experto de contratistas en EE.UU. Siempre respondes con JSON válido únicamente, sin texto adicional. Escribes en lenguaje profesional de contratista."
    : "You are an expert US contractor estimating assistant. You always respond with valid JSON only, no additional text. You write in professional contractor language.";

  const userPrompt = buildUserPrompt(tradeName, description, location, language, materialCtx, laborCtx);

  // ── Try OpenAI GPT-4o first ────────────────────────────────────────────
  if (openAiKey) {
    try {
      const result = await callOpenAI(openAiKey, systemPrompt, userPrompt, photos ?? [], language);
      return NextResponse.json(result);
    } catch (err) {
      console.error("OpenAI GPT-4o error:", err);
      if (!anthropicKey) return NextResponse.json(buildDemoResponse(trade, language));
    }
  }

  // ── Fall back to Claude ────────────────────────────────────────────────
  if (anthropicKey) {
    try {
      const result = await callClaude(anthropicKey, systemPrompt, userPrompt, photos ?? []);
      return NextResponse.json(result);
    } catch (err) {
      console.error("Claude API error:", err);
      return NextResponse.json(buildDemoResponse(trade, language));
    }
  }

  return NextResponse.json(buildDemoResponse(trade, language));
}

// ── OpenAI GPT-4o (with vision) ────────────────────────────────────────────
async function callOpenAI(
  apiKey: string,
  system: string,
  userPrompt: string,
  photos: string[],
  _language: string,
): Promise<EstimateResult> {
  type ContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } };

  const content: ContentPart[] = [];
  for (const dataUrl of photos.slice(0, 3)) {
    if (dataUrl.startsWith("data:image/")) {
      content.push({ type: "image_url", image_url: { url: dataUrl, detail: "low" } });
    }
  }
  content.push({ type: "text", text: userPrompt });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 3000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
    }),
  });

  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content ?? "{}") as EstimateResult;
}

// ── Anthropic Claude (with vision) ─────────────────────────────────────────
async function callClaude(
  apiKey: string,
  system: string,
  userPrompt: string,
  photos: string[],
): Promise<EstimateResult> {
  type ContentBlock =
    | { type: "text"; text: string }
    | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

  const content: ContentBlock[] = [];
  for (const dataUrl of photos.slice(0, 3)) {
    const match = dataUrl.match(/^data:(image\/[a-z]+);base64,(.+)$/);
    if (match) content.push({ type: "image", source: { type: "base64", media_type: match[1], data: match[2] } });
  }
  content.push({ type: "text", text: userPrompt });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 3000, system, messages: [{ role: "user", content }] }),
  });

  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text: string = data.content?.[0]?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON in Claude response");
  return JSON.parse(jsonMatch[0]) as EstimateResult;
}

// ── Prompt builder (includes live price & labor context) ───────────────────
function buildUserPrompt(
  tradeName: string,
  description: string,
  location: string,
  language: "en" | "es",
  materialCtx: string,
  laborCtx: string,
): string {
  if (language === "es") {
    return `Un contratista de ${tradeName} describió verbalmente este trabajo${location ? ` en ${location}` : ""}:

"${description}"
${materialCtx}${laborCtx}

Tu tarea:
1. Reescribe la descripción como un alcance de trabajo PROFESIONAL (sin "um", "uh", ni lenguaje informal. Usa terminología técnica. Escribe en tercera persona como en un contrato formal.)
2. Crea líneas de artículo detalladas. DEBES usar los precios de materiales y la tarifa de mano de obra provista arriba cuando estén disponibles. Si no están disponibles, usa precios típicos del mercado para ${location || "EE.UU."}.
3. Incluye estimación de horas por tarea (SOLO para el contratista — NUNCA visible al cliente).

Responde SOLO con JSON válido con esta estructura exacta:
{
  "scopeOfWork": "Alcance profesional reescrito...",
  "lineItems": [
    { "description": "string", "quantity": number, "unit": "string", "unitPrice": number, "total": number, "estimatedHours": number }
  ],
  "totalEstimatedHours": number,
  "notes": "Notas importantes para el cliente",
  "taxRate": number,
  "estimateSummary": "Resumen breve"
}`;
  }

  return `A ${tradeName} contractor verbally described this job${location ? ` in ${location}` : ""}:

"${description}"
${materialCtx}${laborCtx}

Your tasks:
1. Rewrite the description as a PROFESSIONAL scope of work. Remove all filler words (um, uh, gonna, etc.), casual speech, and first-person language. Use formal contractor/construction terminology in third person as it would appear in a signed proposal.
2. Create detailed line items. You MUST use the material prices and labor rates provided above when available. If not available, use current market pricing for ${location || "the US"}.
3. Include estimated hours per line item for the CONTRACTOR'S internal reference only (never shown to the customer).

Respond ONLY with a valid JSON object with this exact structure:
{
  "scopeOfWork": "Professional rewritten scope of work here...",
  "lineItems": [
    { "description": "string", "quantity": number, "unit": "string (e.g. sq ft, linear ft, each, hour)", "unitPrice": number, "total": number, "estimatedHours": number }
  ],
  "totalEstimatedHours": number,
  "notes": "Important notes for the customer",
  "taxRate": number,
  "estimateSummary": "Brief summary"
}`;
}

// ── Trade name map ─────────────────────────────────────────────────────────
const TRADE_NAMES: Record<string, string> = {
  remodeling:      "remodeling",
  painting:        "painting",
  roofing:         "roofing",
  siding:          "siding",
  "doors-windows": "door & window",
  plumbing:        "plumbing",
  electrical:      "electrical",
  drywall:         "drywall",
};

// ── Demo fallback ──────────────────────────────────────────────────────────
function buildDemoResponse(trade: string, language: "en" | "es"): EstimateResult {
  const isEs = language === "es";
  const demoItems: Record<string, LineItemResult[]> = {
    painting: [
      { description: isEs ? "Aplicación de pintura en paredes interiores — dos capas" : "Interior wall paint application — two coats", quantity: 500, unit: "sq ft", unitPrice: 2.50, total: 1250, estimatedHours: 8 },
      { description: isEs ? "Pintura de cielo raso — dos capas" : "Ceiling paint application — two coats", quantity: 200, unit: "sq ft", unitPrice: 2.75, total: 550, estimatedHours: 3 },
      { description: isEs ? "Pintura de molduras y zócalos" : "Trim and baseboard painting", quantity: 80, unit: "linear ft", unitPrice: 3.00, total: 240, estimatedHours: 2 },
    ],
    roofing: [
      { description: isEs ? "Retiro e instalación de tejas de asfalto" : "Asphalt shingle removal and replacement", quantity: 18, unit: "square", unitPrice: 350, total: 6300, estimatedHours: 16 },
      { description: isEs ? "Instalación de canaletas de aluminio de 5\"" : "5\" aluminum gutter installation", quantity: 120, unit: "linear ft", unitPrice: 12, total: 1440, estimatedHours: 4 },
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
      { description: isEs ? "Instalación de tablaroca 1/2\"" : "1/2\" drywall panel installation", quantity: 400, unit: "sq ft", unitPrice: 1.75, total: 700, estimatedHours: 8 },
      { description: isEs ? "Acabado — cinta, masilla y lijado" : "Drywall finishing — tape, mud, and sanding", quantity: 400, unit: "sq ft", unitPrice: 1.50, total: 600, estimatedHours: 6 },
    ],
  };

  const lineItems = demoItems[trade] ?? [
    { description: isEs ? "Mano de obra — contratista licenciado" : "Labor — licensed contractor", quantity: 8, unit: "hour", unitPrice: 75, total: 600, estimatedHours: 8 },
    { description: isEs ? "Materiales y suministros" : "Materials and supplies", quantity: 1, unit: "lot", unitPrice: 350, total: 350, estimatedHours: 0 },
  ];

  const totalEstimatedHours = lineItems.reduce((s, i) => s + i.estimatedHours, 0);
  return {
    scopeOfWork: isEs
      ? "⚠️ Estimación de demostración. Configura OPENAI_API_KEY o ANTHROPIC_API_KEY para estimaciones con IA."
      : "⚠️ Demo estimate. Configure OPENAI_API_KEY or ANTHROPIC_API_KEY for AI-powered estimates.",
    lineItems,
    totalEstimatedHours,
    notes: isEs
      ? "⚠️ Esta es una estimación de demostración."
      : "⚠️ This is a demo estimate.",
    taxRate: 0.08,
    estimateSummary: isEs ? "Estimación de demostración." : "Demo estimate.",
  };
}
