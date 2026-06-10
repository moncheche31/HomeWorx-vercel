"use client";

import Link from "next/link";
import { Trash2, ChevronRight } from "lucide-react";
import { Estimate } from "@/types";
import { TRADE_LABELS } from "@/lib/pricing";
import { useT } from "@/lib/translations";
import { useLang } from "@/lib/context";

const STATUS_STYLES: Record<Estimate["status"], string> = {
  draft:    "bg-slate-100 text-slate-600",
  sent:     "bg-brand-100 text-brand-700",
  accepted: "bg-accent-100 text-accent-700",
  declined: "bg-red-100 text-red-600",
};

interface Props {
  estimate: Estimate;
  onDelete: (id: string) => void;
}

export default function EstimateCard({ estimate, onDelete }: Props) {
  const { lang } = useLang();
  const t = useT(lang);
  const tradeMeta = TRADE_LABELS[estimate.trade];
  const statusLabel = t[estimate.status as keyof typeof t] as string;

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    if (confirm(t.confirmDelete)) onDelete(estimate.id);
  };

  const createdDate = new Date(estimate.createdAt).toLocaleDateString(
    lang === "es" ? "es-US" : "en-US",
    { month: "short", day: "numeric", year: "numeric" },
  );

  return (
    <Link
      href={`/estimate/${estimate.id}`}
      className="card flex items-center gap-3 hover:shadow-md transition-shadow active:scale-[0.99] no-underline"
    >
      {/* Trade icon */}
      <div className="w-12 h-12 rounded-xl bg-brand-50 flex items-center justify-center text-2xl flex-shrink-0">
        {tradeMeta?.icon ?? "🏠"}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-semibold text-slate-800 truncate">
            {estimate.customer.name || "—"}
          </span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[estimate.status]}`}>
            {statusLabel}
          </span>
        </div>
        <div className="text-sm text-slate-500 truncate">
          {tradeMeta?.[lang] ?? estimate.trade} • #{estimate.estimateNumber}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">{createdDate}</div>
      </div>

      {/* Total + actions */}
      <div className="flex flex-col items-end gap-2 flex-shrink-0">
        <span className="font-bold text-brand-700 text-base">
          ${estimate.total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            aria-label={t.deleteEstimate}
          >
            <Trash2 size={16} />
          </button>
          <ChevronRight size={16} className="text-slate-400" />
        </div>
      </div>
    </Link>
  );
}
