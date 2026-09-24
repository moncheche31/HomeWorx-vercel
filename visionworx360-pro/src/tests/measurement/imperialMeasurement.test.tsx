import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  feetFromInches,
  formatFeet,
  formatInches,
  inchesFromFeet,
  parseImperialLength,
  parseLengthToFeet,
} from "@/domains/measurement";
import { parseAnswer, parseFeet } from "@/domains/ballpark";
import { deriveRoomGeometry } from "@/domains/geometry";
import { ProjectDetailsPanel } from "@/features/remote-vision/components/ProjectDetailsPanel";
import { emptyDimensions } from "@/domains/remoteVision";

/**
 * REGRESSION (pilot blocker): every measurement field read its input with
 * `Number(value)` and called the result FEET, so `94 in` recorded a 94-foot
 * wall and the contractor had to type 7.83 by hand.
 */

describe("imperial parser — canonical inches", () => {
  it("parses 94 in exactly and displays it as 7' 10\"", () => {
    const parsed = parseImperialLength("94 in");
    expect(parsed?.inches).toBe(94);
    expect(parsed?.source).toBe("inches");
    expect(formatInches(parsed!.inches)).toBe(`7' 10"`);
    // The whole point: not rounded up to 8'.
    expect(formatInches(94)).not.toBe(`8'`);
  });

  it("normalizes every feet+inches spelling to the same value", () => {
    const forms = [`7 ft 10 in`, `7' 10"`, `7'10"`, `7 feet 10 inches`, `7ft 10in`, `94"`, `94 in`];
    const values = forms.map((f) => parseImperialLength(f)?.inches);
    expect(values).toEqual(forms.map(() => 94));
  });

  it("treats 8 ft as 96 inches", () => {
    expect(parseImperialLength("8 ft")?.inches).toBe(96);
    expect(parseImperialLength(`8'`)?.inches).toBe(96);
    expect(parseImperialLength("8 feet")?.inches).toBe(96);
    expect(formatInches(96)).toBe(`8'`);
  });

  it("keeps decimal feet backward compatible", () => {
    expect(parseImperialLength("7.5")?.inches).toBe(90);
    expect(parseImperialLength("7.5 ft")?.inches).toBe(90);
    expect(parseImperialLength("7.5")?.source).toBe("bare");
    expect(formatInches(90)).toBe(`7' 6"`);
  });

  it("retains construction fractions exactly", () => {
    expect(parseImperialLength(`7' 10 1/2"`)?.inches).toBe(94.5);
    expect(parseImperialLength(`10 1/2"`)?.inches).toBe(10.5);
    expect(parseImperialLength(`1/4"`)?.inches).toBe(0.25);
    expect(parseImperialLength(`7' 10 1/16"`)?.inches).toBe(94 + 1 / 16);
    expect(formatInches(94.5)).toBe(`7' 10 1/2"`);
    expect(formatInches(94.25)).toBe(`7' 10 1/4"`);
    expect(formatInches(94 + 1 / 8)).toBe(`7' 10 1/8"`);
    expect(formatInches(94 + 1 / 16)).toBe(`7' 10 1/16"`);
  });

  it("round-trips inches -> feet storage -> display without drift", () => {
    for (const inches of [94, 94.5, 96, 90, 1.25, 123 + 7 / 16]) {
      const feet = feetFromInches(inches);
      expect(inchesFromFeet(feet)).toBeCloseTo(inches, 6);
      expect(formatFeet(feet)).toBe(formatInches(inches));
    }
  });

  it("rejects nonsense instead of guessing a number", () => {
    for (const bad of ["", "   ", "abc", "ft", `-4"`, "0", `7' 18"`]) {
      expect(parseImperialLength(bad)).toBeNull();
    }
    expect(parseImperialLength("0", { allowZero: true })?.inches).toBe(0);
  });

  it("can read a bare number as inches when a field means inches", () => {
    expect(parseImperialLength("94", { bareUnit: "in" })?.inches).toBe(94);
    expect(parseImperialLength("94")?.inches).toBe(94 * 12);
  });

  it("formats words for print and screen readers", () => {
    expect(formatInches(94, { words: true })).toBe("7 ft 10 in");
    expect(formatInches(6)).toBe(`6"`);
  });
});

describe("legacy saved values", () => {
  it("loads feet-only records unchanged", () => {
    // Rows saved before this change hold plain feet numbers.
    for (const feet of [8, 16, 7.5, 12.25]) {
      expect(parseLengthToFeet(String(feet))).toBe(feet);
      expect(inchesFromFeet(feet)).toBe(feet * 12);
    }
    expect(formatFeet(16)).toBe(`16'`);
    expect(formatFeet(7.5)).toBe(`7' 6"`);
  });

  it("re-parsing its own formatted output is stable", () => {
    const first = parseImperialLength("94 in")!.feet;
    const second = parseLengthToFeet(formatFeet(first))!;
    expect(second).toBeCloseTo(first, 6);
    expect(formatFeet(second)).toBe(`7' 10"`);
  });
});

describe("downstream calculations consume normalized values", () => {
  it("derives area from inches-entered dimensions without double conversion", () => {
    const lengthFt = parseLengthToFeet("144 in")!; // 12'
    const widthFt = parseLengthToFeet(`10' 6"`)!; // 10.5'
    const heightFt = parseLengthToFeet("94 in")!; // 7' 10"

    expect(lengthFt).toBe(12);
    expect(widthFt).toBe(10.5);

    const geometry = deriveRoomGeometry({
      roomId: null,
      label: null,
      lengthFt,
      widthFt,
      ceilingHeightFt: heightFt,
      openings: [],
      interiorPartitionLf: null,
      floorWastePct: 10,
    });

    const floor = geometry.measurements.floor_area;
    const perimeter = geometry.measurements.perimeter;
    expect(floor.status).toBe("available");
    expect(floor.value).toBeCloseTo(126, 2); // 12 x 10.5, not 144 x 10.5
    expect(perimeter.value).toBeCloseTo(45, 2);

    const walls = geometry.measurements.wall_gross_area;
    // 45 LF x 7.8333 ft — driven by the normalized height, not by "94".
    expect(walls.value).toBeCloseTo(45 * (94 / 12), 1);
    expect(walls.value).toBeLessThan(400);
  });
});

describe("voice and typed ballpark answers", () => {
  const dimensionQuestion = {
    id: "roomLengthFt",
    kind: "dimension" as const,
    promptKey: "q.length",
    unit: "ft" as const,
  };

  it("reads an inches-only spoken answer as inches, not feet", () => {
    expect(parseFeet("94 inches")).toBeCloseTo(94 / 12, 4);
    expect(parseFeet("ninety four inches")).toBeCloseTo(94 / 12, 4);
    expect(parseFeet("94 in")).toBeCloseTo(94 / 12, 4);
  });

  it("still reads feet and feet+inches speech", () => {
    expect(parseFeet("16 feet")).toBe(16);
    expect(parseFeet("eight foot ceiling")).toBe(8);
    expect(parseFeet("7 feet 10 inches")).toBeCloseTo(94 / 12, 4);
    expect(parseFeet("twelve and a half feet")).toBe(12.5);
  });

  it("routes the same values through the question parser", () => {
    expect(parseAnswer(dimensionQuestion, "94 inches", "en-US").value).toBeCloseTo(94 / 12, 4);
    // Unpaired dimension question: the leading number is this question's answer.
    expect(parseAnswer(dimensionQuestion, "16 by 18", "en-US").value).toBe(16);
  });
});

describe("Estimate from Photos/Video -> Details -> Measurements", () => {
  function Harness({ onChange }: { onChange: (d: unknown[]) => void }) {
    return (
      <ProjectDetailsPanel
        locale="en-US"
        voiceTranscript=""
        typedNotes=""
        dimensions={[{ ...emptyDimensions("dim-1"), roomLabel: "Garage" }]}
        onVoiceTranscriptChange={() => {}}
        onTypedNotesChange={() => {}}
        onDimensionsChange={onChange}
      />
    );
  }

  it("accepts inches directly in the measurement field", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    const field = screen.getByLabelText(/length/i);
    // A plain text field: quotes and unit words are typable on a phone.
    expect(field).toHaveAttribute("type", "text");
    await user.type(field, "94 in");

    const last = onChange.mock.calls.at(-1)?.[0] as Array<{ lengthFt: number | null }>;
    expect(last[0].lengthFt).toBeCloseTo(94 / 12, 6);
    expect(screen.getByText(`= 7' 10"`)).toBeInTheDocument();
  });

  it("accepts 7' 10\" and shows the same normalized reading", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    await user.type(screen.getByLabelText(/length/i), `7' 10"`);
    const last = onChange.mock.calls.at(-1)?.[0] as Array<{ lengthFt: number | null }>;
    expect(last[0].lengthFt).toBeCloseTo(94 / 12, 6);
    expect(screen.getByText(`= 7' 10"`)).toBeInTheDocument();
  });

  it("keeps decimal feet working for contractors who already type it", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<Harness onChange={onChange} />);

    await user.type(screen.getByLabelText(/width/i), "7.5");
    const last = onChange.mock.calls.at(-1)?.[0] as Array<{ widthFt: number | null }>;
    expect(last[0].widthFt).toBe(7.5);
    expect(screen.getByText(`= 7' 6"`)).toBeInTheDocument();
  });

  it("explains the accepted formats instead of demanding feet", async () => {
    const user = userEvent.setup();
    render(<Harness onChange={() => {}} />);

    const field = screen.getByLabelText(/length/i);
    // Neutral example: the old "94 in" hint read like a project-specific fact.
    expect(screen.getAllByText(/in\b|ft\b/).length).toBeGreaterThan(0);

    await user.type(field, "abc");
    expect(screen.getByText(/Enter a length like/)).toBeInTheDocument();
    // The typed text is never wiped out from under the contractor.
    expect(field).toHaveValue("abc");
  });

  it("renders a saved feet-only value in contractor format", () => {
    render(
      <ProjectDetailsPanel
        locale="en-US"
        voiceTranscript=""
        typedNotes=""
        dimensions={[
          { id: "dim-1", roomLabel: "Garage", lengthFt: 16, widthFt: 7.5, ceilingHeightFt: null },
        ]}
        onVoiceTranscriptChange={() => {}}
        onTypedNotesChange={() => {}}
        onDimensionsChange={() => {}}
      />,
    );
    expect(screen.getByLabelText(/length/i)).toHaveValue(`16'`);
    expect(screen.getByLabelText(/width/i)).toHaveValue(`7' 6"`);
    expect(screen.getByLabelText(/ceiling/i)).toHaveValue("");
  });
});

describe("no feet-only parsing left in measurement UI", () => {
  it("length fields go through the shared component", async () => {
    const { readFileSync } = await import("node:fs");
    const files = [
      "src/features/remote-vision/components/ProjectDetailsPanel.tsx",
      "src/features/estimating/components/MeasurementsDialog.tsx",
      "src/features/walkthrough/components/IntakeStep.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, file).toContain("MeasurementInput");
      // `type="number"` is what blocked ' and " from ever being typed.
      expect(source, file).not.toContain('type="number"');
    }
  });
});
