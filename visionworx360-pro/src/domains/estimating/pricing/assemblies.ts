/**
 * Composite assembly support (Pricing Integrity, Phase 1).
 *
 * Some things a contractor says out loud are one work item to them and several
 * priced assemblies in the library. "Frame a 16' x 18' platform floor using
 * 2 x 8 lumber and 3/4" Advantech" is the canonical example: it is a joist
 * system plus subfloor sheathing.
 *
 * A composite only expands into assemblies that already exist in the Knowledge
 * Base, with an explicit quantity factor per component. No pricing is invented
 * here — expansion produces (assemblyKey, quantity, unit) triples that the
 * normal pricing path then prices.
 *
 * Pure functions only — no React, no Supabase, no i18n, no IO.
 */

import { deriveAreaSquareFeet, type DerivedQuantity } from "./quantities";

export interface CompositeComponent {
  /** Knowledge Base assembly key. */
  assemblyKey: string;
  unitKey: "square_foot" | "linear_foot" | "each";
  /** Multiplier applied to the composite quantity. 1 = same measured area. */
  quantityFactor: number;
  /** What this component covers, for the contractor-facing breakdown. */
  role: string;
}

export interface CompositeAssembly {
  key: string;
  /** Measured unit the composite itself is quantified in. */
  unitKey: "square_foot";
  /** Lowercase phrases that identify the composite in free text. */
  triggers: string[];
  /** All of these must also appear, when present, to avoid false matches. */
  requires: string[];
  components: CompositeComponent[];
}

/**
 * Platform floor: joist system + subfloor sheathing over the same area.
 * Both components are per square foot, so both take the derived area as-is.
 */
export const PLATFORM_FLOOR: CompositeAssembly = {
  key: "composite.floor.platform",
  unitKey: "square_foot",
  triggers: ["platform floor", "platform framing", "framed floor", "floor platform"],
  requires: [],
  components: [
    {
      assemblyKey: "framing.floor.joist",
      unitKey: "square_foot",
      quantityFactor: 1,
      role: "joists",
    },
    {
      assemblyKey: "framing.subfloor.sheathing",
      unitKey: "square_foot",
      quantityFactor: 1,
      role: "subfloor",
    },
  ],
};

export const COMPOSITE_ASSEMBLIES: CompositeAssembly[] = [PLATFORM_FLOOR];

const normalize = (text: string | null | undefined): string =>
  String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Identify a composite from the contractor's description, or null. */
export function matchCompositeAssembly(
  description: string | null | undefined,
): CompositeAssembly | null {
  const text = normalize(description);
  if (!text) return null;
  for (const composite of COMPOSITE_ASSEMBLIES) {
    const hit = composite.triggers.some((trigger) => text.includes(normalize(trigger)));
    if (!hit) continue;
    const ok = composite.requires.every((word) => text.includes(normalize(word)));
    if (ok) return composite;
  }
  return null;
}

export interface ExpandedComponent extends CompositeComponent {
  quantity: number;
}

/** Expand a composite into priceable component quantities. */
export function expandComposite(
  composite: CompositeAssembly,
  quantity: number,
): ExpandedComponent[] {
  const qty = Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  return composite.components.map((component) => ({
    ...component,
    quantity: Math.round(qty * component.quantityFactor * 100) / 100,
  }));
}

export interface CompositePlan {
  composite: CompositeAssembly;
  /** Derived from the description when it carries dimensions, else null. */
  derivedQuantity: DerivedQuantity | null;
  quantity: number;
  components: ExpandedComponent[];
}

/**
 * Plan a composite line end to end: identify it, derive its area from the
 * description when possible, and expand it into component quantities.
 * `quantityOverride` wins whenever the contractor has already measured.
 */
export function planCompositeLine(input: {
  description: string | null | undefined;
  quantityOverride?: number | null;
}): CompositePlan | null {
  const composite = matchCompositeAssembly(input.description);
  if (!composite) return null;

  const derived = deriveAreaSquareFeet(input.description);
  const override = Number(input.quantityOverride ?? 0);
  const quantity = override > 1 ? override : (derived?.quantity ?? 0);

  return {
    composite,
    derivedQuantity: derived,
    quantity,
    components: expandComposite(composite, quantity),
  };
}
