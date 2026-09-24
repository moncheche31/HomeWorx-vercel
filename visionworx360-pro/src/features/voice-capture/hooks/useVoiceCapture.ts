import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  mergeDrafts,
  parseTranscript,
  splitDraft,
  type VoiceAssemblyRef,
  type VoiceCaptureState,
  type VoiceDraftItem,
  type VoiceRoomRef,
} from "@/domains/voiceCapture";
import { useAssembliesQuery } from "@/features/knowledge-base/hooks/useKnowledgeBase";
import { useRoomsQuery } from "@/features/project-workspace/hooks/useProjectWorkspace";
import { useScopeMutations, useScopeSectionsQuery } from "@/features/scope/hooks/useScope";
import { useEstimateCommit } from "@/features/estimating/hooks/useEstimateCommit";
import { useProjectDescriptionNote } from "./useProjectDescriptionNote";
import { useDictation } from "./useDictation";
import { useVoiceSessionStore } from "./useVoiceSessionStore";

const SECTION_NAME = "Project Description";

export function useVoiceCapture(projectId: string | undefined) {
  const { i18n } = useTranslation();
  const [transcript, setTranscript] = useState("");
  const [drafts, setDrafts] = useState<VoiceDraftItem[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [committedCount, setCommittedCount] = useState<number | null>(null);
  const transcriptRef = useRef("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved">("saved");

  const { restored, save, clear } = useVoiceSessionStore(projectId);
  const roomsQuery = useRoomsQuery(projectId);
  const assembliesQuery = useAssembliesQuery({ search: "" });
  const sectionsQuery = useScopeSectionsQuery(projectId);
  const mutations = useScopeMutations(projectId ?? "");
  const estimateCommit = useEstimateCommit();
  const [estimateId, setEstimateId] = useState<string | null>(null);

  const appendSegment = useCallback((text: string) => {
    setTranscript((prev) => {
      const next = prev ? `${prev.replace(/\s+$/, "")} ${text}` : text;
      transcriptRef.current = next;
      setSaveState("unsaved");
      return next;
    });
  }, []);

  const speech = useDictation({
    lang: i18n.language?.startsWith("es") ? "es-US" : "en-US",
    onFinalSegment: appendSegment,
  });

  const descriptionNote = useProjectDescriptionNote(projectId);

  useEffect(() => {
    if (restored?.transcript && !transcriptRef.current) {
      transcriptRef.current = restored.transcript;
      setTranscript(restored.transcript);
    }
  }, [restored]);

  /** Cross-device restore: fall back to the server-saved project description. */
  useEffect(() => {
    if (!transcriptRef.current && descriptionNote.text) {
      transcriptRef.current = descriptionNote.text;
      setTranscript(descriptionNote.text);
      setSaveState("saved");
    }
  }, [descriptionNote.text]);

  /** Debounced autosave so the contractor always sees an explicit save state. */
  useEffect(() => {
    if (saveState !== "unsaved") return;
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      save(transcriptRef.current);
      setSaveState("saved");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [saveState, save, transcript]);

  /** Explicit "Save & Return" action: flush immediately, skipping the debounce. */
  const flushSave = useCallback(() => {
    setSaveState("saving");
    save(transcriptRef.current);
    setSaveState("saved");
  }, [save]);

  /**
   * Authoritative save: persists the transcript to the server as the project's
   * single "Project Description" note. Throws on failure so the caller can stay
   * on the page.
   */
  const saveToServer = useCallback(async () => {
    setSaveState("saving");
    try {
      save(transcriptRef.current);
      await descriptionNote.save(transcriptRef.current);
      setSaveState("saved");
    } catch (error) {
      setSaveState("unsaved");
      throw error;
    }
  }, [descriptionNote, save]);

  const rooms: VoiceRoomRef[] = useMemo(
    () =>
      ((roomsQuery.data as Array<{ id: string; name: string }> | undefined) ?? []).map((r) => ({
        id: r.id,
        name: r.name,
      })),
    [roomsQuery.data],
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

  const state: VoiceCaptureState = reviewing
    ? "review"
    : speech.status === "listening"
      ? "listening"
      : speech.status === "paused"
        ? "paused"
        : speech.status === "permission_denied"
          ? "permission_denied"
          : speech.status === "unsupported"
            ? "unsupported"
            : speech.status === "error"
              ? "error"
              : speech.status === "requesting" ||
                  speech.status === "stopping" ||
                  speech.status === "transcribing"
                ? "processing"
                : "idle";

  const setTranscriptText = useCallback((value: string) => {
    transcriptRef.current = value;
    setTranscript(value);
    setSaveState("unsaved");
  }, []);

  const review = useCallback(() => {
    speech.stop();
    const result = parseTranscript(transcriptRef.current, { rooms, assemblies });
    setDrafts(result.drafts);
    setReviewing(true);
  }, [assemblies, rooms, speech]);

  const backToCapture = useCallback(() => setReviewing(false), []);

  const updateDraft = useCallback((id: string, patch: Partial<VoiceDraftItem>) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const approve = useCallback(
    (id: string) => updateDraft(id, { status: "approved", selected: true }),
    [updateDraft],
  );
  const reject = useCallback(
    (id: string) => updateDraft(id, { status: "rejected", selected: false }),
    [updateDraft],
  );
  const toggle = useCallback((id: string) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, selected: !d.selected } : d)));
  }, []);

  const merge = useCallback((id: string) => {
    setDrafts((prev) => {
      const index = prev.findIndex((d) => d.id === id);
      if (index < 0 || index + 1 >= prev.length) return prev;
      const merged = mergeDrafts(prev[index], prev[index + 1]);
      return [...prev.slice(0, index), merged, ...prev.slice(index + 2)];
    });
  }, []);

  const split = useCallback((id: string) => {
    setDrafts((prev) => {
      const index = prev.findIndex((d) => d.id === id);
      if (index < 0) return prev;
      const parts = splitDraft(prev[index]);
      if (parts.length < 2) return prev;
      return [...prev.slice(0, index), ...parts, ...prev.slice(index + 1)];
    });
  }, []);

  const addCustom = useCallback(() => {
    setDrafts((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        sourceText: "",
        utteranceIndex: prev.length,
        title: "",
        actionKey: null,
        quantity: null,
        unitKey: null,
        measurements: [],
        roomId: null,
        roomName: null,
        tradeKey: null,
        categoryKey: null,
        subcategoryKey: null,
        origin: "custom",
        assemblyKey: null,
        matches: [],
        needsReview: true,
        confidence: "low",
        reasonKeys: ["manual"],
        status: "pending",
        selected: true,
      },
    ]);
  }, []);

  const reset = useCallback(() => {
    speech.stop();
    setDrafts([]);
    setReviewing(false);
    setTranscriptText("");
    clear();
    setSaveState("saved");
    setCommittedCount(null);
  }, [clear, setTranscriptText, speech]);

  /** Insert approved drafts through the existing scope services → estimating engine. */
  const commit = useCallback(async () => {
    if (!projectId) return 0;
    const selected = drafts.filter((d) => d.selected && d.status !== "rejected" && d.title.trim());
    if (selected.length === 0) return 0;
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

      for (const draft of selected) {
        const roomKey = draft.roomId ?? "none";
        let sectionId = sectionByRoom.get(roomKey);
        if (!sectionId) {
          const created = (await mutations.createSection.mutateAsync({
            projectId,
            roomId: draft.roomId,
            name: SECTION_NAME,
            tradeKey: draft.tradeKey,
          })) as { id: string };
          sectionId = created.id;
          sectionByRoom.set(roomKey, sectionId);
        }
        await mutations.createItem.mutateAsync({
          projectId,
          sectionId,
          roomId: draft.roomId,
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
            ? `Voice measurements: ${draft.measurements.map((m) => m.raw).join(", ")}`
            : null,
          confidenceStatus: draft.confidence === "high" ? "confirmed" : "needs_verification",
          completionStatus: "draft",
        });
      }
      /*
       * Describe Your Project is not a narrative-only path: approving creates
       * the same durable estimate as the other intake modes.
       */
      const committed = await estimateCommit.mutateAsync({
        projectId,
        intakeSource: "describe",
      });
      setEstimateId(committed.estimateId);
      setCommittedCount(selected.length);
      reset();
      return selected.length;
    } finally {
      setCommitting(false);
    }
  }, [drafts, estimateCommit, mutations, projectId, reset, sectionsQuery.data]);

  return {
    estimateId,
    state,
    status: speech.status,
    errorCode: speech.errorCode,
    elapsedMs: speech.elapsedMs,
    audioLevel: speech.audioLevel,
    hasRetryableAudio: speech.hasRetryableAudio,
    supported: speech.supported,
    interim: speech.interim,
    transcript,
    setTranscript: setTranscriptText,
    saveState,
    flushSave,
    saveToServer,
    savedDescription: descriptionNote.text,
    drafts,
    reviewing,
    committing,
    committedCount,
    loadingContext: roomsQuery.isLoading || assembliesQuery.isLoading,
    rooms,
    start: () => void speech.start(),
    pause: speech.pause,
    resume: () => void speech.start(),
    stop: speech.stop,
    retryTranscription: speech.retryTranscription,
    recordAgain: speech.recordAgain,
    review,
    backToCapture,
    updateDraft,
    approve,
    reject,
    toggle,
    merge,
    split,
    addCustom,
    commit,
    reset,
  };
}
