/**
 * Crew-hours -> calendar duration.
 *
 * A labor total of "225 hours" is TOTAL CREW-HOURS, not one person's calendar
 * time. Rendering the raw number makes a 7-day roofing job look like a 5.6-week
 * job. Every surface that shows labor time must therefore show three things:
 * the crew-hours, the assumed crew size, and the resulting calendar days.
 *
 * This module owns the per-trade crew-size defaults and the day math. It reuses
 * the existing 8 productive-hours-per-day convention from the ballpark
 * scenario engine — no second duration concept is introduced.
 *
 * Pure module: no React, no IO.
 */

/** Same convention the ballpark scenario engine uses. */
export const PRODUCTIVE_HOURS_PER_DAY = 8;

/** Used when a trade has no specific default. */
export const DEFAULT_CREW_SIZE = 2;

/**
 * Typical field crew size per trade for a residential job. These are display
 * assumptions for scheduling context only — they never change cost, because
 * cost is crew-hours x rate regardless of how many people show up.
 */
const CREW_SIZE_BY_TRADE: Record<string, number> = {
  /* canonical labor taxonomy keys */
  general_conditions: 2,
  demolition: 3,
  sitework_concrete: 3,
  framing: 3,
  roofing: 4,
  exterior: 3,
  plumbing: 2,
  electrical: 2,
  hvac: 2,
  insulation: 2,
  drywall: 3,
  finish_carpentry: 2,
  flooring: 2,
  tile: 2,
  painting: 2,
  specialty: 2,
  unassigned: DEFAULT_CREW_SIZE,
  /* raw/feature trade keys seen on estimate lines */
  siding: 3,
  landscaping: 3,
  sitework: 3,
  concrete: 3,
  decks: 2,
  deck: 2,
  carpentry: 2,
  doors: 2,
  windows: 2,
  doors_windows: 2,
  masonry: 3,
  gutters: 2,
  trim: 2,
};

const norm = (key: unknown): string =>
  String(key ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");

/** Assumed crew size for a trade key (canonical or raw). */
export function crewSizeForTrade(tradeKey: unknown): number {
  const key = norm(tradeKey);
  if (!key) return DEFAULT_CREW_SIZE;
  if (CREW_SIZE_BY_TRADE[key] != null) return CREW_SIZE_BY_TRADE[key];
  /* tolerate compound keys like "exterior.siding" or "roofing_metal" */
  for (const [candidate, size] of Object.entries(CREW_SIZE_BY_TRADE)) {
    if (key.startsWith(`${candidate}_`) || key.startsWith(`${candidate}.`)) return size;
  }
  return DEFAULT_CREW_SIZE;
}

export interface CrewDuration {
  /** Total crew-hours (all people combined). */
  crewHours: number;
  /** Assumed people on site. */
  crewSize: number;
  /** Calendar working days, always at least 1 when there is any labor. */
  days: number;
  productiveHoursPerDay: number;
}

/**
 * Convert crew-hours into a calendar duration.
 *
 * days = ceil(crewHours / (crewSize * productiveHoursPerDay))
 */
export function crewDuration(input: {
  crewHours: number | null | undefined;
  tradeKey?: string | null;
  crewSize?: number | null;
  productiveHoursPerDay?: number | null;
}): CrewDuration {
  const raw = Number(input.crewHours ?? 0);
  const crewHours = Number.isFinite(raw) && raw > 0 ? Math.round(raw * 100) / 100 : 0;
  const crewSize = Math.max(
    1,
    Math.round(
      Number.isFinite(Number(input.crewSize)) && Number(input.crewSize) > 0
        ? Number(input.crewSize)
        : crewSizeForTrade(input.tradeKey),
    ),
  );
  const perDay =
    Number.isFinite(Number(input.productiveHoursPerDay)) &&
    Number(input.productiveHoursPerDay) > 0
      ? Number(input.productiveHoursPerDay)
      : PRODUCTIVE_HOURS_PER_DAY;

  const days = crewHours > 0 ? Math.max(1, Math.ceil(crewHours / (crewSize * perDay))) : 0;
  return { crewHours, crewSize, days, productiveHoursPerDay: perDay };
}

/**
 * PROJECT-LEVEL duration, blended across the trades actually on the job.
 *
 * The single source for "how long will this take" wherever a whole-project
 * hour total is shown. Crew size is the hours-weighted average of the
 * per-trade crew defaults, so a roofing-heavy job reads as a 4-person crew and
 * a trim-only job as 2 — never a flat company default that ignores the mix.
 * An explicit contractor-entered crew size or productive-hours value always
 * wins.
 */
export function blendedCrewSize(
  trades: ReadonlyArray<{ tradeKey?: string | null; crewHours: number }>,
): number {
  const total = trades.reduce((s, r) => s + Math.max(0, Number(r.crewHours) || 0), 0);
  if (total <= 0) return DEFAULT_CREW_SIZE;
  const weighted = trades.reduce(
    (s, r) => s + Math.max(0, Number(r.crewHours) || 0) * crewSizeForTrade(r.tradeKey),
    0,
  );
  return Math.max(1, Math.round(weighted / total));
}

export function projectCrewDuration(input: {
  totalHours: number | null | undefined;
  trades: ReadonlyArray<{ tradeKey?: string | null; crewHours: number }>;
  /** Contractor override; blank/zero falls back to the blended crew. */
  crewSize?: number | null;
  /** Contractor override; blank/zero falls back to 8 productive hours. */
  productiveHoursPerDay?: number | null;
}): CrewDuration {
  const explicit = Number(input.crewSize);
  return crewDuration({
    crewHours: input.totalHours,
    crewSize:
      Number.isFinite(explicit) && explicit > 0 ? explicit : blendedCrewSize(input.trades),
    productiveHoursPerDay: input.productiveHoursPerDay ?? null,
  });
}
