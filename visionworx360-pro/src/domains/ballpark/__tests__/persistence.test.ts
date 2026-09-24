import { describe, expect, it } from "vitest";
import { mergeBallparkAnswers, transcriptsFromAnswers, type BallparkAnswers } from "../index";

const answered = (value: string | number, transcript?: string) => ({
  status: "answered" as const,
  value,
  transcript,
});

describe("durable ballpark persistence precedence", () => {
  it("restores server answers when the browser draft is empty", () => {
    const server: BallparkAnswers = { lengthFt: answered(20), legacyAnswer: answered("kept") };
    expect(mergeBallparkAnswers(server, {})).toEqual(server);
  });

  it("never lets local or assumed values replace confirmed server answers", () => {
    const server: BallparkAnswers = { lengthFt: answered(20, "twenty feet") };
    const local: BallparkAnswers = { lengthFt: answered(12), widthFt: answered(18) };
    expect(mergeBallparkAnswers(server, local)).toEqual({
      lengthFt: server.lengthFt,
      widthFt: local.widthFt,
    });
  });

  it("preserves unknown legacy keys while adding genuinely new local answers", () => {
    const server: BallparkAnswers = { renamedLegacyKey: answered("legacy") };
    const local: BallparkAnswers = { newSchemaQuestion: answered("new") };
    expect(mergeBallparkAnswers(server, local)).toEqual({ ...local, ...server });
  });

  it("retains original speech transcripts", () => {
    expect(transcriptsFromAnswers({ lengthFt: answered(20, "about twenty feet") }))
      .toEqual({ lengthFt: "about twenty feet" });
  });
});
