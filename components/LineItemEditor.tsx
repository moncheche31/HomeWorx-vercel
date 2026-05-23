"use client";

import { Plus, Trash2 } from "lucide-react";
import { LineItem } from "@/types";
import { v4 as uuidv4 } from "uuid";
import { Translations } from "@/lib/translations";

interface Props {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  t: Translations;
}

export default function LineItemEditor({ items, onChange, t }: Props) {
  const update = (id: string, field: keyof LineItem, value: string | number) => {
    const updated = items.map((item) => {
      if (item.id !== id) return item;
      const next = { ...item, [field]: value };
      if (field === "quantity" || field === "unitPrice") {
        next.total = Number(next.quantity) * Number(next.unitPrice);
      }
      return next;
    });
    onChange(updated);
  };

  const addItem = () => {
    onChange([
      ...items,
      { id: uuidv4(), description: "", quantity: 1, unit: "each", unitPrice: 0, total: 0 },
    ]);
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  return (
    <div className="space-y-2">
      {/* Header row — hidden on very small screens */}
      <div className="hidden sm:grid grid-cols-[1fr_56px_72px_84px_84px_36px] gap-1 px-1">
        {[t.description, t.qty, t.unit, t.unitPrice, t.lineTotal, ""].map((h, i) => (
          <span key={i} className="text-xs font-semibold text-slate-500 text-center">{h}</span>
        ))}
      </div>

      {items.map((item) => (
        <div key={item.id} className="card p-2 space-y-2 sm:space-y-0 sm:grid sm:grid-cols-[1fr_56px_72px_84px_84px_36px] sm:gap-1 sm:items-center">
          {/* Description */}
          <input
            className="input py-2 text-sm"
            placeholder={t.description}
            value={item.description}
            onChange={(e) => update(item.id, "description", e.target.value)}
          />
          <div className="grid grid-cols-4 gap-1 sm:contents">
            {/* Quantity */}
            <input
              className="input py-2 text-sm text-center"
              type="number"
              min="0"
              step="0.01"
              placeholder={t.qty}
              value={item.quantity || ""}
              onChange={(e) => update(item.id, "quantity", parseFloat(e.target.value) || 0)}
            />
            {/* Unit */}
            <input
              className="input py-2 text-sm text-center"
              placeholder={t.unit}
              value={item.unit}
              onChange={(e) => update(item.id, "unit", e.target.value)}
            />
            {/* Unit price */}
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input
                className="input py-2 pl-5 text-sm text-right"
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={item.unitPrice || ""}
                onChange={(e) => update(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
              />
            </div>
            {/* Total (read-only) */}
            <div className="flex items-center justify-end px-2 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700">
              ${item.total.toFixed(2)}
            </div>
          </div>
          {/* Delete */}
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors mx-auto sm:mx-0"
            aria-label={t.removeItem}
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addItem}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 font-semibold hover:bg-blue-50 active:bg-blue-100 transition-colors text-sm"
      >
        <Plus size={18} />
        {t.addLineItem}
      </button>
    </div>
  );
}
