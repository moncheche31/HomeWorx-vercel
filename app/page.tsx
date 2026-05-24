"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { PlusCircle, TrendingUp, FileText, Clock } from "lucide-react";
import Navbar from "@/components/Navbar";
import EstimateCard from "@/components/EstimateCard";
import { Estimate } from "@/types";
import { loadEstimates, deleteEstimate, duplicateEstimate } from "@/lib/storage";
import { useLang } from "@/lib/context";
import { useT } from "@/lib/translations";

export default function DashboardPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const { lang } = useLang();
  const t = useT(lang);

  useEffect(() => {
    setEstimates(loadEstimates());
  }, []);

  const handleDelete = (id: string) => {
    deleteEstimate(id);
    setEstimates((prev) => prev.filter((e) => e.id !== id));
  };

  const handleDuplicate = (id: string) => {
    const copy = duplicateEstimate(id);
    if (copy) setEstimates((prev) => [copy, ...prev]);
  };

  const totalRevenue = estimates
    .filter((e) => e.status === "accepted")
    .reduce((sum, e) => sum + e.total, 0);

  const sentCount = estimates.filter((e) => e.status === "sent").length;
  const draftCount = estimates.filter((e) => e.status === "draft").length;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <Navbar />

      <main className="max-w-lg mx-auto px-4 pt-4">
        {/* Stats cards */}
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="card text-center p-3">
            <div className="flex justify-center mb-1">
              <TrendingUp size={20} className="text-green-600" />
            </div>
            <div className="text-lg font-bold text-slate-800">
              ${totalRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
            </div>
            <div className="text-xs text-slate-500 leading-tight">
              {lang === "es" ? "Ingresos" : "Accepted"}
            </div>
          </div>
          <div className="card text-center p-3">
            <div className="flex justify-center mb-1">
              <Clock size={20} className="text-blue-600" />
            </div>
            <div className="text-lg font-bold text-slate-800">{sentCount}</div>
            <div className="text-xs text-slate-500">{t.sent}</div>
          </div>
          <div className="card text-center p-3">
            <div className="flex justify-center mb-1">
              <FileText size={20} className="text-slate-500" />
            </div>
            <div className="text-lg font-bold text-slate-800">{draftCount}</div>
            <div className="text-xs text-slate-500">{t.draft}</div>
          </div>
        </div>

        {/* Estimate list */}
        {estimates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-xl font-bold text-slate-700 mb-2">{t.noEstimates}</h2>
            <p className="text-slate-500 text-sm mb-8 max-w-xs">{t.noEstimatesHint}</p>
            <Link href="/estimate/new" className="btn-primary">
              <PlusCircle size={20} />
              {t.newEstimate}
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h1 className="text-xl font-bold text-slate-800">{t.dashboard}</h1>
              <Link href="/estimate/new" className="btn-primary text-sm px-4 py-2">
                <PlusCircle size={16} />
                {lang === "es" ? "Nueva" : "New"}
              </Link>
            </div>
            {estimates.map((estimate) => (
              <EstimateCard
                key={estimate.id}
                estimate={estimate}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
