/**
 * Intelligent Estimating Engine — calculation core (Module 008).
 *
 * Pure functions only. Deterministic, allocation-light, and safe to run on
 * 5,000+ line items on every keystroke. No React, Supabase, i18n or IO.
 */

import { round2 } from "../calculations";
import { roundMoney as money } from "../money";
import {
  DEFAULT_PRICING_STRATEGY,
  grossMarginPct,
  grossProfitDollars,
  normalizePricingStrategy,
  sellingPriceFromTargetMargin,
  usesTargetGrossMargin,
} from "../pricingStrategy";
import { roundQuarterHour } from "../laborTime";
import type {
  EngineLineInput,
  EngineLineResult,
  EstimateEngineConfig,
  EstimateEngineResult,
  EstimateEngineTotals,
  ResolvedFieldMap,
  ValueProvenance,
} from "./types";

const num = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const pct = (base: number, percent: number) => money((base * num(percent)) / 100);

const derived = (note?: string): ValueProvenance => ({
  source: "engine-derived",
  sourceId: note ?? null,
});

/** Labor hours for a line: explicit hours win, else production-rate derived. */
export function resolveLaborHours(line: EngineLineInput): {
  hours: number;
  provenance: ValueProvenance;
} {
  const qty = num(line.quantity);
  if (line.laborHours != null && num(line.laborHours) > 0) {
    return {
      hours: roundQuarterHour(num(line.laborHours)),
      provenance: line.provenance?.laborHours ?? derived("explicit-labor-hours"),
    };
  }
  if (line.laborHoursPerUnit != null && num(line.laborHoursPerUnit) > 0) {
    return {
      hours: roundQuarterHour(num(line.laborHoursPerUnit) * qty),
      provenance: line.provenance?.laborHoursPerUnit ?? derived("labor-hours-per-unit"),
    };
  }
  if (line.productionRate != null && num(line.productionRate) > 0) {
    return {
      hours: roundQuarterHour(qty / num(line.productionRate)),
      provenance: line.provenance?.productionRate ?? derived("production-rate"),
    };
  }
  return { hours: roundQuarterHour(num(line.laborHours)), provenance: derived("no-labor-source") };
}

/** Calculate one line independently. Changing any input recomputes everything. */
export function calculateEngineLine(
  line: EngineLineInput,
  config: EstimateEngineConfig,
): EngineLineResult {
  const qty = num(line.quantity);
  const waste = Math.max(0, num(line.wasteFactorPct));
  const materialQuantity = round2(qty * (1 + waste / 100));
  const crewSize = Math.max(1, num(line.crewSize) || 1);

  const { hours: laborHours, provenance: laborProv } = resolveLaborHours(line);
  const crewHours = round2(laborHours / crewSize);

  const laborTotal = money(laborHours * num(line.laborRate));
  const materialTotal = money(num(line.materialCost) * materialQuantity);
  const productTotal = line.product
    ? money(num(line.product.unitPrice) * (num(line.product.quantityPerUnit) || 1) * qty)
    : 0;
  const equipmentTotal = money(num(line.equipmentCost) * qty);
  const subcontractorTotal = money(num(line.subcontractorCost) * qty);
  const otherTotal = money(num(line.otherCost) * qty);

  const directCost = money(
    laborTotal + materialTotal + productTotal + equipmentTotal + subcontractorTotal + otherTotal,
  );
  /*
   * Mutually exclusive pricing methods. Under a target gross margin the line
   * carries NO overhead/profit percentages: margin is applied once, at the
   * estimate roll-up, on top of the full job cost (direct + contingency).
   */
  const targetMargin = usesTargetGrossMargin(config.pricingStrategy);
  const overhead = targetMargin ? 0 : pct(directCost, line.overheadPct);
  const profit = targetMargin ? 0 : pct(directCost + overhead, line.profitPct);
  const contingency = pct(directCost + overhead + profit, line.contingencyPct);
  const subtotal = money(directCost + overhead + profit + contingency);
  const taxable = line.isTaxable ? subtotal : 0;
  const tax = pct(taxable, config.taxRatePct);

  const provenance: ResolvedFieldMap = {
    ...(line.provenance ?? {}),
    laborHours: laborProv,
    crewHours: derived("labor-hours/crew-size"),
    materialQuantity: derived("quantity×waste"),
  };

  return {
    id: line.id,
    quantity: qty,
    materialQuantity,
    laborHours,
    crewHours,
    crewSize,
    laborTotal,
    materialTotal,
    productTotal,
    equipmentTotal,
    subcontractorTotal,
    otherTotal,
    directCost,
    overhead,
    profit,
    contingency,
    subtotal,
    taxable,
    tax,
    total: money(subtotal + tax),
    provenance,
  };
}

function emptyTotals(): EstimateEngineTotals {
  return {
    lineCount: 0,
    laborHours: 0,
    crewHours: 0,
    laborTotal: 0,
    materialTotal: 0,
    productTotal: 0,
    equipmentTotal: 0,
    subcontractorTotal: 0,
    otherTotal: 0,
    allowanceTotal: 0,
    directCost: 0,
    overhead: 0,
    profit: 0,
    contingency: 0,
    jobCost: 0,
    grossProfit: 0,
    grossMarginPct: 0,
    subtotal: 0,
    taxable: 0,
    tax: 0,
    grandTotal: 0,
  };
}

/**
 * Roll up an estimate: every line plus project allowances (travel, disposal,
 * permit and any custom allowances). Callers filter archived/excluded lines.
 */
export function calculateEngineEstimate(
  lines: EngineLineInput[],
  config: EstimateEngineConfig,
): EstimateEngineResult {
  const totals = emptyTotals();
  const results: EngineLineResult[] = new Array(lines.length);
  const warnings: EstimateEngineResult["warnings"] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const r = calculateEngineLine(line, config);
    results[i] = r;

    if (r.quantity <= 0) {
      warnings.push({ lineId: line.id, code: "zero-quantity", message: "Quantity is zero." });
    }
    if (r.laborHours > 0 && num(line.laborRate) <= 0) {
      warnings.push({ lineId: line.id, code: "missing-labor-rate", message: "Labor rate is zero." });
    }

    totals.laborHours += r.laborHours;
    totals.crewHours += r.crewHours;
    totals.laborTotal += r.laborTotal;
    totals.materialTotal += r.materialTotal;
    totals.productTotal += r.productTotal;
    totals.equipmentTotal += r.equipmentTotal;
    totals.subcontractorTotal += r.subcontractorTotal;
    totals.otherTotal += r.otherTotal;
    totals.directCost += r.directCost;
    totals.overhead += r.overhead;
    totals.profit += r.profit;
    totals.contingency += r.contingency;
    totals.taxable += r.taxable;
    totals.tax += r.tax;
  }

  totals.lineCount = lines.length;

  const strategy = normalizePricingStrategy(config.pricingStrategy ?? DEFAULT_PRICING_STRATEGY);
  const targetMargin = usesTargetGrossMargin(strategy);

  const a = config.allowances;
  const allowanceItems: { amount: number; isTaxable: boolean }[] = [];
  if (a) {
    const flat = num(a.travel) + num(a.disposal) + num(a.permit);
    if (flat !== 0) allowanceItems.push({ amount: flat, isTaxable: !!a.isTaxable });
    for (const extra of a.other ?? []) {
      allowanceItems.push({ amount: num(extra.amount), isTaxable: extra.isTaxable ?? !!a.isTaxable });
    }
  }

  for (const item of allowanceItems) {
    const base = money(item.amount);
    totals.allowanceTotal += base;
    totals.directCost += base;
    if (targetMargin) {
      /* Allowances are job cost; the margin grosses them up with everything else. */
      if (item.isTaxable) totals.taxable += base;
      continue;
    }
    if (a?.markupApplies) {
      const oh = pct(base, config.defaultOverheadPct ?? 0);
      const pr = pct(base + oh, config.defaultProfitPct ?? 0);
      const ct = pct(base + oh + pr, config.defaultContingencyPct ?? 0);
      totals.overhead += oh;
      totals.profit += pr;
      totals.contingency += ct;
      if (item.isTaxable) {
        const t = money(base + oh + pr + ct);
        totals.taxable += t;
        totals.tax += pct(t, config.taxRatePct);
      }
    } else if (item.isTaxable) {
      totals.taxable += base;
      totals.tax += pct(base, config.taxRatePct);
    }
  }

  const NON_MONEY_TOTALS = new Set(["lineCount", "laborHours", "crewHours", "grossMarginPct"]);
  for (const key of Object.keys(totals) as (keyof EstimateEngineTotals)[]) {
    totals[key] = NON_MONEY_TOTALS.has(key) ? round2(totals[key]) : money(totals[key]);
  }

  /*
   * Contingency enters EXACTLY ONCE, as cost. `jobCost` is the single base a
   * pricing method is applied to, so contingency can never be marked up twice.
   */
  totals.jobCost = money(totals.directCost + totals.contingency);

  if (targetMargin) {
    const selling = sellingPriceFromTargetMargin(totals.jobCost, strategy.targetGrossMarginPct);
    const factor = totals.jobCost > 0 ? selling / totals.jobCost : 1;

    /* Distribute the margin across lines so line totals reconcile to the roll-up. */
    const linesSelling = money((totals.jobCost - totals.allowanceTotal) * factor);
    let distributed = 0;
    for (let i = 0; i < results.length; i += 1) {
      const r = results[i];
      const lineJobCost = money(r.directCost + r.contingency);
      const isLast = i === results.length - 1;
      const lineSelling = isLast
        ? money(linesSelling - distributed)
        : money(lineJobCost * factor);
      distributed = money(distributed + lineSelling);
      r.overhead = 0;
      r.profit = money(lineSelling - lineJobCost);
      r.subtotal = money(lineSelling);
      r.taxable = r.taxable > 0 ? r.subtotal : 0;
      r.tax = pct(r.taxable, config.taxRatePct);
      r.total = money(r.subtotal + r.tax);
    }

    totals.overhead = 0;
    totals.profit = 0;
    totals.subtotal = money(selling);
    totals.taxable = money(totals.taxable * factor);
    totals.tax = pct(totals.taxable, config.taxRatePct);
  } else {
    totals.subtotal = money(
      totals.directCost + totals.overhead + totals.profit + totals.contingency,
    );
  }

  totals.grossProfit = grossProfitDollars(totals.subtotal, totals.jobCost);
  totals.grossMarginPct = grossMarginPct(totals.subtotal, totals.jobCost);
  totals.grandTotal = money(totals.subtotal + totals.tax);

  return {
    currency: config.currency,
    pricing: {
      method: strategy.method,
      targetGrossMarginPct: strategy.targetGrossMarginPct,
      overheadPct: strategy.overheadPct,
      profitPct: strategy.profitPct,
    },
    totals,
    lines: results,
    warnings,
  };
}
