import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Clock, EyeOff, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  reconcileLaborPlan,
  type LaborSettings,
  type LaborTaskHours,
} from "@/domains/estimating/laborHours";
import { laborExtension } from "@/domains/estimating/laborRounding";
import { crewDuration, projectCrewDuration } from "@/domains/estimating/crewDuration";
import { UNASSIGNED_TRADE } from "@/domains/estimating/tradeTaxonomy";

import { formatCurrency, useLocale } from "@/i18n/format";
import type { EstimateDTO, EstimateLineDTO } from "../types";
import {
  buildLaborView,
  rollupByTrade,
  type LaborCompanyDefaults,
} from "../services/laborView";

const hours = (v: number) => `${Math.round(v * 10) / 10}`;
/** Duration is measured in DAYS. It must never be rendered in the hours format. */
const roundDays = (v: number) => Math.round(v * 10) / 10;
const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/**
 * INTERNAL labor insight for the contractor: hours by task, by trade and for
 * the whole project, plus the pace and crew assumptions behind them.
 *
 * ONE MODEL, THREE VIEWS. Tasks, Trades and Project are all derived from the
 * same task list, so they reconcile exactly — an edited task hour rolls up
 * immediately, and non-install time is a real General Conditions task rather
 * than a number that only ever appeared in the project total.
 *
 * Never rendered in a proposal or the client portal — hours, multipliers and
 * rates stay on the contractor's side of the wall.
 */
export function LaborHoursPanel({
  estimate,
  lines,
  company,
  readOnly,
  saving,
  onSaveSettings,
  truncated,
}: {
  estimate: EstimateDTO;
  lines: readonly EstimateLineDTO[];
  company: LaborCompanyDefaults | null;
  readOnly?: boolean;
  saving?: boolean;
  onSaveSettings: (settings: LaborSettings) => void;
  /**
   * BALLPARK SCREEN. Only the four headline numbers render inline; Tasks,
   * Trades and Project detail open in a separate dialog on demand.
   */
  truncated?: boolean;
}) {
  const { t } = useTranslation("estimating");
  const locale = useLocale();
  const view = useMemo(
    () => buildLaborView(estimate, lines, company),
    [estimate, lines, company],
  );
  const basePlan = view.plan;
  const settings = estimate.laborSettings ?? {};

  const [multiplier, setMultiplier] = useState(
    String(settings.productivityMultiplier ?? basePlan?.productivityMultiplier ?? 1),
  );
  const [rate, setRate] = useState(String(settings.laborRate ?? basePlan?.laborRate ?? ""));
  const [crewSize, setCrewSize] = useState(
    String(settings.crewSize ?? ""),
  );
  const [perDay, setPerDay] = useState(String(settings.productiveHoursPerDay ?? ""));
  /** Local task-hour edits, applied to every view before they are saved. */
  const [draftHours, setDraftHours] = useState<Record<string, string>>({});
  const [openTrade, setOpenTrade] = useState<string | null>(null);
  const [tabValue, setTabValue] = useState<"task" | "trade" | "total">("task");
  const [detailOpen, setDetailOpen] = useState(false);


  /*
   * Task edits recompute the whole model locally: task -> trade -> project.
   * The multiplier is NOT re-applied on top of an edited number, so an edit
   * can never double-count the pace.
   */
  const plan = useMemo(() => {
    if (!basePlan) return null;
    const tasks: LaborTaskHours[] = basePlan.tasks.map((task) => {
      const draft = draftHours[task.id];
      if (draft == null || draft === "") return task;
      const n = Number(draft);
      if (!Number.isFinite(n) || n < 0) return task;
      const adjustedHours = round2(n);
      const ext = laborExtension(adjustedHours, task.laborRate);
      return {
        ...task,
        adjustedHours,
        appliedMultiplier: 1,
        isOverridden: true,
        source: "override" as const,
        laborRate: ext.rate,
        laborAmount: ext.raw,
        laborAmountDisplay: ext.display,
      };
    });
    const totalHours = round2(tasks.reduce((s, x) => s + x.adjustedHours, 0));
    return {
      ...basePlan,
      tasks,
      topTasks: [...tasks].sort((a, b) => b.adjustedHours - a.adjustedHours).slice(0, 5),
      byTrade: rollupByTrade(tasks),
      totalHours,
      baselineHours: round2(tasks.reduce((s, x) => s + x.baselineHours, 0)),
      laborAmount: round2(tasks.reduce((s, x) => s + x.laborAmount, 0)),
      laborAmountDisplay: tasks.reduce((s, x) => s + x.laborAmountDisplay, 0),
    };
  }, [basePlan, draftHours]);

  const reconciliation = useMemo(() => (plan ? reconcileLaborPlan(plan) : null), [plan]);

  /*
   * ONE duration source. The project summary uses the SAME crewDuration module
   * as the per-trade rows, with an hours-weighted blend of the trades actually
   * on this job, so the summary line and the trade lines can never disagree.
   * A contractor-entered crew size / productive-hours value still wins.
   */
  const duration = useMemo(
    () =>
      plan
        ? projectCrewDuration({
            totalHours: plan.totalHours,
            trades: plan.byTrade.map((r) => ({
              tradeKey: r.tradeKey,
              crewHours: r.adjustedHours,
            })),
            crewSize: settings.crewSize ?? null,
            productiveHoursPerDay: settings.productiveHoursPerDay ?? null,
          })
        : null,
    [plan, settings.crewSize, settings.productiveHoursPerDay],
  );


  if (!plan || !reconciliation || !duration) {
    return (
      <Card data-testid="labor-hours-panel">
        <CardContent className="space-y-1 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="size-4" aria-hidden />
            {t("labor.title")}
          </h3>
          <p className="text-sm text-foreground-muted">{t("labor.empty")}</p>
        </CardContent>
      </Card>
    );
  }

  const num = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  const tradeLabel = (key: string) =>
    t(`labor.trades.${key}`, { defaultValue: key.replace(/_/g, " ") });

  const taskLabel = (task: LaborTaskHours) =>
    task.isNonInstall && task.nonInstallKey
      ? t(`labor.nonInstall.${task.nonInstallKey}`)
      : task.description;

  const hourOverrides: Record<string, number> = { ...(settings.hourOverrides ?? {}) };
  for (const [id, value] of Object.entries(draftHours)) {
    const n = Number(value);
    if (value !== "" && Number.isFinite(n) && n >= 0) hourOverrides[id] = round2(n);
  }

  const tabsNode = (
    <Tabs value={tabValue} onValueChange={(v) => setTabValue(v as "task" | "trade" | "total")}>
          <TabsList className="w-full">
            <TabsTrigger value="task" className="flex-1">
              {t("labor.view.task")}
            </TabsTrigger>
            <TabsTrigger value="trade" className="flex-1">
              {t("labor.view.trade")}
            </TabsTrigger>
            <TabsTrigger value="total" className="flex-1">
              {t("labor.view.total")}
            </TabsTrigger>
          </TabsList>

          {/* TASKS — the complete labor-bearing scope, never a subset. */}
          <TabsContent value="task" className="space-y-2 pt-3" data-testid="labor-task-view">
            {plan.tasks.length === 0 ? (
              <p className="text-sm text-foreground-muted">{t("labor.empty")}</p>
            ) : (
              <>
                <p className="text-xs text-foreground-muted">
                  {t("labor.taskCount", { count: plan.tasks.length })}
                </p>
                {plan.tasks.map((task) => (
                  <div
                    key={task.id}
                    data-testid="labor-task-row"
                    className="rounded-md border border-border px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{taskLabel(task)}</p>
                        <p className="text-xs text-foreground-muted">
                          {tradeLabel(task.tradeKey)}
                          {task.tradeKey === UNASSIGNED_TRADE
                            ? ` · ${t("labor.unassignedHint")}`
                            : ""}
                        </p>
                        <p className="text-xs text-foreground-muted">
                          {t("labor.taskMeta", {
                            baseline: hours(task.baselineHours),
                            multiplier: task.appliedMultiplier,
                          })}
                          {" · "}
                          {t("labor.rateMeta", {
                            rate: formatCurrency(task.laborRate, locale),
                          })}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold">
                          {t("labor.hoursValue", { value: hours(task.adjustedHours) })}
                        </p>
                        <p className="text-xs text-foreground-muted">
                          {formatCurrency(task.laborAmountDisplay, locale)}
                        </p>
                        {task.isImplausible ? (
                          <span className="inline-flex items-center gap-1 text-xs text-warning-foreground">
                            <TriangleAlert className="size-3" aria-hidden />
                            {t("labor.flagged")}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    {!readOnly && !task.isNonInstall ? (
                      <div className="mt-2 flex items-center gap-2">
                        <Label
                          htmlFor={`labor-task-${task.id}`}
                          className="text-xs text-foreground-muted"
                        >
                          {t("labor.editHours")}
                        </Label>
                        <Input
                          id={`labor-task-${task.id}`}
                          className="h-9 w-24"
                          inputMode="decimal"
                          placeholder={hours(task.adjustedHours)}
                          value={draftHours[task.id] ?? ""}
                          onChange={(e) =>
                            setDraftHours((prev) => ({ ...prev, [task.id]: e.target.value }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ))}
              </>
            )}
          </TabsContent>

          {/* TRADES — how a GC actually buys the work. */}
          <TabsContent value="trade" className="space-y-2 pt-3" data-testid="labor-trade-view">
            {plan.byTrade.length === 0 ? (
              <p className="text-sm text-foreground-muted">{t("labor.empty")}</p>
            ) : (
              plan.byTrade.map((row) => {
                const open = openTrade === row.tradeKey;
                return (
                  <div key={row.tradeKey} className="rounded-md border border-border">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
                      onClick={() => setOpenTrade(open ? null : row.tradeKey)}
                      aria-expanded={open}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        <ChevronDown
                          className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                        <span className="truncate">{tradeLabel(row.tradeKey)}</span>
                        <span className="text-xs text-foreground-muted">
                          {t("labor.taskCount", { count: row.taskCount })}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block font-semibold">
                          {t("labor.hoursValue", { value: hours(row.adjustedHours) })}
                        </span>
                        <span className="block text-xs text-foreground-muted">
                          {t("labor.crewDurationShort", {
                            hours: hours(row.adjustedHours),
                            days: crewDuration({
                              crewHours: row.adjustedHours,
                              tradeKey: row.tradeKey,
                              productiveHoursPerDay: duration.productiveHoursPerDay,
                            }).days,
                            crew: crewDuration({
                              crewHours: row.adjustedHours,
                              tradeKey: row.tradeKey,
                            }).crewSize,
                          })}
                        </span>
                        <span className="block text-xs text-foreground-muted">
                          {formatCurrency(row.laborAmountDisplay, locale)}
                        </span>
                      </span>

                    </button>
                    {open ? (
                      <div className="space-y-1 border-t border-border px-3 py-2">
                        {plan.tasks
                          .filter((task) => task.tradeKey === row.tradeKey)
                          .map((task) => (
                            <div
                              key={task.id}
                              className="flex items-center justify-between gap-3 text-xs"
                            >
                              <span className="truncate text-foreground-muted">
                                {taskLabel(task)}
                              </span>
                              <span>
                                {t("labor.hoursValue", { value: hours(task.adjustedHours) })}
                              </span>
                            </div>
                          ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </TabsContent>

          {/* PROJECT — the executive total the other two views sum to. */}
          <TabsContent value="total" className="space-y-2 pt-3 text-sm" data-testid="labor-project-view">
            <Row label={t("labor.totalHours")} value={hours(plan.totalHours)} />
            <Row
              label={t("labor.laborDollars")}
              value={formatCurrency(plan.laborAmountDisplay, locale)}
            />
            <Row
              label={t("labor.productivity")}
              value={`${plan.productivityMultiplier}x`}
            />
            <Row label={t("labor.nonInstallHours")} value={hours(plan.nonInstallHours)} />
            <Row
              label={t("labor.workingDays")}
              value={t("labor.daysValue", { count: roundDays(duration.days) })}
            />
            <Row label={t("labor.taskTotalCheck")} value={hours(reconciliation.taskHours)} />
            <Row label={t("labor.tradeTotalCheck")} value={hours(reconciliation.tradeHours)} />
          </TabsContent>
    </Tabs>
  );

  return (
    <Card data-testid="labor-hours-panel">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="size-4" aria-hidden />
            {t("labor.title")}
          </h3>
          <Badge variant="secondary" className="gap-1">
            <EyeOff className="size-3" aria-hidden />
            {t("labor.internalOnly")}
          </Badge>
        </div>

        {!truncated ? (
        <>
        <p className="text-xs text-foreground-muted" data-testid="labor-reconcile-note">
          {t("labor.reconcileNote")} {t("labor.roundingNote")}
        </p>
        {reconciliation.hoursMatch && reconciliation.amountMatch ? (
          <p
            className="text-xs text-success"
            data-testid="labor-reconciled"
          >
            {t("labor.reconciled", {
              hours: hours(reconciliation.taskHours),
            })}
          </p>
        ) : null}
        {!reconciliation.hoursMatch || !reconciliation.amountMatch ? (
          <p
            className="flex items-center gap-1 text-xs text-warning-foreground"
            data-testid="labor-reconcile-warning"
          >
            <TriangleAlert className="size-3" aria-hidden />
            {t("labor.reconcileMismatch")}
          </p>
        ) : null}
        </>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t("labor.totalHours")} value={hours(plan.totalHours)} />
          <Stat label={t("labor.baselineHours")} value={hours(plan.baselineHours)} />
          <Stat
            label={t("labor.laborDollars")}
            value={formatCurrency(plan.laborAmountDisplay, locale)}
          />
          <Stat label={t("labor.workingDays")} value={t("labor.daysValue", { count: roundDays(duration.days) })} />
        </div>
        {!truncated ? (
          <p className="text-xs text-foreground-muted">
            {t("labor.durationHelp", {
              crew: duration.crewSize,
              perDay: duration.productiveHoursPerDay,
            })}
          </p>
        ) : null}

        {truncated ? (
          <div className="grid gap-2 sm:grid-cols-3" data-testid="labor-detail-buttons">
            {(["task", "trade", "total"] as const).map((v) => (
              <Button
                key={v}
                type="button"
                variant="outline"
                className="h-11"
                data-testid={`labor-open-${v}`}
                onClick={() => {
                  setTabValue(v);
                  setDetailOpen(true);
                }}
              >
                {t(`labor.view.${v}`)}
              </Button>
            ))}
          </div>
        ) : (
          tabsNode
        )}

        {truncated ? (
          <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>{t("labor.title")}</DialogTitle>
              </DialogHeader>
              {tabsNode}
            </DialogContent>
          </Dialog>
        ) : null}

        {!truncated ? (
        <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-4">
          <Field
            id="labor-multiplier"
            label={t("labor.productivity")}
            value={multiplier}
            onChange={setMultiplier}
            disabled={readOnly}
          />
          <Field
            id="labor-rate"
            label={t("labor.rate")}
            value={rate}
            onChange={setRate}
            disabled={readOnly}
          />
          <Field
            id="labor-crew"
            label={t("labor.crewSize")}
            value={crewSize}
            onChange={setCrewSize}
            disabled={readOnly}
          />
          <Field
            id="labor-per-day"
            label={t("labor.productiveHours")}
            value={perDay}
            onChange={setPerDay}
            disabled={readOnly}
          />
        </div>
        ) : null}
        {!truncated && !readOnly ? (
          <Button
            className="h-11"
            disabled={saving}
            onClick={() =>
              onSaveSettings({
                productivityMultiplier: num(multiplier),
                laborRate: num(rate),
                crewSize: num(crewSize),
                productiveHoursPerDay: num(perDay),
                ...(Object.keys(hourOverrides).length ? { hourOverrides } : {}),
              })
            }
          >
            {t("labor.save")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <p className="text-xs text-foreground-muted">{label}</p>
      <p className="text-base font-semibold">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-foreground-muted">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id} className="text-xs text-foreground-muted">
        {label}
      </Label>
      <Input
        id={id}
        className="h-11"
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
