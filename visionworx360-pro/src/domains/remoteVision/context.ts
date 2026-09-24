/**
 * Post-upload contractor context: voice note, typed notes and measurements.
 *
 * Everything here is deterministic and UI-free. The critical product rule this
 * module encodes: measurements typed or spoken by the contractor are FACTS,
 * while anything derived from a photo or a walkthrough video frame is an
 * OBSERVATION and must never be presented as a confirmed measurement.
 */

import type {
  RemoteVisionContext,
  RemoteVisionDimensions,
  RemoteVisionMedia,
} from "./types";

export const EMPTY_CONTEXT: RemoteVisionContext = {
  voiceTranscript: "",
  typedNotes: "",
  dimensions: [],
};

export function emptyDimensions(id: string, roomLabel = ""): RemoteVisionDimensions {
  return { id, roomLabel, lengthFt: null, widthFt: null, ceilingHeightFt: null };
}

export function hasDimensionValues(d: RemoteVisionDimensions): boolean {
  return d.lengthFt !== null || d.widthFt !== null || d.ceilingHeightFt !== null;
}

/** Floor area, only when both plan dimensions are present. */
export function floorAreaSqft(d: RemoteVisionDimensions): number | null {
  if (d.lengthFt === null || d.widthFt === null) return null;
  return Math.round(d.lengthFt * d.widthFt * 100) / 100;
}

function dimensionSentence(d: RemoteVisionDimensions): string {
  const room = d.roomLabel.trim() || "The area";
  const parts: string[] = [];
  if (d.lengthFt !== null && d.widthFt !== null) {
    parts.push(`measures ${d.lengthFt} by ${d.widthFt} feet`);
  } else if (d.lengthFt !== null) {
    parts.push(`is ${d.lengthFt} feet long`);
  } else if (d.widthFt !== null) {
    parts.push(`is ${d.widthFt} feet wide`);
  }
  if (d.ceilingHeightFt !== null) parts.push(`has ${d.ceilingHeightFt} foot ceilings`);
  if (parts.length === 0) return "";
  return `${room} ${parts.join(" and ")}.`;
}

/** Human-readable rendering of the contractor-entered measurements. */
export function dimensionsText(dimensions: RemoteVisionDimensions[]): string {
  return dimensions.map(dimensionSentence).filter(Boolean).join(" ");
}

/**
 * Every input the contractor gave us, merged into a single analyzable text:
 * the original description, the voice transcript, the typed notes and the
 * measurements. Order is stable so analysis output is deterministic.
 */
export function mergeIntakeText(description: string, context: RemoteVisionContext): string {
  return [
    description ?? "",
    context.voiceTranscript ?? "",
    context.typedNotes ?? "",
    dimensionsText(context.dimensions ?? []),
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("\n");
}

export type RemoteVisionInputKind =
  | "description"
  | "voice_note"
  | "typed_note"
  | "measurement"
  | "photo"
  | "video";

export interface RemoteVisionInputRecord {
  kind: RemoteVisionInputKind;
  label: string;
  /** True only when the contractor stated it. Media is never "confirmed". */
  contractorConfirmed: boolean;
  detail: string | null;
}

/**
 * Audit ledger of what the ballpark is standing on. Media rows are always
 * `contractorConfirmed: false` — they are evidence, not measurements.
 */
export function buildInputLedger(
  description: string,
  context: RemoteVisionContext,
  media: RemoteVisionMedia[],
): RemoteVisionInputRecord[] {
  const rows: RemoteVisionInputRecord[] = [];
  if (description.trim()) {
    rows.push({
      kind: "description",
      label: "Project description",
      contractorConfirmed: true,
      detail: null,
    });
  }
  if (context.voiceTranscript.trim()) {
    rows.push({
      kind: "voice_note",
      label: "Voice note",
      contractorConfirmed: true,
      detail: null,
    });
  }
  if (context.typedNotes.trim()) {
    rows.push({ kind: "typed_note", label: "Typed notes", contractorConfirmed: true, detail: null });
  }
  for (const d of context.dimensions.filter(hasDimensionValues)) {
    rows.push({
      kind: "measurement",
      label: d.roomLabel.trim() || "Measurements",
      contractorConfirmed: true,
      detail: dimensionSentence(d).trim() || null,
    });
  }
  for (const m of media) {
    rows.push({
      kind: m.kind === "walkthrough_video" ? "video" : "photo",
      label: m.fileName,
      contractorConfirmed: false,
      detail:
        m.kind === "walkthrough_video"
          ? `${m.keyframeCount ?? 0} representative frame(s) analyzed`
          : null,
    });
  }
  return rows;
}

/**
 * Measurement facts the ballpark intake can consume. Video/photo derived
 * signals are deliberately absent: media can never emit a measurement fact.
 */
export interface RemoteVisionFact {
  key: string;
  value: number;
  source: "contractor";
  roomLabel: string;
}

export function buildMeasurementFacts(context: RemoteVisionContext): RemoteVisionFact[] {
  const facts: RemoteVisionFact[] = [];
  for (const d of context.dimensions) {
    const room = d.roomLabel.trim();
    if (d.lengthFt !== null)
      facts.push({ key: "dimensions.length", value: d.lengthFt, source: "contractor", roomLabel: room });
    if (d.widthFt !== null)
      facts.push({ key: "dimensions.width", value: d.widthFt, source: "contractor", roomLabel: room });
    if (d.ceilingHeightFt !== null)
      facts.push({
        key: "dimensions.ceiling",
        value: d.ceilingHeightFt,
        source: "contractor",
        roomLabel: room,
      });
  }
  return facts;
}
