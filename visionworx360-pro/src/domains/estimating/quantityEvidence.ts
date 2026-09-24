/**
 * Evidence-first quantity engine (Universal Estimating Engine repair).
 *
 * ONE canonical rule decides what quantity a line may carry:
 *
 *   A quantity is only resolved when the evidence semantically belongs to the
 *   task. Contractor confirmation wins. A specific measurement of the surface
 *   the task actually touches comes next. Project-wide geometry is accepted
 *   ONLY for tasks that genuinely cover a whole project surface.
 *
 * There is deliberately NO generic fallback. A localized repair, a patch, a
 * blend or a confined area (shower, tub surround, backsplash, niche) can never
 * inherit the project's floor or wall area — those tasks are returned
 * UNRESOLVED so the contractor is asked, instead of being silently priced from
 * somebody else's square footage.
 *
 * This module mirrors, one-for-one, the database gate in
 * `public.quantity_scope_kind` / `public.geometry_surface_for_line`.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import { isMeasuredUnit } from "./resolution";

/* ------------------------------------------------------------------ *
 * Scope semantics
 * ------------------------------------------------------------------ */

/** What physical extent a task covers. Decides which evidence may be used. */
export type QuantityScopeKind =
  /** Covers an entire project surface (all walls, the whole floor). */
  | "whole_surface"
  /** A patch, repair, blend or touch-up. Extent is unknown until measured. */
  | "localized"
  /** A small enclosure with its own dimensions (shower, backsplash, niche). */
  | "confined_area";

/** Geometry surfaces published by `public.project_geometry_basis`. */
export type GeometrySurface =
  | "floorArea"
  | "floorAreaWithWaste"
  | "ceilingArea"
  | "wallArea"
  | "partitionLf"
  | "trimLf"
  | "structuralSpanLf";

const LOCALIZED_RE =
  /\brepair|patch|patching|blend|touch[- ]?up|touchup|spot\b|small area|as[- ]needed|where damaged|damaged area|make[- ]good/i;

const CONFINED_RE =
  /\bshower|tub surround|tub\/shower|backsplash|niche|wainscot|shower pan|curb\b|steam room|sauna|shower stall/i;

/**
 * Classify a task's physical extent from the contractor's own words plus the
 * catalog key it matched. Localized and confined beat whole-surface: a
 * "shower tile" line is confined even though the catalog key says flooring.
 */
export function classifyQuantityScope(
  description: string | null | undefined,
  catalogKey?: string | null,
): QuantityScopeKind {
  const text = `${description ?? ""} ${catalogKey ?? ""}`.toLowerCase();
  if (LOCALIZED_RE.test(text)) return "localized";
  if (CONFINED_RE.test(text)) return "confined_area";
  return "whole_surface";
}

/**
 * The project-geometry surface a line may legitimately read — or null when no
 * surface semantically matches. Null is a first-class answer: it means "ask the
 * contractor", never "use the floor area".
 */
export function semanticSurfaceForLine(input: {
  description: string | null | undefined;
  catalogKey?: string | null;
  unitKey: string | null | undefined;
}): GeometrySurface | null {
  const unit = input.unitKey ?? "";
  if (classifyQuantityScope(input.description, input.catalogKey) !== "whole_surface") {
    return null;
  }
  const s = `${input.description ?? ""} ${input.catalogKey ?? ""}`.toLowerCase();

  if (unit === "linear_foot") {
    if (/partition|interior wall|nonbearing|non-bearing|demo\.wall|wall\.interior/.test(s)) {
      return "partitionLf";
    }
    if (/baseboard|base trim|casing|crown|trim/.test(s)) return "trimLf";
    if (/lvl|beam|header|girder|ridge|glulam/.test(s)) return "structuralSpanLf";
    /* Wall framing is measured along the wall run. */
    if (/\bframe|framing\b/.test(s) && /wall/.test(s)) return "partitionLf";
    return null;
  }

  if (unit === "square_foot") {
    /* "walls and ceilings" is a wall-area task: the wall face dominates. */
    if (/wall|drywall|insulat|furring|sheathing/.test(s)) return "wallArea";
    if (/ceiling/.test(s)) return "ceilingArea";
    if (/floor|subfloor|underlayment|slab|carpet|lvp|laminate|hardwood/.test(s)) {
      /* Prep and levelling cover the deck itself: no finish waste factor. */
      return /prep|level|underlayment|subfloor|slab/.test(s) ? "floorArea" : "floorAreaWithWaste";
    }
    if (/paint/.test(s)) return "wallArea";
    return null;
  }


  return null;
}

/* ------------------------------------------------------------------ *
 * Canonical resolution
 * ------------------------------------------------------------------ */

export type QuantityEvidenceSource =
  | "contractor_confirmed"
  | "specific_measurement"
  | "project_geometry"
  | "none";

export interface QuantityResolutionInput {
  description: string | null | undefined;
  catalogKey?: string | null;
  unitKey: string | null | undefined;
  /** Contractor-entered / reviewed quantity. Highest authority. */
  contractorQuantity?: number | null;
  /** A measurement captured for THIS task's surface (e.g. shower wall area). */
  specificMeasurement?: { value: number; label: string } | null;
  /** Project-wide geometry basis. Only usable by whole-surface tasks. */
  projectGeometry?: Partial<Record<GeometrySurface, number>> | null;
}

export interface ResolvedQuantity {
  status: "resolved";
  quantity: number;
  source: Exclude<QuantityEvidenceSource, "none">;
  basis: "contractor_confirmed" | "specific_measurement" | "geometry_derived" | "assumed";
  surface: GeometrySurface | null;
  note: string;
  formula: Record<string, unknown>;
}

export interface UnresolvedQuantity {
  status: "unresolved";
  reason: "quantity_unmeasured" | "needs_specific_measurement" | "unit_mismatch";
  scope: QuantityScopeKind;
  note: string;
}

export type QuantityResolution = ResolvedQuantity | UnresolvedQuantity;

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * THE quantity resolution function. Every automatic quantity in the estimator
 * must come through here so no other code can invent a fallback.
 */
export function resolveQuantity(input: QuantityResolutionInput): QuantityResolution {
  const scope = classifyQuantityScope(input.description, input.catalogKey);

  if (input.contractorQuantity != null && input.contractorQuantity > 0) {
    return {
      status: "resolved",
      quantity: round2(input.contractorQuantity),
      source: "contractor_confirmed",
      basis: "contractor_confirmed",
      surface: null,
      note: "Confirmed by the contractor.",
      formula: { source: "contractor_confirmed" },
    };
  }

  if (input.specificMeasurement && input.specificMeasurement.value > 0) {
    return {
      status: "resolved",
      quantity: round2(input.specificMeasurement.value),
      source: "specific_measurement",
      basis: "specific_measurement",
      surface: null,
      note: `Measured for this task (${input.specificMeasurement.label}).`,
      formula: { source: "specific_measurement", label: input.specificMeasurement.label },
    };
  }

  if (!isMeasuredUnit(input.unitKey ?? null)) {
    return {
      status: "unresolved",
      reason: "quantity_unmeasured",
      scope,
      note: "This task is counted, not measured. Confirm the count.",
    };
  }

  if (scope !== "whole_surface") {
    return {
      status: "unresolved",
      reason: "needs_specific_measurement",
      scope,
      note:
        scope === "localized"
          ? "A repair or patch covers only part of a surface. Measure the affected area."
          : "This area has its own dimensions. Measure it instead of using the room size.",
    };
  }

  const surface = semanticSurfaceForLine(input);
  const value = surface ? (input.projectGeometry?.[surface] ?? 0) : 0;
  if (!surface || !(value > 0)) {
    return {
      status: "unresolved",
      reason: "quantity_unmeasured",
      scope,
      note: "No measurement matches this task yet.",
    };
  }

  const assumed = surface === "structuralSpanLf";
  return {
    status: "resolved",
    quantity: round2(value),
    source: "project_geometry",
    basis: assumed ? "assumed" : "geometry_derived",
    surface,
    note: assumed
      ? `Assumed from the widest measured room span (${round2(value)} ft). Confirm the engineered length.`
      : `Derived from saved project measurements (${surface}).`,
    formula: { surface, value: round2(value) },
  };
}

/* ------------------------------------------------------------------ *
 * Composite task decomposition
 * ------------------------------------------------------------------ */

export interface CompositeComponent {
  description: string;
  unitKey: string;
  /** Components are never auto-counted: each needs its own evidence. */
  needsQuantity: true;
}

interface CompositeRule {
  match: RegExp;
  components: { description: string; unitKey: string }[];
}

/**
 * Broad scope wording that hides two or more independently measured tasks.
 * Splitting them is what stops "shutoffs and supply lines" being priced as one
 * arbitrary unit.
 */
const COMPOSITE_RULES: CompositeRule[] = [
  {
    match: /shutoffs?\b.*supply lines?|supply lines?\b.*shutoffs?/i,
    components: [
      { description: "Install new fixture shutoff valves", unitKey: "each" },
      { description: "Install new fixture supply lines", unitKey: "each" },
    ],
  },
  {
    match: /walls?,?\s*ceilings?,?\s*(and\s*)?floors?/i,
    components: [
      { description: "Walls", unitKey: "square_foot" },
      { description: "Ceiling", unitKey: "square_foot" },
      { description: "Floor", unitKey: "square_foot" },
    ],
  },
  {
    match: /circuits?\b.*outlets?\b.*light/i,
    components: [
      { description: "New branch circuits", unitKey: "each" },
      { description: "New outlets and switches", unitKey: "each" },
      { description: "New light fixtures", unitKey: "each" },
    ],
  },
  {
    match: /doors?\b.*(and|&)\s*trim/i,
    components: [
      { description: "Install interior doors", unitKey: "each" },
      { description: "Install door casing and trim", unitKey: "linear_foot" },
    ],
  },
];

/**
 * Split a broad line into independently measurable components. Returns an
 * empty array when the line is already a single task — callers must not invent
 * components of their own.
 */
export function decomposeCompositeTask(
  description: string | null | undefined,
): CompositeComponent[] {
  const text = String(description ?? "");
  const rule = COMPOSITE_RULES.find((r) => r.match.test(text));
  if (!rule) return [];
  return rule.components.map((c) => ({ ...c, needsQuantity: true as const }));
}

/* ------------------------------------------------------------------ *
 * Plausibility gate
 * ------------------------------------------------------------------ */

export interface PlausibilityFinding {
  code: "localized_uses_project_surface" | "confined_uses_project_surface" | "no_evidence";
  message: string;
}

/**
 * Last line of defence before a number is priced as resolved: catch a quantity
 * that is numerically identical to a project-wide surface on a task that could
 * not possibly cover it.
 */
export function checkQuantityPlausibility(input: {
  description: string | null | undefined;
  catalogKey?: string | null;
  unitKey: string | null | undefined;
  quantity: number;
  quantityBasis?: string | null;
  projectGeometry?: Partial<Record<GeometrySurface, number>> | null;
}): PlausibilityFinding | null {
  if (!isMeasuredUnit(input.unitKey ?? null)) return null;
  const scope = classifyQuantityScope(input.description, input.catalogKey);
  if (scope === "whole_surface") return null;

  const geometry = input.projectGeometry ?? {};
  const matchesProjectSurface = Object.values(geometry).some(
    (v) => typeof v === "number" && v > 1 && Math.abs(v - input.quantity) < 0.5,
  );
  const derived =
    input.quantityBasis === "geometry_derived" || input.quantityBasis === "assumed";

  if (matchesProjectSurface || derived) {
    return scope === "localized"
      ? {
          code: "localized_uses_project_surface",
          message:
            "A repair is priced against the whole project surface. Measure the affected area.",
        }
      : {
          code: "confined_uses_project_surface",
          message:
            "A confined area is priced against the room's measurements. Measure the area itself.",
        };
  }
  return null;
}
