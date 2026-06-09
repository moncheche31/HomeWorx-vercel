"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Download } from "lucide-react";
import { loadEstimate, loadContractor } from "@/lib/storage";
import { Estimate, ContractorProfile } from "@/types";
import { generatePdf } from "@/lib/pdf";
import { groupLineItems } from "@/lib/grouping";
import { TRADE_LABELS } from "@/lib/pricing";

// ── Public client-facing estimate view ────────────────────────────────────────
// Shows the contractor's branding only. HomeWorx 360 appears only as a small
// "Powered by" credit in the footer. Internal fields (hours, rates, margins)
// are never rendered here.
export default function PublicEstimatePage() {
  const params  = useParams();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const mergeContractor = (snap: Partial<ContractorProfile>, current: ContractorProfile) => ({
      name:        snap.name        || current.name        || "",
      company:     snap.company     || current.company     || "",
      phone:       snap.phone       || current.phone       || "",
      email:       snap.email       || current.email       || "",
      website:     snap.website     || current.website     || "",
      address:     snap.address     || current.address     || "",
      city:        snap.city        || current.city        || "",
      state:       snap.state       || current.state       || "",
      zip:         snap.zip         || current.zip         || "",
      license:     snap.license     || current.license     || "",
      logoDataUrl: snap.logoDataUrl || current.logoDataUrl || "",
    });

    try {
      // Priority 1: URL-encoded estimate — self-contained, works on any device
      const urlParams = new URLSearchParams(window.location.search);
      const raw = urlParams.get("d");
      if (raw) {
        try {
          const padded = raw + "==".slice(0, (4 - (raw.length % 4)) % 4);
          const standard = padded.replace(/-/g, "+").replace(/_/g, "/");
          // Mirrors the btoa(encodeURIComponent(...)) encoding in the detail page
          const decoded: Estimate = JSON.parse(decodeURIComponent(atob(standard)));
          const current = loadContractor();
          setEstimate({ ...decoded, contractor: mergeContractor(decoded.contractor ?? {}, current) });
          return;
        } catch {
          // Corrupted URL data — fall through to localStorage
        }
      }

      // Priority 2: localStorage — works on the device where estimate was created
      const e = loadEstimate(params.id as string);
      if (!e) { setNotFound(true); return; }

      const current = loadContractor();
      setEstimate({ ...e, contractor: mergeContractor(e.contractor ?? {}, current) });
    } catch {
      // Any unexpected runtime error (e.g. storage restricted by browser security policy)
      // → show not-found rather than leaving the spinner frozen forever
      setNotFound(true);
    }
  }, [params.id]);

  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="text-center max-w-sm">
          <p className="text-2xl mb-2">📄</p>
          <p className="font-semibold text-slate-700">Estimate not found</p>
          <p className="text-sm text-slate-400 mt-2 leading-relaxed">
            This view works on the device where the estimate was originally created.
            Ask your contractor to share the PDF for offline access.
          </p>
        </div>
      </div>
    );
  }

  // Show a spinner while localStorage loads (avoids a blank white flash on mobile)
  if (!estimate) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#0B3C5D] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading estimate…</p>
        </div>
      </div>
    );
  }

  // Safe fallbacks for fields that may be missing on older saved estimates
  const lang       = (estimate.language || "en") as "en" | "es";
  const contractor = estimate.contractor ?? {};
  const tradeMeta  = TRADE_LABELS[estimate.trade] ?? TRADE_LABELS.remodeling;
  const mode       = estimate.displayMode ?? "total-only";
  const lineItems  = estimate.lineItems  ?? [];
  const customer   = estimate.customer   ?? { name: "", phone: "", email: "", address: "", city: "", state: "", zip: "" };

  const subtotal  = estimate.subtotal  ?? 0;
  const taxRate   = estimate.taxRate   ?? 0;
  const taxAmount = estimate.taxAmount ?? 0;
  const total     = estimate.total     ?? 0;

  const companyName    = contractor.company || contractor.name || "";
  const contactParts   = [contractor.phone, contractor.email, contractor.website].filter(Boolean);
  const contractorAddr = [contractor.address, contractor.city, contractor.state, contractor.zip]
    .filter(Boolean).join(", ");

  const createdDate = new Date(estimate.createdAt || Date.now());
  const validDate   = new Date(createdDate);
  validDate.setDate(validDate.getDate() + (estimate.validDays ?? 30));
  const fmtDate = (d: Date) =>
    d.toLocaleDateString(lang === "es" ? "es-US" : "en-US", {
      year: "numeric", month: "long", day: "numeric",
    });

  const taxPct = (taxRate * 100).toFixed(1);
  const { laborTotal, materialsTotal } = groupLineItems(lineItems);

  return (
    <div className="min-h-screen bg-white">

      {/* ── Contractor header ─────────────────────────────────────────────────
           Everything here comes from estimate.contractor (profile snapshot
           merged with current local settings). No HomeWorx 360 info here.
      ── */}
      <div className="bg-[#0B3C5D] text-white">
        <div className="max-w-2xl mx-auto px-5 py-5 flex items-start gap-4">

          {/* Logo — or initials avatar when no logo uploaded */}
          {contractor.logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={contractor.logoDataUrl}
              alt={companyName}
              className="h-16 w-16 object-contain rounded-xl bg-white p-1 flex-shrink-0"
            />
          ) : companyName ? (
            <div className="h-16 w-16 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl font-bold text-white select-none">
                {companyName.charAt(0).toUpperCase()}
              </span>
            </div>
          ) : null}

          {/* Company info — name is larger when no logo to compensate */}
          <div className="flex-1 min-w-0">
            {companyName && (
              <h1
                className={`font-bold leading-tight ${
                  contractor.logoDataUrl ? "text-xl" : "text-2xl"
                }`}
              >
                {companyName}
              </h1>
            )}
            {contactParts.length > 0 && (
              <p className="text-sm text-blue-200 mt-1 leading-snug">
                {contactParts.join("  ·  ")}
              </p>
            )}
            {contractorAddr && (
              <p className="text-sm text-blue-200 leading-snug">{contractorAddr}</p>
            )}
            {contractor.license && (
              <p className="text-xs text-blue-300 mt-0.5">Lic. {contractor.license}</p>
            )}
          </div>

          {/* Estimate badge */}
          <div className="flex-shrink-0">
            <div className="bg-[#41AD49] rounded-xl px-3 py-2 text-center">
              <p className="text-xs font-bold uppercase tracking-wide">
                {lang === "es" ? "Cotización" : "Estimate"}
              </p>
              <p className="text-sm font-bold">#{estimate.estimateNumber}</p>
            </div>
          </div>
        </div>
      </div>
      {/* Green accent stripe */}
      <div className="h-1 bg-[#41AD49]" />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">

        {/* ── Date / validity / trade ── */}
        <div className="grid grid-cols-3 gap-3 bg-slate-50 rounded-2xl p-4">
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">
              {lang === "es" ? "Fecha" : "Date"}
            </p>
            <p className="text-sm font-medium text-slate-800">{fmtDate(createdDate)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">
              {lang === "es" ? "Válido hasta" : "Valid Until"}
            </p>
            <p className="text-sm font-medium text-slate-800">{fmtDate(validDate)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 font-semibold uppercase tracking-wide mb-1">
              {lang === "es" ? "Trabajo" : "Trade"}
            </p>
            <p className="text-sm font-medium text-slate-800">
              {tradeMeta.icon} {tradeMeta[lang]}
            </p>
          </div>
        </div>

        {/* ── Prepared by / For ── */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-bold text-[#0B3C5D] uppercase tracking-wide mb-1">
              {lang === "es" ? "Preparado por:" : "Prepared By:"}
            </p>
            {companyName && <p className="font-semibold text-slate-800">{companyName}</p>}
            {contractor.name && contractor.name !== companyName && (
              <p className="text-sm text-slate-600">{contractor.name}</p>
            )}
            {contactParts.length > 0 && (
              <p className="text-xs text-slate-500 mt-0.5">{contactParts[0]}</p>
            )}
          </div>
          <div>
            <p className="text-xs font-bold text-[#0B3C5D] uppercase tracking-wide mb-1">
              {lang === "es" ? "Estimación para:" : "Estimate For:"}
            </p>
            <p className="font-semibold text-slate-800">{customer.name || "—"}</p>
            {customer.phone && (
              <p className="text-sm text-slate-600">{customer.phone}</p>
            )}
            {customer.email && (
              <p className="text-sm text-slate-600">{customer.email}</p>
            )}
            {estimate.jobAddress && (
              <p className="text-xs text-slate-500 leading-snug mt-0.5">{estimate.jobAddress}</p>
            )}
          </div>
        </div>

        {/* ── Scope of work ── */}
        {(estimate.scopeOfWork || estimate.jobDescription) && (
          <div className="bg-slate-50 rounded-2xl p-4">
            <p className="text-xs font-bold text-[#0B3C5D] uppercase tracking-wide mb-2">
              {lang === "es" ? "Alcance del Trabajo" : "Scope of Work"}
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">
              {estimate.scopeOfWork || estimate.jobDescription}
            </p>
          </div>
        )}

        {/* ── Line items (display mode–aware) ── */}
        <div>
          <p className="text-xs font-bold text-[#0B3C5D] uppercase tracking-wide mb-2">
            {lang === "es" ? "Desglose de Costos" : "Cost Breakdown"}
          </p>

          {/* Itemized */}
          {mode === "itemized" && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-12 gap-2 bg-[#0B3C5D] text-white text-xs font-bold px-3 py-2.5">
                <div className="col-span-6">{lang === "es" ? "Descripción" : "Description"}</div>
                <div className="col-span-2 text-center">{lang === "es" ? "Cant." : "Qty"}</div>
                <div className="col-span-2 text-center">{lang === "es" ? "Unidad" : "Unit"}</div>
                <div className="col-span-2 text-right">Total</div>
              </div>
              {lineItems.map((item, i) => (
                <div
                  key={item.id}
                  className={`grid grid-cols-12 gap-2 px-3 py-2.5 text-sm border-b border-slate-100 last:border-0 ${
                    i % 2 === 0 ? "bg-white" : "bg-slate-50"
                  }`}
                >
                  <div className="col-span-6 text-slate-800">{item.description}</div>
                  <div className="col-span-2 text-center text-slate-500">{item.quantity}</div>
                  <div className="col-span-2 text-center text-slate-500">{item.unit}</div>
                  <div className="col-span-2 text-right font-medium text-slate-800">
                    ${item.total.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Grouped */}
          {mode === "grouped" && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="grid grid-cols-2 bg-[#0B3C5D] text-white text-xs font-bold px-3 py-2.5">
                <div>{lang === "es" ? "Categoría" : "Category"}</div>
                <div className="text-right">Total</div>
              </div>
              <div className="grid grid-cols-2 px-3 py-3 text-sm bg-white border-b border-slate-100">
                <div className="text-slate-800">{lang === "es" ? "Mano de obra" : "Labor"}</div>
                <div className="text-right font-medium text-slate-800">${laborTotal.toFixed(2)}</div>
              </div>
              <div className="grid grid-cols-2 px-3 py-3 text-sm bg-slate-50">
                <div className="text-slate-800">
                  {lang === "es" ? "Materiales y suministros" : "Materials & Supplies"}
                </div>
                <div className="text-right font-medium text-slate-800">${materialsTotal.toFixed(2)}</div>
              </div>
            </div>
          )}

          {/* Total-only */}
          {mode === "total-only" && (
            <div className="border border-slate-200 rounded-2xl overflow-hidden">
              <div className="bg-[#0B3C5D] text-white text-xs font-bold px-3 py-2.5">
                {lang === "es" ? "Servicios" : "Services"}
              </div>
              <div className="px-3 py-3 text-sm text-slate-700 bg-slate-50">
                {lang === "es"
                  ? "Servicios de contratista según el alcance del trabajo descrito anteriormente"
                  : "Contractor services per scope of work described above"}
              </div>
            </div>
          )}
        </div>

        {/* ── Totals ── */}
        <div className="flex flex-col items-end gap-1.5 pt-1">
          <div className="flex justify-between w-full max-w-xs text-sm text-slate-600">
            <span>{lang === "es" ? "Subtotal" : "Subtotal"}</span>
            <span className="font-medium">${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between w-full max-w-xs text-sm text-slate-600">
            <span>{lang === "es" ? `Impuesto (${taxPct}%)` : `Tax (${taxPct}%)`}</span>
            <span>${taxAmount.toFixed(2)}</span>
          </div>
          <div className="h-px bg-slate-200 w-full max-w-xs" />
          <div className="flex justify-between w-full max-w-xs bg-[#0B3C5D] text-white rounded-2xl px-4 py-3">
            <span className="font-bold text-base">{lang === "es" ? "TOTAL" : "TOTAL"}</span>
            <span className="font-bold text-base">
              ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>

        {/* ── Notes ── */}
        {estimate.notes && (
          <div>
            <p className="text-xs font-bold text-[#0B3C5D] uppercase tracking-wide mb-1">
              {lang === "es" ? "Notas" : "Notes"}
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">{estimate.notes}</p>
          </div>
        )}

        {/* ── Terms ── */}
        {estimate.terms && (
          <div>
            <p className="text-xs font-bold text-[#0B3C5D] uppercase tracking-wide mb-1">
              {lang === "es" ? "Términos y Condiciones" : "Terms & Conditions"}
            </p>
            <p className="text-sm text-slate-500 leading-relaxed">{estimate.terms}</p>
          </div>
        )}

        {/* ── Signature lines ── */}
        <div className="grid grid-cols-2 gap-8 pt-6">
          <div>
            <div className="border-b-2 border-slate-300 mb-2" />
            <p className="text-xs text-slate-500">
              {lang === "es" ? "Firma del Cliente" : "Customer Signature"}
            </p>
          </div>
          <div>
            <div className="border-b-2 border-slate-300 mb-2" />
            <p className="text-xs text-slate-500">{lang === "es" ? "Fecha" : "Date"}</p>
          </div>
        </div>

        {/* ── Download PDF ── */}
        <button
          onClick={() => generatePdf(estimate)}
          className="w-full flex items-center justify-center gap-2 bg-[#41AD49] text-white font-semibold py-3.5 rounded-2xl mt-2 active:opacity-80 transition-opacity"
        >
          <Download size={18} />
          {lang === "es" ? "Descargar PDF" : "Download PDF"}
        </button>
      </main>

      {/* ── Passive SaaS marketing footer ─────────────────────────────────────
           Intentionally tiny and light so it markets to homeowners who view
           this page without distracting from the contractor's branding above.
      ── */}
      <footer className="text-center py-8 border-t border-slate-100 mt-4">
        <a
          href="https://homeworx360.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-400 hover:text-slate-500 transition-colors"
        >
          {lang === "es"
            ? "Con tecnología de HomeWorx 360 | Genera cotizaciones con voz al instante"
            : "Powered by HomeWorx 360 | Create instant voice estimates"}
        </a>
      </footer>
    </div>
  );
}
