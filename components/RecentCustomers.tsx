"use client";

import { useState, useEffect } from "react";
import { Clock, X, ChevronDown, ChevronUp } from "lucide-react";
import { loadRecentCustomers, deleteRecentCustomer, SavedCustomer } from "@/lib/storage";
import { Language } from "@/types";

interface Props {
  lang: Language;
  onSelect: (customer: SavedCustomer) => void;
}

export default function RecentCustomers({ lang, onSelect }: Props) {
  const [customers, setCustomers] = useState<SavedCustomer[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setCustomers(loadRecentCustomers());
  }, []);

  if (customers.length === 0) return null;

  const label = lang === "es" ? "Clientes Recientes" : "Recent Customers";
  const selectLabel = lang === "es" ? "Seleccionar" : "Use this customer";
  const removeLabel = lang === "es" ? "Eliminar" : "Remove";

  const handleRemove = (name: string, phone: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteRecentCustomer(name, phone);
    setCustomers((prev) => prev.filter((c) => !(c.name === name && c.phone === phone)));
  };

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 font-semibold text-sm"
      >
        <Clock size={16} />
        <span className="flex-1 text-left">{label}</span>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {open && (
        <div className="mt-2 space-y-2">
          {customers.map((c) => (
            <div
              key={`${c.name}-${c.phone}`}
              className="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-200 shadow-sm"
            >
              <button
                type="button"
                onClick={() => { onSelect(c); setOpen(false); }}
                className="flex-1 text-left"
              >
                <p className="font-semibold text-slate-800 text-sm">{c.name}</p>
                <p className="text-xs text-slate-500">{c.phone}{c.address ? ` • ${c.address}` : ""}</p>
              </button>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => { onSelect(c); setOpen(false); }}
                  className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-lg font-semibold"
                >
                  {selectLabel}
                </button>
                <button
                  type="button"
                  onClick={(e) => handleRemove(c.name, c.phone, e)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50"
                  aria-label={removeLabel}
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
