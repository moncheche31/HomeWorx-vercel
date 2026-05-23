"use client";

import { TradeType, Language } from "@/types";
import { TRADE_LABELS } from "@/lib/pricing";

const TRADES: TradeType[] = [
  "painting", "roofing", "remodeling", "siding",
  "doors-windows", "plumbing", "electrical", "drywall",
];

interface Props {
  selected: TradeType | null;
  onSelect: (trade: TradeType) => void;
  lang: Language;
  label: string;
}

export default function TradeSelector({ selected, onSelect, lang, label }: Props) {
  return (
    <div>
      <p className="section-title">{label}</p>
      <div className="grid grid-cols-2 gap-3">
        {TRADES.map((trade) => {
          const meta = TRADE_LABELS[trade];
          const isSelected = selected === trade;
          return (
            <button
              key={trade}
              onClick={() => onSelect(trade)}
              className={`flex flex-col items-center justify-center gap-1.5 p-4 rounded-2xl border-2 transition-all duration-150 active:scale-95 ${
                isSelected
                  ? "border-blue-600 bg-blue-50 shadow-md"
                  : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
              }`}
            >
              <span className="text-3xl">{meta.icon}</span>
              <span className={`text-sm font-semibold text-center leading-tight ${isSelected ? "text-blue-700" : "text-slate-700"}`}>
                {meta[lang]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
