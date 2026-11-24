"use client";

import { useState } from "react";
import { getApiErrorMessage } from "@/lib/utils";
import { useRedeemGiftCode } from "../api/token-balance";
import { spokenMatches } from "./launch-allowance";

/**
 * «عندك كود؟» — type it, and know on the spot.
 *
 * Two outcomes and both are sentences: the Matches were added, or the
 * server's own reason why not. The field never guesses at a code's shape; the
 * server is the only thing that knows whether one is real.
 */
export function GiftCodeForm({ className }: { className?: string }) {
  const [code, setCode] = useState("");
  const redeem = useRedeemGiftCode();

  return (
    <form
      className={className}
      data-testid="gift-code-form"
      onSubmit={(event) => {
        event.preventDefault();
        const typed = code.trim();
        if (!typed || redeem.isPending) return;
        redeem.mutate(typed, { onSuccess: () => setCode("") });
      }}
    >
      <label
        htmlFor="gift-code"
        className="mb-1.5 block text-sm font-bold text-brand-navy"
      >
        عندك كود؟
      </label>
      <div className="flex gap-2">
        <input
          id="gift-code"
          dir="ltr"
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
            if (redeem.isError || redeem.isSuccess) redeem.reset();
          }}
          autoComplete="off"
          autoCapitalize="characters"
          maxLength={32}
          placeholder="CODE"
          className="h-11 min-w-0 flex-1 rounded-xl border-[3px] border-brand-navy bg-white px-3 text-sm font-bold uppercase tracking-wider text-brand-navy placeholder:font-semibold placeholder:tracking-normal placeholder:text-brand-dash focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-purple))]"
        />
        <button
          type="submit"
          disabled={!code.trim() || redeem.isPending}
          className="h-11 shrink-0 rounded-xl border-[3px] border-brand-navy bg-brand-gold px-4 text-sm font-bold text-brand-navy disabled:border-brand-dash disabled:bg-brand-wash disabled:text-brand-plum"
        >
          {redeem.isPending ? "لحظة…" : "فعّل"}
        </button>
      </div>
      {redeem.isSuccess ? (
        <p
          role="status"
          data-testid="gift-code-success"
          className="mt-2 rounded-xl border-2 border-brand-navy bg-brand-gold px-3 py-2 text-sm font-bold text-brand-navy"
        >
          انضافت {spokenMatches(redeem.data.tokens)} لرصيدك.
        </p>
      ) : null}
      {redeem.isError ? (
        <p
          role="alert"
          data-testid="gift-code-error"
          className="mt-2 rounded-xl border-2 border-brand-navy bg-brand-lavender px-3 py-2 text-sm font-bold text-brand-navy"
        >
          {getApiErrorMessage(redeem.error, "ما قدرنا نفعّل الكود. جرّب مرة ثانية.")}
        </p>
      ) : null}
    </form>
  );
}
