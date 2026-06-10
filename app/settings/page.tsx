"use client";

import { useState, useEffect, useRef } from "react";
import {
  Check, Plus, Trash2, Building2, Cpu, DollarSign,
  Globe, Phone, Mail, MapPin, ShieldCheck, Upload, X,
  CheckCircle, AlertCircle, Clock, Zap,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import { useLang } from "@/lib/context";
import { useT } from "@/lib/translations";
import {
  loadContractor, saveContractor,
  loadSettings, savePriceTable,
} from "@/lib/storage";
import { ContractorProfile, TradeType, TradePriceTable, PriceTableItem } from "@/types";
import { TRADE_LABELS, DEFAULT_PRICE_TABLES } from "@/lib/pricing";

type Tab = "profile" | "rates" | "integrations";

const TRADES: TradeType[] = [
  "painting", "roofing", "remodeling", "siding",
  "doors-windows", "plumbing", "electrical", "drywall",
];

interface Capabilities {
  whisper:     boolean;
  gpt4o:       boolean;
  claude:      boolean;
  livePrices:  boolean;
  bigbox:      boolean;
  serpapi:     boolean;
  supabase:    boolean;
  priceSource: string;
  aiEngine:    string;
}

export default function SettingsPage() {
  const { lang, setLang } = useLang();
  const t = useT(lang);

  const [activeTab, setActiveTab]   = useState<Tab>("profile");
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);

  const [contractor, setContractor] = useState<ContractorProfile>({
    name: "", company: "", phone: "", email: "", website: "",
    address: "", city: "", state: "", zip: "", license: "",
  });
  const [profileSaved, setProfileSaved] = useState(false);

  const [activeTrade, setActiveTrade] = useState<TradeType>("painting");
  const [priceTable, setPriceTable]   = useState<TradePriceTable>(
    DEFAULT_PRICE_TABLES.find((t) => t.trade === "painting")!,
  );
  const [tableSaved, setTableSaved] = useState(false);

  const logoRef = useRef<HTMLInputElement>(null);

  // Load capabilities from API
  useEffect(() => {
    fetch("/api/capabilities")
      .then((r) => r.json())
      .then(setCapabilities)
      .catch(() => setCapabilities(null));
  }, []);

  useEffect(() => {
    setContractor(loadContractor());
  }, []);

  useEffect(() => {
    const settings = loadSettings();
    const found = settings.priceTables.find((t) => t.trade === activeTrade);
    setPriceTable(found ?? DEFAULT_PRICE_TABLES.find((t) => t.trade === activeTrade)!);
  }, [activeTrade]);

  const handleSaveProfile = () => {
    saveContractor(contractor);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2500);
  };

  const handleSaveTable = () => {
    savePriceTable(priceTable);
    setTableSaved(true);
    setTimeout(() => setTableSaved(false), 2500);
  };

  const updateItem = (id: string, field: keyof PriceTableItem, value: string | number) => {
    setPriceTable((pt) => ({
      ...pt,
      items: pt.items.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    }));
  };

  const addItem = () => {
    setPriceTable((pt) => ({
      ...pt,
      items: [...pt.items, { id: crypto.randomUUID(), description: "", unit: "sq ft", price: 0 }],
    }));
  };

  const removeItem = (id: string) => {
    setPriceTable((pt) => ({ ...pt, items: pt.items.filter((i) => i.id !== id) }));
  };

  const handleLogoUpload = (file: File | null) => {
    if (!file) return;
    if (file.size > 1.5 * 1024 * 1024) {
      alert(lang === "es" ? "El logo es demasiado grande (máx 1.5MB)" : "Logo is too large (max 1.5 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setContractor((c) => ({ ...c, logoDataUrl: e.target!.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "profile",      label: lang === "es" ? "Perfil" : "Profile",       icon: <Building2 size={16} /> },
    { id: "rates",        label: lang === "es" ? "Precios" : "Pricing",      icon: <DollarSign size={16} /> },
    { id: "integrations", label: lang === "es" ? "APIs" : "Integrations",    icon: <Cpu size={16} /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Navbar />

      <main className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        <h1 className="text-2xl font-bold text-slate-800">{t.settings}</h1>

        {/* Language toggle */}
        <div className="card">
          <p className="section-title">{t.language}</p>
          <div className="grid grid-cols-2 gap-3">
            {(["en", "es"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`py-3 rounded-xl border-2 font-semibold transition-all ${
                  lang === l
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-brand-300"
                }`}
              >
                {l === "en" ? `🇺🇸 ${t.english}` : `🇲🇽 ${t.spanish}`}
              </button>
            ))}
          </div>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 bg-slate-200 rounded-xl p-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? "bg-white text-brand-700 shadow-sm"
                  : "text-slate-600 hover:text-slate-800"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── PROFILE TAB ──────────────────────────────────────────────── */}
        {activeTab === "profile" && (
          <div className="card space-y-4">
            <p className="section-title">{t.contractorProfile}</p>

            {/* Logo upload */}
            <div>
              <p className="label">{lang === "es" ? "Logo de la empresa" : "Company Logo"}</p>
              <div className="flex items-center gap-4">
                {contractor.logoDataUrl ? (
                  <div className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={contractor.logoDataUrl}
                      alt="Logo"
                      className="w-20 h-20 rounded-2xl object-contain border-2 border-slate-200 bg-white p-1"
                    />
                    <button
                      onClick={() => setContractor((c) => ({ ...c, logoDataUrl: undefined }))}
                      className="absolute -top-1.5 -right-1.5 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => logoRef.current?.click()}
                    className="w-20 h-20 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50 flex flex-col items-center justify-center text-brand-500 hover:bg-brand-100 transition-colors gap-1"
                  >
                    <Upload size={20} />
                    <span className="text-xs font-medium">Logo</span>
                  </button>
                )}
                <div className="flex-1">
                  <p className="text-sm text-slate-600">{t.logoHint}</p>
                  <p className="text-xs text-slate-400 mt-1">PNG, JPG up to 1.5 MB</p>
                  {!contractor.logoDataUrl && (
                    <button
                      onClick={() => logoRef.current?.click()}
                      className="mt-2 text-xs text-brand-600 font-semibold hover:text-brand-800"
                    >
                      {lang === "es" ? "Subir logo →" : "Upload logo →"}
                    </button>
                  )}
                </div>
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleLogoUpload(e.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            {/* Name / Company */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">
                  <span className="flex items-center gap-1"><ShieldCheck size={12} />{t.yourName}</span>
                </label>
                <input className="input" value={contractor.name}
                  onChange={(e) => setContractor((c) => ({ ...c, name: e.target.value }))}
                  placeholder="John Smith" />
              </div>
              <div>
                <label className="label">
                  <span className="flex items-center gap-1"><Building2 size={12} />{t.companyName}</span>
                </label>
                <input className="input" value={contractor.company}
                  onChange={(e) => setContractor((c) => ({ ...c, company: e.target.value }))}
                  placeholder="Smith Contractors LLC" />
              </div>
            </div>

            {/* Phone / Email */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">
                  <span className="flex items-center gap-1"><Phone size={12} />{t.phoneNumber}</span>
                </label>
                <input className="input" type="tel" value={contractor.phone}
                  onChange={(e) => setContractor((c) => ({ ...c, phone: e.target.value }))}
                  placeholder="(555) 000-0000" />
              </div>
              <div>
                <label className="label">
                  <span className="flex items-center gap-1"><Mail size={12} />{t.emailAddress}</span>
                </label>
                <input className="input" type="email" value={contractor.email}
                  onChange={(e) => setContractor((c) => ({ ...c, email: e.target.value }))}
                  placeholder="john@smithcontractors.com" />
              </div>
            </div>

            {/* Website */}
            <div>
              <label className="label">
                <span className="flex items-center gap-1"><Globe size={12} />{lang === "es" ? "Sitio Web" : "Website"}</span>
              </label>
              <input className="input" type="url" value={contractor.website ?? ""}
                onChange={(e) => setContractor((c) => ({ ...c, website: e.target.value }))}
                placeholder="https://smithcontractors.com" />
            </div>

            {/* Address */}
            <div>
              <label className="label">
                <span className="flex items-center gap-1"><MapPin size={12} />{t.address}</span>
              </label>
              <input className="input" value={contractor.address}
                onChange={(e) => setContractor((c) => ({ ...c, address: e.target.value }))}
                placeholder="123 Main St" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1">
                <label className="label">{t.city}</label>
                <input className="input" value={contractor.city}
                  onChange={(e) => setContractor((c) => ({ ...c, city: e.target.value }))}
                  placeholder="Miami" />
              </div>
              <div>
                <label className="label">{t.state}</label>
                <input className="input" value={contractor.state}
                  onChange={(e) => setContractor((c) => ({ ...c, state: e.target.value }))}
                  placeholder="FL" maxLength={2} />
              </div>
              <div>
                <label className="label">{t.zip}</label>
                <input className="input" value={contractor.zip}
                  onChange={(e) => setContractor((c) => ({ ...c, zip: e.target.value }))}
                  placeholder="33101" maxLength={5} />
              </div>
            </div>

            {/* License */}
            <div>
              <label className="label">{t.licenseNumber}</label>
              <input className="input" value={contractor.license}
                onChange={(e) => setContractor((c) => ({ ...c, license: e.target.value }))}
                placeholder="CGC1234567" />
            </div>

            <button onClick={handleSaveProfile} className="btn-primary w-full">
              {profileSaved ? <CheckCircle size={18} /> : <Check size={18} />}
              {profileSaved
                ? (lang === "es" ? "¡Perfil guardado!" : "Profile saved!")
                : t.saveProfile}
            </button>

            {profileSaved && (
              <p className="text-center text-sm text-accent-600 font-medium">
                ✓ {lang === "es"
                  ? "Este perfil aparecerá automáticamente en todas tus estimaciones."
                  : "This profile will auto-populate on every new estimate."}
              </p>
            )}
          </div>
        )}

        {/* ── PRICING TAB ──────────────────────────────────────────────── */}
        {activeTab === "rates" && (
          <div className="card">
            <p className="section-title">{t.priceTables}</p>
            <p className="text-sm text-slate-500 mb-3">
              {lang === "es"
                ? "Personaliza los precios para tu mercado. La IA los usará como referencia."
                : "Customize prices for your local market. The AI uses these as reference."}
            </p>

            {/* Trade tabs */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {TRADES.map((trade) => (
                <button
                  key={trade}
                  onClick={() => setActiveTrade(trade)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    activeTrade === trade
                      ? "bg-brand-700 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {TRADE_LABELS[trade].icon} {TRADE_LABELS[trade][lang]}
                </button>
              ))}
            </div>

            {/* Labor rate */}
            <div className="mb-3">
              <label className="label">{t.laborRate}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
                <input
                  type="number"
                  className="input pl-7"
                  value={priceTable.laborRate}
                  onChange={(e) => setPriceTable((pt) => ({ ...pt, laborRate: parseFloat(e.target.value) || 0 }))}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {lang === "es" ? "Tarifa predeterminada por hora para este tipo de trabajo." : "Default hourly rate for this trade type."}
              </p>
            </div>

            {/* Price items */}
            <div className="space-y-2">
              {priceTable.items.map((item) => (
                <div key={item.id} className="grid grid-cols-[1fr_64px_72px_36px] gap-1 items-center">
                  <input
                    className="input py-2 text-sm"
                    placeholder={t.itemDescription}
                    value={item.description}
                    onChange={(e) => updateItem(item.id, "description", e.target.value)}
                  />
                  <input
                    className="input py-2 text-sm text-center"
                    placeholder={t.unitLabel}
                    value={item.unit}
                    onChange={(e) => updateItem(item.id, "unit", e.target.value)}
                  />
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
                    <input
                      type="number"
                      className="input py-2 pl-5 text-sm text-right"
                      placeholder="0.00"
                      value={item.price || ""}
                      onChange={(e) => updateItem(item.id, "price", parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <button
                    onClick={() => removeItem(item.id)}
                    className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={addItem}
              className="w-full flex items-center justify-center gap-2 py-2.5 mt-3 rounded-xl border-2 border-dashed border-brand-300 text-brand-600 font-semibold hover:bg-brand-50 transition-colors text-sm"
            >
              <Plus size={16} />
              {t.addItem}
            </button>

            <button onClick={handleSaveTable} className="btn-primary w-full mt-3">
              {tableSaved ? <CheckCircle size={18} /> : null}
              {tableSaved ? (lang === "es" ? "¡Guardado!" : "Saved!") : t.saveTable}
            </button>
          </div>
        )}

        {/* ── INTEGRATIONS TAB ─────────────────────────────────────────── */}
        {activeTab === "integrations" && (
          <div className="space-y-4">
            {/* Live status from /api/capabilities */}
            <div className="card">
              <p className="section-title flex items-center gap-2">
                <Zap size={18} className="text-accent-500" />
                {lang === "es" ? "Estado del Sistema" : "System Status"}
              </p>

              {capabilities === null ? (
                <div className="flex items-center gap-2 text-slate-500 text-sm py-2">
                  <Clock size={16} className="animate-spin" />
                  {lang === "es" ? "Verificando..." : "Checking…"}
                </div>
              ) : (
                <div className="space-y-2">
                  <CapRow
                    label={lang === "es" ? "Motor de IA" : "AI Engine"}
                    value={capabilities.aiEngine === "gpt-4o" ? "GPT-4o (OpenAI)" : capabilities.aiEngine === "claude" ? "Claude (Anthropic)" : "Demo mode"}
                    active={capabilities.aiEngine !== "demo"}
                  />
                  <CapRow
                    label={lang === "es" ? "Transcripción de voz" : "Voice Transcription"}
                    value={capabilities.whisper ? "Whisper AI (OpenAI)" : lang === "es" ? "Navegador (sin clave)" : "Browser fallback (no key)"}
                    active={capabilities.whisper}
                  />
                  <CapRow
                    label={lang === "es" ? "Precios de materiales" : "Material Prices"}
                    value={
                      capabilities.bigbox   ? "BigBox API — Home Depot (live)" :
                      capabilities.serpapi  ? "SerpAPI — Home Depot (live)" :
                      lang === "es" ? "Precios simulados (sin clave)" : "Simulated prices (no key)"
                    }
                    active={capabilities.livePrices}
                  />
                  <CapRow
                    label={lang === "es" ? "Tarifas laborales" : "Labor Rates"}
                    value={lang === "es" ? "Base de datos BLS 2023 (integrada)" : "BLS OES 2023 database (built-in)"}
                    active={true}
                  />
                  <CapRow
                    label="Supabase"
                    value={capabilities.supabase ? lang === "es" ? "Conectado" : "Connected" : lang === "es" ? "No configurado" : "Not configured"}
                    active={capabilities.supabase}
                  />
                </div>
              )}
            </div>

            {/* API Key Instructions */}
            <div className="card space-y-4">
              <p className="font-bold text-slate-800">
                {lang === "es" ? "🔑 Variables de Entorno Requeridas" : "🔑 Required Environment Variables"}
              </p>
              <p className="text-sm text-slate-500">
                {lang === "es"
                  ? "Agrega estas variables a tu archivo .env.local (desarrollo) o en el panel de Vercel → Settings → Environment Variables."
                  : "Add these to your .env.local file (dev) or in Vercel → Settings → Environment Variables."}
              </p>

              <EnvKeyRow
                keyName="OPENAI_API_KEY"
                label={lang === "es" ? "OpenAI — Whisper + GPT-4o" : "OpenAI — Whisper + GPT-4o"}
                description={lang === "es"
                  ? "Activa transcripción de voz por Whisper y estimaciones con GPT-4o. Recomendado."
                  : "Enables Whisper voice transcription and GPT-4o estimates. Recommended."}
                docsUrl="https://platform.openai.com/api-keys"
                active={capabilities?.gpt4o}
              />
              <EnvKeyRow
                keyName="ANTHROPIC_API_KEY"
                label={lang === "es" ? "Anthropic Claude — Estimaciones" : "Anthropic Claude — Estimates"}
                description={lang === "es"
                  ? "Usa Claude para generar estimaciones si no tienes OPENAI_API_KEY."
                  : "Use Claude for estimate generation if you don't have OPENAI_API_KEY."}
                docsUrl="https://console.anthropic.com"
                active={capabilities?.claude}
              />
              <EnvKeyRow
                keyName="BIGBOX_API_KEY"
                label={lang === "es" ? "BigBox API — Precios de Home Depot (en vivo)" : "BigBox API — Live Home Depot Prices"}
                description={lang === "es"
                  ? "Busca precios reales de productos de Home Depot por código postal. $50/mes · 5,000 búsquedas."
                  : "Fetches real Home Depot product prices by ZIP code. ~$50/mo · 5,000 searches."}
                docsUrl="https://bigboxapi.com"
                active={capabilities?.bigbox}
              />
              <EnvKeyRow
                keyName="SERPAPI_KEY"
                label={lang === "es" ? "SerpAPI — Alternativa a BigBox" : "SerpAPI — BigBox Alternative"}
                description={lang === "es"
                  ? "Alternativa para precios de Home Depot si no tienes BigBox. $50/mes."
                  : "Alternative Home Depot pricing source if you don't have BigBox. ~$50/mo."}
                docsUrl="https://serpapi.com"
                active={capabilities?.serpapi}
              />
              <EnvKeyRow
                keyName="NEXT_PUBLIC_SUPABASE_URL"
                label="Supabase URL"
                description={lang === "es"
                  ? "URL del proyecto Supabase para sincronizar datos entre dispositivos. Gratis hasta 500MB."
                  : "Supabase project URL for syncing data across devices. Free up to 500 MB."}
                docsUrl="https://supabase.com/dashboard"
                active={capabilities?.supabase}
              />
              <EnvKeyRow
                keyName="NEXT_PUBLIC_SUPABASE_ANON_KEY"
                label="Supabase Anon Key"
                description={lang === "es"
                  ? "Clave pública de Supabase (requerida con la URL de arriba)."
                  : "Supabase public anon key (required alongside the URL above)."}
                docsUrl="https://supabase.com/dashboard"
                active={capabilities?.supabase}
              />
            </div>

            {/* Supabase schema note */}
            <div className="card bg-brand-50 border-brand-200">
              <p className="font-semibold text-brand-800 text-sm mb-2">
                {lang === "es" ? "📐 Schema de Base de Datos (Supabase)" : "📐 Database Schema (Supabase)"}
              </p>
              <p className="text-xs text-brand-700 leading-relaxed">
                {lang === "es"
                  ? "El archivo de migración está en supabase/migrations/001_initial.sql. Ejecuta npx supabase db push en tu proyecto para crear las tablas."
                  : "Migration file is at supabase/migrations/001_initial.sql. Run npx supabase db push on your project to create all tables."}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ── Helper sub-components ──────────────────────────────────────────────────

function CapRow({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex items-center gap-1.5">
        {active
          ? <CheckCircle size={14} className="text-accent-500 flex-shrink-0" />
          : <AlertCircle size={14} className="text-amber-400 flex-shrink-0" />}
        <span className={`text-xs font-medium ${active ? "text-accent-700" : "text-amber-700"}`}>
          {value}
        </span>
      </div>
    </div>
  );
}

function EnvKeyRow({
  keyName,
  label,
  description,
  docsUrl,
  active,
}: {
  keyName: string;
  label: string;
  description: string;
  docsUrl: string;
  active?: boolean;
}) {
  return (
    <div className={`rounded-xl p-3 border ${active ? "border-accent-200 bg-accent-50" : "border-slate-200 bg-slate-50"}`}>
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <code className={`text-xs font-mono font-bold px-1.5 py-0.5 rounded ${active ? "bg-accent-100 text-accent-800" : "bg-slate-200 text-slate-700"}`}>
            {keyName}
          </code>
          <span className="text-xs text-slate-500 ml-2">{label}</span>
        </div>
        {active !== undefined && (
          active
            ? <CheckCircle size={14} className="text-accent-500 flex-shrink-0 mt-0.5" />
            : <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
        )}
      </div>
      <p className="text-xs text-slate-600 leading-relaxed mb-1.5">{description}</p>
      <a
        href={docsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-brand-600 font-semibold hover:text-brand-800"
      >
        Get key → {docsUrl.replace("https://", "")}
      </a>
    </div>
  );
}
