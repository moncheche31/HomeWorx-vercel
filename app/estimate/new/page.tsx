"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import Navbar from "@/components/Navbar";
import TradeSelector from "@/components/TradeSelector";
import VoiceInput from "@/components/VoiceInput";
import PhotoUpload from "@/components/PhotoUpload";
import LineItemEditor from "@/components/LineItemEditor";
import { useLang } from "@/lib/context";
import { useT } from "@/lib/translations";
import { saveEstimate, loadContractor, nextEstimateNumber, saveRecentCustomer } from "@/lib/storage";
import { TradeType, LineItem, Estimate, DisplayMode } from "@/types";
import RecentCustomers from "@/components/RecentCustomers";
import DisplayModePicker from "@/components/DisplayModePicker";
import { compressPhoto } from "@/lib/compress";

const TOTAL_STEPS = 4;

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center my-4">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i < current ? "bg-brand-700 w-6" : i === current - 1 ? "bg-brand-500 w-8" : "bg-slate-300 w-3"
          }`}
        />
      ))}
    </div>
  );
}

export default function NewEstimatePage() {
  const router = useRouter();
  const { lang } = useLang();
  const t = useT(lang);

  const [step, setStep] = useState(1);

  // Step 1 — Trade & Customer
  const [trade, setTrade] = useState<TradeType | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [jobAddress, setJobAddress] = useState("");
  const [jobCity, setJobCity] = useState("");
  const [jobState, setJobState] = useState("");
  const [jobZip, setJobZip] = useState("");

  // Step 2 — Description
  const [description, setDescription] = useState("");

  // Step 3 — Photos
  const [photos, setPhotos] = useState<string[]>([]);

  // Step 4 — Estimate
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("total-only");
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [totalEstimatedHours, setTotalEstimatedHours] = useState(0);
  const [taxRate, setTaxRate] = useState(8);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [validDays, setValidDays] = useState(30);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [generateError, setGenerateError] = useState("");

  const handleTranscript = useCallback((text: string) => {
    setDescription(text);
  }, []);

  const canAdvance = () => {
    if (step === 1) return trade !== null && customerName.trim() !== "";
    if (step === 2) return true; // photos are optional
    if (step === 3) return description.trim().length > 5;
    return true;
  };

  const generateEstimate = async () => {
    if (!trade) return;
    setGenerating(true);
    setGenerateError("");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45_000); // 45s hard timeout

    try {
      // Compress photos before sending — phone photos are 4-5MB each and will freeze the request
      const compressed = await Promise.all(photos.slice(0, 3).map(compressPhoto));

      const res = await fetch("/api/estimate/generate", {
        method: "POST",
        signal: controller.signal,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trade,
          description,
          city: jobCity,
          state: jobState,
          zip: jobZip,
          language: lang,
          photos: compressed,
        }),
      });

      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();

      const items: LineItem[] = (data.lineItems ?? []).map(
        (item: Omit<LineItem, "id">) => ({ ...item, id: crypto.randomUUID() })
      );
      setLineItems(items);
      setScopeOfWork(data.scopeOfWork ?? "");
      setTotalEstimatedHours(data.totalEstimatedHours ?? 0);
      setTaxRate(Math.round((data.taxRate ?? 0.08) * 100 * 10) / 10);
      setNotes(data.notes ?? "");
      setGenerated(true);
    } catch (err) {
      const msg = err instanceof Error && err.name === "AbortError"
        ? (lang === "es" ? "Tiempo de espera agotado. Intenta de nuevo." : "Request timed out. Please try again.")
        : (lang === "es" ? "Error al generar. Intenta de nuevo." : "Generation failed. Please try again.");
      setGenerateError(msg);
      console.error(err);
    } finally {
      clearTimeout(timeout);
      setGenerating(false);
    }
  };

  const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const handleFinish = () => {
    // Save customer for quick re-use next time
    if (customerName.trim()) {
      saveRecentCustomer({
        name: customerName, phone: customerPhone, email: customerEmail,
        address: jobAddress, city: jobCity, state: jobState, zip: jobZip,
        lastUsed: new Date().toISOString(),
      });
    }
    const contractor = loadContractor();
    const estimate: Estimate = {
      id: crypto.randomUUID(),
      estimateNumber: nextEstimateNumber(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: "draft",
      trade: trade!,
      contractor,
      customer: {
        name: customerName,
        phone: customerPhone,
        email: customerEmail,
        address: jobAddress,
        city: jobCity,
        state: jobState,
        zip: jobZip,
      },
      jobDescription: description,
      scopeOfWork,
      totalEstimatedHours,
      displayMode,
      jobAddress: [jobAddress, jobCity, jobState, jobZip].filter(Boolean).join(", "),
      location: { city: jobCity, state: jobState, zip: jobZip },
      photos,
      lineItems,
      subtotal,
      taxRate: taxRate / 100,
      taxAmount,
      total,
      notes,
      terms,
      validDays,
      language: lang,
    };

    // Save locally first — works offline, zero network dependency.
    saveEstimate(estimate);

    // Sync to server. The API always returns 200 with { success, savedLocally, data }.
    // If it returns the estimate back (savedLocally: true), refresh localStorage with
    // the canonical copy. Any network failure is silently caught — localStorage wins.
    fetch("/api/estimates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(estimate),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (payload?.savedLocally && payload?.data) {
          saveEstimate(payload.data as Estimate);
        }
      })
      .catch(() => {});

    router.push(`/estimate/${estimate.id}`);
  };

  const next = async () => {
    if (step === TOTAL_STEPS) {
      handleFinish();
    } else {
      // Step 3 is now "Describe Job" — generate before showing step 4
      if (step === 3 && lineItems.length === 0) {
        await generateEstimate();
      }
      setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    }
  };

  const back = () => setStep((s) => Math.max(s - 1, 1));

  // Step order: 1=Trade&Customer  2=Photos  3=Describe  4=Review
  const stepLabel = [t.step1, t.step3, t.step2, t.step4][step - 1];

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Navbar />

      <main className="max-w-lg mx-auto px-4">
        {/* Step header */}
        <StepIndicator current={step} total={TOTAL_STEPS} />
        <h1 className="text-xl font-bold text-slate-800 text-center mb-4">
          {stepLabel}
        </h1>

        {/* STEP 1: Trade & Customer */}
        {step === 1 && (
          <div className="space-y-5 fade-in">
            <TradeSelector
              selected={trade}
              onSelect={setTrade}
              lang={lang}
              label={t.selectTrade}
            />

            <div className="card space-y-3">
              <p className="section-title">{lang === "es" ? "Información del Cliente" : "Customer Info"}</p>

              {/* Quick-fill from recent customers */}
              <RecentCustomers
                lang={lang}
                onSelect={(c) => {
                  setCustomerName(c.name);
                  setCustomerPhone(c.phone);
                  setCustomerEmail(c.email);
                  setJobAddress(c.address);
                  setJobCity(c.city);
                  setJobState(c.state);
                  setJobZip(c.zip);
                }}
              />

              <div>
                <label className="label">{t.customerName} *</label>
                <input className="input" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="John Smith" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t.customerPhone}</label>
                  <input className="input" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="(555) 000-0000" />
                </div>
                <div>
                  <label className="label">{t.customerEmail}</label>
                  <input className="input" type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} placeholder="email@..." />
                </div>
              </div>
              <div>
                <label className="label">{t.jobAddress}</label>
                <input className="input" value={jobAddress} onChange={(e) => setJobAddress(e.target.value)} placeholder="123 Main St" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1">
                  <label className="label">{t.jobCity}</label>
                  <input className="input" value={jobCity} onChange={(e) => setJobCity(e.target.value)} placeholder="Miami" />
                </div>
                <div>
                  <label className="label">{t.jobState}</label>
                  <input className="input" value={jobState} onChange={(e) => setJobState(e.target.value)} placeholder="FL" maxLength={2} />
                </div>
                <div>
                  <label className="label">{t.jobZip}</label>
                  <input className="input" type="text" inputMode="numeric" value={jobZip} onChange={(e) => setJobZip(e.target.value)} placeholder="33101" maxLength={5} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Photos first — take them before describing the job */}
        {step === 2 && (
          <div className="space-y-4 fade-in">
            <div className="card">
              <p className="text-sm text-slate-500 mb-4">
                {lang === "es"
                  ? "Toma fotos del área de trabajo ahora. Podrás verlas en la siguiente pantalla mientras describes el trabajo."
                  : "Take photos of the work area first. You'll see them on the next screen while you describe the job."}
              </p>
              <PhotoUpload
                photos={photos}
                onAdd={(url) => setPhotos((p) => [...p, url])}
                onRemove={(i) => setPhotos((p) => p.filter((_, idx) => idx !== i))}
                lang={lang}
                takePhoto={t.takePhoto}
                choosePhoto={t.choosePhoto}
                removePhoto={t.removePhoto}
              />
              {photos.length > 0 && (
                <p className="text-sm text-green-600 font-semibold text-center mt-3">
                  ✓ {photos.length} {t.photosAdded}
                </p>
              )}
            </div>
            <p className="text-xs text-slate-400 text-center">
              {lang === "es" ? "Las fotos son opcionales — toca Siguiente para continuar" : "Photos are optional — tap Next to continue"}
            </p>
          </div>
        )}

        {/* STEP 3: Describe the job — photos shown above mic for reference */}
        {step === 3 && (
          <div className="space-y-4 fade-in">
            {/* Photo reference strip */}
            {photos.length > 0 && (
              <div className="card">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
                  {lang === "es" ? "Fotos de referencia" : "Reference Photos"}
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {photos.map((src, i) => (
                    <div key={i} className="flex-shrink-0 w-24 h-24 rounded-xl overflow-hidden border border-slate-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="card">
              <p className="text-sm text-slate-500 mb-4">
                {lang === "es"
                  ? "Mira las fotos y describe el trabajo. Menciona dimensiones, materiales y detalles."
                  : "Look at your photos and describe the job. Mention dimensions, materials, and any details."}
              </p>
              <VoiceInput
                lang={lang}
                onTranscript={handleTranscript}
                tapToSpeak={t.tapToSpeak}
                listening={t.listening}
                stopListening={t.stopListening}
              />
            </div>

            <div className="card">
              <p className="text-sm text-slate-500 text-center mb-3">{t.orTypeBelow}</p>
              <label className="label">{t.jobDescription}</label>
              <textarea
                className="input min-h-[120px] resize-none"
                placeholder={t.jobDescriptionPlaceholder}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* STEP 4: Review / Edit Estimate */}
        {step === 4 && (
          <div className="space-y-4 fade-in">
            {/* Generate button if not yet generated */}
            {!generated && lineItems.length === 0 && (
              <div className="card text-center py-6">
                <div className="text-4xl mb-3">{generating ? "⏳" : "🤖"}</div>
                <p className="text-slate-600 text-sm mb-4">
                  {generating
                    ? (lang === "es" ? "Generando tu estimación… puede tomar hasta 30 segundos." : "Generating your estimate… this can take up to 30 seconds.")
                    : (lang === "es" ? "Genera una estimación con IA basada en tu descripción y ubicación." : "Generate an AI estimate based on your description and location.")}
                </p>
                {generateError && (
                  <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm font-medium">
                    ⚠️ {generateError}
                  </div>
                )}
                <button
                  onClick={generateEstimate}
                  disabled={generating}
                  className="btn-primary mx-auto"
                >
                  {generating ? (
                    <><Loader2 size={18} className="animate-spin" />{t.generating}</>
                  ) : (
                    <><Sparkles size={18} />{generateError ? (lang === "es" ? "Intentar de nuevo" : "Try Again") : t.generateEstimate}</>
                  )}
                </button>
              </div>
            )}

            {/* Line items */}
            {(generated || lineItems.length > 0) && (
              <>
                {/* Scope of work — professional version */}
                <div className="card">
                  <p className="section-title">{lang === "es" ? "Alcance del Trabajo (para el cliente)" : "Scope of Work (shown to customer)"}</p>
                  <p className="text-xs text-slate-500 mb-2">
                    {lang === "es"
                      ? "Texto profesional reescrito por IA. Edita si es necesario."
                      : "Professionally rewritten by AI from your voice description. Edit if needed."}
                  </p>
                  <textarea
                    className="input resize-none min-h-[100px]"
                    value={scopeOfWork}
                    onChange={(e) => setScopeOfWork(e.target.value)}
                    placeholder={lang === "es" ? "Descripción profesional del trabajo..." : "Professional scope of work..."}
                  />
                </div>

                {/* Contractor-only time estimate */}
                {totalEstimatedHours > 0 && (
                  <div className="card bg-amber-50 border-amber-200">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">⏱️</span>
                      <p className="font-bold text-amber-800">
                        {lang === "es" ? "Tiempo Estimado (solo para ti)" : "Time Estimate (Contractor Eyes Only)"}
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-amber-700 mb-1">
                      {totalEstimatedHours} {lang === "es" ? "horas en total" : "hours total"}
                    </p>
                    <p className="text-xs text-amber-600">
                      {lang === "es"
                        ? "Este tiempo NO aparece en la estimación del cliente. Úsalo para planificar tu agenda."
                        : "This time does NOT appear on the customer estimate. Use it to plan your schedule."}
                    </p>
                    <div className="mt-3 space-y-1">
                      {lineItems.filter(i => (i.estimatedHours ?? 0) > 0).map(item => (
                        <div key={item.id} className="flex justify-between text-sm text-amber-800">
                          <span className="truncate flex-1 mr-2">{item.description}</span>
                          <span className="font-semibold flex-shrink-0">{item.estimatedHours}h</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Display mode — what customer sees */}
                <div className="card">
                  <DisplayModePicker value={displayMode} onChange={setDisplayMode} lang={lang} />
                </div>

                <div className="card">
                  <p className="section-title">{lang === "es" ? "Líneas de la Estimación (solo para ti)" : "Line Items (your eyes only)"}</p>
                  <LineItemEditor items={lineItems} onChange={setLineItems} t={t} />
                </div>

                {/* Totals */}
                <div className="card">
                  <p className="section-title">{lang === "es" ? "Totales" : "Totals"}</p>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>{t.subtotal}</span>
                      <span className="font-medium">${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600 flex-1">{t.taxRate}</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          max="20"
                          step="0.1"
                          className="input w-20 py-1 text-center text-sm"
                          value={taxRate}
                          onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                        />
                        <span className="text-sm text-slate-500">%</span>
                      </div>
                    </div>
                    <div className="flex justify-between text-sm text-slate-600">
                      <span>{t.tax}</span>
                      <span>${taxAmount.toFixed(2)}</span>
                    </div>
                    <div className="h-px bg-slate-200" />
                    <div className="flex justify-between font-bold text-lg text-brand-700">
                      <span>{t.estimateTotal}</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Notes & Terms */}
                <div className="card space-y-3">
                  <div>
                    <label className="label">{t.notes}</label>
                    <textarea
                      className="input resize-none"
                      rows={3}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder={lang === "es" ? "Notas adicionales para el cliente..." : "Additional notes for the customer..."}
                    />
                  </div>
                  <div>
                    <label className="label">{t.terms}</label>
                    <textarea
                      className="input resize-none"
                      rows={3}
                      value={terms}
                      onChange={(e) => setTerms(e.target.value)}
                      placeholder={lang === "es" ? "Términos de pago y condiciones..." : "Payment terms and conditions..."}
                    />
                  </div>
                  <div>
                    <label className="label">{t.validFor}</label>
                    <input
                      type="number"
                      className="input"
                      value={validDays}
                      onChange={(e) => setValidDays(parseInt(e.target.value) || 30)}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-3 mt-6">
          {step > 1 && (
            <button onClick={back} className="btn-secondary flex-1">
              <ChevronLeft size={18} />
              {t.back}
            </button>
          )}
          <button
            onClick={next}
            disabled={!canAdvance() || generating}
            className="btn-primary flex-1"
          >
            {generating ? (
              <><Loader2 size={18} className="animate-spin" />{t.generating}</>
            ) : step === TOTAL_STEPS ? (
              lang === "es" ? "Guardar Estimación" : "Save Estimate"
            ) : (
              <>{t.next}<ChevronRight size={18} /></>
            )}
          </button>
        </div>
      </main>
    </div>
  );
}
