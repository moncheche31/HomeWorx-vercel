import { describe, expect, it, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { useState } from "react";
import {
  CurrencyInput,
  formatCurrencyString,
  parseCurrencyToNumber,
  sanitizeCurrencyInput,
} from "./CurrencyInput";

function Harness({
  initial = null,
  onChange,
  allowDecimals = true,
  showCurrencyOnBlur = true,
}: {
  initial?: number | null;
  onChange?: (v: number | null) => void;
  allowDecimals?: boolean;
  showCurrencyOnBlur?: boolean;
}) {
  const [v, setV] = useState<number | null>(initial);
  return (
    <CurrencyInput
      aria-label="amount"
      value={v}
      allowDecimals={allowDecimals}
      showCurrencyOnBlur={showCurrencyOnBlur}
      onValueChange={(n) => {
        setV(n);
        onChange?.(n);
      }}
    />
  );
}

describe("sanitizeCurrencyInput", () => {
  it("strips $, commas, letters", () => {
    expect(sanitizeCurrencyInput("$1,234.50abc")).toBe("1234.50");
  });
  it("keeps at most one decimal point", () => {
    expect(sanitizeCurrencyInput("1.2.3.4")).toBe("1.234");
  });
  it("drops decimals when disallowed", () => {
    expect(sanitizeCurrencyInput("1.50", false)).toBe("150");
  });
  it("trims leading zeros", () => {
    expect(sanitizeCurrencyInput("000123")).toBe("123");
    expect(sanitizeCurrencyInput("0.5")).toBe("0.5");
    expect(sanitizeCurrencyInput("0")).toBe("0");
  });
});

describe("formatCurrencyString", () => {
  it("adds thousands separators", () => {
    expect(formatCurrencyString("1000")).toBe("1,000");
    expect(formatCurrencyString("60000")).toBe("60,000");
    expect(formatCurrencyString("1250000")).toBe("1,250,000");
  });
  it("preserves trailing decimals as-typed", () => {
    expect(formatCurrencyString("1234.")).toBe("1,234.");
    expect(formatCurrencyString("1234.50")).toBe("1,234.50");
  });
});

describe("parseCurrencyToNumber", () => {
  it("parses formatted strings to numbers for database serialization", () => {
    expect(parseCurrencyToNumber("$1,234.50")).toBe(1234.5);
    expect(parseCurrencyToNumber("60,000")).toBe(60000);
    expect(parseCurrencyToNumber("")).toBeNull();
    expect(parseCurrencyToNumber("$")).toBeNull();
  });
});

describe("CurrencyInput component", () => {
  it("formats while typing", () => {
    const spy = vi.fn();
    const { getByLabelText } = render(<Harness onChange={spy} />);
    const input = getByLabelText("amount") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "1000" } });
    expect(input.value).toBe("1,000");
    expect(spy).toHaveBeenLastCalledWith(1000);
    fireEvent.change(input, { target: { value: "1250000" } });
    expect(input.value).toBe("1,250,000");
    expect(spy).toHaveBeenLastCalledWith(1250000);
  });

  it("supports deleting characters", () => {
    const spy = vi.fn();
    const { getByLabelText } = render(<Harness initial={1234} onChange={spy} />);
    const input = getByLabelText("amount") as HTMLInputElement;
    fireEvent.focus(input);
    // simulate user deleting the last digit
    fireEvent.change(input, { target: { value: "123" } });
    expect(input.value).toBe("123");
    expect(spy).toHaveBeenLastCalledWith(123);
    fireEvent.change(input, { target: { value: "" } });
    expect(input.value).toBe("");
    expect(spy).toHaveBeenLastCalledWith(null);
  });

  it("preserves cursor position after formatting", async () => {
    const { getByLabelText } = render(<Harness />);
    const input = getByLabelText("amount") as HTMLInputElement;
    fireEvent.focus(input);
    // Simulate the user inserting "5" between "12" and "34" -> raw becomes "12534"
    await act(async () => {
      fireEvent.change(input, { target: { value: "12534" } });
    });
    expect(input.value).toBe("12,534");
    // Move cursor to position 3 (after inserted digit) and let rAF-scheduled
    // cursor restore run.
    input.setSelectionRange(3, 3);
    await act(async () => {
      fireEvent.change(input, { target: { value: "12,534" } });
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    expect(input.selectionStart).toBeGreaterThanOrEqual(2);
  });

  it("accepts pasted values with commas and $", () => {
    const spy = vi.fn();
    const { getByLabelText } = render(<Harness onChange={spy} />);
    const input = getByLabelText("amount") as HTMLInputElement;
    fireEvent.focus(input);
    const dt = {
      getData: () => "$1,250,000.75",
    };
    fireEvent.paste(input, { clipboardData: dt });
    expect(input.value).toBe("1,250,000.75");
    expect(spy).toHaveBeenLastCalledWith(1250000.75);
  });

  it("ignores invalid characters like letters", () => {
    const spy = vi.fn();
    const { getByLabelText } = render(<Harness onChange={spy} />);
    const input = getByLabelText("amount") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "12abc34" } });
    expect(input.value).toBe("1,234");
    expect(spy).toHaveBeenLastCalledWith(1234);
  });

  it("displays $ prefix on blur when enabled", () => {
    const { getByLabelText } = render(<Harness initial={60000} />);
    const input = getByLabelText("amount") as HTMLInputElement;
    expect(input.value).toBe("$60,000");
  });

  it("stores numeric value not formatted string (serialization contract)", () => {
    const values: (number | null)[] = [];
    const { getByLabelText } = render(<Harness onChange={(n) => values.push(n)} />);
    const input = getByLabelText("amount") as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "45,000" } });
    fireEvent.change(input, { target: { value: "45,000.25" } });
    expect(values.at(-1)).toBe(45000.25);
    expect(typeof values.at(-1)).toBe("number");
  });
});
