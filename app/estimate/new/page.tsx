"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2, Sparkles, SkipForward } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import Navbar from "@/components/Navbar";
import TradeSelector from "@/components/TradeSelector";
import VoiceInput from "@/components/VoiceInput";
import PhotoUpload from "@/components/PhotoUpload";
import LineItemEditor from "@/components/LineItemEditor";
import { useLang } from "@/lib/context";
import { useT } from "@/lib/translations";
import { saveEstimate, loadContractor, nextEstimateNumber } from "@/lib/storage";
import { TradeType, LineItem, Estimate } from "@/types";

const TOTAL_STEPS = 4;

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5 justify-center my-4">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`h-2 rounded-full transition-all duration-300 ${
            i < current ? "bg-blue-700 w-6" : i === current - 1 ? "bg-blue-500 w-8" : "bg-slate-300 w-3"
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
  const [taxRate, setTaxRate] = useState(8);
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [validDays, setValidDays] = useState(30);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);

  const handleTranscript = useCallback((text: string) => {
    setDescription(text);
  }, []);

  const canAdvance = () => {
    if (step === 1) return trade !== null && customerName.trim() !== "";
    if (step === 2) return description.trim().length > 5;
    return true;
  };

  const generateEstimate = async () => {
    if (!trade) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/estimate/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trade,
          description,
          city: jobCity,
          state: jobState,
          zip: jobZip,
          language: lang,
          photos: photos.slice(0, 3),
        }),
      });
      const data = await res.json();

      const items: LineItem[] = (data.lineItems ?? []).map(
        (item: Omit<LineItem, "id">) => ({ ...item, id: uuidv4() })
      );
      setLineItems(items);
      setTaxRate(Math.round((data.taxRate ?? 0.08) * 100 * 10) / 10);
      setNotes(data.notes ?? "");
      setGenerated(true);
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  };

  const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const handleFinish = () => {
    const contractor = loadContractor();
    const estimate: Estimate = {
      id: uuidv4(),
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
    saveEstimate(estimate);
    router.push(`/estimate/${estimate.id}`);
  };

  const next = async () => {
    if (step === TOTAL_STEPS) {
      handleFinish();
    } else {
      // Wait for estimate to finish before advancing to step 4
      if (step === 3 && lineItems.length === 0) {
        await generateEstimate();
      }
      setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    }
  };

  const back = () => setStep((s) => Math.max(s - 1, 1));

  const stepLabel = [t.step1, t.step2, t.step3, t.step4][step - 1];

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

        {/* STEP 2: Voice / Text description */}
        {step === 2 && (
          <div className="space-y-5 fade-in">
            <div className="card">
              <p className="text-sm text-slate-500 mb-4">{t.describeJobHint}</p>
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

        {/* STEP 3: Photos */}
        {step === 3 && (
          <div className="space-y-4 fade-in">
            <div className="card">
              <p className="text-sm text-slate-500 mb-4">{t.addPhotosHint}</p>
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
                <p className="text-sm text-slate-500 text-center mt-3">
                  {photos.length} {t.photosAdded}
                </p>
              )}
            </div>
          </div>
        )}

        {/* STEP 4: Review / Edit Estimate */}
        {step === 4 && (
          <div className="space-y-4 fade-in">
            {/* Generate button if not yet generated */}
            {!generated && lineItems.length === 0 && (
              <div className="card text-center py-6">
                <div className="text-4xl mb-3">🤖</div>
                <p className="text-slate-600 text-sm mb-4">
                  {lang === "es"
                    ? "Genera una estimación con IA basada en la descripción del trabajo y la ubicación."
                    : "Generate an AI estimate based on the job description and location."}
                </p>
                <button
                  onClick={generateEstimate}
                  disabled={generating}
                  className="btn-primary mx-auto"
                >
                  {generating ? (
                    <><Loader2 size={18} className="animate-spin" />{t.generating}</>
                  ) : (
                    <><Sparkles size={18} />{t.generateEstimate}</>
                  )}
                </button>
              </div>
            )}

            {/* Line items */}
            {(generated || lineItems.length > 0) && (
              <>
                <div className="card">
                  <p className="section-title">{lang === "es" ? "Líneas de la Estimación" : "Line Items"}</p>
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
                    <div className="flex justify-between font-bold text-lg text-blue-700">
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
          {step === 3 && (
            <button
              onClick={async () => {
                await generateEstimate();
                setStep(4);
              }}
              disabled={generating}
              className="btn-secondary"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <SkipForward size={16} />}
              {t.skipPhotos}
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
