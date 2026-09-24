import type { BallparkAnswers, BallparkConfidence } from "./types";
import type { BallparkIntakeSource } from "./intake";
import type { Json } from "@/integrations/supabase/types";

export type BallparkPersistenceState = "saving" | "saved" | "offline" | "error";
export type BallparkInterviewType = "initial" | "full_refinement" | "photo_clarification";

export interface DurableBallparkSession {
  schemaKey: string;
  schemaVersion: number;
  estimateId: string;
  projectId: string;
  intakeSource: BallparkIntakeSource;
  currentStage: "intake" | "review" | "questions" | "results";
  interviewType?: BallparkInterviewType;
  /** Immutable ordered question ids for this interview run. */
  frozenQuestionIds?: string[];
  /** Stable id of the question the contractor was on, so a refresh resumes there. */
  currentQuestionId?: string | null;
  answers: BallparkAnswers;
  transcripts: Record<string, string>;
  photoReferences: Json[];
  photoAnalysis: Record<string, Json | undefined>;
  confirmedValues: Record<string, Json | undefined>;
  inferredValues: Record<string, Json | undefined>;
  assumedValues: Record<string, Json | undefined>;
  contractorOverrides: Record<string, Json | undefined>;
  derivedGeometry: Record<string, Json | undefined>;
  derivedQuantities: Json[];
  unknowns: Json[];
  rangeInputs: Record<string, Json | undefined>;
  rangeSnapshot: Record<string, Json | undefined> | null;
  /** Computed from the draft only; never promoted until the contractor saves. */
  draftPreview?: Record<string, Json | undefined> | null;
  confidence: BallparkConfidence | null;
  description?: string;
  observations?: Json[];
  corrections?: Record<string, number | "confirm">;
  clarifications?: string[];
  updatedAt: string;
  recoveredFromEstimateSnapshot?: boolean;
}

/**
 * Server values are authoritative. A newer local draft may contribute only
 * unanswered keys; it can never erase or replace a populated server answer.
 * Unknown legacy keys are intentionally retained across schema upgrades.
 *
 * ONE EXCEPTION, and it is the contractor's own words: when the local draft
 * holds a spoken answer (it carries a transcript) and the stored server answer
 * does not, the server value came from derived/measured state. Letting it win
 * is how a spoken "36" was replaced by a stale 20 on every rehydration.
 */
export function mergeBallparkAnswers(
  server: BallparkAnswers,
  local: BallparkAnswers,
): BallparkAnswers {
  const merged = { ...local, ...server };
  for (const [key, answer] of Object.entries(server)) {
    if (answer?.status !== "answered") continue;
    const spokenLocal = local[key];
    const localIsSpoken =
      spokenLocal?.status === "answered" && Boolean((spokenLocal.transcript ?? "").trim());
    if (localIsSpoken && !(answer.transcript ?? "").trim()) {
      merged[key] = spokenLocal!;
      continue;
    }
    merged[key] = answer;
  }
  return merged;
}


export function transcriptsFromAnswers(answers: BallparkAnswers): Record<string, string> {
  const transcripts: Record<string, string> = {};
  for (const [key, answer] of Object.entries(answers)) {
    if (answer?.transcript) transcripts[key] = answer.transcript;
  }
  return transcripts;
}
