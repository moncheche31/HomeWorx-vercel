import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { useBallparkSession } from "../hooks/useBallparkSession";
import { QUICK_BALLPARK_SCHEMA, type BallparkInterviewSchema, type DurableBallparkSession } from "@/domains/ballpark";

const PROJECT = "11111111-1111-1111-1111-111111111111";
const ESTIMATE = "22222222-2222-2222-2222-222222222222";

function serverSession(answers: Record<string, unknown>): DurableBallparkSession {
  return {
    schemaKey: QUICK_BALLPARK_SCHEMA.key,
    schemaVersion: 1,
    estimateId: ESTIMATE,
    projectId: PROJECT,
    intakeSource: "onsite",
    currentStage: "questions",
    answers: answers as DurableBallparkSession["answers"],
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
  };
}

const answered = (value: string | number) => ({ status: "answered" as const, value });

const STRUCTURAL_SCHEMA: BallparkInterviewSchema = {
  ...QUICK_BALLPARK_SCHEMA,
  key: "quick_ballpark_v1.scoped.structural-bookcases",
  questions: [
    { id: "beamSpanFt", kind: "dimension", promptKey: "q.beamSpanFt.prompt", unit: "ft" },
    { id: "builtInLengthFt", kind: "dimension", promptKey: "q.builtInLengthFt.prompt", unit: "ft" },
  ],
};

describe("ballpark interview progression", () => {
  beforeEach(() => window.localStorage.clear());

  it("advances Q1 -> Q2 -> Q3 exactly once per click and never loops back", async () => {
    const { result } = renderHook(() => useBallparkSession(PROJECT, QUICK_BALLPARK_SCHEMA));
    await waitFor(() => expect(result.current.current).not.toBeNull());

    const first = result.current.current!.id;
    act(() => result.current.setAnswer(first, answered(18)));
    act(() => result.current.next());
    const second = result.current.current!.id;
    expect(second).not.toBe(first);

    act(() => result.current.setAnswer(second, answered(16)));
    act(() => result.current.next());
    const third = result.current.current!.id;
    expect(third).not.toBe(first);
    expect(third).not.toBe(second);
    expect(result.current.index).toBe(2);
  });

  it("keeps the active question stable when the server session object changes", async () => {
    const session = serverSession({});
    const { result, rerender } = renderHook(
      ({ s }: { s: DurableBallparkSession }) =>
        useBallparkSession(PROJECT, QUICK_BALLPARK_SCHEMA, undefined, ESTIMATE, s),
      { initialProps: { s: session } },
    );
    await waitFor(() => expect(result.current.current).not.toBeNull());
    act(() => result.current.next());
    const at = result.current.current!.id;

    /* An autosave response replaces the cached session object identity. */
    rerender({ s: { ...session, updatedAt: new Date().toISOString() } });
    expect(result.current.current!.id).toBe(at);
    expect(result.current.index).toBe(1);
  });

  it("resumes from the durable cursor on a new device", async () => {
    const session = {
      ...serverSession({ lengthFt: answered(18), widthFt: answered(16) }),
      currentQuestionId: "ceilingHeightFt",
      interviewType: "full_refinement" as const,
      frozenQuestionIds: QUICK_BALLPARK_SCHEMA.questions.map((question) => question.id),
    };
    const { result } = renderHook(() =>
      useBallparkSession(PROJECT, QUICK_BALLPARK_SCHEMA, undefined, ESTIMATE, session),
    );
    await waitFor(() => expect(result.current.current?.id).toBe("ceilingHeightFt"));
    expect(result.current.answers.lengthFt).toEqual(answered(18));
    expect(result.current.answers.widthFt).toEqual(answered(16));
  });

  it("does not latch onto a local question while the authoritative session is loading", async () => {
    const durable = {
      ...serverSession({ lengthFt: answered(18), widthFt: answered(16) }),
      currentQuestionId: "ceilingHeightFt",
    };
    const { result, rerender } = renderHook(
      ({ loading, session }: { loading: boolean; session: DurableBallparkSession | null }) =>
        useBallparkSession(
          PROJECT,
          QUICK_BALLPARK_SCHEMA,
          undefined,
          ESTIMATE,
          session,
          "full_refinement",
          loading,
        ),
      { initialProps: { loading: true, session: null as DurableBallparkSession | null } },
    );
    expect(result.current.hydrated).toBe(false);
    rerender({ loading: false, session: durable });
    await waitFor(() => expect(result.current.current?.id).toBe("ceilingHeightFt"));
  });

  it("keeps a frozen full-refinement sequence when answers reveal conditional questions", async () => {
    const { result } = renderHook(() => useBallparkSession(PROJECT, QUICK_BALLPARK_SCHEMA));
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const original = result.current.frozenQuestionIds;
    act(() => result.current.setAnswer("partitions", answered("moderate")));
    expect(result.current.frozenQuestionIds).toEqual(original);
    expect(result.current.frozenQuestionIds).toContain("partitionLfKnown");
  });

  it("back returns to the previous question and preserves answers", async () => {
    const { result } = renderHook(() => useBallparkSession(PROJECT, QUICK_BALLPARK_SCHEMA));
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const first = result.current.current!.id;
    act(() => result.current.setAnswer(first, answered(18)));
    act(() => result.current.next());
    act(() => result.current.back());
    expect(result.current.current!.id).toBe(first);
    expect(result.current.answers[first]).toEqual(answered(18));
  });

  it("walks every question once and finishes at results", async () => {
    const { result } = renderHook(() => useBallparkSession(PROJECT, QUICK_BALLPARK_SCHEMA));
    await waitFor(() => expect(result.current.current).not.toBeNull());
    const seen: string[] = [];
    for (let i = 0; i < 60 && !result.current.isComplete; i += 1) {
      const q = result.current.current!;
      seen.push(q.id);
      act(() => result.current.setAnswer(q.id, answered(1)));
      act(() => result.current.next());
    }
    expect(result.current.isComplete).toBe(true);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("hydrates server answers with no localStorage and resumes at the first unanswered question", async () => {
    const questions = QUICK_BALLPARK_SCHEMA.questions;
    const [q1, q2] = questions;
    const { result } = renderHook(() =>
      useBallparkSession(
        PROJECT,
        QUICK_BALLPARK_SCHEMA,
        undefined,
        ESTIMATE,
        serverSession({ [q1.id]: answered(18), [q2.id]: answered(16) }),
      ),
    );
    await waitFor(() => expect(result.current.current).not.toBeNull());
    expect(result.current.answers[q1.id]).toEqual(answered(18));
    expect(result.current.answers[q2.id]).toEqual(answered(16));
    expect(result.current.current!.id).not.toBe(q1.id);
    expect(result.current.current!.id).not.toBe(q2.id);
  });

  it("ignores stale durable answers, frozen questions, and cursor when the schema changes", async () => {
    const stale = {
      ...serverSession({
        lengthFt: answered(22),
        widthFt: answered(20),
        builtInLengthFt: answered(10),
      }),
      currentQuestionId: "lengthFt",
      interviewType: "full_refinement" as const,
      frozenQuestionIds: ["lengthFt", "widthFt", "raisedFloor", "partitions"],
    };

    const { result } = renderHook(() =>
      useBallparkSession(PROJECT, STRUCTURAL_SCHEMA, undefined, ESTIMATE, stale),
    );

    await waitFor(() => expect(result.current.current?.id).toBe("beamSpanFt"));
    expect(result.current.answers).toEqual({});
    expect(result.current.frozenQuestionIds).toEqual(["beamSpanFt", "builtInLengthFt"]);
  });
});
