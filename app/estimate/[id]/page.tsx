"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft, Download, Printer, Share2, Loader2,
  Edit3, Check, Sparkles, Send,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import LineItemEditor from "@/components/LineItemEditor";
import { useLang } from "@/lib/context";
import { useT } from "@/lib/translations";
import { loadEstimate, saveEstimate } from "@/lib/storage";
import { Estimate, EstimateStatus, LineItem } from "@/types";
import { TRADE_LABELS } from "@/lib/pricing";
import { generatePdf } from "@/lib/pdf";

const STATUS_CYCLE: EstimateStatus[] = ["draft", "sent", "accepted", "declined"];

export default function EstimateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { lang } = useLang();
  const t = useT(lang);

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [editing, setEditing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable copies
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [taxRate, setTaxRate] = useState(8);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");

  useEffect(() => {
    const e = loadEstimate(params.id as string);
    if (!e) { router.push("/"); return; }
    setEstimate(e);
    setLineItems(e.lineItems);
    setScopeOfWork(e.scopeOfWork ?? e.jobDescription ?? "");
    setTaxRate(Math.round(e.taxRate * 100 * 10) / 10);
    setNotes(e.notes);
    setTerms(e.terms);
  }, [params.id, router]);

  if (!estimate) return null;

  const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const tradeMeta = TRADE_LABELS[estimate.trade];

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
      scopeOfWork,
      subtotal,
      taxRate: taxRate / 100,
      taxAmount,
      total,
      notes,
      terms,
      updatedAt: new Date().toISOString(),
    };
    setEstimate(updated);
    saveEstimate(updated);
    setEditing(false);
    setSaving(false);
  };

  const handleRegenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/estimate/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trade: estimate.trade,
          description: estimate.jobDescription,
          city: estimate.location.city,
          state: estimate.location.state,
          zip: estimate.location.zip,
          language: lang,
          photos: estimate.photos?.slice(0, 3) ?? [],
        }),
      });
      const data = await res.json();
      const { v4: uuidv4 } = await import("uuid");
      const items: LineItem[] = (data.lineItems ?? []).map(
        (item: Omit<LineItem, "id">) => ({ ...item, id: uuidv4() })
      );
      setLineItems(items);
      setTaxRate(Math.round((data.taxRate ?? 0.08) * 100 * 10) / 10);
      setNotes(data.notes ?? "");
      setEditing(true);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownloadPdf = async () => {
    const pdfEstimate: Estimate = {
      ...estimate,
      lineItems,
      subtotal,
      taxRate: taxRate / 100,
      taxAmount,
      total,
      notes,
      terms,
    };
    await generatePdf(pdfEstimate);
  };

  const handlePrint = async () => {
    await handleDownloadPdf();
  };

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `${t.estimateNumber}${estimate.estimateNumber}`,
        text: `${tradeMeta[lang]} estimate for ${estimate.customer.name}: $${total.toFixed(2)}`,
      });
    } else {
      await handleDownloadPdf();
    }
  };

  const STATUS_LABELS = {
    draft: t.draft,
    sent: t.sent,
    accepted: t.accepted,
    declined: t.declined,
  };

  const STATUS_COLORS: Record<EstimateStatus, string> = {
    draft: "bg-slate-100 text-slate-700 border-slate-300",
    sent: "bg-blue-100 text-blue-700 border-blue-300",
    accepted: "bg-green-100 text-green-700 border-green-300",
    declined: "bg-red-100 text-red-600 border-red-300",
  };

  const createdDate = new Date(estimate.createdAt).toLocaleDateString(
    lang === "es" ? "es-US" : "en-US",
    { month: "long", day: "numeric", year: "numeric" }
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

        {/* Action buttons */}
        <div className="grid grid-cols-3 gap-2 mb-4">
          <button onClick={handleDownloadPdf} className="btn-secondary text-sm py-2.5 flex-col gap-1">
            <Download size={18} />
            <span className="text-xs">{lang === "es" ? "Descargar" : "Download"}</span>
          </button>
          <button onClick={handlePrint} className="btn-secondary text-sm py-2.5 flex-col gap-1">
            <Printer size={18} />
            <span className="text-xs">{lang === "es" ? "Imprimir" : "Print"}</span>
          </button>
          <button onClick={handleShare} className="btn-secondary text-sm py-2.5 flex-col gap-1">
            <Share2 size={18} />
            <span className="text-xs">{lang === "es" ? "Compartir" : "Share"}</span>
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
              <p className="text-2xl font-bold text-blue-700">
                ${total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {lang === "es" ? `Incl. ${(taxRate)}% impuesto` : `Incl. ${taxRate}% tax`}
              </p>
            </div>
          </div>
        </div>

        {/* Scope of work — professional version shown to customer */}
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

        {/* Contractor-only time estimates */}
        {(estimate.totalEstimatedHours ?? 0) > 0 && (
          <div className="card mb-4 bg-amber-50 border-amber-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">⏱️</span>
              <p className="font-bold text-amber-800 text-sm">
                {lang === "es" ? "SOLO PARA EL CONTRATISTA — Tiempo Estimado" : "CONTRACTOR ONLY — Time Estimate"}
              </p>
            </div>
            <p className="text-2xl font-bold text-amber-700">
              {estimate.totalEstimatedHours}h {lang === "es" ? "en total" : "total"}
            </p>
            <p className="text-xs text-amber-600 mt-1 mb-2">
              {lang === "es" ? "No aparece en el PDF del cliente." : "Does not appear on the customer PDF."}
            </p>
            <div className="space-y-1">
              {lineItems.filter(i => (i.estimatedHours ?? 0) > 0).map(item => (
                <div key={item.id} className="flex justify-between text-sm text-amber-800">
                  <span className="truncate flex-1 mr-2">{item.description}</span>
                  <span className="font-semibold flex-shrink-0">{item.estimatedHours}h</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Photos */}
        {estimate.photos && estimate.photos.length > 0 && (
          <div className="card mb-4">
            <p className="text-xs text-slate-500 mb-2 font-semibold uppercase tracking-wide">
              {lang === "es" ? "Fotos" : "Photos"}
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
          <div className="flex items-center justify-between mb-3">
            <p className="section-title mb-0">{lang === "es" ? "Líneas de la Estimación" : "Line Items"}</p>
            <div className="flex gap-2">
              <button
                onClick={handleRegenerate}
                disabled={generating}
                className="flex items-center gap-1 text-xs text-blue-600 font-semibold hover:text-blue-800 transition-colors px-2 py-1 rounded-lg hover:bg-blue-50"
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
            <div className="flex justify-between font-bold text-lg text-blue-700 pt-1 border-t border-slate-200">
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

        {/* Status change helper */}
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
