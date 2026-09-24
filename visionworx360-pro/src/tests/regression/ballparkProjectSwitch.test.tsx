/**
 * PROJECT-SWITCH SAFETY.
 *
 * Switching the selected project must not reuse the previous project's
 * answers, cursor or frozen question list, and a durable session belonging to
 * another project must never hydrate.
 */

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { useBallparkSession } from "@/features/ballpark/hooks/useBallparkSession";
import {
  GARAGE_CONVERSION_SCHEMA,
  type BallparkInterviewSchema,
  type DurableBallparkSession,
} from "@/domains/ballpark";

const PROJECT_A = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJECT_B = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const HANDYMAN_SCHEMA: BallparkInterviewSchema = {
  key: "quick_ballpark_v1.scoped.handyman",
  titleKey: GARAGE_CONVERSION_SCHEMA.titleKey,
  questions: GARAGE_CONVERSION_SCHEMA.questions.filter((q) =>
    ["insulationCeiling", "newDoors"].includes(q.id),
  ),
};

function sessionFor(projectId: string): DurableBallparkSession {
  return {
    schemaKey: GARAGE_CONVERSION_SCHEMA.key,
    schemaVersion: 1,
    estimateId: null,
    projectId,
    intakeSource: "onsite",
    currentStage: "questions",
    currentQuestionId: "raisedFloor",
    answers: { lengthFt: { status: "answered", value: 24 } },
    transcripts: {},
    photoReferences: [],
    photoAnalysis: {},
    confirmedValues: {},
    inferredValues: {},
    assumedValues: {},
    contractorOverrides: {},
    derivedGeometry: {},
    derivedQuantities: [],
    unknowns: [],
    rangeInputs: {},
    rangeSnapshot: null,
    confidence: null,
    updatedAt: new Date().toISOString(),
  } as unknown as DurableBallparkSession;
}

describe("switching projects isolates the ballpark interview", () => {
  beforeEach(() => window.localStorage.clear());

  it("drops project A's questions, answers and cursor when project B opens", async () => {
    const { result, rerender } = renderHook(
      ({ projectId, schema, session }: {
        projectId: string;
        schema: BallparkInterviewSchema;
        session: DurableBallparkSession | null;
      }) => useBallparkSession(projectId, schema, undefined, null, session),
      {
        initialProps: {
          projectId: PROJECT_A,
          schema: GARAGE_CONVERSION_SCHEMA,
          session: sessionFor(PROJECT_A) as DurableBallparkSession | null,
        },
      },
    );

    await waitFor(() => expect(result.current.current?.id).toBe("raisedFloor"));
    expect(result.current.answers.lengthFt).toBeTruthy();

    rerender({ projectId: PROJECT_B, schema: HANDYMAN_SCHEMA, session: null });

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.questions.map((q) => q.id)).toEqual(["insulationCeiling", "newDoors"]);
    expect(result.current.answers).toEqual({});
    expect(result.current.currentId).not.toBe("raisedFloor");
  });

  it("ignores a durable session that belongs to another project", async () => {
    const { result } = renderHook(() =>
      useBallparkSession(PROJECT_B, GARAGE_CONVERSION_SCHEMA, undefined, null, sessionFor(PROJECT_A)),
    );
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.answers).toEqual({});
    /* Its saved cursor is discarded: project B starts at its own first question. */
    expect(result.current.currentId).toBe(GARAGE_CONVERSION_SCHEMA.questions[0].id);
  });
});
