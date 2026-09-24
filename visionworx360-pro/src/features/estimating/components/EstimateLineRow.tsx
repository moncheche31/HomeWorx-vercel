import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useLocale, formatCurrency } from "@/i18n/format";
import { calculateLine } from "@/domains/estimating/calculations";
import { auditLine } from "@/domains/estimating/lineAudit";
import { PricingBasisSheet } from "./PricingBasisSheet";
import { AssemblyExpansionBadge, AssemblyReviewPanel } from "./AssemblyReviewPanel";
import type { EstimateLineDTO } from "../types";

type NumericField =
  | "quantity" | "laborHours" | "laborRate" | "materialCost" | "equipmentCost"
  | "subcontractorCost" | "otherCost" | "overheadPct" | "profitPct" | "contingencyPct";

export interface LinePatch {
  lineId: string;
  [key: string]: unknown;
}

/** Local-first numeric field: types freely, commits on blur, totals recalc instantly. */
function NumberField({
  id, label, value, onCommit, onLive, disabled, hint, step = "0.01",
}: {
  id: string;
  label: string;
  value: number;
  onCommit: (v: number) => void;
  onLive: (v: number) => void;
  disabled?: boolean;
  hint?: string;
  step?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="text-xs text-foreground-muted">{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        type="number"
        step={step}
        min="0"
        className="h-11 tabular-nums"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          onLive(Number.isFinite(n) ? n : 0);
        }}
        onBlur={() => {
          const n = Number(text);
          const safe = Number.isFinite(n) && n >= 0 ? n : 0;
          setText(String(safe));
          if (safe !== value) onCommit(safe);
        }}
      />
      {hint ? <p className="mt-0.5 text-[11px] text-foreground-muted">{hint}</p> : null}
    </div>
  );
}

/**
 * Pricing audit: exactly how the library produced this line's numbers, or why
 * it declined to price it. Read-only — it never changes the math.
 */
function PricingAudit({ line }: { line: EstimateLineDTO }) {
  const { t } = useTranslation("estimating");
  const p = line.pricingProvenance ?? {};
  if (!line.pricingSource || line.pricingSource === "contractor") return null;

  const rows: [string, string][] = [];
  const nz = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

  if (line.pricingSource === "knowledge_base") {
    if (p.workItem || p.assemblyKey) {
      rows.push([t("kbPricing.audit.matched"), String(p.workItem ?? p.assemblyKey)]);
    }
    if (nz(p.matchScore)) {
      rows.push([
        t("kbPricing.audit.score"),
        `${p.matchScore}${p.matchReason ? ` · ${p.matchReason}` : ""}`,
      ]);
    }
    if (nz(p.laborHoursPerUnit)) {
      rows.push([t("kbPricing.audit.hoursPerUnit"), String(p.laborHoursPerUnit)]);
    }
    if (nz(p.computedLaborHours)) {
      rows.push([
        t("kbPricing.audit.computedHours"),
        `${nz(p.quantity) ? p.quantity : 1} × ${p.laborHoursPerUnit ?? 0} = ${p.computedLaborHours}`,
      ]);
    }
    if (nz(p.crewSize)) rows.push([t("kbPricing.audit.crewSize"), String(p.crewSize)]);
    if (nz(p.materialAllowance)) {
      rows.push([
        t("kbPricing.audit.material"),
        `${p.materialAllowance}${nz(p.wasteFactor) ? ` +${Math.round(p.wasteFactor * 100)}%` : ""}`,
      ]);
    }
  } else {
    rows.push([
      t("kbPricing.audit.unmatched"),
      p.candidateWorkItem
        ? t("kbPricing.audit.weakCandidate", {
            item: p.candidateWorkItem,
            score: p.candidateScore ?? 0,
            min: p.minimumScore ?? 60,
          })
        : t("kbPricing.audit.noCandidate"),
    ]);
  }

  if (rows.length === 0) return null;

  return (
    <div className="mt-4 rounded-md border border-border bg-surface-muted px-3 py-2">
      <p className="text-xs font-medium">{t("kbPricing.audit.title")}</p>
      <dl className="mt-1 space-y-0.5 text-[11px] text-foreground-muted">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-wrap gap-x-2">
            <dt className="font-medium">{label}:</dt>
            <dd className="tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {p.crewSizeApplied === false ? (
        <p className="mt-1 text-[11px] text-foreground-muted">{t("kbPricing.audit.crewNote")}</p>
      ) : null}
    </div>
  );
}

export function EstimateLineRow({
  line, currency, taxRate, readOnly, onPatch, onRemove, draft, onDraftChange, focusSignal,
  components = [],
}: {
  line: EstimateLineDTO;
  currency: string;
  taxRate: number;
  readOnly: boolean;
  onPatch: (patch: LinePatch) => void;
  onRemove: () => void;
  /** Uncommitted local numeric overrides so totals update while typing. */
  draft: Partial<Record<NumericField, number>>;
  onDraftChange: (field: NumericField, value: number) => void;
  /** Bumped by the page to open this line (e.g. "review assemblies"). */
  focusSignal?: number;
  /**
   * Materialized assembly children. They are never their own row in the list:
   * their money rolls up into this line and the detail is an opt-in drill-down.
   */
  components?: EstimateLineDTO[];
}) {
  const { t } = useTranslation("estimating");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(line.description);
  useEffect(() => setDescription(line.description), [line.description]);
  useEffect(() => {
    if (focusSignal) setOpen(true);
  }, [focusSignal]);



  const merged = { ...line, ...draft };
  const totals = calculateLine(
    {
      quantity: merged.quantity,
      laborHours: merged.laborHours,
      laborRate: merged.laborRate,
      materialCost: merged.materialCost,
      equipmentCost: merged.equipmentCost,
      subcontractorCost: merged.subcontractorCost,
      otherCost: merged.otherCost,
      overheadPct: merged.overheadPct,
      profitPct: merged.profitPct,
      contingencyPct: merged.contingencyPct,
      isTaxable: line.isTaxable,
    },
    taxRate,
  );

  const money = (v: number) => formatCurrency(v, locale, currency);

  /*
   * Rolled-up presentation. The child components keep every cent of their own
   * book-sourced pricing in the database — this only sums them into the one
   * number the contractor reads on the list.
   */
  const componentTotals = components.map((c) =>
    calculateLine(
      {
        quantity: c.quantity,
        laborHours: c.laborHours,
        laborRate: c.laborRate,
        materialCost: c.materialCost,
        equipmentCost: c.equipmentCost,
        subcontractorCost: c.subcontractorCost,
        otherCost: c.otherCost,
        overheadPct: c.overheadPct,
        profitPct: c.profitPct,
        contingencyPct: c.contingencyPct,
        isTaxable: c.isTaxable,
      },
      taxRate,
    ),
  );
  const sum = (pick: (t: (typeof componentTotals)[number]) => number) =>
    componentTotals.reduce((acc, t2) => acc + pick(t2), 0);
  const rolledTotal = totals.total + sum((x) => x.total);
  const rolledDirect = totals.directCost + sum((x) => x.directCost);


  /*
   * Shared line audit: cost basis, unit legality and labor plausibility. It
   * never changes a number — it explains the basis and flags what to review.
   */
  const audit = auditLine({
    id: line.id,
    description: line.description,
    quantity: merged.quantity,
    unitKey: line.unitKey,
    tradeKey: line.tradeKey ?? null,
    categoryKey: line.categoryKey ?? null,
    laborHours: merged.laborHours,
    laborRate: merged.laborRate,
    materialCost: merged.materialCost,
    equipmentCost: merged.equipmentCost,
    subcontractorCost: merged.subcontractorCost,
    otherCost: merged.otherCost,
    catalogHoursPerUnit: (line.pricingProvenance?.laborHoursPerUnit as number | undefined) ?? null,
    computedLaborHours: (line.pricingProvenance?.computedLaborHours as number | undefined) ?? null,
    pricingSource: line.pricingSource,
    isContractorOwned: line.pricingSource === "contractor" || line.isPriceOverridden,
  });

  /* Quantity derivation recorded when project geometry drove this number. */
  const quantityDerivation = (() => {
    const q = (line.pricingProvenance as Record<string, unknown> | null)?.quantity as
      | Record<string, unknown>
      | undefined;
    const summary = q?.derivation;
    return typeof summary === "string" && summary.trim() ? summary : null;
  })();

  const numField = (field: NumericField, label: string, hint?: string, step?: string) => (
    <NumberField
      id={`${line.id}-${field}`}
      label={label}
      hint={hint}
      step={step}
      disabled={readOnly}
      value={merged[field] as number}
      onLive={(v) => onDraftChange(field, v)}
      onCommit={(v) => onPatch({ lineId: line.id, [field]: v })}
    />
  );

  return (
    <Collapsible id={`estimate-line-${line.id}`} open={open} onOpenChange={setOpen} className="scroll-mt-24 border-b border-border last:border-b-0">
      <div className="flex items-start gap-2 px-3 py-3">
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-11 shrink-0"
            aria-label={open ? t("actions.collapseAll") : t("actions.expandAll")}
          >
            <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
          </Button>
        </CollapsibleTrigger>

        <div className="min-w-0 flex-1">
          <Input
            aria-label={t("fields.description")}
            className="h-11 border-transparent bg-transparent px-1 font-medium shadow-none focus-visible:border-input focus-visible:bg-background"
            value={description}
            disabled={readOnly}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={() => {
              const next = description.trim();
              if (next && next !== line.description) onPatch({ lineId: line.id, description: next });
              else setDescription(line.description);
            }}
          />
          <div className="mt-1 flex flex-wrap items-center gap-2 px-1 text-xs text-foreground-muted">
            <span className="tabular-nums">
              {merged.quantity}
              {line.unitKey ? ` ${t(`units.${line.unitKey}`, { ns: "scope" })}` : ""}
            </span>
            {quantityDerivation ? (
              /* How this number was reached, so it can be sanity-checked. */
              <span data-testid="line-quantity-derivation" className="tabular-nums">
                · {quantityDerivation}
              </span>
            ) : null}

            {line.categoryKey ? (
              <Badge variant="outline" className="font-normal">
                {t(`categories.${line.categoryKey}`, { ns: "scope", defaultValue: line.categoryKey })}
              </Badge>
            ) : null}
            {!line.isClientVisible ? (
              <Badge variant="outline" className="font-normal">{t("fields.clientVisible")}: —</Badge>
            ) : null}
            {line.pricingSource === "unmatched" ? (
              <Badge variant="outline" className="border-warning/40 font-normal text-warning">
                {t("kbPricing.lineNeedsPricing")}
              </Badge>
            ) : null}
            {line.pricingSource === "knowledge_base" ? (
              <Badge variant="outline" className="font-normal">
                {t("kbPricing.lineFromLibrary")}
              </Badge>
            ) : null}
            {/* An estimated material cost must never read as a book price. */}
            {line.pricingSource === "ai_estimated_material" ? (
              <Badge
                variant="outline"
                className="border-warning/40 font-normal text-warning"
                data-testid="line-material-estimated"
                title="Material cost estimated, not from the cost book. Labor is not estimated."
              >
                Est. material
              </Badge>
            ) : null}

            {/* AN UNCONFIRMED SIZE MUST TRAVEL WITH ITS MONEY. Every total that
                rests on a ballpark quantity says so, on every trade and job. */}
            {line.isQuantityPlaceholder ? (
              <Badge
                variant="outline"
                className="border-warning/40 font-normal text-warning"
                data-testid="line-quantity-placeholder"
                title="This quantity is a ballpark assumption, not a measurement. Confirm the actual size before issuing."
              >
                Estimated size — not yet confirmed
              </Badge>
            ) : null}

            {/* How this line is costed — a fee must never read as labor. */}
            <Badge
              variant="outline"
              className="font-normal"
              data-testid={`line-cost-basis-${audit.basis}`}
            >
              {t(`costBasis.basis.${audit.basis}`)}
            </Badge>
            {/* An unreviewed auto-expansion must be visible next to the money. */}
            <AssemblyExpansionBadge line={line} />
            {line.parentLineId ? (
              <Badge variant="outline" className="font-normal" data-testid="line-assembly-component">
                Assembly component
              </Badge>
            ) : null}



          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold tabular-nums" data-testid="line-rolled-total">
            {money(rolledTotal)}
          </div>
          <div className="text-[11px] text-foreground-muted tabular-nums">
            {money(rolledDirect)}
          </div>
        </div>

      </div>

      <CollapsibleContent className="px-3 pb-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {numField("quantity", t("fields.quantity"))}
          {numField("laborHours", t("fields.laborHours"))}
          {numField("laborRate", t("fields.laborRate"), t("hints.laborTotal"))}
          {numField("materialCost", t("fields.materialCost"), t("hints.perUnit"))}
          {numField("equipmentCost", t("fields.equipmentCost"), t("hints.perUnit"))}
          {numField("subcontractorCost", t("fields.subcontractorCost"), t("hints.perUnit"))}
          {numField("otherCost", t("fields.otherCost"), t("hints.perUnit"))}
          {numField("overheadPct", t("fields.overheadPct"), undefined, "0.1")}
          {numField("profitPct", t("fields.profitPct"), undefined, "0.1")}
          {numField("contingencyPct", t("fields.contingencyPct"), undefined, "0.1")}
        </div>

        <PricingAudit line={line} />

        {/*
          NO PARTS LIST HERE. An estimate — ballpark or detailed — is priced one
          line per scope item. The component data still exists and still rolls
          into this line's money; it belongs to the Shopping List, which is a
          different document ("what to buy"), not estimate detail.
        */}


        <AssemblyReviewPanel line={line} readOnly={readOnly} />



        {audit.findings.length > 0 ? (
          <ul className="mt-3 space-y-1 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-[11px] text-foreground-muted">
            {audit.findings.map((f) => (
              <li key={f.code} data-testid={`line-audit-${f.code}`}>
                {t(`costBasis.finding.${f.code}`)}
              </li>
            ))}
          </ul>
        ) : null}


        <div className="mt-4 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-2">
            <Switch
              id={`${line.id}-taxable`}
              checked={line.isTaxable}
              disabled={readOnly}
              onCheckedChange={(v) => onPatch({ lineId: line.id, isTaxable: v })}
            />
            <Label htmlFor={`${line.id}-taxable`} className="text-sm">{t("fields.taxable")}</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id={`${line.id}-visible`}
              checked={line.isClientVisible}
              disabled={readOnly}
              onCheckedChange={(v) => onPatch({ lineId: line.id, isClientVisible: v })}
            />
            <Label htmlFor={`${line.id}-visible`} className="text-sm">{t("fields.clientVisible")}</Label>
          </div>
        </div>

        <div className="mt-4">
          <Label htmlFor={`${line.id}-notes`} className="text-xs text-foreground-muted">
            {t("fields.internalNotes")}
          </Label>
          <Textarea
            id={`${line.id}-notes`}
            rows={2}
            disabled={readOnly}
            defaultValue={line.internalNotes ?? ""}
            onBlur={(e) => {
              const next = e.target.value.trim();
              if (next !== (line.internalNotes ?? "")) {
                onPatch({ lineId: line.id, internalNotes: next || null });
              }
            }}
          />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
          {([
            [t("totals.labor"), totals.laborTotal],
            [t("totals.material"), totals.materialTotal],
            [t("totals.equipment"), totals.equipmentTotal],
            [t("totals.subcontractor"), totals.subcontractorTotal],
            [t("totals.other"), totals.otherTotal],
            [t("totals.directCost"), totals.directCost],
            [t("totals.overhead"), totals.overhead],
            [t("totals.profit"), totals.profit],
            [t("totals.contingency"), totals.contingency],
            [t("totals.tax"), totals.tax],
            [t("totals.lineTotal"), totals.total],
          ] as Array<[string, number]>).map(([label, value]) => (
            <div key={label} className="flex justify-between gap-2">
              <dt className="text-foreground-muted">{label}</dt>
              <dd className="tabular-nums">{money(value)}</dd>
            </div>
          ))}
        </dl>

        {/* Contractor-only rate transparency + override entry point. */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <PricingBasisSheet
            lineId={line.id}
            estimateId={line.estimateId}
            readOnly={readOnly}
          />
          {!readOnly ? (
            <Button variant="outline" size="sm" className="min-h-(--control-min-h)" onClick={onRemove}>
              <Trash2 className="mr-1 size-4" aria-hidden />
              {t("actions.removeLine")}
            </Button>
          ) : null}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
