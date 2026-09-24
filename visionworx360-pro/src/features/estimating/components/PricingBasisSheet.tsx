/**
 * Pricing basis drawer — CONTRACTOR ONLY.
 *
 * Answers "what is VisionWorx using for this task, and why?" by showing the
 * matched catalog task, the quantity basis, the labor productivity math (raw and
 * quarter-hour normalized), and the full source stack:
 *
 *   VisionWorx baseline → your company → this estimate → manual line override
 *
 * Overrides here change DIRECT COST / productivity only. The estimate's pricing
 * strategy (target gross margin vs overhead+profit) still decides selling price,
 * so margin is never applied twice.
 */

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Info, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { formatCurrency, useLocale } from "@/i18n/format";
import {
  buildBasisComparison,
  primaryBasisSource,
  unitsPerHour,
  type CostBookField,
  type CostBookValues,
} from "@/domains/costBook";
import {
  useLinePricingBasis,
  useResetLineRateOverride,
  useSaveLineRateOverride,
} from "../hooks/useCostBook";

/** Fields a contractor may override from a line, keyed by cost basis relevance. */
const EDITABLE_FIELDS: readonly CostBookField[] = [
  "hoursPerUnit",
  "setupHours",
  "laborRate",
  "materialUnitCost",
  "equipmentCost",
  "otherCost",
] as const;

const MONEY_FIELDS = new Set<CostBookField>([
  "laborRate",
  "materialUnitCost",
  "equipmentCost",
  "otherCost",
  "directUnitCost",
]);

export function PricingBasisSheet({
  lineId,
  estimateId,
  readOnly,
}: {
  lineId: string;
  estimateId?: string;
  readOnly?: boolean;
}) {
  const { t } = useTranslation("estimating");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  const { data: trace, isLoading } = useLinePricingBasis(open ? lineId : null);
  const save = useSaveLineRateOverride(estimateId);
  const reset = useResetLineRateOverride(estimateId);

  useEffect(() => {
    if (!open) {
      setDraft({});
      setNote("");
    }
  }, [open]);

  const rows = useMemo(() => (trace ? buildBasisComparison(trace) : []), [trace]);
  const source = trace ? primaryBasisSource(trace) : "none";
  const money = (v: number | null) =>
    v === null ? "—" : formatCurrency(v, locale, "USD");
  const fmt = (field: CostBookField, v: number | null) =>
    v === null ? "—" : MONEY_FIELDS.has(field) ? money(v) : String(v);

  const values = (): CostBookValues => {
    const out: Record<string, number | null> = {};
    for (const field of EDITABLE_FIELDS) {
      const raw = draft[field];
      if (raw === undefined) continue;
      const trimmed = raw.trim();
      if (trimmed === "") {
        out[field] = null;
        continue;
      }
      const n = Number(trimmed);
      if (Number.isFinite(n) && n >= 0) out[field] = n;
    }
    return out as CostBookValues;
  };

  const hasDraft = Object.keys(draft).length > 0;
  const submit = (scope: "estimate" | "company", applyToThisEstimate?: boolean) => {
    save.mutate(
      { lineId, scope, values: values(), note: note.trim() || null, applyToThisEstimate },
      { onSuccess: () => setDraft({}) },
    );
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="min-h-(--control-min-h)"
          data-testid={`pricing-basis-trigger-${lineId}`}
        >
          <Info className="mr-1 size-4" aria-hidden />
          {t("costBook.viewBasis")}
        </Button>
      </SheetTrigger>

      <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <SheetHeader className="text-left">
          <SheetTitle>{t("costBook.basisTitle")}</SheetTitle>
          <SheetDescription>{t("costBook.basisSubtitle")}</SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <p className="py-6 text-sm text-foreground-muted">{t("costBook.loading")}</p>
        ) : !trace ? (
          <p className="py-6 text-sm text-foreground-muted">{t("costBook.noBasis")}</p>
        ) : (
          <div className="space-y-5 pb-6">
            {/* Matched catalog task and its version. */}
            <section className="space-y-1 rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">
                  {trace.catalogEntry?.workItem ?? trace.description ?? "—"}
                </span>
                <Badge variant="outline" className="font-normal" data-testid="basis-source">
                  {t(`costBook.source.${source}`)}
                </Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-foreground-muted">
                <Row label={t("costBook.trade")} value={trace.tradeKey ?? "—"} />
                <Row label={t("costBook.unit")} value={trace.unitKey ?? "—"} />
                <Row
                  label={t("costBook.catalogVersion")}
                  value={
                    trace.catalogEntry?.sourceVersion ??
                    (trace.catalogEntry?.catalogVersion !== null &&
                    trace.catalogEntry?.catalogVersion !== undefined
                      ? String(trace.catalogEntry.catalogVersion)
                      : "—")
                  }
                />
                <Row
                  label={t("costBook.convention")}
                  value={
                    trace.catalogEntry?.productivityConvention
                      ? t(`costBook.conventions.${trace.catalogEntry.productivityConvention}`, {
                          defaultValue: trace.catalogEntry.productivityConvention,
                        })
                      : "—"
                  }
                />
                <Row
                  label={t("costBook.quantity")}
                  value={`${trace.quantity}${trace.quantityIsAssumedDefault ? ` · ${t("costBook.assumed")}` : ""}`}
                />
                <Row
                  label={t("costBook.quantityBasis")}
                  value={trace.quantityBasisNote ?? trace.quantityBasis ?? "—"}
                />
              </dl>
              {trace.quantityBasisFormula ? (
                <p className="text-xs text-foreground-muted">{trace.quantityBasisFormula}</p>
              ) : null}
            </section>

            {/* Labor productivity: raw math, then the billable quarter-hour value. */}
            <section className="space-y-1 rounded-md border border-border p-3 text-xs">
              <h3 className="text-sm font-medium">{t("costBook.laborTitle")}</h3>
              {trace.effective.laborFormula ? (
                <p className="text-foreground-muted">{trace.effective.laborFormula}</p>
              ) : null}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-foreground-muted">
                <Row
                  label={t("costBook.field.hoursPerUnit")}
                  value={
                    trace.effective.hoursPerUnit !== null
                      ? `${trace.effective.hoursPerUnit} · ${unitsPerHour(trace.effective.hoursPerUnit) ?? "—"} ${t("costBook.unitsPerHour")}`
                      : "—"
                  }
                />
                <Row label={t("costBook.rawLabor")} value={trace.effective.laborHoursRaw ?? "—"} />
                <Row
                  label={t("costBook.normalizedLabor")}
                  value={trace.effective.laborHours ?? "—"}
                />
                <Row label={t("costBook.field.laborRate")} value={money(trace.effective.laborRate)} />
                <Row label={t("costBook.laborTotal")} value={money(trace.effective.laborTotal)} />
                <Row label={t("costBook.directCost")} value={money(trace.effective.directCost)} />
              </dl>
            </section>

            {/* Source stack: baseline is always preserved and visible. */}
            <section className="space-y-2">
              <h3 className="text-sm font-medium">{t("costBook.stackTitle")}</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-foreground-muted">
                    <tr className="text-left">
                      <th className="py-1 pr-2 font-medium">{t("costBook.field.label")}</th>
                      <th className="py-1 pr-2 font-medium">{t("costBook.source.catalog_baseline")}</th>
                      <th className="py-1 pr-2 font-medium">{t("costBook.source.company_override")}</th>
                      <th className="py-1 pr-2 font-medium">{t("costBook.source.estimate_override")}</th>
                      <th className="py-1 font-medium">{t("costBook.effective")}</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {rows.map((r) => (
                      <tr key={r.field} data-testid={`basis-row-${r.field}`} className="border-t border-border">
                        <td className="py-1 pr-2">{t(`costBook.field.${r.field}`)}</td>
                        <td className="py-1 pr-2">{fmt(r.field, r.baseline)}</td>
                        <td className="py-1 pr-2">{fmt(r.field, r.company)}</td>
                        <td className="py-1 pr-2">{fmt(r.field, r.estimate)}</td>
                        <td className="py-1 font-medium">{fmt(r.field, r.effective)}</td>
                      </tr>
                    ))}
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-2 text-foreground-muted">
                          {t("costBook.noBaseline")}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Override controls. Scope of the change is spelled out on the buttons. */}
            {!readOnly ? (
              <section className="space-y-3 rounded-md border border-border p-3">
                <h3 className="text-sm font-medium">{t("costBook.overrideTitle")}</h3>
                <p className="text-xs text-foreground-muted">{t("costBook.overrideHelp")}</p>
                <div className="grid grid-cols-2 gap-3">
                  {EDITABLE_FIELDS.map((field) => (
                    <div key={field} className="min-w-0">
                      <Label htmlFor={`${lineId}-${field}`} className="text-xs text-foreground-muted">
                        {t(`costBook.field.${field}`)}
                      </Label>
                      <Input
                        id={`${lineId}-${field}`}
                        inputMode="decimal"
                        type="number"
                        min="0"
                        step="0.01"
                        className="h-11 tabular-nums"
                        placeholder={String(
                          rows.find((r) => r.field === field)?.effective ?? "",
                        )}
                        value={draft[field] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
                <div>
                  <Label htmlFor={`${lineId}-basis-note`} className="text-xs text-foreground-muted">
                    {t("costBook.note")}
                  </Label>
                  <Textarea
                    id={`${lineId}-basis-note`}
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    className="min-h-(--control-min-h)"
                    disabled={!hasDraft || save.isPending}
                    onClick={() => submit("estimate")}
                    data-testid="basis-save-estimate"
                  >
                    {t("costBook.saveThisEstimate")}
                  </Button>
                  <Button
                    variant="outline"
                    className="min-h-(--control-min-h)"
                    disabled={!hasDraft || save.isPending || !trace.catalogItemKey}
                    onClick={() => submit("company", true)}
                    data-testid="basis-save-company"
                  >
                    {t("costBook.saveCompanyDefault")}
                  </Button>
                  <Button
                    variant="ghost"
                    className="min-h-(--control-min-h)"
                    disabled={reset.isPending}
                    onClick={() => reset.mutate(lineId)}
                    data-testid="basis-reset"
                  >
                    <RotateCcw className="mr-1 size-4" aria-hidden />
                    {t("costBook.resetToCompany")}
                  </Button>
                </div>
                {save.error || reset.error ? (
                  <p className="text-xs text-destructive">
                    {(save.error ?? reset.error)?.message}
                  </p>
                ) : null}
              </section>
            ) : null}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
