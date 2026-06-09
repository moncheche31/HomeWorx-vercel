import { NextRequest, NextResponse } from "next/server";
import { Estimate } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Convenience: always returns 200 JSON so the client never sees an HTML error page
const localOK = (id: string | null) =>
  NextResponse.json({ success: true, savedLocally: true, id }, { status: 200 });

// ── POST /api/estimates ────────────────────────────────────────────────────────
// Best-effort cloud sync. The client ALWAYS saves to localStorage first, so this
// route returning any non-200 would be swallowed by the .catch(() => {}) on the
// client — but we make it bullet-proof anyway so mobile never parses HTML.
export async function POST(req: NextRequest) {
  // Outer safety net: any unhandled throw returns JSON, never an HTML error page
  try {
    let estimate: Estimate;
    try {
      estimate = await req.json();
    } catch {
      // Body parse failed (malformed JSON, empty body, etc.)
      // Client already saved to localStorage — confirm success so it can proceed.
      return localOK(null);
    }

    if (!estimate?.id) {
      return localOK(null);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const authHeader  = req.headers.get("authorization");

    const supabaseReady =
      supabaseUrl &&
      supabaseKey &&
      !supabaseUrl.includes("your-project") &&
      authHeader?.startsWith("Bearer ");

    if (supabaseReady) {
      try {
        const row = mapEstimateToRow(estimate);
        const res = await fetch(`${supabaseUrl}/rest/v1/estimates`, {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "apikey":        supabaseKey!,
            "Authorization": authHeader!,
            "Prefer":        "return=minimal,resolution=merge-duplicates",
          },
          body: JSON.stringify(row),
          signal: AbortSignal.timeout(8000),
        });

        if (res.ok) {
          return NextResponse.json(
            { success: true, savedLocally: false, storage: "supabase", id: estimate.id },
            { status: 200 },
          );
        }

        const detail = await res.text().catch(() => "");
        console.error("[estimates] Supabase insert failed:", res.status, detail);
        // Fall through to localOK below
      } catch (err) {
        console.error("[estimates] Supabase error:", err);
        // Fall through to localOK below
      }
    }

    // Supabase not configured, unauthenticated, or any failure.
    // Client already persisted to localStorage — acknowledge success.
    // Note: we do NOT echo the estimate body back to avoid sending large
    // base64 photo payloads back over a mobile connection.
    return localOK(estimate.id);
  } catch (err) {
    // Absolute last resort: something unexpected blew up.
    // Return JSON so the client's .catch(() => {}) still sees a clean response
    // rather than an HTML 500 page triggering JSON.parse errors.
    console.error("[estimates] Unhandled error:", err);
    return NextResponse.json({ success: true, savedLocally: true, id: null }, { status: 200 });
  }
}

// ── Map client Estimate → Supabase REST row ───────────────────────────────────
// Photos omitted — base64 data URLs belong in localStorage / Storage bucket,
// not a Postgres JSONB column.
function mapEstimateToRow(e: Estimate): Record<string, unknown> {
  return {
    id:               e.id,
    estimate_number:  e.estimateNumber,
    status:           e.status,
    language:         e.language,
    display_mode:     e.displayMode,
    trade:            e.trade,

    customer_name:    e.customer.name    || null,
    customer_phone:   e.customer.phone   || null,
    customer_email:   e.customer.email   || null,
    customer_address: e.customer.address || null,
    customer_city:    e.customer.city    || null,
    customer_state:   e.customer.state   || null,
    customer_zip:     e.customer.zip     || null,

    job_address: e.location.city
      ? `${e.location.city}, ${e.location.state} ${e.location.zip}`.trim()
      : null,
    job_city:  e.location.city  || null,
    job_state: e.location.state || null,
    job_zip:   e.location.zip   || null,

    job_description:       e.jobDescription      || null,
    scope_of_work:         e.scopeOfWork         || null,
    total_estimated_hours: e.totalEstimatedHours ?? null,
    labor_rate:            e.laborRate           ?? null,

    subtotal:   e.subtotal,
    tax_rate:   e.taxRate,
    tax_amount: e.taxAmount,
    total:      e.total,
    notes:      e.notes  || null,
    terms:      e.terms  || null,
    valid_days: e.validDays ?? 30,

    line_items: e.lineItems,
    photos:     [],

    contractor_snapshot: {
      name:    e.contractor.name,
      company: e.contractor.company,
      phone:   e.contractor.phone,
      email:   e.contractor.email,
      website: e.contractor.website,
      address: e.contractor.address,
      city:    e.contractor.city,
      state:   e.contractor.state,
      zip:     e.contractor.zip,
      license: e.contractor.license,
      logoUrl: e.contractor.logoDataUrl ?? null,
    },
  };
}
