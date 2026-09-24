import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  parseTranscript,
  type VoiceAssemblyRef,
  type VoiceDraftItem,
  type VoiceRoomRef,
} from "@/domains/voiceCapture";
import {
  applyAnswers,
  buildQuestions,
  canAdvance,
  draftDedupeKey,
  filterUncommitted,
  nextStep,
  previousStep,
  unresolvedQuestions,
  type CaptureLanguage,
  type WalkthroughAnswer,
  type WalkthroughRoomProgress,
  type WalkthroughStep,
} from "@/domains/walkthrough";
import { useAssembliesQuery } from "@/features/knowledge-base/hooks/useKnowledgeBase";
import { useRoomsQuery } from "@/features/project-workspace/hooks/useProjectWorkspace";
import { useScopeMutations, useScopeSectionsQuery } from "@/features/scope/hooks/useScope";
import { useEstimateCommit } from "@/features/estimating/hooks/useEstimateCommit";
import {
  useDictation,
  type DictationErrorCode,
  type DictationStatus,
} from "@/features/voice-capture/hooks/useDictation";
import { trackWalkthroughEvent } from "../analytics";
import { useWalkthroughSessionStore } from "./useWalkthroughSession";

const SECTION_NAME = "Walkthrough";

interface RoomRow {
  id: string;
  name: string;
}

export interface UseWalkthroughResult {
  /** Estimate created/updated by the shared commit bridge on approval. */
  estimateId: string | null;
  ready: boolean;
  step: WalkthroughStep;
  projectId: string | null;
  projectName: string | null;
  roomId: string | null;
  roomName: string | null;
  captureLanguage: CaptureLanguage;
  transcript: string;
  /** Project-level description captured on the capture-first intake step. */
  description: string;
  interim: string;
  recording: boolean;
  paused: boolean;
  speechSupported: boolean;
  speechStatus: DictationStatus;
  errorCode: DictationErrorCode | null;
  elapsedMs: number;
  audioLevel: number;
  hasRetryableAudio: boolean;
  drafts: VoiceDraftItem[];
  rooms: VoiceRoomRef[];
  questions: ReturnType<typeof buildQuestions>;
  answers: Record<string, WalkthroughAnswer>;
  unresolvedCount: number;
  completedRooms: WalkthroughRoomProgress[];
  committing: boolean;
  hasResumableSession: boolean;
  loadingContext: boolean;
  setProject: (id: string, name: string | null) => void;
  setRoom: (id: string | null, name: string | null) => void;
  setCaptureLanguage: (lang: CaptureLanguage) => void;
  setTranscript: (value: string) => void;
  setDescription: (value: string) => void;
  /** Analyse THIS project's captured evidence and derive its own questions. */
  analyzeIntake: () => void;
  startRecording: () => void;
  pauseRecording: () => void;
  resumeRecording: () => void;
  stopRecording: () => void;
  retryTranscription: () => void;
  recordAgain: () => void;
  finishRoom: () => void;
  undoLast: () => void;
  answer: (questionId: string, answer: WalkthroughAnswer) => void;
  updateDraft: (id: string, patch: Partial<VoiceDraftItem>) => void;
  approveDraft: (id: string) => void;
  deleteDraft: (id: string) => void;
  markNeedsReview: (id: string) => void;
  approveAllHighConfidence: () => void;
  commit: () => Promise<number>;
  goNext: () => void;
  goBack: () => void;
  goToStep: (step: WalkthroughStep) => void;
  startAnotherRoom: () => void;
  abandon: () => void;
  finish: () => void;
}

/**
 * @param activeProjectId The project this walkthrough belongs to (from the
 * route). Every persisted and in-memory value below is scoped to it: changing
 * projects wipes transient state instead of inheriting the previous project's
 * drafts, answers and generated questions.
 */
export function useWalkthrough(activeProjectId: string | null = null): UseWalkthroughResult {
  const { i18n } = useTranslation();

  const [step, setStep] = useState<WalkthroughStep>(activeProjectId ? "intake" : "project");
  const [projectId, setProjectId] = useState<string | null>(activeProjectId);
  const [projectName, setProjectName] = useState<string | null>(null);
  const { restored, hydrated, save, clear } = useWalkthroughSessionStore(projectId);
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [captureLanguage, setCaptureLanguage] = useState<CaptureLanguage>(
    i18n.language?.startsWith("es") ? "es-US" : "en-US",
  );
  const [transcript, setTranscriptState] = useState("");
  const [description, setDescription] = useState("");
  const [drafts, setDrafts] = useState<VoiceDraftItem[]>([]);
  const [answers, setAnswers] = useState<Record<string, WalkthroughAnswer>>({});
  const [committedKeys, setCommittedKeys] = useState<string[]>([]);
  const [completedRooms, setCompletedRooms] = useState<WalkthroughRoomProgress[]>([]);
  const [committing, setCommitting] = useState(false);
  const [restoredOnce, setRestoredOnce] = useState(false);
  const scopedTo = useRef<string | null>(projectId);

  const transcriptRef = useRef("");
  const segmentsRef = useRef<string[]>([]);

  /* ---------------------------- context data ---------------------------- */
  const roomsQuery = useRoomsQuery(projectId ?? undefined);
  const assembliesQuery = useAssembliesQuery({ search: "" });
  const sectionsQuery = useScopeSectionsQuery(projectId ?? undefined);
  const mutations = useScopeMutations(projectId ?? "");
  const estimateCommit = useEstimateCommit();
  const [estimateId, setEstimateId] = useState<string | null>(null);

  const roomRows = (roomsQuery.data as RoomRow[] | undefined) ?? [];
  const rooms: VoiceRoomRef[] = useMemo(
    () => roomRows.map((r) => ({ id: r.id, name: r.name })),
    [roomsQuery.data], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const assemblies: VoiceAssemblyRef[] = useMemo(
    () =>
      (assembliesQuery.data ?? []).map((a) => ({
        assemblyKey: a.assemblyKey,
        workItem: a.workItem,
        tradeKey: a.tradeKey,
        categoryKey: a.categoryKey,
        subcategoryKey: a.subcategoryKey,
        unitKey: a.unitKey,
        keywords: a.keywords,
      })),
    [assembliesQuery.data],
  );

  /* ------------------------------ recovery ------------------------------ */
  useEffect(() => {
    if (!hydrated || restoredOnce) return;
    setRestoredOnce(true);
    if (!restored || restored.projectId !== projectId) return;
    setStep(restored.step);
    setProjectId(restored.projectId);
    setProjectName(restored.projectName);
    setRoomId(restored.roomId);
    setRoomName(restored.roomName);
    setCaptureLanguage(restored.captureLanguage);
    setTranscriptState(restored.transcript);
    setDescription(restored.description ?? "");
    transcriptRef.current = restored.transcript;
    setDrafts(restored.drafts);
    setAnswers(restored.answers);
    setCommittedKeys(restored.committedKeys);
    setCompletedRooms(restored.completedRooms);
  }, [hydrated, restored, restoredOnce, projectId]);

  /*
   * Project switch = hard reset of everything transient. Without this, drafts,
   * answers and generated questions from the previously opened project stayed
   * in React state and were rendered (and re-persisted) under the new project.
   */
  useEffect(() => {
    if (scopedTo.current === projectId) return;
    scopedTo.current = projectId;
    setStep(projectId ? "intake" : "project");
    setRoomId(null);
    setRoomName(null);
    setTranscriptState("");
    transcriptRef.current = "";
    segmentsRef.current = [];
    setDescription("");
    setDrafts([]);
    setAnswers({});
    setCommittedKeys([]);
    setCompletedRooms([]);
    setRestoredOnce(false);
  }, [projectId]);

  /* ----------------------------- persistence ---------------------------- */
  useEffect(() => {
    if (!restoredOnce || !projectId) return;
    save({
      projectId,
      projectName,
      roomId,
      roomName,
      step,
      captureLanguage,
      description,
      transcript,
      drafts,
      answers,
      committedKeys,
      completedRooms,
    });
  }, [
    restoredOnce,
    projectId,
    projectName,
    roomId,
    roomName,
    step,
    captureLanguage,
    description,
    transcript,
    drafts,
    answers,
    committedKeys,
    completedRooms,
    save,
  ]);

  /* ------------------------------- speech ------------------------------- */
  const appendSegment = useCallback((text: string) => {
    segmentsRef.current = [...segmentsRef.current, text];
    setTranscriptState((prev) => {
      const next = prev ? `${prev.replace(/\s+$/, "")} ${text}` : text;
      transcriptRef.current = next;
      return next;
    });
  }, []);

  const speech = useDictation({ lang: captureLanguage, onFinalSegment: appendSegment });

  const setTranscript = useCallback((value: string) => {
    transcriptRef.current = value;
    setTranscriptState(value);
  }, []);

  /* ------------------------------ questions ----------------------------- */
  const questions = useMemo(() => buildQuestions(drafts, { rooms }), [drafts, rooms]);
  const unresolvedCount = useMemo(
    () => unresolvedQuestions(questions, answers).length,
    [questions, answers],
  );

  const ctx = useMemo(
    () => ({
      hasProject: Boolean(projectId),
      hasRoom: Boolean(roomId) || Boolean(roomName),
      hasEvidence: description.trim().length > 0 || transcript.trim().length > 0,
      hasTranscript: transcript.trim().length > 0,
      questionCount: questions.length,
      draftCount: drafts.length,
    }),
    [projectId, roomId, roomName, description, transcript, questions.length, drafts.length],
  );

  /* ------------------------------- actions ------------------------------ */
  const setProject = useCallback((id: string, name: string | null) => {
    setProjectId(id);
    setProjectName(name);
    trackWalkthroughEvent("walkthrough_started", {});
  }, []);

  const parseNow = useCallback(
    (text: string) => {
      const result = parseTranscript(text, {
        rooms,
        assemblies,
        idFactory: (i) => `wt-${roomId ?? "none"}-${i}-${text.length}`,
      });
      // Smart default: everything captured in this room belongs to this room.
      return result.drafts.map((d) => ({
        ...d,
        roomId: d.roomId ?? roomId,
        roomName: d.roomName ?? roomName,
      }));
    },
    [assemblies, roomId, roomName, rooms],
  );

  const setRoom = useCallback((id: string | null, name: string | null) => {
    setRoomId(id);
    setRoomName(name);
    trackWalkthroughEvent("room_started", {});
  }, []);

  const startRecording = useCallback(() => {
    void speech.start();
    trackWalkthroughEvent("recording_started", { captureLanguage });
  }, [captureLanguage, speech]);

  const pauseRecording = useCallback(() => {
    speech.pause();
    trackWalkthroughEvent("recording_paused", {});
  }, [speech]);

  const resumeRecording = useCallback(() => void speech.start(), [speech]);

  const undoLast = useCallback(() => {
    const segments = segmentsRef.current;
    if (segments.length === 0) return;
    const last = segments[segments.length - 1];
    segmentsRef.current = segments.slice(0, -1);
    const index = transcriptRef.current.lastIndexOf(last);
    if (index < 0) return;
    const next =
      `${transcriptRef.current.slice(0, index)}${transcriptRef.current.slice(index + last.length)}`
        .replace(/\s+/g, " ")
        .trim();
    setTranscript(next);
  }, [setTranscript]);

  const finishRoom = useCallback(() => {
    speech.stop();
    const parsed = parseNow(transcriptRef.current);
    setDrafts(parsed);
    trackWalkthroughEvent("draft_reviewed", { draftCount: parsed.length });
    setStep(parsed.length && buildQuestions(parsed, { rooms }).length ? "questions" : "review");
  }, [parseNow, rooms, speech]);

  const answer = useCallback(
    (questionId: string, value: WalkthroughAnswer) => {
      const question = questions.find((q) => q.id === questionId);
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      if (question && value.status !== "answered") {
        trackWalkthroughEvent("question_skipped", { questionKind: question.kind });
      }
      if (question) {
        setDrafts((prev) => applyAnswers(prev, [question], { [questionId]: value }));
      }
    },
    [questions],
  );

  const updateDraft = useCallback((id: string, patch: Partial<VoiceDraftItem>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const approveDraft = useCallback(
    (id: string) => {
      updateDraft(id, { status: "approved", selected: true, needsReview: false });
      trackWalkthroughEvent("item_approved", { approvedCount: 1 });
    },
    [updateDraft],
  );

  const deleteDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const markNeedsReview = useCallback(
    (id: string) => updateDraft(id, { needsReview: true, status: "pending", selected: false }),
    [updateDraft],
  );

  const approveAllHighConfidence = useCallback(() => {
    setDrafts((prev) => {
      const next = prev.map((d) =>
        d.confidence === "high" && d.status !== "rejected"
          ? { ...d, status: "approved" as const, selected: true, needsReview: false }
          : d,
      );
      trackWalkthroughEvent("item_approved", {
        approvedCount: next.filter((d) => d.status === "approved").length,
      });
      return next;
    });
  }, []);

  /** Commit approved drafts through the existing scope services (no new engine). */
  const commit = useCallback(async () => {
    if (!projectId) return 0;
    const approved = drafts.filter((d) => d.selected && d.status !== "rejected" && d.title.trim());
    const fresh = filterUncommitted(approved, committedKeys);
    if (fresh.length === 0) return 0;
    setCommitting(true);
    try {
      const sections = (sectionsQuery.data ?? []) as Array<{
        id: string;
        name: string;
        roomId: string | null;
      }>;
      const sectionByRoom = new Map<string, string>();
      for (const s of sections) {
        if (s.name === SECTION_NAME) sectionByRoom.set(s.roomId ?? "none", s.id);
      }

      for (const draft of fresh) {
        const key = draft.roomId ?? roomId ?? "none";
        let sectionId = sectionByRoom.get(key);
        if (!sectionId) {
          const created = (await mutations.createSection.mutateAsync({
            projectId,
            roomId: draft.roomId ?? roomId,
            name: SECTION_NAME,
            tradeKey: draft.tradeKey,
          })) as { id: string };
          sectionId = created.id;
          sectionByRoom.set(key, sectionId);
        }
        await mutations.createItem.mutateAsync({
          projectId,
          sectionId,
          roomId: draft.roomId ?? roomId,
          title: draft.title.slice(0, 200),
          scopeItemKey: draft.assemblyKey,
          tradeKey: draft.tradeKey,
          categoryKey: draft.categoryKey,
          subcategoryKey: draft.subcategoryKey,
          actionKey: draft.actionKey,
          quantity: draft.quantity,
          unitKey: draft.unitKey,
          description: draft.sourceText,
          internalNotes: draft.measurements.length
            ? `Walkthrough measurements: ${draft.measurements.map((m) => m.raw).join(", ")}`
            : null,
          confidenceStatus: draft.confidence === "high" ? "confirmed" : "needs_verification",
          completionStatus: "draft",
        });
      }

      /*
       * Shared bridge: the approved scope becomes a durable project estimate
       * through the same commit service the other intake modes use. No
       * walkthrough-specific estimate persistence.
       */
      const committed = await estimateCommit.mutateAsync({
        projectId,
        intakeSource: "walkthrough",
      });
      setEstimateId(committed.estimateId);

      setCommittedKeys((prev) => [...prev, ...fresh.map(draftDedupeKey)]);
      setCompletedRooms((prev) => [
        ...prev,
        {
          roomId,
          roomName: roomName ?? "",
          approvedCount: fresh.length,
          completedAt: new Date().toISOString(),
        },
      ]);
      setDrafts([]);
      setAnswers({});
      setTranscript("");
      segmentsRef.current = [];
      setStep("summary");
      return fresh.length;
    } finally {
      setCommitting(false);
    }
  }, [
    committedKeys,
    drafts,
    mutations,
    projectId,
    roomId,
    roomName,
    sectionsQuery.data,
    setTranscript,
  ]);

  /**
   * Turn the current project's own description into drafts, then ask only the
   * clarifications those drafts leave open. Nothing from any other project is
   * consulted: the only inputs are this project's description and its rooms.
   */
  const analyzeIntake = useCallback(() => {
    speech.stop();
    const text = description.trim();
    if (!text) return;
    const parsed = parseTranscript(text, {
      rooms,
      assemblies,
      idFactory: (i) => `wt-intake-${projectId ?? "none"}-${i}-${text.length}`,
    });
    setDrafts(parsed.drafts);
    trackWalkthroughEvent("draft_reviewed", { draftCount: parsed.drafts.length });
    setStep(buildQuestions(parsed.drafts, { rooms }).length > 0 ? "questions" : "room");
  }, [assemblies, description, projectId, rooms, speech]);

  const goNext = useCallback(() => {
    setStep((current) => (canAdvance(current, ctx) ? nextStep(current, ctx) : current));
  }, [ctx]);

  const goBack = useCallback(() => setStep((current) => previousStep(current, ctx)), [ctx]);

  const goToStep = useCallback((target: WalkthroughStep) => setStep(target), []);

  const startAnotherRoom = useCallback(() => {
    setRoomId(null);
    setRoomName(null);
    setDrafts([]);
    setAnswers({});
    setTranscript("");
    segmentsRef.current = [];
    setStep("room");
  }, [setTranscript]);

  const abandon = useCallback(() => {
    speech.stop();
    trackWalkthroughEvent("walkthrough_abandoned", { step });
    clear();
    setStep("project");
    setProjectId(null);
    setProjectName(null);
    setRoomId(null);
    setRoomName(null);
    setDrafts([]);
    setAnswers({});
    setCommittedKeys([]);
    setCompletedRooms([]);
    setTranscript("");
    setDescription("");
    segmentsRef.current = [];
  }, [clear, setTranscript, speech, step]);

  const finish = useCallback(() => {
    speech.stop();
    trackWalkthroughEvent("walkthrough_completed", {
      roomCount: completedRooms.length,
      approvedCount: completedRooms.reduce((sum, r) => sum + r.approvedCount, 0),
    });
    clear();
  }, [clear, completedRooms, speech]);

  return {
    estimateId,
    ready: hydrated,
    step,
    projectId,
    projectName,
    roomId,
    roomName,
    captureLanguage,
    transcript,
    description,
    interim: speech.interim,
    errorCode: speech.errorCode,
    elapsedMs: speech.elapsedMs,
    audioLevel: speech.audioLevel,
    hasRetryableAudio: speech.hasRetryableAudio,
    recording: speech.status === "listening",
    paused: speech.status === "paused",
    speechSupported: speech.supported,
    speechStatus: speech.status,
    drafts,
    rooms,
    questions,
    answers,
    unresolvedCount,
    completedRooms,
    committing,
    hasResumableSession: Boolean(restored),
    loadingContext: roomsQuery.isLoading || assembliesQuery.isLoading,
    setProject,
    setRoom,
    setCaptureLanguage,
    setTranscript,
    setDescription,
    analyzeIntake,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording: speech.stop,
    retryTranscription: speech.retryTranscription,
    recordAgain: speech.recordAgain,
    finishRoom,
    undoLast,
    answer,
    updateDraft,
    approveDraft,
    deleteDraft,
    markNeedsReview,
    approveAllHighConfidence,
    commit,
    goNext,
    goBack,
    goToStep,
    startAnotherRoom,
    abandon,
    finish,
  };
}
