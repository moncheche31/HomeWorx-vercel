import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Lock } from "lucide-react";
import { formatCurrency, formatNumber, useLocale } from "@/i18n/format";
import {
  isEmptyBreakdown,
  type ContractorBreakdown,
} from "@/domains/estimating/contractorBreakdown";
import { crewDuration, projectCrewDuration } from "@/domains/estimating/crewDuration";


/**
 * INTERNAL-ONLY contractor cost breakdown.
 *
 * One component for every workflow where the logged-in contractor reviews an
 * estimate before sharing: ballpark from photos/video, detailed estimates,
 * realtor / rendering projects, flipper prep and homeowner proposals.
 *
 * AUDIENCE RULE: never render this inside a customer, realtor or buyer facing
 * document, the public client portal, the print/PDF view, or any emailed
 * snapshot. It is mounted only in authenticated contractor screens and always
 * carries the "internal only" label plus `proposal-no-print` so a print of the
 * surrounding page cannot leak it.
 */
export function ContractorBreakdownPanel({
  breakdown,
  currency,
  defaultOpen = false,
  className,
}: {
  breakdown: ContractorBreakdown | null | undefined;
  currency: string;
  defaultOpen?: boolean;
  className?: string;
}) {
  const { t } = useTranslation("estimating");
  const locale = useLocale();
  const [open, setOpen] = useState(defaultOpen);
  const [tasksOpen, setTasksOpen] = useState(false);

  if (isEmptyBreakdown(breakdown)) return null;
  const b = breakdown as ContractorBreakdown;

  const money = (v: number) => formatCurrency(v, locale, currency);
  const hours = (v: number) => t("labor.hoursValue", { value: formatNumber(v, locale) });

  /**
   * Labor time is TOTAL crew-hours. Always render it with the assumed crew size
   * and the calendar days it implies, never as a bare hour count.
   */
  const crewLine = (value: number, tradeKey?: string | null, short = false) => {
    const d = crewDuration({ crewHours: value, tradeKey });
    if (d.days <= 0) return hours(value);
    return t(short ? "labor.crewDurationShort" : "labor.crewDuration", {
      hours: formatNumber(d.crewHours, locale),
      days: d.days,
      crew: d.crewSize,
    });
  };

  /* Project-level crew size: the shared hours-weighted blend of the trades. */
  const projectCrew = projectCrewDuration({
    totalHours: b.crewHours,
    trades: b.trades.map((r) => ({ tradeKey: r.tradeKey, crewHours: r.laborHours })),
  });


  const summaryRows: Array<[string, string]> = [
    [t("contractorBreakdown.laborHours"), hours(b.laborHours)],
    [
      t("contractorBreakdown.crewHours"),
      projectCrew.days > 0
        ? t("labor.crewDuration", {
            hours: formatNumber(projectCrew.crewHours, locale),
            days: projectCrew.days,
            crew: projectCrew.crewSize,
          })
        : hours(b.crewHours),
    ],

    [
      t("contractorBreakdown.labor"),
      b.laborRate
        ? `${money(b.laborCost)} · ${t("labor.rateMeta", { rate: money(b.laborRate) })}`
        : money(b.laborCost),
    ],
    [t("contractorBreakdown.materials"), money(b.materialCost)],
    [t("contractorBreakdown.other"), money(b.otherCost)],
    [t("contractorBreakdown.markup"), money(b.markup)],
  ];
  if (b.tax > 0) summaryRows.push([t("totals.tax"), money(b.tax)]);
  if (b.durationDays != null) {
    summaryRows.push([
      t("contractorBreakdown.duration"),
      t("contractorBreakdown.durationValue", { days: b.durationDays }),
    ]);
  }

  return (
    <section
      data-testid="contractor-breakdown"
      data-audience="internal"
      className={`proposal-no-print rounded-lg border border-border bg-card p-3 ${className ?? ""}`}
      aria-label={t("contractorBreakdown.title")}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-(--control-min-h-sm) w-full items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Lock className="size-4 text-foreground-muted" aria-hidden />
          {t("contractorBreakdown.title")}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      <p className="mt-1 text-xs text-foreground-muted">
        {t("contractorBreakdown.internalOnly")}
      </p>

      {open ? (
        <div className="mt-3 space-y-4">
          <dl className="space-y-1 text-sm">
            {summaryRows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-3">
                <dt className="min-w-0 truncate text-foreground-muted">{label}</dt>
                <dd className="shrink-0 tabular-nums">{value}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-3 border-t border-border pt-1 font-medium">
              <dt>{t("contractorBreakdown.total")}</dt>
              <dd className="tabular-nums">{money(b.total)}</dd>
            </div>
          </dl>

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wide text-foreground-muted">
              {t("contractorBreakdown.byTrade")}
            </p>
            <ul className="space-y-1 text-sm">
              {b.trades.map((trade) => (
                <li key={trade.tradeKey} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate">{t(`labor.trades.${trade.tradeKey}`)}</span>
                  <span className="shrink-0 tabular-nums text-foreground-muted">
                    {crewLine(trade.laborHours, trade.tradeKey, true)} · {money(trade.total)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-1">
            <button
              type="button"
              onClick={() => setTasksOpen((v) => !v)}
              aria-expanded={tasksOpen}
              className="flex min-h-(--control-min-h-sm) w-full items-center justify-between gap-2 text-left text-xs uppercase tracking-wide text-foreground-muted"
            >
              {t("contractorBreakdown.byTask")}
              <ChevronDown
                className={`size-4 shrink-0 transition-transform ${tasksOpen ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
            {tasksOpen ? (
              <ul className="space-y-2 text-sm">
                {b.tasks.map((task) => (
                  <li key={task.id} className="space-y-0.5">
                    <div className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {task.label}
                        {task.quantityIsAssumedDefault ? (
                          <span className="ml-2 rounded-sm bg-warning/15 px-1.5 py-0.5 align-middle text-[0.6875rem] font-medium text-warning-foreground">
                            {t("assumedQuantity.badge")}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums">{money(task.total)}</span>
                    </div>
                    <p className="text-xs text-foreground-muted">
                      {crewLine(task.laborHours, task.tradeKey, true)} ·{" "}
                      {t("contractorBreakdown.labor")}{" "}

                      {money(task.laborCost)} · {t("contractorBreakdown.materials")}{" "}
                      {money(task.materialCost)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
