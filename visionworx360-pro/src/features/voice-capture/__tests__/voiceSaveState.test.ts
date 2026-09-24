import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { language: "en-US" } }) }));
vi.mock("../hooks/useSpeechCapture", () => ({
  useSpeechCapture: () => ({
    status: "idle",
    supported: true,
    interim: "",
    start: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
  }),
}));
vi.mock("@/features/knowledge-base/hooks/useKnowledgeBase", () => ({
  useAssembliesQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/features/project-workspace/hooks/useProjectWorkspace", () => ({
  useRoomsQuery: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/features/scope/hooks/useScope", () => ({
  useScopeSectionsQuery: () => ({ data: [] }),
  useScopeMutations: () => ({
    createSection: { mutateAsync: vi.fn() },
    createItem: { mutateAsync: vi.fn() },
  }),
}));

vi.mock("@/features/estimating/hooks/useEstimateCommit", () => ({
  useEstimateCommit: () => ({ mutateAsync: vi.fn(async () => ({ estimateId: "est-1" })), isPending: false }),
}));

const saveNote = vi.fn(async () => ({ id: "note-1" }));
vi.mock("../hooks/useProjectDescriptionNote", () => ({
  useProjectDescriptionNote: () => ({ note: null, text: "", loading: false, save: saveNote }),
}));

import { useVoiceCapture } from "../hooks/useVoiceCapture";

describe("useVoiceCapture save state", () => {
  beforeEach(() => window.localStorage.clear());

  it("starts saved, marks unsaved on edit, then autosaves", async () => {
    const { result } = renderHook(() => useVoiceCapture("proj-1"));
    expect(result.current.saveState).toBe("saved");

    act(() => result.current.setTranscript("paint the kitchen ceiling"));
    expect(result.current.saveState).toBe("unsaved");

    await waitFor(() => expect(result.current.saveState).toBe("saved"), { timeout: 2000 });
    expect(window.localStorage.getItem("vwx.voice.session.proj-1")).toContain("kitchen");
  });

  it("flushSave persists immediately without losing content", () => {
    const { result } = renderHook(() => useVoiceCapture("proj-2"));
    act(() => result.current.setTranscript("replace the vanity"));
    act(() => result.current.flushSave());

    expect(result.current.saveState).toBe("saved");
    expect(result.current.transcript).toBe("replace the vanity");
    expect(window.localStorage.getItem("vwx.voice.session.proj-2")).toContain("vanity");
  });

  it("saveToServer persists the transcript to the server", async () => {
    saveNote.mockClear();
    const { result } = renderHook(() => useVoiceCapture("proj-3"));
    act(() => result.current.setTranscript("tile the shower"));
    await act(async () => {
      await result.current.saveToServer();
    });
    expect(saveNote).toHaveBeenCalledWith("tile the shower");
    expect(result.current.saveState).toBe("saved");
  });

  it("saveToServer surfaces failures without reporting saved", async () => {
    saveNote.mockClear();
    saveNote.mockRejectedValueOnce(new Error("network"));
    const { result } = renderHook(() => useVoiceCapture("proj-4"));
    act(() => result.current.setTranscript("frame the wall"));
    await act(async () => {
      await expect(result.current.saveToServer()).rejects.toThrow("network");
    });
    expect(result.current.saveState).toBe("unsaved");
  });
});
