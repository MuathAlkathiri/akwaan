"use client";

import { GiftCodeForm } from "@/features/entitlements/components/gift-code-form";
import { moreMatchesMailto } from "@/features/entitlements/contact";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Loader2, X } from "lucide-react";
import { useShopCatalogue, useQuote, useStartCheckout } from "../api/shop";
import { freeUntilLabel } from "./shop-state";
import { refusalMessage, riyals, savingLabel } from "./discount-copy";

/**
 * Buying Matches without leaving the page you were on.
 *
 * The shop still exists as a page — مُيسّر reads it, and a price list deserves
 * a URL — but it is no longer the way in. A player who runs out mid-evening
 * wants three taps and their game back, not a destination to navigate to and
 * then navigate out of. So: a panel, the packs as rows rather than cards, the
 * amount printed on the button that takes it.
 *
 * Nothing here works out a price. Every total on screen came from the server's
 * quote for the selected pack and code, so what the button says and what the
 * gateway charges are the same number by construction.
 */
export function BuyPanel({ onClose }: { onClose: () => void }) {
  const { data: catalogue } = useShopCatalogue();
  const [packId, setPackId] = useState<string>();
  const [typed, setTyped] = useState("");
  const [applied, setApplied] = useState<string>();
  const checkout = useStartCheckout();
  const { user } = useAuth();
  const panel = useRef<HTMLDivElement>(null);

  const selling = catalogue?.selling ?? false;
  const quote = useQuote(selling ? packId : undefined, applied);

  // The largest pack first, and selected: it is the best value per Match, and
  // a panel that opens with nothing chosen asks the player to do work before
  // it will tell them anything.
  // The query's own array, not a fresh one per render: a `?? []` default here
  // would hand this effect a new dependency every time the panel re-rendered.
  const packs = catalogue?.packs;
  useEffect(() => {
    if (!packId && packs?.length) setPackId(packs[packs.length - 1].id);
  }, [packId, packs]);
  const list = packs ?? [];

  // Escape closes, and the panel takes focus when it opens so a keyboard lands
  // inside it rather than back at the top of the page.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const refusal = refusalMessage(quote.data?.refused);
  const saved = savingLabel(quote.data);
  const total = quote.data ? riyals(quote.data.totalHalalas) : undefined;
  const closesOn = freeUntilLabel(catalogue?.freeUntil);

  const buy = () => {
    if (!packId || !selling) return;
    checkout.mutate(
      { packId, code: quote.data?.refused ? undefined : quote.data?.code },
      { onSuccess: (url) => window.location.assign(url) },
    );
  };

  return (
    <div
      ref={panel}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="شراء مباريات"
      className="w-[min(22rem,calc(100vw-1.5rem))] rounded-3xl border-[3px] border-[hsl(var(--brand-navy))] bg-white p-4 text-right shadow-[6px_8px_0_hsl(var(--brand-navy))] outline-none"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-extrabold text-[hsl(var(--brand-navy))]">
          زد مبارياتك
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="إغلاق"
          className="grid size-8 place-items-center rounded-full text-[hsl(var(--brand-navy))] transition-colors hover:bg-[hsl(var(--brand-navy)/.06)]"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      {!catalogue ? (
        <p className="py-6 text-center text-sm text-[hsl(var(--brand-navy)/.6)]">
          لحظة…
        </p>
      ) : !selling ? (
        // The launch month. The prices still show — a player deciding whether
        // this is worth coming back to deserves to see what it will cost — but
        // nothing here can take money, so nothing here pretends it can.
        <div className="space-y-3">
          <p className="rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold)/.2)] p-3 text-sm font-bold leading-6 text-[hsl(var(--brand-navy))]">
            أول شهر ببلاش: 3 مباريات كل أسبوع لكل حساب
            {closesOn ? `، لين ${closesOn}` : ""}. والشراء ما انفتح للحين.
          </p>
          <GiftCodeForm />
          <ul className="space-y-2">
            {list.map((pack) => (
              <li
                key={pack.id}
                className="flex items-center justify-between rounded-2xl border-2 border-[hsl(var(--brand-navy)/.18)] px-4 py-3 text-sm font-bold text-[hsl(var(--brand-navy)/.55)]"
              >
                <span>{pack.label}</span>
                <span className="akwaan-numeral">{pack.priceRiyals} ريال</span>
              </li>
            ))}
          </ul>
          <p className="text-center text-xs text-[hsl(var(--brand-navy)/.55)]">
            هذي أسعار الباقات لما ينفتح الشراء
          </p>
          <a
            href={moreMatchesMailto(user?.email)}
            className="flex min-h-11 items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white text-sm font-bold text-[hsl(var(--brand-navy))] no-underline"
          >
            تبي أكثر؟ كلمنا
          </a>
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((pack) => {
            const chosen = pack.id === packId;
            return (
              <button
                key={pack.id}
                type="button"
                onClick={() => setPackId(pack.id)}
                aria-pressed={chosen}
                className={
                  chosen
                    ? "flex w-full items-center justify-between rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-4 py-3 text-[15px] font-extrabold text-[hsl(var(--brand-navy))]"
                    : "flex w-full items-center justify-between rounded-2xl border-[3px] border-[hsl(var(--brand-navy)/.18)] bg-white px-4 py-3 text-[15px] font-bold text-[hsl(var(--brand-navy))] transition-colors hover:border-[hsl(var(--brand-navy)/.45)]"
                }
              >
                <span>{pack.label}</span>
                <span className="tabular-nums">{pack.priceRiyals} ريال</span>
              </button>
            );
          })}

          <form
            className="flex gap-2 pt-1"
            onSubmit={(event) => {
              event.preventDefault();
              setApplied(typed.trim() || undefined);
            }}
          >
            <input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="كود خصم"
              aria-label="كود خصم"
              maxLength={32}
              className="min-w-0 flex-1 rounded-2xl border-2 border-[hsl(var(--brand-navy)/.2)] px-4 py-2.5 text-sm font-bold text-[hsl(var(--brand-navy))] placeholder:font-normal placeholder:text-[hsl(var(--brand-navy)/.4)] focus:border-[hsl(var(--brand-navy))] focus:outline-none"
            />
            <button
              type="submit"
              disabled={!typed.trim() || quote.isFetching}
              className="shrink-0 rounded-2xl border-2 border-[hsl(var(--brand-navy))] px-4 py-2.5 text-sm font-bold text-[hsl(var(--brand-navy))] transition-colors hover:bg-[hsl(var(--brand-navy)/.06)] disabled:opacity-40"
            >
              تطبيق
            </button>
          </form>

          {refusal ? (
            <p role="status" className="text-xs font-bold text-[hsl(var(--brand-navy)/.7)]">
              {refusal}
            </p>
          ) : saved ? (
            <p role="status" className="text-xs font-bold text-[hsl(var(--brand-navy))]">
              تم — وفّرت <span className="tabular-nums">{saved}</span> ريال
            </p>
          ) : null}

          <button
            type="button"
            onClick={buy}
            disabled={!packId || quote.isFetching || checkout.isPending}
            className="mt-1 flex min-h-[3.25rem] w-full items-center justify-between rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-navy))] px-5 font-display text-[17px] font-extrabold text-white transition-transform duration-150 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60"
          >
            <span>ادفع الآن</span>
            {checkout.isPending ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <span className="tabular-nums">{total ?? "…"} ريال</span>
            )}
          </button>

          {checkout.isError ? (
            <p role="alert" className="text-xs font-bold text-[hsl(var(--brand-navy))]">
              ما قدرنا نفتح صفحة الدفع. جرّب مرة ثانية، وإذا تكرر راسلنا على
              support@playakwaan.com
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
