import { NextResponse } from "next/server";

/**
 * Returns feature flags based on which environment variables are configured.
 * Safe to call from the client — returns only boolean flags, never key values.
 */
export async function GET() {
  return NextResponse.json({
    whisper:     !!process.env.OPENAI_API_KEY,
    gpt4o:       !!process.env.OPENAI_API_KEY,
    claude:      !!process.env.ANTHROPIC_API_KEY,
    livePrices:  !!(process.env.BIGBOX_API_KEY || process.env.SERPAPI_KEY),
    bigbox:      !!process.env.BIGBOX_API_KEY,
    serpapi:     !!process.env.SERPAPI_KEY,
    supabase:    !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    priceSource: process.env.BIGBOX_API_KEY ? "bigbox" :
                 process.env.SERPAPI_KEY    ? "serpapi" :
                                              "simulated",
    aiEngine:    process.env.OPENAI_API_KEY    ? "gpt-4o" :
                 process.env.ANTHROPIC_API_KEY ? "claude" :
                                                 "demo",
  });
}
