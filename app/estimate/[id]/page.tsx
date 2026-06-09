"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft, Download, Printer, Share2, Loader2,
  Edit3, Check, Sparkles, Send, DollarSign, Lock, ChevronDown, ChevronUp, Eye,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import LineItemEditor from "@/components/LineItemEditor";
import DisplayModePicker from "@/components/DisplayModePicker";
import { useLang } from "@/lib/context";
import { useT } from "@/lib/translations";
import { loadEstimate, saveEstimate, loadPriceTable } from "@/lib/storage";
import { Estimate, EstimateStatus, LineItem, DisplayMode } from "@/types";
import { TRADE_LABELS } from "@/lib/pricing";
import { generatePdf } from "@/lib/pdf";

const STATUS_CYCLE: EstimateStatus[] = ["draft", "sent", "accepted", "declined"];

export default function EstimateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { lang } = useLang();
  const t = useT(lang);

  const [estimate, setEstimate]     = useState<Estimate | null>(null);
  const [editing, setEditing]       = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [contractorOpen, setContractorOpen] = useState(false);

  // Editable copies
  const [lineItems, setLineItems]   = useState<LineItem[]>([]);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("total-only");
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [taxRate, setTaxRate]       = useState(8);
  const [notes, setNotes]           = useState("");
  const [terms, setTerms]           = useState("");

  // Contractor internal — labor rate override
  const [laborRate, setLaborRate]   = useState(75);

  useEffect(() => {
    const e = loadEstimate(params.id as string);
    if (!e) { router.push("/"); return; }
    setEstimate(e);
    setLineItems(e.lineItems);
    setDisplayMode(e.displayMode ?? "total-only");
    setScopeOfWork(e.scopeOfWork ?? e.jobDescription ?? "");
    setTaxRate(Math.round(e.taxRate * 100 * 10) / 10);
    setNotes(e.notes);
    setTerms(e.terms);

    // Load labor rate: prefer saved on estimate, then from trade price table, then default
    const savedRate = e.laborRate;
    if (savedRate && savedRate > 0) {
      setLaborRate(savedRate);
    } else {
      const priceTable = loadPriceTable(e.trade);
      setLaborRate(priceTable?.laborRate ?? 75);
    }
  }, [params.id, router]);

  if (!estimate) return null;

  const subtotal  = lineItems.reduce((s, i) => s + i.total, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total     = subtotal + taxAmount;

  const tradeMeta = TRADE_LABELS[estimate.trade];

  // Contractor internal calculations
  const totalHours = estimate.totalEstimatedHours ?? 0;
  const laborValue = Math.round(totalHours * laborRate * 100) / 100;
  const laborRevenue = lineItems
    .filter((i) => (i.estimatedHours ?? 0) > 0)
    .reduce((s, i) => s + i.total, 0);
  const laborMargin = laborRevenue > 0
    ? Math.round(((laborRevenue - laborValue) / laborRevenue) * 100)
    : null;

  const cycleStatus = () => {
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(estimate.status) + 1) % STATUS_CYCLE.length];
    const updated = { ...estimate, status: next, updatedAt: new Date().toISOString() };
    setEstimate(updated);
    saveEstimate(updated);
  };

  const handleSave = () => {
    setSaving(true);
    const updated: Estimate = {
      ...estimate,
      lineItems,
      displayMode,
      scopeOfWork,
      subtotal,
      taxRate: taxRate / 100,
      taxAmount,
      total,
      notes,
      terms,
      laborRate,
      updatedAt: new Date().toISOString(),
    };

    // Save locally first — zero network dependency.
    setEstimate(updated);
    saveEstimate(updated);

    // Background cloud sync — fire and forget.
    fetch("/api/estimates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(updated),
    }).catch(() => {});

    setEditing(false);
    setSaving(false);
  };

  const handleRegenerate = async () => {
    setGenerating(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000);
    try {
      const { compressPhoto } = await import("@/lib/compress");
      const compressed = await Promise.all((estimate.photos ?? []).slice(0, 3).map(compressPhoto));
      const res = await fetch("/api/estimate/generate", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trade: estimate.trade,
          description: estimate.jobDescription,
          city: estimate.location.city,
          state: estimate.location.state,
          zip: estimate.location.zip,
          language: lang,
          photos: compressed,
        }),
      });
      const data = await res.json();
      const items: LineItem[] = (data.lineItems ?? []).map(
        (item: Omit<LineItem, "id">) => ({ ...item, id: crypto.randomUUID() }),
      );
      setLineItems(items);
      setScopeOfWork(data.scopeOfWork ?? "");
      setTaxRate(Math.round((data.taxRate ?? 0.08) * 100 * 10) / 10);
      setNotes(data.notes ?? "");
      const updatedWithHours = {
        ...estimate,
        totalEstimatedHours: data.totalEstimatedHours ?? estimate.totalEstimatedHours,
      };
      setEstimate(updatedWithHours);
      setEditing(true);
    } catch (err) {
      console.error(err);
      alert(lang === "es" ? "Error al regenerar. Intenta de nuevo." : "Re-generation failed. Please try again.");
    } finally {
      clearTimeout(timeout);
      setGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    const pdfEstimate: Estimate = {
      ...estimate,
      lineItems,
      displayMode,
      scopeOfWork,
      subtotal,
      taxRate: taxRate / 100,
      taxAmount,
      total,
      notes,
      terms,
    };
    await generatePdf(pdfEstimate);
  };

  // Build the relative path for the public client view with estimate data
  // embedded as URL-safe base64. Strips photos and logo (too large for a URL).
  const getSharePath = (): string => {
    const slim = {
      ...estimate,
      lineItems,
      displayMode,
      scopeOfWork,
      subtotal,
      taxRate: taxRate / 100,
      taxAmount,
      total,
      notes,
      terms,
      photos: [],
      contractor: { ...(estimate.contractor ?? {}), logoDataUrl: "" },
    };
    try {
      // btoa(encodeURIComponent(...)) converts any Unicode to safe ASCII before
      // base64-encoding. decodeURIComponent(atob(...)) reverses it on the other end.
      const encoded = btoa(encodeURIComponent(JSON.stringify(slim)))
        .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      return `/estimate/${estimate.id}/public?d=${encoded}`;
    } catch {
      return `/estimate/${estimate.id}/public`;
    }
  };

  const handleShare = async () => {
    const path = getSharePath();
    const fullUrl = `${window.location.origin}${path}`;
    if (navigator.share) {
      await navigator.share({
        title: `${estimate.contractor.company || estimate.contractor.name} — Estimate #${estimate.estimateNumber}`,
        text: `${tradeMeta[lang]} estimate for ${estimate.customer.name}: $${total.toFixed(2)}`,
        url: fullUrl,
      }).catch(() => {});
    } else {
      try {
        await navigator.clipboard.writeText(fullUrl);
        alert(lang === "es" ? "Enlace copiado al portapapeles" : "Link copied to clipboard");
      } catch {
        await handleDownloadPdf();
      }
    }
  };

  const STATUS_LABELS = {
    draft: t.draft, sent: t.sent, accepted: t.accepted, declined: t.declined,
  };

  const STATUS_COLORS: Record<EstimateStatus, string> = {
    draft:    "bg-slate-100 text-slate-700 border-slate-300",
    sent:     "bg-brand-100 text-brand-700 border-brand-300",
    accepted: "bg-accent-100 text-accent-700 border-accent-300",
    declined: "bg-red-100 text-red-600 border-red-300",
  };

  const createdDate = new Date(estimate.createdAt).toLocaleDateString(
    lang === "es" ? "es-US" : "en-US",
    { month: "long", day: "numeric", year: "numeric" },
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      <Navbar />

      <main className="max-w-lg mx-auto px-4 pt-4">
        {/* Back + title */}
        <div className="flex items-center gap-2 mb-4">
          <button onClick={() => router.push("/")} className="p-2 rounded-xl hover:bg-slate-200 transition-colors">
            <ChevronLeft size={22} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg text-slate-800 truncate">
              {tradeMeta.icon} {tradeMeta[lang]}
            </h1>
            <p className="text-sm text-slate-500">
              {t.estimateNumber}{estimate.estimateNumber} • {createdDate}
            </p>
          </div>
          <button
            onClick={cycleStatus}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${STATUS_COLORS[estimate.status]}`}
          >
            {STATUS_LABELS[estimate.status]}
          </button>
        </div>

        {/* Action buttons — 2×2 grid */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          <button onClick={handleDownloadPdf} className="btn-secondary text-sm py-2.5 flex-col gap-1">
            <Download size={18} />
            <span className="text-xs">{lang === "es" ? "Descargar" : "Download"}</span>
          </button>
          <button onClick={handleShare} className="btn-secondary text-sm py-2.5 flex-col gap-1">
            <Share2 size={18} />
            <span className="text-xs">{lang === "es" ? "Compartir" : "Share"}</span>
          </button>
          <button onClick={handleDownloadPdf} className="btn-secondary text-sm py-2.5 flex-col gap-1">
            <Printer size={18} />
            <span className="text-xs">{lang === "es" ? "Imprimir" : "Print"}</span>
          </button>
          <button
            onClick={() => router.push(getSharePath())}
            className="btn-secondary text-sm py-2.5 flex-col gap-1"
          >
            <Eye size={18} />
            <span className="text-xs">{lang === "es" ? "Vista Cliente" : "Client View"}</span>
          </button>
        </div>

        {/* Customer info */}
        <div className="card mb-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wide">
                {lang === "es" ? "Cliente" : "Customer"}
              </p>
              <p className="font-semibold text-slate-800">{estimate.customer.name}</p>
              {estimate.customer.phone && <p className="text-sm text-slate-600">{estimate.customer.phone}</p>}
              {estimate.jobAddress && <p className="text-sm text-slate-500 leading-tight mt-1">{estimate.jobAddress}</p>}
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wide">
                {lang === "es" ? "Total Estimado" : "Estimate Total"}
              </p>
              <p className="text-2xl font-bold text-brand-700">
                ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {lang === "es" ? `Incl. ${taxRate}% impuesto` : `Incl. ${taxRate}% tax`}
              </p>
            </div>
          </div>
        </div>

        {/* Scope of work */}
        <div className="card mb-4">
          <p className="text-xs text-slate-500 mb-1 font-semibold uppercase tracking-wide">
            {lang === "es" ? "Alcance del Trabajo" : "Scope of Work"}
          </p>
          {editing ? (
            <textarea
              className="input resize-none min-h-[80px] text-sm"
              value={scopeOfWork}
              onChange={(e) => setScopeOfWork(e.target.value)}
            />
          ) : (
            <p className="text-sm text-slate-700 leading-relaxed">
              {scopeOfWork || estimate.jobDescription}
            </p>
          )}
        </div>

        {/* ── CONTRACTOR INTERNAL PANEL ─────────────────────────────────── */}
        <div className="mb-4 rounded-2xl border-2 border-amber-300 overflow-hidden">
          <button
            onClick={() => setContractorOpen((o) => !o)}
            className="w-full flex items-center justify-between px-4 py-3 bg-amber-50"
          >
            <div className="flex items-center gap-2">
              <Lock size={15} className="text-amber-700" />
              <span className="font-bold text-amber-800 text-sm">
                {lang === "es" ? "VISTA DEL CONTRATISTA — No visible al cliente" : "CONTRACTOR VIEW — Not visible to customer"}
              </span>
            </div>
            {contractorOpen
              ? <ChevronUp size={18} className="text-amber-700" />
              : <ChevronDown size={18} className="text-amber-700" />}
          </button>

          {contractorOpen && (
            <div className="bg-amber-50 border-t border-amber-200 p-4 space-y-4">
              {/* Estimated hours breakdown */}
              {totalHours > 0 && (
                <div>
                  <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">
                    {lang === "es" ? "Horas estimadas por tarea" : "Estimated Hours by Task"}
                  </p>
                  <div className="space-y-1.5">
                    {lineItems
                      .filter((i) => (i.estimatedHours ?? 0) > 0)
                      .map((item) => (
                        <div key={item.id} className="flex justify-between text-sm text-amber-900">
                          <span className="truncate flex-1 mr-2">{item.description}</span>
                          <span className="font-semibold flex-shrink-0">{item.estimatedHours}h</span>
                        </div>
                      ))}
                    <div className="flex justify-between font-bold text-amber-800 text-base border-t border-amber-300 pt-1 mt-1">
                      <span>{lang === "es" ? "Total horas" : "Total hours"}</span>
                      <span>{totalHours}h</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Labor rate override */}
              <div>
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2">
                  {lang === "es" ? "Tu tarifa por hora" : "Your Hourly Rate"}
                </p>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <DollarSign size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600" />
                    <input
                      type="number"
                      min="0"
                      step="5"
                      className="w-full rounded-xl border-2 border-amber-300 bg-white pl-7 pr-3 py-2.5 text-base font-semibold text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-400"
                      value={laborRate}
                      onChange={(e) => setLaborRate(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <span className="text-amber-700 font-semibold text-sm flex-shrink-0">
                    {lang === "es" ? "/ hora" : "/ hr"}
                  </span>
                </div>
              </div>

              {/* Calculations */}
              {totalHours > 0 && (
                <div className="rounded-xl bg-white border border-amber-200 p-3 space-y-2">
                  <div className="flex justify-between text-sm text-amber-800">
                    <span>{totalHours}h × ${laborRate.toFixed(0)}/hr</span>
                    <span className="font-semibold">${laborValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between text-sm text-amber-800">
                    <span>{lang === "es" ? "Ingresos por mano de obra" : "Labor billed to client"}</span>
                    <span className="font-semibold">${laborRevenue.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                  </div>
                  {laborMargin !== null && (
                    <div className={`flex justify-between text-sm font-bold border-t border-amber-200 pt-2 ${
                      laborMargin >= 20 ? "text-accent-700" : laborMargin >= 0 ? "text-amber-700" : "text-red-600"
                    }`}>
                      <span>{lang === "es" ? "Margen estimado" : "Est. labor margin"}</span>
                      <span>{laborMargin}%</span>
                    </div>
                  )}
                </div>
              )}

              <p className="text-xs text-amber-600 italic text-center">
                {lang === "es"
                  ? "Esta información NUNCA aparece en el PDF ni en la vista del cliente."
                  : "This information NEVER appears on the customer PDF or estimate view."}
              </p>
            </div>
          )}
        </div>

        {/* Photos */}
        {estimate.photos && estimate.photos.length > 0 && (
          <div className="card mb-4">
            <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">
              {lang === "es" ? "Fotos del trabajo" : "Job Photos"}
            </p>
            <div className="grid grid-cols-3 gap-2">
              {estimate.photos.map((src, i) => (
                <div key={i} className="aspect-square rounded-xl overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Line items */}
        <div className="card mb-4">
          <div className="mb-4">
            <DisplayModePicker value={displayMode} onChange={setDisplayMode} lang={lang} />
          </div>
          <div className="flex items-center justify-between mb-3">
            <p className="section-title mb-0">
              {lang === "es" ? "Líneas (solo para ti)" : "Line Items (your eyes only)"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleRegenerate}
                disabled={generating}
                className="flex items-center gap-1 text-xs text-brand-600 font-semibold hover:text-brand-800 transition-colors px-2 py-1 rounded-lg hover:bg-brand-50"
              >
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {lang === "es" ? "Re-generar" : "Re-generate"}
              </button>
              <button
                onClick={() => setEditing(!editing)}
                className="flex items-center gap-1 text-xs text-slate-600 font-semibold hover:text-slate-800 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100"
              >
                <Edit3 size={14} />
                {editing ? (lang === "es" ? "Cancelar" : "Cancel") : (lang === "es" ? "Editar" : "Edit")}
              </button>
            </div>
          </div>

          {editing ? (
            <LineItemEditor items={lineItems} onChange={setLineItems} t={t} />
          ) : (
            <div className="space-y-2">
              {lineItems.map((item) => (
                <div key={item.id} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800">{item.description}</p>
                    <p className="text-xs text-slate-500">
                      {item.quantity} {item.unit} × ${item.unitPrice.toFixed(2)}
                    </p>
                  </div>
                  <span className="text-sm font-semibold text-slate-700 flex-shrink-0">
                    ${item.total.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Totals */}
          <div className="mt-4 pt-3 border-t border-slate-200 space-y-1.5">
            <div className="flex justify-between text-sm text-slate-600">
              <span>{t.subtotal}</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
            {editing ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600 flex-1">{t.taxRate}</span>
                <input
                  type="number" min="0" max="20" step="0.1"
                  className="input w-20 py-1 text-center text-sm"
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                />
                <span className="text-sm">%</span>
              </div>
            ) : (
              <div className="flex justify-between text-sm text-slate-600">
                <span>{t.tax} ({taxRate}%)</span>
                <span>${taxAmount.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-lg text-brand-700 pt-1 border-t border-slate-200">
              <span>{t.estimateTotal}</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {(editing || notes) && (
          <div className="card mb-4">
            <label className="label">{t.notes}</label>
            {editing ? (
              <textarea className="input resize-none" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            ) : (
              <p className="text-sm text-slate-700 leading-relaxed">{notes}</p>
            )}
          </div>
        )}

        {/* Terms */}
        {(editing || terms) && (
          <div className="card mb-4">
            <label className="label">{t.terms}</label>
            {editing ? (
              <textarea className="input resize-none" rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} />
            ) : (
              <p className="text-sm text-slate-500 leading-relaxed">{terms}</p>
            )}
          </div>
        )}

        {/* Save button */}
        {editing && (
          <button onClick={handleSave} disabled={saving} className="btn-primary w-full">
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
            {lang === "es" ? "Guardar Cambios" : "Save Changes"}
          </button>
        )}

        {/* Mark as sent */}
        {!editing && estimate.status === "draft" && (
          <button onClick={cycleStatus} className="btn-primary w-full mt-2">
            <Send size={18} />
            {lang === "es" ? "Marcar como Enviada" : "Mark as Sent"}
          </button>
        )}
      </main>
    </div>
  );
}
