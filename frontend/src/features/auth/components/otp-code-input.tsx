"use client";

import { useEffect, useRef } from "react";

const LENGTH = 6;

/**
 * Six single-character boxes behaving as one field.
 *
 * Left-to-right regardless of the surrounding RTL layout: a verification code
 * is a number, and Arabic numerals still read left to right. `inputMode`
 * numeric is what raises the digit keypad on a phone, which matters more here
 * than anywhere else in the app — this screen stands between a player and the
 * game.
 */
export function OtpCodeInput({
  value,
  onChange,
  onComplete,
  disabled,
  invalid,
  autoFocus = true,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
}) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = value.padEnd(LENGTH, " ").slice(0, LENGTH).split("");

  useEffect(() => {
    if (autoFocus) inputs.current[0]?.focus();
  }, [autoFocus]);

  const commit = (next: string) => {
    const cleaned = next.replace(/\D/g, "").slice(0, LENGTH);
    onChange(cleaned);
    if (cleaned.length === LENGTH) onComplete?.(cleaned);
  };

  const handleChange = (index: number, raw: string) => {
    const typed = raw.replace(/\D/g, "");
    if (!typed) return;
    // A paste lands in one box; spread it across the rest rather than
    // truncating, because pasting the code from a mail app is the common path.
    if (typed.length > 1) {
      commit((value.slice(0, index) + typed).slice(0, LENGTH));
      inputs.current[Math.min(index + typed.length, LENGTH - 1)]?.focus();
      return;
    }
    const next = value.split("");
    next[index] = typed;
    commit(next.join("").slice(0, LENGTH));
    inputs.current[Math.min(index + 1, LENGTH - 1)]?.focus();
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = value.split("");
      if (next[index]) {
        // Clear this box first; a second Backspace steps back. Deleting and
        // jumping in one press makes a correction overshoot.
        next[index] = "";
        onChange(next.join("").replace(/\s+$/, ""));
        return;
      }
      inputs.current[Math.max(index - 1, 0)]?.focus();
      next[Math.max(index - 1, 0)] = "";
      onChange(next.join("").replace(/\s+$/, ""));
      return;
    }
    if (event.key === "ArrowLeft") inputs.current[index + 1]?.focus();
    if (event.key === "ArrowRight") inputs.current[index - 1]?.focus();
  };

  return (
    <div className="flex justify-center gap-2" dir="ltr">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            inputs.current[index] = element;
          }}
          value={digit.trim()}
          onChange={(event) => handleChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => {
            event.preventDefault();
            handleChange(0, event.clipboardData.getData("text"));
          }}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={LENGTH}
          aria-label={`الرقم ${index + 1} من ${LENGTH}`}
          data-testid={`otp-digit-${index}`}
          className={[
            "h-14 w-11 rounded-xl border-2 text-center text-2xl font-bold",
            "focus:outline-none focus:ring-2 focus:ring-offset-1",
            invalid
              ? "border-destructive focus:ring-destructive"
              : "border-input focus:border-primary focus:ring-primary",
            disabled ? "opacity-50" : "",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

export const OTP_LENGTH = LENGTH;
