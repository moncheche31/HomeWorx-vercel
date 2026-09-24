/**
 * Server-side helpers for binding a captured measurement to an estimate line.
 *
 * The rule enforced here: a line's quantity may only change when the capture
 * actually answers the line's unit of measure. Everything else comes back as
 * `needs_review` for the contractor to confirm — the app never invents the
 * number it is missing.
 */

import { parseMeasurementText } from "@/domains/measurementCapture";
import {
  measurementNeedFor,
  selectBindableMeasurement,
  type BoundQuantity,
} from "@/domains/estimating/measurementBinding";

export interface LineRow {
  id: string;
  estimate_id: string;
  project_id: string;
  organization_id: string;
  description: string;
  unit_key: string | null;
  archived_at: string | null;
}

export interface BindResult {
  bound: BoundQuantity;
  item: {
    label: string;
    subject: string | null;
    kind: string;
    inches: number;
    secondaryInches: number | null;
    display: string;
    rawText: string;
    /** Ambiguity the parser flagged; kept on the stored measurement. */
    flag: string | null;
  } | null;
}

/**
 * Work out the quantity a capture supports for a line. Returns null when the
 * capture cannot answer it (wrong shape, no dimension found).
 */
export function bindCaptureToLine(
  line: Pick<LineRow, "unit_key">,
  input: { text?: string; quantity?: number; source: "spoken" | "typed" },
): BindResult | null {
  if (input.quantity != null) {
    return {
      bound: {
        quantity: Math.round(input.quantity * 100) / 100,
        formula: `Contractor entered ${input.quantity} ${line.unit_key ?? "unit"} on site`,
      },
      item: null,
    };
  }
  if (!input.text) return null;

  const parsed = parseMeasurementText(input.text, { source: input.source });
  const picked = selectBindableMeasurement(line.unit_key, parsed);
  if (picked) {
    return {
      bound: picked.bound,
      item: {
        label: picked.item.label,
        subject: picked.item.subject,
        kind: picked.item.kind,
        inches: picked.item.inches,
        secondaryInches: picked.item.secondaryInches,
        display: picked.item.display,
        rawText: picked.item.rawText,
        flag: picked.item.flag ?? null,
      },
    };
  }

  /*
   * A count is never a physical dimension, so a bare number is the honest
   * answer for `each` lines ("three outlets"). Any other unit must produce a
   * real measurement or nothing at all.
   */
  if (measurementNeedFor(line.unit_key) === "count") {
    const bare = /\b(\d{1,4})(?:\.\d+)?\b/.exec(input.text);
    const n = bare ? Number(bare[1]) : NaN;
    if (Number.isFinite(n) && n > 0) {
      return {
        bound: { quantity: n, formula: `Counted ${n} on site ("${input.text.trim()}")` },
        item: null,
      };
    }
  }
  return null;
}
