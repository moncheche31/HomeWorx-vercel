import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ProjectDetailsPanel } from "@/features/remote-vision/components/ProjectDetailsPanel";

/**
 * REGRESSION (pilot blocker): "Start Recording" on the estimate / uploaded
 * media note was a silent no-op. Those surfaces called the Web Speech API
 * only, which does not exist in the preview iframe, Firefox or many mobile
 * browsers — the control either hid itself or called an engine that never
 * started. These tests exercise the real click path, not source strings.
 */

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = (type: string) => type.startsWith("audio/webm");
  state: "inactive" | "recording" | "paused" = "inactive";
  mimeType = "audio/webm";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(
    public stream: MediaStream,
    public options?: MediaRecorderOptions,
  ) {
    FakeMediaRecorder.instances.push(this);
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob([new Uint8Array(8192)], { type: "audio/webm" }) });
    this.onstop?.();
  }
  pause() {
    this.state = "paused";
  }
}

const stopTrack = vi.fn();

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
}

function setupMedia(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(getUserMedia) },
  });
  (window as unknown as { MediaRecorder: unknown }).MediaRecorder = FakeMediaRecorder;
}

function removeSpeechEngine() {
  delete (window as unknown as Record<string, unknown>).SpeechRecognition;
  delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
}

interface HarnessProps {
  onVoice?: (text: string) => void;
  transcript?: string;
}

function Harness({ onVoice = () => {}, transcript = "" }: HarnessProps) {
  return (
    <ProjectDetailsPanel
      locale="en-US"
      voiceTranscript={transcript}
      typedNotes="existing typed note"
      dimensions={[]}
      onVoiceTranscriptChange={onVoice}
      onTypedNotesChange={() => {}}
      onDimensionsChange={() => {}}
    />
  );
}

const control = () => screen.getByTestId("dictation-control");

beforeEach(() => {
  removeSpeechEngine();
  FakeMediaRecorder.instances = [];
  stopTrack.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ text: "twelve by fourteen bedroom" }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("estimate / media note recorder", () => {
  it("requests the microphone on tap and enters the recording state", async () => {
    setupMedia(async () => fakeStream());
    const user = userEvent.setup();
    render(<Harness />);

    expect(control()).toBeEnabled();
    await user.click(control());

    await waitFor(() => expect(control()).toHaveAttribute("data-status", "listening"));
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(FakeMediaRecorder.instances).toHaveLength(1);
  });

  it("transcribes the stopped clip into the note for this item only", async () => {
    setupMedia(async () => fakeStream());
    const onVoice = vi.fn();
    const user = userEvent.setup();
    render(<Harness onVoice={onVoice} transcript="before text" />);

    await user.click(control());
    await waitFor(() => expect(control()).toHaveAttribute("data-status", "listening"));
    await user.click(control());

    await waitFor(() => expect(onVoice).toHaveBeenCalled());
    expect(onVoice.mock.calls[0][0]).toBe("before text twelve by fourteen bedroom");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/transcribe", expect.anything());
    // The stream is always released so the next recording gets a fresh one.
    expect(stopTrack).toHaveBeenCalled();
  });

  it("shows an actionable error when permission is denied and keeps typed text", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    setupMedia(async () => {
      throw denied;
    });
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(control());

    await waitFor(() => expect(control()).toHaveAttribute("data-status", "permission_denied"));
    expect(screen.getByText("Microphone blocked")).toBeInTheDocument();
    expect(screen.getByDisplayValue("existing typed note")).toBeInTheDocument();
    // Retry is possible: the control is not stuck disabled.
    expect(control()).toBeEnabled();
  });

  it("explains an unsupported context instead of silently doing nothing", async () => {
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: undefined });
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(control());

    await waitFor(() => expect(control()).toHaveAttribute("data-status", "unsupported"));
    expect(screen.getByText(/Recording not supported|Recording not available here/)).toBeInTheDocument();
  });

  it("reports an explicit error when MediaRecorder is missing", async () => {
    setupMedia(async () => fakeStream());
    delete (window as unknown as Record<string, unknown>).MediaRecorder;
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(control());

    await waitFor(() => expect(control()).toHaveAttribute("data-status", "unsupported"));
    expect(stopTrack).toHaveBeenCalled();
  });

  it("records and transcribes five times with a fresh stream and recorder every time", async () => {
    setupMedia(async () => fakeStream());
    const onVoice = vi.fn();
    const user = userEvent.setup();
    render(<Harness onVoice={onVoice} />);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await user.click(control());
      await waitFor(() => expect(control()).toHaveAttribute("data-status", "listening"));
      expect(screen.getByTestId("recording-indicator")).toBeInTheDocument();
      expect(screen.getByTestId("recording-timer")).toHaveTextContent("00:00");
      expect(screen.getByTestId("audio-level-meter")).toBeInTheDocument();
      await user.click(control());
      await waitFor(() => expect(control()).toHaveAttribute("data-status", "success"));
      expect(onVoice).toHaveBeenCalledTimes(attempt);
    }

    expect(FakeMediaRecorder.instances).toHaveLength(5);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(5);
    expect(globalThis.fetch).toHaveBeenCalledTimes(5);
    expect(stopTrack).toHaveBeenCalledTimes(5);
  });

  it("keeps notes isolated: each mounted item writes only to its own handler", async () => {
    setupMedia(async () => fakeStream());
    const onA = vi.fn();
    const onB = vi.fn();
    const user = userEvent.setup();

    const viewA = render(<Harness onVoice={onA} transcript="photo A" />);
    await user.click(control());
    await waitFor(() => expect(control()).toHaveAttribute("data-status", "listening"));
    await user.click(control());
    await waitFor(() => expect(onA).toHaveBeenCalled());
    viewA.unmount();

    render(<Harness onVoice={onB} transcript="photo B" />);
    await user.click(control());
    await waitFor(() => expect(control()).toHaveAttribute("data-status", "listening"));
    await user.click(control());
    await waitFor(() => expect(onB).toHaveBeenCalled());

    expect(onA.mock.calls[0][0]).toContain("photo A");
    expect(onB.mock.calls[0][0]).toContain("photo B");
    expect(onA).toHaveBeenCalledTimes(1);
  });

  it("surfaces a transcription failure without losing the note", async () => {
    setupMedia(async () => fakeStream());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(control());
    await waitFor(() => expect(control()).toHaveAttribute("data-status", "listening"));
    await user.click(control());

    await waitFor(() => expect(control()).toHaveAttribute("data-status", "error"));
    expect(screen.getByText("Could not transcribe")).toBeInTheDocument();
    expect(screen.getByDisplayValue("existing typed note")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry transcription" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Record again" })).toBeEnabled();
  });

  it("retries the retained recording without opening another microphone stream", async () => {
    setupMedia(async () => fakeStream());
    const onVoice = vi.fn();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ error: "transcription_failed" }, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ text: "retry succeeded" }));
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<Harness onVoice={onVoice} />);

    await user.click(control());
    await waitFor(() => expect(control()).toHaveAttribute("data-status", "listening"));
    await user.click(control());
    await waitFor(() => expect(control()).toHaveAttribute("data-status", "error"));
    await user.click(screen.getByRole("button", { name: "Retry transcription" }));

    await waitFor(() => expect(control()).toHaveAttribute("data-status", "success"));
    expect(onVoice).toHaveBeenCalledWith("retry succeeded");
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(FakeMediaRecorder.instances).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("shared recorder adoption", () => {
  it("every audio-note surface uses the shared dictation hook", async () => {
    const { readFileSync } = await import("node:fs");
    const surfaces = [
      "src/features/remote-vision/components/ProjectDetailsPanel.tsx",
      "src/features/remote-vision/components/DescribePanel.tsx",
      "src/features/ballpark/components/DescriptionIntakePanel.tsx",
      "src/features/ballpark/components/BallparkQuestionCard.tsx",
      "src/features/walkthrough/components/IntakeStep.tsx",
      "src/features/walkthrough/hooks/useWalkthrough.ts",
      "src/features/voice-capture/hooks/useVoiceCapture.ts",
    ];
    for (const file of surfaces) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("useDictation");
      expect(source, file).not.toContain("useSpeechCapture");
    }
  });
});
