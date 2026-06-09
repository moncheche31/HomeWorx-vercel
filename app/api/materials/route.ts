import { NextRequest, NextResponse } from "next/server";
import { lookupTradeMaterials, formatMaterialContext } from "@/lib/bigbox";

interface MaterialsBody {
  trade: string;
  zip: string;
  lang?: "en" | "es";
}

export async function POST(req: NextRequest) {
  let body: MaterialsBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { trade, zip, lang = "en" } = body;
  if (!trade) return NextResponse.json({ error: "trade is required" }, { status: 400 });

  const bigboxKey  = process.env.BIGBOX_API_KEY;
  const serpapiKey = process.env.SERPAPI_KEY;

  const results = await lookupTradeMaterials(trade, zip || "00000", bigboxKey, serpapiKey);
  const context = formatMaterialContext(results, lang);
  const source  = results[0]?.source ?? "simulated";

  return NextResponse.json({ results, context, source });
}
