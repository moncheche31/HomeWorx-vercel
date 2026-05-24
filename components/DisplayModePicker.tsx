"use client";

import { DisplayMode, Language } from "@/types";

interface Props {
  value: DisplayMode;
  onChange: (mode: DisplayMode) => void;
  lang: Language;
}

const OPTIONS: { mode: DisplayMode; en: string; es: string; desc_en: string; desc_es: string }[] = [
  {
    mode: "total-only",
    en: "Total Only",
    es: "Solo Total",
    desc_en: "Customer sees one price",
    desc_es: "El cliente ve un precio",
  },
  {
    mode: "grouped",
    en: "Labor & Materials",
    es: "Mano de Obra y Materiales",
    desc_en: "Two-line breakdown",
    desc_es: "Dos líneas",
  },
  {
    mode: "itemized",
    en: "Full Breakdown",
    es: "Detalle Completo",
    desc_en: "Every line item shown",
    desc_es: "Todas las líneas",
  },
];

export default function DisplayModePicker({ value, onChange, lang }: Props) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
        {lang === "es" ? "¿Qué ve el cliente en el PDF?" : "What does the customer see on the PDF?"}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.mode}
            type="button"
            onClick={() => onChange(opt.mode)}
            className={`flex flex-col items-center text-center p-3 rounded-xl border-2 transition-all ${
              value === opt.mode
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-300"
            }`}
          >
            <span className="text-lg mb-1">
              {opt.mode === "total-only" ? "💰" : opt.mode === "grouped" ? "📊" : "📋"}
            </span>
            <span className="font-semibold text-xs leading-tight">
              {lang === "es" ? opt.es : opt.en}
            </span>
            <span className="text-[10px] text-slate-400 leading-tight mt-0.5">
              {lang === "es" ? opt.desc_es : opt.desc_en}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
