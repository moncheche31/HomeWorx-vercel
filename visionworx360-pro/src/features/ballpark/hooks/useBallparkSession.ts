import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  QUICK_BALLPARK_SCHEMA,
  visibleQuestions,
  type BallparkInterviewSchema,
  type BallparkAnswer,
  type BallparkAnswers,
  type BallparkLocale,
  type BallparkSessionSnapshot,
  type DurableBallparkSession,
  mergeBallparkAnswers,
} from "@/domains/ballpark";

const STORAGE_PREFIX = "vwx.ballpark.";

function storageKey(projectId: string, schemaKey: string, estimateId?: string | null) {
  return `${STORAGE_PREFIX}${schemaKey}.${estimateId ?? projectId}`;
}

function readSnapshot(projectId: string, schemaKey: string, estimateId?: string | null): BallparkAnswers {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(projectId, schemaKey, estimateId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as BallparkSessionSnapshot;
    if (parsed?.version !== 1 || parsed.schemaKey !== schemaKey) return {};
    /* Project identity is part of acceptance: never hydrate another job's draft. */
    if (parsed.projectId && parsed.projectId !== projectId) return {};
    return parsed.answers ?? {};
  } catch {
    return {};
  }
}

function pruneAnswersToSchema(answers: BallparkAnswers, questionIds: readonly string[]): BallparkAnswers {
  const allowed = new Set(questionIds);
  return Object.fromEntries(Object.entries(answers).filter(([id]) => allowed.has(id)));
}


/**
 * A resumable Quick Ballpark interview.
 *
 * The database is authoritative: server answers hydrate first and a local
 * draft may only contribute keys the server has not answered. Hydration runs
 * ONCE per estimate/schema (plus once more when the first server session
 * arrives). Re-running it on every autosave response is what used to snap the
 * interview back to question 1 after each Next.
 *
 * The active question is tracked by stable question id, never by an index into
 * a recomputed array, so answering a question can never reorder or rewind the
 * sequence.
 */
export function useBallparkSession(
  projectId: string | null,
  schema: BallparkInterviewSchema = QUICK_BALLPARK_SCHEMA,
  /**
   * When set, only these question ids are asked (schema order preserved).
   */
  focusIds?: string[],
  estimateId?: string | null,
  serverSession?: DurableBallparkSession | null,
  interviewType: "full_refinement" | "photo_clarification" = "full_refinement",
  waitForServer = false,
) {
  const { i18n } = useTranslation();
  const locale: BallparkLocale = i18n.language?.startsWith("es") ? "es-US" : "en-US";

  const [answers, setAnswers] = useState<BallparkAnswers>({});
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [completed, setCompleted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [frozenQuestionIds, setFrozenQuestionIds] = useState<string[]>([]);
  const schemaQuestionIds = useMemo(() => schema.questions.map((question) => question.id), [schema]);
  const schemaQuestionKey = schemaQuestionIds.join("|");
  const resumed = useRef(false);

  /** Hydration identity: which estimate, and whether the server row landed. */
  const hydratedFor = useRef<string | null>(null);
  const hydrationKey = `${projectId ?? "none"}|${schema.key}:${schemaQuestionKey}|${estimateId ?? "none"}|${
    serverSession ? "server" : "local"
  }`;

  useEffect(() => {
    if (waitForServer) return;
    if (hydratedFor.current === hydrationKey) return;
    const switchedIdentity =
      hydratedFor.current !== null && hydratedFor.current.split("|")[0] !== (projectId ?? "none");
    hydratedFor.current = hydrationKey;
    resumed.current = false;
    /* Project switch: drop the previous job's cursor before anything hydrates. */
    if (switchedIdentity) {
      setAnswers({});
      setCurrentId(null);
      setFrozenQuestionIds([]);
    }
    if (!projectId) {
      setHydrated(true);
      return;
    }
    /*
     * A durable session is only usable when it belongs to THIS project and
     * estimate. A row fetched for another job (or left over from a previous
     * selection) is ignored rather than merged.
     */
    const serverBelongsHere =
      !!serverSession &&
      (!serverSession.projectId || serverSession.projectId === projectId) &&
      (!estimateId || !serverSession.estimateId || serverSession.estimateId === estimateId);
    const serverMatchesSchema = serverBelongsHere && serverSession?.schemaKey === schema.key;
    const local = pruneAnswersToSchema(readSnapshot(projectId, schema.key, estimateId), schemaQuestionIds);
    const serverAnswers = serverMatchesSchema
      ? pruneAnswersToSchema(serverSession?.answers ?? {}, schemaQuestionIds)
      : {};
    const merged = serverMatchesSchema ? mergeBallparkAnswers(serverAnswers, local) : local;

    setAnswers(pruneAnswersToSchema(merged, schemaQuestionIds));
    const serverFrozen = serverMatchesSchema && serverSession?.interviewType === interviewType
      ? serverSession.frozenQuestionIds ?? []
      : [];
    /*
     * An explicit focus set (the canonical eligibility service) always wins
     * over a stored frozen set. Without this, a stale frozen list from an old
     * session re-asked questions the project already answers.
     */
    const requested = schemaQuestionIds;
    const validFocusIds = (focusIds ?? []).filter((id) => requested.includes(id));
    const validServerFrozen = serverFrozen.filter((id) => requested.includes(id));
    setFrozenQuestionIds(
      validFocusIds.length ? validFocusIds : validServerFrozen.length > 0 ? validServerFrozen : requested,
    );
    setCompleted(false);
    setHydrated(true);
  }, [hydrationKey, projectId, schema.key, estimateId, serverSession, focusIds, interviewType, waitForServer, schemaQuestionIds]);

  useEffect(() => {
    if (!hydrated || !projectId || typeof window === "undefined") return;
    const snapshot: BallparkSessionSnapshot = {
      version: 1,
      schemaKey: schema.key,
      projectId,
      locale,
      answers,
      updatedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(storageKey(projectId, schema.key, estimateId), JSON.stringify(snapshot));
    } catch {
      /* Private browsing: the interview still works, it just cannot resume. */
    }
  }, [answers, hydrated, locale, projectId, schema.key, estimateId]);

  /** Only the questions whose conditions currently hold. */
  const questions = useMemo(() => {
    if (frozenQuestionIds.length === 0) return visibleQuestions(schema, answers);
    const byId = new Map(schema.questions.map((question) => [question.id, question]));
    return frozenQuestionIds.flatMap((id) => {
      const question = byId.get(id);
      return question ? [question] : [];
    });
  }, [schema, answers, frozenQuestionIds]);

  /* Resume at the first unanswered question once, after hydration. */
  useEffect(() => {
    if (!hydrated || resumed.current || questions.length === 0) return;
    resumed.current = true;
    const cursorBelongsHere =
      serverSession?.schemaKey === schema.key &&
      (!serverSession?.projectId || serverSession.projectId === projectId);
    const savedId = cursorBelongsHere ? serverSession?.currentQuestionId ?? null : null;
    if (savedId && questions.some((q) => q.id === savedId)) {
      setCurrentId(savedId);
      return;
    }
    const firstUnanswered = questions.find((q) => answers[q.id]?.status !== "answered");
    setCurrentId(firstUnanswered?.id ?? questions[0]?.id ?? null);
  }, [hydrated, questions, answers, serverSession, schema.key, projectId]);

  const foundIndex = currentId ? questions.findIndex((q) => q.id === currentId) : -1;
  const safeIndex = foundIndex >= 0 ? foundIndex : 0;
  const current = completed ? null : (questions[safeIndex] ?? null);

  const setAnswer = useCallback((questionId: string, answer: BallparkAnswer) => {
    setAnswers((prev) => ({ ...prev, [questionId]: answer }));
  }, []);

  const mergeAnswers = useCallback((patch: BallparkAnswers) => {
    setAnswers((prev) => ({ ...prev, ...patch }));
  }, []);

  const goTo = useCallback((questionId: string) => {
    setCompleted(false);
    setCurrentId(questionId);
  }, []);

  const next = useCallback(() => {
    const at = currentId ? questions.findIndex((q) => q.id === currentId) : 0;
    const from = at >= 0 ? at : 0;
    const upcoming = questions[from + 1];
    if (upcoming) setCurrentId(upcoming.id);
    else setCompleted(true);
  }, [currentId, questions]);

  const nextQuestionId = useCallback(() => {
    const at = currentId ? questions.findIndex((q) => q.id === currentId) : 0;
    return questions[(at >= 0 ? at : 0) + 1]?.id ?? null;
  }, [currentId, questions]);

  const previousQuestionId = useCallback(() => {
    const at = currentId ? questions.findIndex((q) => q.id === currentId) : 0;
    return questions[Math.max(0, (at >= 0 ? at : 0) - 1)]?.id ?? null;
  }, [currentId, questions]);

  const back = useCallback(() => {
    if (completed) {
      setCompleted(false);
      const last = questions[questions.length - 1];
      if (last) setCurrentId(last.id);
      return;
    }
    const at = currentId ? questions.findIndex((q) => q.id === currentId) : 0;
    const previous = questions[Math.max(0, (at >= 0 ? at : 0) - 1)];
    if (previous) setCurrentId(previous.id);
  }, [completed, currentId, questions]);

  const reset = useCallback(() => {
    setAnswers({});
    setCurrentId(questions[0]?.id ?? null);
    setCompleted(false);
    if (projectId && typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(storageKey(projectId, schema.key, estimateId));
      } catch {
        /* ignore */
      }
    }
  }, [projectId, schema.key, estimateId, questions]);

  return {
    schema,
    locale,
    hydrated,
    answers,
    questions,
    current,
    currentId: current?.id ?? null,
    frozenQuestionIds,
    index: safeIndex,
    total: questions.length,
    /** The interview is finished once the contractor steps past the last question. */
    isComplete: completed,
    setAnswer,
    mergeAnswers,
    goTo,
    next,
    nextQuestionId,
    back,
    previousQuestionId,
    reset,
    showQuestions: () => {
      setCompleted(false);
      const last = questions[questions.length - 1];
      if (last) setCurrentId(last.id);
    },
  };
}
