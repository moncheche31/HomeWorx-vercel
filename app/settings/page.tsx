"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import Navbar from "@/components/Navbar";
import { useLang } from "@/lib/context";
import { useT } from "@/lib/translations";
import {
  loadContractor, saveContractor,
  loadSettings, savePriceTable,
} from "@/lib/storage";
import { ContractorProfile, TradeType, TradePriceTable, PriceTableItem } from "@/types";
import { TRADE_LABELS, DEFAULT_PRICE_TABLES } from "@/lib/pricing";
import { v4 as uuidv4 } from "uuid";

const TRADES: TradeType[] = [
  "painting", "roofing", "remodeling", "siding",
  "doors-windows", "plumbing", "electrical", "drywall",
];

export default function SettingsPage() {
  const { lang, setLang } = useLang();
  const t = useT(lang);

  const [contractor, setContractor] = useState<ContractorProfile>({
    name: "", company: "", phone: "", email: "",
    address: "", city: "", state: "", zip: "", license: "",
  });
  const [profileSaved, setProfileSaved] = useState(false);

  const [activeTrade, setActiveTrade] = useState<TradeType>("painting");
  const [priceTable, setPriceTable] = useState<TradePriceTable>(
    DEFAULT_PRICE_TABLES.find((t) => t.trade === "painting")!
  );
  const [tableSaved, setTableSaved] = useState(false);

  const logoRef = useRef<HTMLInputElement>(null);

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
      items: [...pt.items, { id: uuidv4(), description: "", unit: "sq ft", price: 0 }],
    }));
  };

  const removeItem = (id: string) => {
    setPriceTable((pt) => ({ ...pt, items: pt.items.filter((i) => i.id !== id) }));
  };

  const handleLogoUpload = (file: File | null) => {
    if (!file) return;
    if (file.size > 1 * 1024 * 1024) {
      alert(lang === "es" ? "El logo es demasiado grande (máx 1MB)" : "Logo is too large (max 1MB)");
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

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Navbar />

      <main className="max-w-lg mx-auto px-4 pt-4 space-y-5">
        <h1 className="text-2xl font-bold text-slate-800">{t.settings}</h1>

        {/* Language */}
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

        {/* Contractor profile */}
        <div className="card space-y-3">
          <p className="section-title">{t.contractorProfile}</p>

          {/* Logo */}
          <div className="flex items-center gap-3">
            {contractor.logoDataUrl ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={contractor.logoDataUrl} alt="Logo" className="w-16 h-16 rounded-xl object-cover border" />
                <button
                  onClick={() => setContractor((c) => ({ ...c, logoDataUrl: undefined }))}
                  className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center text-xs"
                >×</button>
              </div>
            ) : (
              <button
                onClick={() => logoRef.current?.click()}
                className="w-16 h-16 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 text-xs text-center font-medium hover:border-blue-400 hover:text-blue-500 transition-colors"
              >
                {lang === "es" ? "Logo" : "Logo"}
              </button>
            )}
            <div className="text-xs text-slate-500">{t.logoHint}</div>
            <input
              ref={logoRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleLogoUpload(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">{t.yourName}</label>
              <input className="input" value={contractor.name} onChange={(e) => setContractor((c) => ({ ...c, name: e.target.value }))} placeholder="John Smith" />
            </div>
            <div>
              <label className="label">{t.companyName}</label>
              <input className="input" value={contractor.company} onChange={(e) => setContractor((c) => ({ ...c, company: e.target.value }))} placeholder="Smith Contractors" />
            </div>
            <div>
              <label className="label">{t.phoneNumber}</label>
              <input className="input" type="tel" value={contractor.phone} onChange={(e) => setContractor((c) => ({ ...c, phone: e.target.value }))} placeholder="(555) 000-0000" />
            </div>
            <div>
              <label className="label">{t.emailAddress}</label>
              <input className="input" type="email" value={contractor.email} onChange={(e) => setContractor((c) => ({ ...c, email: e.target.value }))} placeholder="email@..." />
            </div>
          </div>
          <div>
            <label className="label">{t.address}</label>
            <input className="input" value={contractor.address} onChange={(e) => setContractor((c) => ({ ...c, address: e.target.value }))} placeholder="123 Main St" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-1">
              <label className="label">{t.city}</label>
              <input className="input" value={contractor.city} onChange={(e) => setContractor((c) => ({ ...c, city: e.target.value }))} placeholder="Miami" />
            </div>
            <div>
              <label className="label">{t.state}</label>
              <input className="input" value={contractor.state} onChange={(e) => setContractor((c) => ({ ...c, state: e.target.value }))} placeholder="FL" maxLength={2} />
            </div>
            <div>
              <label className="label">{t.zip}</label>
              <input className="input" value={contractor.zip} onChange={(e) => setContractor((c) => ({ ...c, zip: e.target.value }))} placeholder="33101" maxLength={5} />
            </div>
          </div>
          <div>
            <label className="label">{t.licenseNumber}</label>
            <input className="input" value={contractor.license} onChange={(e) => setContractor((c) => ({ ...c, license: e.target.value }))} placeholder="CGC1234567" />
          </div>

          <button onClick={handleSaveProfile} className="btn-primary w-full">
            {profileSaved ? <Check size={18} /> : null}
            {profileSaved ? (lang === "es" ? "¡Guardado!" : "Saved!") : t.saveProfile}
          </button>
        </div>

        {/* Price tables */}
        <div className="card">
          <p className="section-title">{t.priceTables}</p>
          <p className="text-sm text-slate-500 mb-3">
            {lang === "es"
              ? "Ajusta los precios para tu mercado local. La IA también usará estos valores como referencia."
              : "Adjust prices for your local market. The AI will also use these as a reference."}
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
                onChange={(e) =>
                  setPriceTable((pt) => ({ ...pt, laborRate: parseFloat(e.target.value) || 0 }))
                }
              />
            </div>
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
            {tableSaved ? <Check size={18} /> : null}
            {tableSaved ? (lang === "es" ? "¡Guardado!" : "Saved!") : t.saveTable}
          </button>
        </div>

        {/* API key note */}
        <div className="card bg-amber-50 border-amber-200">
          <p className="font-semibold text-amber-800 text-sm mb-1">
            {lang === "es" ? "🔑 Clave API de Anthropic" : "🔑 Anthropic API Key"}
          </p>
          <p className="text-xs text-amber-700 leading-relaxed">
            {lang === "es"
              ? "Para estimaciones precisas con IA y datos del mercado local, agrega ANTHROPIC_API_KEY a tu archivo .env.local de Vercel. Sin la clave, se muestran estimaciones de demostración."
              : "For accurate AI estimates with local market data, add ANTHROPIC_API_KEY to your Vercel .env.local file. Without the key, demo estimates are shown."}
          </p>
        </div>
      </main>
    </div>
  );
}
