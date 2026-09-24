import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BallparkQuestionCard } from "../components/BallparkQuestionCard";
import { QUICK_BALLPARK_SCHEMA } from "@/domains/ballpark";

vi.mock("@/features/voice-capture/hooks/useSpeechCapture", () => ({
  useSpeechCapture: () => ({
    status: "idle",
    supported: true,
    interim: "",
    start: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
  }),
}));

const question = (id: string) => {
  const match = QUICK_BALLPARK_SCHEMA.questions.find((item) => item.id === id);
  if (!match) throw new Error(`Missing question ${id}`);
  return match;
};

describe("BallparkQuestionCard answer paths", () => {
  it("saves a structured bathroom selection directly without speech coercion", () => {
    const onAnswer = vi.fn();
    render(
      <BallparkQuestionCard
        question={question("bathroom")}
        answer={undefined}
        locale="en-US"
        onAnswer={onAnswer}
        onAnswerMany={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "No bathroom" }));
    expect(onAnswer).toHaveBeenCalledWith("bathroom", {
      status: "answered",
      value: "none",
      transcript: null,
    });
  });

  it("keeps a valid structured answer when supplemental speech cannot be interpreted", () => {
    const onAnswer = vi.fn();
    render(
      <BallparkQuestionCard
        question={question("bathroom")}
        answer={{ status: "answered", value: "none", transcript: null }}
        locale="en-US"
        onAnswer={onAnswer}
        onAnswerMany={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("What we heard"), { target: { value: "five by eleven" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onAnswer).not.toHaveBeenCalled();
    expect(screen.getByText(/did not match any of the choices/i)).toBeInTheDocument();
  });
});
