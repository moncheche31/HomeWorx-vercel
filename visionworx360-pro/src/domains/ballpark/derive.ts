/**
 * Answers → geometry, allowances, explicit assumptions and quantities.
 *
 * Documented rules only. Every value that was not spoken by the contractor is
 * emitted as an `assumed` assumption so the ballpark screen can show it, and
 * every input the contractor skipped is emitted as an unknown so the range
 * gets wider instead of more precise.
 */

import { deriveRoomGeometry, type GeometryOpening, type RoomGeometryInput } from "@/domains/geometry";
import type {
  BallparkAnswers,
  BallparkAssumption,
  BallparkDerived,
  BallparkQuantity,
  BallparkUnknown,
} from "./types";
import { QUICK_BALLPARK_SCHEMA, visibleQuestions } from "./questions";
import { footprintFor, SIZE_CLASS_FOOTPRINT } from "./intake";
import type { BallparkInterviewSchema } from "./types";


const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const round1 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 10) / 10;

/* ------------------------------------------------------------------ *
 * Documented allowance tables. Changing a number here changes every
 * ballpark; nothing in the UI hard-codes these.
 * ------------------------------------------------------------------ */

/** New partition length as a fraction of the room perimeter. */
export const PARTITION_ALLOWANCE_FACTOR: Record<string, number> = {
  none: 0,
  light: 0.25,
  moderate: 0.5,
  extensive: 0.9,
};

/** Bathroom footprint assumptions (floor area and enclosing partitions). */
export const BATHROOM_ALLOWANCE: Record<string, { areaSf: number; partitionLf: number }> = {
  none: { areaSf: 0, partitionLf: 0 },
  half: { areaSf: 20, partitionLf: 18 },
  full: { areaSf: 40, partitionLf: 26 },
};

/** Closet footprint assumptions (floor area, partitions, shelving LF). */
export const CLOSET_ALLOWANCE: Record<
  string,
  { areaSf: number; partitionLf: number; shelvingLf: number }
> = {
  none: { areaSf: 0, partitionLf: 0, shelvingLf: 0 },
  small: { areaSf: 8, partitionLf: 12, shelvingLf: 6 },
  standard: { areaSf: 15, partitionLf: 16, shelvingLf: 10 },
  large: { areaSf: 30, partitionLf: 22, shelvingLf: 18 },
};

/** Standard opening sizes used when only a count is known. */
export const OPENING_ASSUMPTION = {
  door: { widthFt: 3, heightFt: 6.83 },
  window: { widthFt: 3, heightFt: 4 },
} as const;

/** How much each missing input widens the band, in percent. */
export const UNKNOWN_WIDEN_PCT: Record<string, number> = {
  /* A footprint allowance still prices the job; it just prices it wider. */
  lengthFt: 12,
  widthFt: 12,
  ceilingHeightFt: 8,

  partitions: 8,
  bathroom: 7,
  raisedFloor: 6,
  drywall: 5,
  flooringQuality: 4,
  plumbing: 6,
  electrical: 5,
  closet: 3,
  insulationWalls: 3,
  insulationCeiling: 3,
  insulationFloor: 3,
  newDoors: 2,
  newWindows: 2,
  finishLevel: 4,
  useOfSpace: 1,
  partitionLfKnown: 2,
};

const DEFAULT_WIDEN_PCT = 3;

/** Assumed when the contractor did not answer but the work is still likely. */
const FALLBACK: Record<string, string | number> = {
  ceilingHeightFt: 8,
  bathroom: "none",
  closet: "none",
  partitions: "moderate",
  raisedFloor: "unsure",
  insulationWalls: "yes",
  insulationCeiling: "yes",
  insulationFloor: "unsure",
  drywall: "walls_and_ceiling",
  flooringQuality: "mid",
  plumbing: "none",
  electrical: "moderate",
  newDoors: 1,
  newWindows: 1,
  finishLevel: "standard",
};

interface Resolved {
  value: string | number | null;
  source: "answered" | "assumed";
}

function resolve(answers: BallparkAnswers, id: string): Resolved {
  const answer = answers[id];
  if (answer?.status === "answered" && answer.value !== undefined && answer.value !== null && answer.value !== "") {
    return { value: answer.value, source: "answered" };
  }
  const fallback = FALLBACK[id];
  return { value: fallback ?? null, source: "assumed" };
}

const asNumber = (v: string | number | null): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

const asText = (v: string | number | null): string => (v == null ? "" : String(v));

/** "yes" and "unsure" both include the work; "unsure" also widens the range. */
const includesWork = (value: string): boolean => value === "yes" || value === "unsure";

/**
 * Derive everything downstream of the interview. Deterministic: identical
 * answers always produce identical geometry, assumptions and quantities.
 */
export function deriveBallpark(
  answers: BallparkAnswers,
  /**
   * The interview actually relevant to this project. Questions the scope does
   * not justify are never asked, never assumed and never priced.
   */
  schema: BallparkInterviewSchema = QUICK_BALLPARK_SCHEMA,
): BallparkDerived {
  const assumptions: BallparkAssumption[] = [];
  const unknowns: BallparkUnknown[] = [];

  const inSchema = new Set(schema.questions.map((question) => question.id));
  /** Out-of-scope inputs resolve to nothing instead of a garage fallback. */
  const resolveScoped = (id: string): Resolved =>
    inSchema.has(id) ? resolve(answers, id) : { value: null, source: "assumed" };

  const asked = visibleQuestions(schema, answers);
  for (const question of asked) {
    if (question.optional) continue;
    const answer = answers[question.id];
    const missing =
      !answer ||
      answer.status !== "answered" ||
      answer.value === undefined ||
      answer.value === null ||
      answer.value === "";
    const saidUnsure = answer?.status === "answered" && answer.value === "unsure";
    if (missing || saidUnsure) {

      unknowns.push({
        questionId: question.id,
        promptKey: question.promptKey,
        widenPct: UNKNOWN_WIDEN_PCT[question.id] ?? DEFAULT_WIDEN_PCT,
      });
    }
  }

  const add = (
    key: string,
    labelKey: string,
    value: string,
    source: BallparkAssumption["source"],
    basis: string | null = null,
    questionId: string | null = null,
  ) => {
    if (questionId && !inSchema.has(questionId)) return;
    assumptions.push({ key, labelKey, value, source, basis, questionId });
  };

  /* --- core geometry ------------------------------------------------ */
  /*
   * Ballpark never blocks on a missing room dimension. A dimension the
   * contractor actually stated always wins; when one is missing we fall back
   * to a DOCUMENTED footprint allowance (room type + size class when known,
   * otherwise a standard medium room) and disclose it as an assumption. The
   * missing answer still registers as an unknown above, so the band widens.
   */
  const statedLength = asNumber(resolveScoped("lengthFt").value);
  const statedWidth = asNumber(resolveScoped("widthFt").value);
  const geometryAsked = inSchema.has("lengthFt") || inSchema.has("widthFt");
  const footprintAllowance =
    geometryAsked && (!statedLength || !statedWidth)
      ? footprintFor(
          asText(answers.roomType?.value ?? null) || null,
          asText(answers.sizeClass?.value ?? null) || null,
        ) ?? SIZE_CLASS_FOOTPRINT.medium
      : null;
  const length = statedLength || footprintAllowance?.lengthFt || null;
  const width = statedWidth || footprintAllowance?.widthFt || null;
  const dimensionsAreAllowance = footprintAllowance != null;
  const heightResolved = resolveScoped("ceilingHeightFt");
  const height = asNumber(heightResolved.value);


  const doorsResolved = resolveScoped("newDoors");
  const windowsResolved = resolveScoped("newWindows");
  const doors = asNumber(doorsResolved.value) ?? 0;
  const windows = asNumber(windowsResolved.value) ?? 0;

  const openings: GeometryOpening[] = [];
  if (doors > 0) {
    openings.push({ kind: "door", count: doors, ...OPENING_ASSUMPTION.door, interruptsTrim: true });
  }
  if (windows > 0) {
    openings.push({ kind: "window", count: windows, ...OPENING_ASSUMPTION.window, interruptsTrim: false });
  }

  /* --- partition allowance ------------------------------------------ */
  const perimeter = length && width ? round2(2 * (length + width)) : 0;
  const partitionsResolved = resolveScoped("partitions");
  const partitionsInScope = inSchema.has("partitions");
  const partitionsChoice = asText(partitionsResolved.value) || (partitionsInScope ? "moderate" : "none");
  const factor = PARTITION_ALLOWANCE_FACTOR[partitionsChoice] ?? 0;
  const explicitPartitionLf = asNumber(resolveScoped("partitionLfKnown").value);
  const partitionsMeasured =
    inSchema.has("partitionLfKnown") &&
    answers.partitionLfKnown?.status === "answered" && explicitPartitionLf != null && explicitPartitionLf > 0;

  const bathChoice = asText(resolveScoped("bathroom").value) || "none";
  const closetChoice = asText(resolveScoped("closet").value) || "none";
  const bath = BATHROOM_ALLOWANCE[bathChoice] ?? BATHROOM_ALLOWANCE.none;
  const closet = CLOSET_ALLOWANCE[closetChoice] ?? CLOSET_ALLOWANCE.none;

  const allowancePartitionLf = round1(perimeter * factor);
  const partitionLf = partitionsMeasured
    ? round1(explicitPartitionLf as number)
    : round1(allowancePartitionLf + bath.partitionLf + closet.partitionLf);

  const geometryInput: RoomGeometryInput = {
    roomId: null,
    label: asText(resolveScoped("useOfSpace").value) || null,
    lengthFt: length,
    widthFt: width,
    ceilingHeightFt: height,
    openings,
    interiorPartitionLf: partitionLf > 0 ? partitionLf : null,
    floorWastePct: 10,
    notes: null,
  };
  const geometry = deriveRoomGeometry(geometryInput);
  const m = geometry.measurements;

  const floorArea = m.floor_area.status === "available" ? m.floor_area.value : 0;
  const ceilingArea = m.ceiling_area.status === "available" ? m.ceiling_area.value : 0;
  const wallGross = m.wall_gross_area.status === "available" ? m.wall_gross_area.value : 0;
  const wallNet = m.wall_net_area.status === "available" ? m.wall_net_area.value : 0;
  const trimLf = m.trim_lf.status === "available" ? m.trim_lf.value : 0;

  /* Both faces of a partition get framed once and finished twice. */
  const partitionFaceArea = height ? round2(partitionLf * height * 2) : 0;

  /* --- assumption trail --------------------------------------------- */
  if (length && width) {
    add(
      "dimensions",
      "assumption.dimensions",
      `${length} ft × ${width} ft`,
      dimensionsAreAllowance ? "assumed" : "answered",
      dimensionsAreAllowance ? "standard footprint allowance" : null,
      "lengthFt",
    );
  }

  add(
    "ceilingHeight",
    "assumption.ceilingHeight",
    height ? `${height} ft` : "—",
    heightResolved.source,
    null,
    "ceilingHeightFt",
  );
  if (floorArea > 0)
    add("floorArea", "assumption.floorArea", `${floorArea} SF`, "derived", `${length ?? "?"} ft × ${width ?? "?"} ft`);
  if (perimeter > 0)
    add("perimeter", "assumption.perimeter", `${perimeter} LF`, "derived", `2 × (${length ?? "?"} + ${width ?? "?"})`);
  if (wallGross > 0)
    add("wallArea", "assumption.wallArea", `${wallGross} SF`, "derived", `${perimeter} LF × ${height ?? "?"} ft`);
  add(
    "partitions",
    "assumption.partitions",
    partitionsMeasured ? `${partitionLf} LF` : `${partitionsChoice} · ${partitionLf} LF`,
    partitionsMeasured ? "answered" : "assumed",
    partitionsMeasured
      ? null
      : `${Math.round(factor * 100)}% of ${perimeter} LF perimeter` +
        (bath.partitionLf ? ` + ${bath.partitionLf} LF bath` : "") +
        (closet.partitionLf ? ` + ${closet.partitionLf} LF closet` : ""),
    "partitions",
  );
  if (bathChoice !== "none") {
    add(
      "bathroom",
      "assumption.bathroom",
      `${bathChoice} · ${bath.areaSf} SF`,
      resolveScoped("bathroom").source,
      `${bath.areaSf} SF footprint, ${bath.partitionLf} LF of enclosing wall`,
      "bathroom",
    );
  }
  if (closetChoice !== "none") {
    add(
      "closet",
      "assumption.closet",
      `${closetChoice} · ${closet.areaSf} SF`,
      resolveScoped("closet").source,
      `${closet.areaSf} SF footprint, ${closet.shelvingLf} LF shelving`,
      "closet",
    );
  }
  if (doors > 0 || windows > 0) {
    add(
      "openings",
      "assumption.openings",
      `${doors} × door, ${windows} × window`,
      doorsResolved.source === "answered" && windowsResolved.source === "answered" ? "answered" : "assumed",
      `door ${OPENING_ASSUMPTION.door.widthFt}×${OPENING_ASSUMPTION.door.heightFt} ft, window ${OPENING_ASSUMPTION.window.widthFt}×${OPENING_ASSUMPTION.window.heightFt} ft`,
      "newDoors",
    );
  }
  const finishResolved = resolveScoped("finishLevel");
  add("finishLevel", "assumption.finishLevel", asText(finishResolved.value), finishResolved.source, null, "finishLevel");

  /* --- quantities ---------------------------------------------------- */
  const quantities: BallparkQuantity[] = [];
  const push = (
    itemKey: string,
    labelKey: string,
    groupKey: string,
    quantity: number,
    unitKey: BallparkQuantity["unitKey"],
    formula: string,
    isAssumed: boolean,
  ) => {
    if (!(quantity > 0)) return;
    quantities.push({ itemKey, labelKey, groupKey, quantity: round2(quantity), unitKey, formula, isAssumed });
  };

  push(
    "framing.partition_wall",
    "item.partitionWall",
    "group.framing",
    partitionLf,
    "linear_foot",
    partitionsMeasured ? "contractor-entered partition length" : `${partitionsChoice} allowance from ${perimeter} LF perimeter`,
    !partitionsMeasured,
  );

  const raisedFloor = asText(resolveScoped("raisedFloor").value);
  if (includesWork(raisedFloor)) {
    push(
      "framing.raised_floor",
      "item.raisedFloor",
      "group.framing",
      floorArea,
      "square_foot",
      `floor area ${floorArea} SF`,
      raisedFloor !== "yes",
    );
  }

  const insWalls = asText(resolveScoped("insulationWalls").value);
  if (includesWork(insWalls)) {
    push("insulation.walls", "item.insulationWalls", "group.insulation", wallGross, "square_foot", `${perimeter} LF × ${height ?? "?"} ft`, insWalls !== "yes");
  }
  const insCeiling = asText(resolveScoped("insulationCeiling").value);
  if (includesWork(insCeiling)) {
    push("insulation.ceiling", "item.insulationCeiling", "group.insulation", ceilingArea, "square_foot", `ceiling ${ceilingArea} SF`, insCeiling !== "yes");
  }
  const insFloor = asText(resolveScoped("insulationFloor").value);
  if (includesWork(insFloor) && raisedFloor !== "no") {
    push("insulation.floor", "item.insulationFloor", "group.insulation", floorArea, "square_foot", `floor ${floorArea} SF`, insFloor !== "yes");
  }

  const drywall = asText(resolveScoped("drywall").value);
  const drywallArea =
    drywall === "none"
      ? 0
      : drywall === "walls_only"
        ? wallNet + partitionFaceArea
        : wallNet + ceilingArea + partitionFaceArea;
  push(
    "drywall.hang_finish",
    "item.drywall",
    "group.drywall",
    drywallArea,
    "square_foot",
    drywall === "walls_only"
      ? `walls ${wallNet} SF + partitions ${partitionFaceArea} SF`
      : `walls ${wallNet} SF + ceiling ${ceilingArea} SF + partitions ${partitionFaceArea} SF`,
    resolveScoped("drywall").source === "assumed",
  );
  push(
    "paint.walls_ceiling",
    "item.paint",
    "group.finishes",
    drywallArea,
    "square_foot",
    "same surface area as drywall",
    resolveScoped("drywall").source === "assumed",
  );

  const flooringQuality = asText(resolveScoped("flooringQuality").value);
  if (flooringQuality && flooringQuality !== "none") {
    const key = flooringQuality === "basic" ? "flooring.basic" : flooringQuality === "premium" ? "flooring.premium" : "flooring.mid";
    const flooringArea = m.flooring_area_with_waste.status === "available" ? m.flooring_area_with_waste.value : 0;
    push(key, "item.flooring", "group.finishes", flooringArea, "square_foot", `${floorArea} SF + 10% waste`, resolveScoped("flooringQuality").source === "assumed");
  }

  if (inSchema.has("drywall"))
    push("trim.base", "item.trim", "group.finishes", trimLf + partitionLf, "linear_foot", `perimeter trim ${trimLf} LF + partitions ${partitionLf} LF`, !partitionsMeasured);

  if (doors > 0) push("door.interior", "item.doors", "group.openings", doors, "each", `${doors} new door(s)`, doorsResolved.source === "assumed");
  if (windows > 0) push("window.unit", "item.windows", "group.openings", windows, "each", `${windows} new window(s)`, windowsResolved.source === "assumed");

  const electrical = asText(resolveScoped("electrical").value);
  if (electrical) {
    push(`electrical.${electrical}`, "item.electrical", "group.systems", 1, "each", `${electrical} electrical scope`, resolveScoped("electrical").source === "assumed");
  }
  const plumbing = asText(resolveScoped("plumbing").value);
  if (plumbing && plumbing !== "none") {
    push(`plumbing.${plumbing}`, "item.plumbing", "group.systems", 1, "each", `${plumbing} plumbing relocation`, resolveScoped("plumbing").source === "assumed");
  }
  if (bathChoice === "half") push("bath.half_fixtures", "item.bathFixtures", "group.systems", 1, "each", "half bath fixtures", resolveScoped("bathroom").source === "assumed");
  if (bathChoice === "full") push("bath.full_fixtures", "item.bathFixtures", "group.systems", 1, "each", "full bath fixtures", resolveScoped("bathroom").source === "assumed");
  if (closet.shelvingLf > 0) push("closet.shelving", "item.closetShelving", "group.finishes", closet.shelvingLf, "linear_foot", `${closetChoice} closet shelving`, resolveScoped("closet").source === "assumed");

  return {
    geometryInput,
    geometry,
    quantities,
    assumptions,
    unknowns,
    allowances: {
      partitionLf,
      bathroomAreaSf: bath.areaSf,
      closetAreaSf: closet.areaSf,
    },
  };
}
