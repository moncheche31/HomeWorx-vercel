/**
 * Complete pricing — focused workflow for estimate lines that are still
 * unpriced or carry a placeholder quantity (Phase 1).
 *
 * Nothing here invents data: the contractor sets the quantity, picks the
 * library item explicitly, or types their own pricing. No fuzzy candidate is
 * ever applied automatically, and the preview uses the same math the server
 * persists.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ArrowRight, Check, CircleAlert, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { useLocale, formatCurrency } from "@/i18n/format";
import {
  classifyLine, isUnitCompatible, nextIncompleteLineId, previewCandidateLine,
  previewManualLine, summarizeCompletion, isSeededPricingOnly,
  suggestQuantityForLine, planCompositeLine, previewCompositeAssembly,
  compositeApplyPayload,
} from "@/domains/estimating";
import { useAssembliesQuery } from "@/features/knowledge-base/hooks/useKnowledgeBase";
import { GeometryQuantitiesPanel } from "./GeometryQuantitiesPanel";
import type { AssemblyDTO } from "@/features/knowledge-base/types";
import type { EstimateDTO, EstimateLineDTO } from "../types";
import type { useEstimateMutations } from "../hooks/useEstimating";

const UNITS = [
  "each", "linear_foot", "square_foot", "cubic_foot", "cubic_yard", "sheet",
  "board_foot", "gallon", "pound", "hour", "day", "allowance", "lump_sum", "other",
] as const;

type Unit = (typeof UNITS)[number];

interface ManualDraft {
  laborHours: string;
  laborRate: string;
  materialCost: string;
  equipmentCost: string;
  subcontractorCost: string;
  otherCost: string;
}

const numberOf = (value: string): number => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

export function CompletePricingDialog({
  open, onOpenChange, estimate, lines, mutations,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimate: EstimateDTO;
  lines: EstimateLineDTO[];
  mutations: ReturnType<typeof useEstimateMutations>;
}) {
  const { t } = useTranslation("estimating");
  const locale = useLocale();
  const money = (v: number) => formatCurrency(v, locale, estimate.currency);

  const completion = useMemo(() => summarizeCompletion(lines), [lines]);
  const [lineId, setLineId] = useState<string | null>(null);

  /* Resume where the contractor left off: first line still needing work. */
  useEffect(() => {
    if (!open) return;
    setLineId((current) => {
      if (current && lines.some((l) => l.id === current)) return current;
      return nextIncompleteLineId(lines, null);
    });
  }, [open, lines]);

  const line = lines.find((l) => l.id === lineId) ?? null;

  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitKey, setUnitKey] = useState<Unit | "none">("none");
  const [search, setSearch] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSearchOpen, setManualSearchOpen] = useState(false);
  const [manual, setManual] = useState<ManualDraft>({
    laborHours: "0", laborRate: "0", materialCost: "0",
    equipmentCost: "0", subcontractorCost: "0", otherCost: "0",
  });

  /* Reset the editable draft whenever the workflow moves to another line. */
  useEffect(() => {
    if (!line) return;
    setDescription(line.description);
    setQuantity(String(line.quantity));
    setUnitKey((line.unitKey as Unit) ?? "none");
    setSearch(line.description.slice(0, 60));
    setSelectedKey(null);
    setManualOpen(false);
    setManualSearchOpen(false);
    setManual({
      laborHours: String(line.laborHours),
      laborRate: String(line.laborRate || estimate.defaultLaborRate || 0),
      materialCost: String(line.materialCost),
      equipmentCost: String(line.equipmentCost),
      subcontractorCost: String(line.subcontractorCost),
      otherCost: String(line.otherCost),
    });
  }, [line?.id, estimate.defaultLaborRate]); // eslint-disable-line react-hooks/exhaustive-deps

  const assembliesQ = useAssembliesQuery({ search: search.trim() || undefined });
  const candidates: AssemblyDTO[] = useMemo(() => {
    const rows = assembliesQ.data ?? [];
    /* Organization-authored and customized items outrank shared seeded ones. */
    return [...rows]
      .sort((a, b) => {
        const rank = (x: AssemblyDTO) =>
          (x.origin === "organization" ? 2 : 0) + (x.isCustomized ? 1 : 0);
        return rank(b) - rank(a);
      })
      .slice(0, 25);
  }, [assembliesQ.data]);

  const selected = candidates.find((c) => c.assemblyKey === selectedKey) ?? null;
  const lineUnit = unitKey === "none" ? null : unitKey;
  const unitOk = selected ? isUnitCompatible(lineUnit, selected.unitKey) : true;
  const qty = numberOf(quantity);

  /* Deterministic quantity read from the contractor's own words (16' x 18'
     → 288 sq ft). Suggested only — never applied without an explicit tap. */
  const suggestedQuantity = useMemo(
    () => suggestQuantityForLine({ description, unitKey: lineUnit }),
    [description, lineUnit],
  );
  const composite = useMemo(
    () => planCompositeLine({ description, quantityOverride: qty }),
    [description, qty],
  );

  /* Composite components are resolved DIRECTLY by key from the effective
     library — the contractor never free-text searches a recognized composite. */
  const libraryQ = useAssembliesQuery({});
  const libraryByKey = useMemo(() => {
    const map = new Map<string, AssemblyDTO>();
    for (const row of libraryQ.data ?? []) map.set(row.assemblyKey, row);
    return map;
  }, [libraryQ.data]);

  const compositePreview = useMemo(() => {
    if (!line || !composite) return null;
    return previewCompositeAssembly({
      plan: composite,
      quantity: qty,
      lookup: (key) => libraryByKey.get(key) ?? null,
      context: {
        laborRate: line.laborRate || estimate.defaultLaborRate,
        overheadPct: line.overheadPct,
        profitPct: line.profitPct,
        contingencyPct: line.contingencyPct,
        isTaxable: line.isTaxable,
        taxRatePct: estimate.taxRate,
      },
    });
  }, [line, composite, qty, libraryByKey, estimate.defaultLaborRate, estimate.taxRate]);

  /* A recognized composite owns the flow; manual search stays one tap away. */
  const compositeMode = Boolean(composite) && !manualSearchOpen;

  const preview = useMemo(() => {
    if (!line || !selected) return null;
    return previewCandidateLine({
      quantity: qty,
      defaultLaborHours: selected.defaultLaborHours,
      productionRate: selected.productionRate,
      crewSize: selected.crewSize,
      materialAllowance: selected.materialAllowance,
      wasteFactor: selected.wasteFactor,
      materialFactor: 1,
      laborRate: line.laborRate || estimate.defaultLaborRate,
      equipmentCost: line.equipmentCost,
      subcontractorCost: line.subcontractorCost,
      otherCost: line.otherCost,
      overheadPct: line.overheadPct || selected.defaultOverheadPct || 0,
      profitPct: line.profitPct || selected.suggestedProfitPct || 0,
      contingencyPct: line.contingencyPct,
      isTaxable: line.isTaxable,
      taxRatePct: estimate.taxRate,
    });
  }, [line, selected, qty, estimate.defaultLaborRate, estimate.taxRate]);

  const manualPreview = useMemo(() => {
    if (!line) return null;
    return previewManualLine({
      quantity: qty,
      laborHours: numberOf(manual.laborHours),
      laborRate: numberOf(manual.laborRate),
      materialCost: numberOf(manual.materialCost),
      equipmentCost: numberOf(manual.equipmentCost),
      subcontractorCost: numberOf(manual.subcontractorCost),
      otherCost: numberOf(manual.otherCost),
      overheadPct: line.overheadPct,
      profitPct: line.profitPct,
      contingencyPct: line.contingencyPct,
      isTaxable: line.isTaxable,
      taxRatePct: estimate.taxRate,
    });
  }, [line, qty, manual, estimate.taxRate]);

  const goNext = () => {
    const next = nextIncompleteLineId(lines, lineId);
    if (next && next !== lineId) setLineId(next);
    else if (!next) toast.success(t("completion.toast.finished"));
  };

  const shared = () => ({
    quantity: qty,
    unitKey: lineUnit,
    description: description.trim() || undefined,
  });

  const fail = (e: unknown) => {
    const message = e instanceof Error ? e.message : "";
    toast.error(
      message.includes("unit_mismatch")
        ? t("completion.errors.unitMismatch")
        : message.includes("estimate_locked")
          ? t("completion.errors.locked")
          : t("completion.errors.generic"),
    );
  };

  const applyCandidate = async () => {
    if (!line || !selected || !unitOk) return;
    try {
      await mutations.confirmLineCatalog.mutateAsync({
        lineId: line.id,
        assemblyKey: selected.assemblyKey,
        ...shared(),
      });
      toast.success(t("completion.toast.applied"));
      goNext();
    } catch (e) {
      fail(e);
    }
  };

  const applyComposite = async () => {
    if (!line || !compositePreview?.canApply) return;
    try {
      const payload = compositeApplyPayload(compositePreview);
      await mutations.applyCompositeAssembly.mutateAsync({
        lineId: line.id,
        compositeKey: payload.compositeKey,
        quantity: payload.quantity,
        unitKey: lineUnit,
        description: description.trim() || undefined,
        components: payload.components,
      });
      toast.success(t("completion.composite.toastApplied"));
      goNext();
    } catch (e) {
      fail(e);
    }
  };

  const applyManual = async () => {
    if (!line) return;
    try {
      await mutations.setLineManualPricing.mutateAsync({
        lineId: line.id,
        ...shared(),
        laborHours: numberOf(manual.laborHours),
        laborRate: numberOf(manual.laborRate),
        materialCost: numberOf(manual.materialCost),
        equipmentCost: numberOf(manual.equipmentCost),
        subcontractorCost: numberOf(manual.subcontractorCost),
        otherCost: numberOf(manual.otherCost),
      });
      toast.success(t("completion.toast.manualSaved"));
      goNext();
    } catch (e) {
      fail(e);
    }
  };

  const applyQuantityOnly = async () => {
    if (!line) return;
    try {
      await mutations.reviewLineQuantity.mutateAsync({ lineId: line.id, ...shared() });
      toast.success(t("completion.toast.quantityReviewed"));
      goNext();
    } catch (e) {
      fail(e);
    }
  };

  const busy =
    mutations.applyCompositeAssembly.isPending ||
    mutations.confirmLineCatalog.isPending ||
    mutations.setLineManualPricing.isPending ||
    mutations.reviewLineQuantity.isPending;

  const state = line ? classifyLine({ ...line }) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("completion.title")}</DialogTitle>
          <DialogDescription>{t("completion.subtitle")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline" className="font-normal">
            {t("completion.progress", {
              done: completion.complete,
              total: completion.total,
            })}
          </Badge>
          {completion.incomplete > 0 ? (
            <span className="text-foreground-muted">
              {t("completion.remaining", { count: completion.incomplete })}
            </span>
          ) : (
            <span className="text-foreground-muted">{t("completion.allDone")}</span>
          )}
        </div>

        {/*
          Grouped, geometry-derived quantities come first: anything derivable
          from the project measurements is resolved in one action instead of
          stopping the contractor on every line.
        */}
        <GeometryQuantitiesPanel
          projectId={estimate.projectId}
          estimate={estimate}
          lines={lines}
        />



        {!line ? (
          <p className="py-8 text-center text-sm text-foreground-muted">
            {t("completion.empty")}
          </p>
        ) : (
          <div className="space-y-5">
            {/* ---------- line details ---------- */}
            <section className="space-y-3 rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-medium">{t("completion.line.details")}</h3>
                {state?.needsQuantityReview ? (
                  <Badge variant="outline" className="border-warning/40 font-normal text-warning">
                    {t("completion.badges.quantityReview")}
                  </Badge>
                ) : null}
                {state?.needsPricing ? (
                  <Badge variant="outline" className="border-warning/40 font-normal text-warning">
                    {t("kbPricing.lineNeedsPricing")}
                  </Badge>
                ) : null}
              </div>

              <div>
                <Label htmlFor="cp-description">{t("fields.description")}</Label>
                <Input
                  id="cp-description"
                  className="h-11"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <p className="mt-1 text-[11px] text-foreground-muted">
                  {t("completion.line.descriptionHint")}
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="cp-quantity">{t("fields.quantity")}</Label>
                  <Input
                    id="cp-quantity"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="h-11 tabular-nums"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                  {suggestedQuantity && suggestedQuantity.quantity !== qty ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-2 h-9 w-full justify-start text-xs"
                      onClick={() => {
                        setQuantity(String(suggestedQuantity.quantity));
                        setUnitKey(suggestedQuantity.unitKey);
                      }}
                    >
                      {t("completion.line.useDerivedQuantity", {
                        quantity: suggestedQuantity.quantity,
                        unit: t(`units.${suggestedQuantity.unitKey}`, {
                          ns: "scope", defaultValue: suggestedQuantity.unitKey,
                        }),
                        formula: suggestedQuantity.formula,
                      })}
                    </Button>
                  ) : null}
                  <p className="mt-1 text-[11px] text-foreground-muted">
                    {t("completion.line.quantityHint")}
                  </p>
                </div>
                <div>
                  <Label htmlFor="cp-unit">{t("fields.unit")}</Label>
                  <Select
                    value={unitKey}
                    onValueChange={(v) => setUnitKey(v as Unit | "none")}
                  >
                    <SelectTrigger id="cp-unit" className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("completion.line.none")}</SelectItem>
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {t(`units.${u}`, { ns: "scope", defaultValue: u })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs text-foreground-muted">
                <span>
                  {t("completion.line.category")}:{" "}
                  {line.categoryKey
                    ? t(`categories.${line.categoryKey}`, {
                        ns: "scope", defaultValue: line.categoryKey,
                      })
                    : t("completion.line.none")}
                </span>
                <span>
                  {t("completion.line.trade")}: {line.tradeKey ?? t("completion.line.none")}
                </span>
              </div>

              {composite ? (
                <p className="rounded-md border border-border bg-surface-muted p-3 text-xs text-foreground-muted">
                  {t("completion.line.compositeHint", {
                    parts: composite.components.length,
                  })}
                </p>
              ) : null}
            </section>

            {/* ---------- recognized composite assembly ---------- */}
            {compositePreview ? (
              <section className="space-y-3 rounded-md border border-primary/40 bg-primary/[0.04] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">
                    {t(`completion.composite.names.${compositePreview.compositeKey}`, {
                      defaultValue: t("completion.composite.title"),
                    })}
                  </h3>
                  <Badge variant="outline" className="font-normal">
                    {t("completion.composite.badge", {
                      parts: compositePreview.composite.components.length,
                    })}
                  </Badge>
                </div>
                <p className="text-xs text-foreground-muted">
                  {t("completion.composite.explain", {
                    quantity: compositePreview.quantity,
                    unit: t(`units.${compositePreview.unitKey}`, {
                      ns: "scope", defaultValue: compositePreview.unitKey,
                    }),
                  })}
                </p>

                {libraryQ.isLoading ? (
                  <LoadingSpinner label={t("completion.search.loading")} />
                ) : (
                  <ul className="space-y-2">
                    {compositePreview.components.map((c) => (
                      <li key={c.assemblyKey} className="rounded-md border border-border bg-surface p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-sm font-medium">{c.workItem}</p>
                          <span className="text-sm tabular-nums">{money(c.totals.total)}</span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-foreground-muted">
                          {t(`completion.composite.roles.${c.role}`, { defaultValue: c.role })}
                          {" · "}
                          {c.assemblyKey}
                        </p>
                        <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-[11px] sm:grid-cols-2">
                          {([
                            [
                              t("completion.composite.quantity"),
                              `${c.quantity} ${t(`units.${c.unitKey}`, {
                                ns: "scope", defaultValue: c.unitKey,
                              })}`,
                            ],
                            [
                              t("completion.preview.laborHours", {
                                quantity: c.quantity, perUnit: c.laborHoursPerUnit,
                              }),
                              String(c.laborHours),
                            ],
                            [t("completion.preview.laborTotal"), money(c.totals.laborTotal)],
                            [
                              t("completion.composite.materialWithWaste", {
                                waste: Math.round(c.wasteFactor * 100),
                              }),
                              money(c.materialCostPerUnit),
                            ],
                            [t("completion.preview.materialTotal"), money(c.totals.materialTotal)],
                            [t("completion.preview.directCost"), money(c.totals.directCost)],
                          ] as [string, string][]).map(([label, value]) => (
                            <div key={label} className="flex justify-between gap-2">
                              <dt className="text-foreground-muted">{label}</dt>
                              <dd className="tabular-nums">{value}</dd>
                            </div>
                          ))}
                        </dl>
                      </li>
                    ))}
                  </ul>
                )}

                {compositePreview.missingKeys.length > 0 ? (
                  <p className="flex items-start gap-1 text-xs text-warning">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {t("completion.composite.missingComponent", {
                      keys: compositePreview.missingKeys.join(", "),
                    })}
                  </p>
                ) : null}
                {compositePreview.quantity <= 0 ? (
                  <p className="flex items-start gap-1 text-xs text-warning">
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    {t("completion.composite.needsQuantity")}
                  </p>
                ) : null}

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                  <span className="text-sm font-medium">
                    {t("completion.composite.combinedTotal")}
                  </span>
                  <span className="text-sm font-semibold tabular-nums">
                    {money(compositePreview.totals.total)}
                  </span>
                </div>
                <p className="text-[11px] text-foreground-muted">
                  {t("completion.preview.crewNote")}
                </p>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    className="h-11 sm:flex-1"
                    disabled={busy || !compositePreview.canApply}
                    onClick={applyComposite}
                  >
                    {busy
                      ? t("completion.actions.applying")
                      : t("completion.composite.apply")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11"
                    onClick={() => setManualSearchOpen((v) => !v)}
                  >
                    {manualSearchOpen
                      ? t("completion.composite.hideSearch")
                      : t("completion.composite.showSearch")}
                  </Button>
                </div>
              </section>
            ) : null}

            {/* ---------- library search ---------- */}
            {compositeMode ? null : (
            <section className="space-y-3">

              <div>
                <Label htmlFor="cp-search">{t("completion.search.label")}</Label>
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-3 top-3.5 size-4 text-foreground-muted"
                    aria-hidden
                  />
                  <Input
                    id="cp-search"
                    className="h-11 pl-9"
                    placeholder={t("completion.search.placeholder")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>

              {assembliesQ.isLoading ? (
                <LoadingSpinner label={t("completion.search.loading")} />
              ) : candidates.length === 0 ? (
                <p className="text-sm text-foreground-muted">{t("completion.search.empty")}</p>
              ) : (
                <ul className="space-y-2">
                  {candidates.map((c) => {
                    const compatible = isUnitCompatible(lineUnit, c.unitKey);
                    const isSelected = c.assemblyKey === selectedKey;
                    const rowPreview = previewCandidateLine({
                      quantity: qty,
                      defaultLaborHours: c.defaultLaborHours,
                      productionRate: c.productionRate,
                      materialAllowance: c.materialAllowance,
                      wasteFactor: c.wasteFactor,
                      laborRate: line.laborRate || estimate.defaultLaborRate,
                      overheadPct: line.overheadPct || c.defaultOverheadPct || 0,
                      profitPct: line.profitPct || c.suggestedProfitPct || 0,
                      contingencyPct: line.contingencyPct,
                      isTaxable: line.isTaxable,
                      taxRatePct: estimate.taxRate,
                    });
                    return (
                      <li
                        key={c.assemblyKey}
                        className={`rounded-md border p-3 ${
                          isSelected ? "border-primary bg-primary/[0.06]" : "border-border"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium">{c.workItem}</p>
                            <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11px] text-foreground-muted">
                              <span>
                                {t(`categories.${c.categoryKey}`, {
                                  ns: "scope", defaultValue: c.categoryKey,
                                })}{" "}
                                · {c.tradeKey}
                              </span>
                              <span>
                                {t("completion.candidate.unit")}:{" "}
                                {t(`units.${c.unitKey}`, { ns: "scope", defaultValue: c.unitKey })}
                              </span>
                              <span>
                                {t("completion.candidate.hoursPerUnit")}:{" "}
                                {rowPreview.laborHoursPerUnit}
                              </span>
                              <span>
                                {t("completion.candidate.material")}:{" "}
                                {money(c.materialAllowance ?? 0)}
                              </span>
                              <span>
                                {t("completion.candidate.waste")}:{" "}
                                {Math.round((c.wasteFactor ?? 0) * 100)}%
                              </span>
                            </p>
                            <p className="mt-1 flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="font-normal">
                                {t(`completion.candidate.origin.${c.origin}`)}
                              </Badge>
                              <span className="text-xs tabular-nums">
                                {t("completion.candidate.subtotal")}:{" "}
                                {money(rowPreview.totals.total)}
                              </span>
                            </p>
                            {!compatible ? (
                              <p className="mt-1 flex items-center gap-1 text-[11px] text-warning">
                                <CircleAlert className="size-3.5" aria-hidden />
                                {t("completion.candidate.unitMismatchHelp", {
                                  unit: t(`units.${c.unitKey}`, {
                                    ns: "scope", defaultValue: c.unitKey,
                                  }),
                                })}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 flex-col gap-2">
                            <Button
                              variant={isSelected ? "default" : "outline"}
                              className="h-11"
                              disabled={!compatible}
                              onClick={() => setSelectedKey(c.assemblyKey)}
                            >
                              {isSelected ? (
                                <Check className="mr-1 size-4" aria-hidden />
                              ) : null}
                              {isSelected
                                ? t("completion.candidate.selected")
                                : t("completion.candidate.select")}
                            </Button>
                            {!compatible ? (
                              <Button
                                variant="ghost"
                                className="h-11"
                                onClick={() => setUnitKey(c.unitKey as Unit)}
                              >
                                {t("completion.candidate.useUnit", {
                                  unit: t(`units.${c.unitKey}`, {
                                    ns: "scope", defaultValue: c.unitKey,
                                  }),
                                })}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            )}

            {/* ---------- preview ---------- */}
            {selected && preview ? (
              <section className="rounded-md border border-border bg-surface-muted p-3">
                <h3 className="text-sm font-medium">{t("completion.preview.title")}</h3>
                <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
                  {([
                    [
                      t("completion.preview.laborHours", {
                        quantity: qty, perUnit: preview.laborHoursPerUnit,
                      }),
                      String(preview.laborHours),
                    ],
                    [t("completion.preview.laborTotal"), money(preview.totals.laborTotal)],
                    [
                      t("completion.preview.materialPerUnit"),
                      money(preview.materialCostPerUnit),
                    ],
                    [t("completion.preview.materialTotal"), money(preview.totals.materialTotal)],
                    [t("completion.preview.directCost"), money(preview.totals.directCost)],
                    [t("completion.preview.overhead"), money(preview.totals.overhead)],
                    [t("completion.preview.profit"), money(preview.totals.profit)],
                    [t("completion.preview.contingency"), money(preview.totals.contingency)],
                    [t("completion.preview.total"), money(preview.totals.total)],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-2">
                      <dt className="text-foreground-muted">{label}</dt>
                      <dd className="tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-2 text-[11px] text-foreground-muted">
                  {t("completion.preview.crewNote")}
                </p>
                {isSeededPricingOnly() ? (
                  <p className="mt-1 text-[11px] text-foreground-muted">
                    {t("kbPricing.sampleData")}
                  </p>
                ) : null}
              </section>
            ) : null}

            {/* ---------- manual pricing ---------- */}
            <section className="rounded-md border border-border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">{t("completion.manual.title")}</h3>
                <Button
                  variant="outline"
                  className="h-11"
                  onClick={() => setManualOpen((v) => !v)}
                >
                  {t("completion.manual.toggle")}
                </Button>
              </div>
              {manualOpen ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {(
                      [
                        ["laborHours", t("fields.laborHours")],
                        ["laborRate", t("fields.laborRate")],
                        ["materialCost", t("fields.materialCost")],
                        ["equipmentCost", t("fields.equipmentCost")],
                        ["subcontractorCost", t("fields.subcontractorCost")],
                        ["otherCost", t("fields.otherCost")],
                      ] as [keyof ManualDraft, string][]
                    ).map(([field, label]) => (
                      <div key={field}>
                        <Label htmlFor={`cp-${field}`} className="text-xs">{label}</Label>
                        <Input
                          id={`cp-${field}`}
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          className="h-11 tabular-nums"
                          value={manual[field]}
                          onChange={(e) =>
                            setManual((m) => ({ ...m, [field]: e.target.value }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                  {manualPreview ? (
                    <p className="mt-2 text-xs tabular-nums">
                      {t("completion.preview.total")}: {money(manualPreview.total)}
                    </p>
                  ) : null}
                  <p className="mt-1 text-[11px] text-foreground-muted">
                    {t("completion.manual.hint")}
                  </p>
                  <Button className="mt-3 h-11 w-full sm:w-auto" disabled={busy} onClick={applyManual}>
                    {busy ? t("completion.actions.applying") : t("completion.manual.apply")}
                  </Button>
                </>
              ) : null}
            </section>

            {/* ---------- actions ---------- */}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="ghost"
                className="h-11"
                disabled={busy}
                onClick={applyQuantityOnly}
              >
                {t("completion.actions.quantityOnly")}
              </Button>
              <Button variant="outline" className="h-11" disabled={busy} onClick={goNext}>
                {t("completion.actions.next")}
                <ArrowRight className="ml-1 size-4" aria-hidden />
              </Button>
              {compositePreview?.canApply ? (
                <Button className="h-11" disabled={busy} onClick={applyComposite}>
                  {busy
                    ? t("completion.actions.applying")
                    : t("completion.composite.apply")}
                </Button>
              ) : (
                <Button
                  className="h-11"
                  disabled={busy || !selected || !unitOk}
                  onClick={applyCandidate}
                >
                  {busy ? t("completion.actions.applying") : t("completion.actions.apply")}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
