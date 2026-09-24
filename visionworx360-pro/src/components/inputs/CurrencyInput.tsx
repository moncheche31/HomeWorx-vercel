import * as React from "react";
import { Input } from "@/components/ui/input";

export interface CurrencyInputProps
  extends Omit<React.ComponentProps<"input">, "value" | "type"> {
  value: number | null;
  onValueChange: (value: number | null) => void;
  allowDecimals?: boolean;
  /** When true (default), show a leading "$" and 2 decimals on blur. */
  showCurrencyOnBlur?: boolean;
  locale?: string;
}

/**
 * Sanitize raw text into a normalized numeric string containing only
 * digits and at most one decimal point. Strips $, spaces, thousands commas,
 * and any other invalid characters.
 */
export function sanitizeCurrencyInput(input: string, allowDecimals = true): string {
  if (!input) return "";
  let s = input.replace(/[^\d.,-]/g, "");
  // treat commas as thousands separators — strip them
  s = s.replace(/,/g, "");
  // negative sign only if leading
  const negative = s.startsWith("-");
  s = s.replace(/-/g, "");
  if (!allowDecimals) {
    s = s.replace(/\./g, "");
  } else {
    const firstDot = s.indexOf(".");
    if (firstDot !== -1) {
      s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    }
  }
  // trim leading zeros unless "0" or "0.xxx"
  if (s.length > 1 && s.startsWith("0") && !s.startsWith("0.")) {
    s = s.replace(/^0+/, "") || "0";
  }
  return negative && s ? `-${s}` : s;
}

/**
 * Format a normalized numeric string with thousands separators, preserving a
 * trailing "." and trailing zeros so the user can keep typing decimals.
 */
export function formatCurrencyString(raw: string, locale = "en-US"): string {
  if (!raw || raw === "-") return raw;
  const negative = raw.startsWith("-");
  const body = negative ? raw.slice(1) : raw;
  const [intPart, decPart] = body.split(".");
  const intNum = intPart === "" ? 0 : Number(intPart);
  const intFormatted = Number.isFinite(intNum)
    ? intNum.toLocaleString(locale, { maximumFractionDigits: 0 })
    : "0";
  const out = decPart !== undefined ? `${intFormatted}.${decPart}` : intFormatted;
  return negative ? `-${out}` : out;
}

export function parseCurrencyToNumber(raw: string): number | null {
  const s = sanitizeCurrencyInput(raw, true);
  if (!s || s === "-" || s === "." || s === "-.") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Count digits/dot characters to the left of a cursor within a string. */
function countNumericChars(s: string, upTo: number): number {
  let n = 0;
  for (let i = 0; i < Math.min(s.length, upTo); i++) {
    if (/[\d.\-]/.test(s[i]!)) n++;
  }
  return n;
}

/** Find the index in formatted after which `count` numeric chars have appeared. */
function findCursorInFormatted(formatted: string, count: number): number {
  if (count <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[\d.\-]/.test(formatted[i]!)) {
      seen++;
      if (seen === count) return i + 1;
    }
  }
  return formatted.length;
}

export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  function CurrencyInput(
    {
      value,
      onValueChange,
      allowDecimals = true,
      showCurrencyOnBlur = true,
      locale = "en-US",
      onFocus,
      onBlur,
      onChange,
      onPaste,
      inputMode,
      ...rest
    },
    forwardedRef,
  ) {
    const innerRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);

    const [focused, setFocused] = React.useState(false);
    const [display, setDisplay] = React.useState<string>(() =>
      externalToDisplay(value, { focused: false, allowDecimals, showCurrencyOnBlur, locale }),
    );

    // Keep display in sync with external value when not focused
    React.useEffect(() => {
      if (focused) return;
      setDisplay(
        externalToDisplay(value, { focused: false, allowDecimals, showCurrencyOnBlur, locale }),
      );
    }, [value, focused, allowDecimals, showCurrencyOnBlur, locale]);

    const applyChange = (nextRaw: string, targetCursor: number) => {
      const sanitized = sanitizeCurrencyInput(nextRaw, allowDecimals);
      const formatted = formatCurrencyString(sanitized, locale);
      setDisplay(formatted);

      const numeric = parseCurrencyToNumber(sanitized);
      onValueChange(numeric);

      // restore cursor
      const numericBeforeCursor = countNumericChars(nextRaw, targetCursor);
      const newPos = findCursorInFormatted(formatted, numericBeforeCursor);
      requestAnimationFrame(() => {
        const el = innerRef.current;
        if (el && document.activeElement === el) {
          try {
            el.setSelectionRange(newPos, newPos);
          } catch {
            /* ignore */
          }
        }
      });
    };

    return (
      <Input
        ref={innerRef}
        type="text"
        inputMode={inputMode ?? (allowDecimals ? "decimal" : "numeric")}
        autoComplete="off"
        value={display}
        onFocus={(e) => {
          setFocused(true);
          // Strip currency prefix on focus for easier editing.
          const raw = value == null ? "" : String(value);
          setDisplay(formatCurrencyString(sanitizeCurrencyInput(raw, allowDecimals), locale));
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          setDisplay(
            externalToDisplay(value, {
              focused: false,
              allowDecimals,
              showCurrencyOnBlur,
              locale,
            }),
          );
          onBlur?.(e);
        }}
        onPaste={(e) => {
          onPaste?.(e);
          if (e.defaultPrevented) return;
          e.preventDefault();
          const pasted = e.clipboardData.getData("text");
          const el = innerRef.current;
          if (!el) return;
          const start = el.selectionStart ?? display.length;
          const end = el.selectionEnd ?? display.length;
          const nextRaw = display.slice(0, start) + pasted + display.slice(end);
          applyChange(nextRaw, start + pasted.length);
        }}
        onChange={(e) => {
          onChange?.(e);
          const el = e.target;
          const cursor = el.selectionStart ?? el.value.length;
          applyChange(el.value, cursor);
        }}
        {...rest}
      />
    );
  },
);

function externalToDisplay(
  value: number | null,
  opts: {
    focused: boolean;
    allowDecimals: boolean;
    showCurrencyOnBlur: boolean;
    locale: string;
  },
): string {
  if (value == null || !Number.isFinite(value)) return "";
  const { allowDecimals, showCurrencyOnBlur, locale } = opts;
  if (showCurrencyOnBlur) {
    const hasFraction = allowDecimals && Math.round(value) !== value;
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: hasFraction ? 2 : 0,
      maximumFractionDigits: allowDecimals ? 2 : 0,
    }).format(value);
  }
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: allowDecimals ? 2 : 0,
  }).format(value);
}
