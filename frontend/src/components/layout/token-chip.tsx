"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { BuyPanel } from "@/features/payments/components/buy-panel";
import { useTokenBalance } from "@/features/entitlements/api/token-balance";
import { ARABIC_NOUNS, arabicCount, arabicNoun } from "@/lib/arabic-plural";

/**
 * How many Matches you have, and the way to get more.
 *
 * It says "مباريات" rather than "توكنز" because that is what one is: the whole
 * product counts in Matches, and a second word for the same thing would make a
 * player wonder whether they are two things.
 *
 * Nothing is shown until the number is known. A chip that says zero while the
 * balance is still loading tells a player they cannot play, which is both wrong
 * and the worst possible thing to be wrong about in the header.
 *
 * It opens the buy panel in place rather than linking to the shop. Running out
 * happens in the middle of an evening with people waiting, and the fix should
 * not begin by taking the host to another page.
 */
export function TokenChip() {
  const { isAuthenticated } = useAuth();
  const { data: balance } = useTokenBalance(isAuthenticated);
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);

  // A click anywhere outside closes it, the way every menu in the header does.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [open]);

  if (!isAuthenticated || balance === undefined) return null;

  // One and two carry no numeral in Arabic — "مباراة واحدة", "مباراتان" — so
  // the design's emphasised digit only exists from three up. Printing "1" next
  // to a noun that already means one is the tell of a translated interface.
  const countsWithNumeral = balance >= 3;

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        onClick={() => setOpen((shown) => !shown)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`عندك ${arabicCount(balance, ARABIC_NOUNS.match)} — زد مبارياتك`}
        className="inline-flex min-h-[2.875rem] items-center gap-2.5 rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white px-4 text-[15px] font-bold text-[hsl(var(--brand-navy))] transition-transform duration-150 hover:-translate-y-0.5"
      >
        <TokenCoins />
        <span>
          عندك{" "}
          {countsWithNumeral ? (
            <>
              <span className="text-[18px] font-extrabold tabular-nums">
                {balance}
              </span>{" "}
              {arabicNoun(balance, ARABIC_NOUNS.match)}
            </>
          ) : (
            arabicCount(balance, ARABIC_NOUNS.match)
          )}
        </span>
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+0.65rem)] z-30">
          <BuyPanel onClose={() => setOpen(false)} />
        </div>
      ) : null}
    </div>
  );
}

/** Two stacked gold coins, as the identity draws a Match. */
function TokenCoins() {
  return (
    <span aria-hidden="true" className="relative block size-[1.875rem] shrink-0">
      <span className="absolute right-2 top-[3px] size-6 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))]" />
      <span className="absolute right-0 top-[1px] inline-flex size-6 items-center justify-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))]">
        <svg viewBox="-10 -10 20 20" className="size-3">
          <path
            d="M0 -10 Q1.8 -1.8 10 0 Q1.8 1.8 0 10 Q-1.8 1.8 -10 0 Q-1.8 -1.8 0 -10Z"
            fill="hsl(var(--brand-navy))"
          />
        </svg>
      </span>
    </span>
  );
}
