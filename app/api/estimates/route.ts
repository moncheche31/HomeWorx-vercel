import { NextRequest, NextResponse } from "next/server";
import { Estimate } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ── POST /api/estimates ────────────────────────────────────────────────────────
// Accepts a full Estimate JSON from the client, attempts to persist it to
// Supabase (if configured and the user is authenticated), then ALWAYS returns
// 200 so the client can proceed.  localStorage is the primary source of truth
// until Supabase auth is wired up — this route is a best-effort cloud sync.
export async function POST(req: NextRequest) {
  let estimate: Estimate;
  try {
    estimate = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!estimate?.id) {
    return NextResponse.json({ error: "Missing estimate id" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const authHeader  = req.headers.get("authorization");

  // Only attempt Supabase if properly configured and the client passed a JWT.
  // (RLS requires auth.uid(); without it the insert will be rejected anyway.)
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
        return NextResponse.json({ success: true, storage: "supabase", id: estimate.id });
      }

      const detail = await res.text().catch(() => "");
      console.error("[estimates] Supabase insert failed:", res.status, detail);
    } catch (err) {
      console.error("[estimates] Supabase error:", err);
    }
  }

  // Supabase not configured, user unauthenticated, or any failure —
  // the client already saved to localStorage; return success so the
  // user can proceed to view/print their estimate.
  return NextResponse.json({ success: true, storage: "local", id: estimate.id });
}

// ── Map client Estimate → Supabase row ────────────────────────────────────────
// Photos are intentionally excluded — data URLs are too large for a DB column.
// Upload to Supabase Storage and store paths when that feature is added.
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

    job_address:      e.location.city ? `${e.location.city}, ${e.location.state} ${e.location.zip}`.trim() : null,
    job_city:         e.location.city  || null,
    job_state:        e.location.state || null,
    job_zip:          e.location.zip   || null,

    job_description:       e.jobDescription       || null,
    scope_of_work:         e.scopeOfWork          || null,
    total_estimated_hours: e.totalEstimatedHours  ?? null,
    labor_rate:            e.laborRate            ?? null,

    subtotal:   e.subtotal,
    tax_rate:   e.taxRate,
    tax_amount: e.taxAmount,
    total:      e.total,
    notes:      e.notes  || null,
    terms:      e.terms  || null,
    valid_days: e.validDays ?? 30,

    line_items: e.lineItems,
    photos:     [],   // data URLs are stored in localStorage; paths go here when Storage is wired up

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
