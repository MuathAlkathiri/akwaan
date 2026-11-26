"use client";

import type { Ref } from "react";
import { Loader2, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

export type AnswerMicState =
  "idle" | "listening" | "processing" | "unsupported";

/**
 * The one way a phone takes a typed or spoken answer.
 *
 * A text field with a round microphone beside it. While the phone is listening
 * the microphone turns gold with a halo; nothing else moves, so a question's
 * picture stays exactly where it was. What was heard, or why an answer came
 * back, is said by `AnswerListeningPill` and `AnswerNote` above the field.
 */
export function AnswerEntry({
  value,
  onChange,
  inputRef,
  disabled = false,
  placeholder = "اكتب إجابتك",
  mic,
  onMic,
  micDisabled = false,
  inputTestId,
  micTestId,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef?: Ref<HTMLInputElement>;
  disabled?: boolean;
  placeholder?: string;
  /** Leave out on a surface with no microphone. */
  mic?: AnswerMicState;
  onMic?: () => void;
  micDisabled?: boolean;
  inputTestId?: string;
  micTestId?: string;
  className?: string;
}) {
  const listening = mic === "listening";
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={listening ? "…" : placeholder}
        aria-label="إجابتك"
        autoComplete="off"
        disabled={disabled}
        data-testid={inputTestId}
        className="min-h-[60px] min-w-0 flex-1 rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-white px-4 text-center text-[19px] font-bold text-[hsl(var(--brand-navy))] placeholder:text-brand-dash focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-gold))] disabled:opacity-60"
      />
      {mic && mic !== "unsupported" && (
        <button
          type="button"
          onClick={onMic}
          disabled={micDisabled || mic === "processing"}
          aria-pressed={listening}
          aria-label={listening ? "أسمعك، وقّف التسجيل" : "تكلّم بدل الكتابة"}
          data-testid={micTestId}
          className={cn(
            "grid size-[60px] shrink-0 place-items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] text-[hsl(var(--brand-navy))] transition-colors disabled:opacity-60",
            listening
              ? "bg-[hsl(var(--brand-gold))] shadow-[0_0_0_6px_#F3E6C8]"
              : "bg-white",
          )}
        >
          {mic === "processing" ? (
            <Loader2 className="size-6 animate-spin" aria-hidden />
          ) : (
            <Mic className="size-[26px]" strokeWidth={2.4} aria-hidden />
          )}
        </button>
      )}
    </div>
  );
}

/** «أسمعك…»: small, and under the question's picture — never in its place. */
export function AnswerListeningPill({ className }: { className?: string }) {
  return (
    <p
      role="status"
      data-testid="answer-listening"
      className={cn(
        "inline-flex min-h-[30px] items-center gap-2 self-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-3 text-[13px] font-bold text-[hsl(var(--brand-navy))]",
        className,
      )}
    >
      <span aria-hidden className="inline-flex h-5 items-center gap-[3px]">
        {[8, 14, 20, 12, 18, 10].map((height, index) => (
          <span
            key={index}
            style={{ height }}
            className="w-1 rounded-full bg-[hsl(var(--brand-navy))] motion-safe:animate-pulse"
          />
        ))}
      </span>
      أسمعك… قلها بصوت واضح
    </p>
  );
}

/**
 * A line about the last attempt. Lavender when the phone simply did not catch
 * it; the coral tint when an answer was sent and was not the one.
 */
export function AnswerNote({
  tone,
  children,
  className,
  ...rest
}: {
  tone: "info" | "rejected";
  children: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <p
      {...rest}
      role="status"
      data-tone={tone}
      className={cn(
        "rounded-[14px] border-2 border-[hsl(var(--brand-navy))] px-3.5 py-2 text-center text-sm font-bold leading-relaxed text-[hsl(var(--brand-navy))]",
        tone === "rejected" ? "bg-destructive-subtle" : "bg-brand-lavender",
        className,
      )}
    >
      {children}
    </p>
  );
}
