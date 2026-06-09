import { NextRequest, NextResponse } from "next/server";
import { getLaborRate, formatLaborContext } from "@/lib/labor-rates";

interface LaborBody {
  trade: string;
  zip: string;
  lang?: "en" | "es";
}

export async function POST(req: NextRequest) {
  let body: LaborBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { trade, zip, lang = "en" } = body;
  if (!trade) return NextResponse.json({ error: "trade is required" }, { status: 400 });

  const rate    = getLaborRate(trade, zip || "00000");
  const context = formatLaborContext(rate, lang);

  return NextResponse.json({ rate, context });
}
