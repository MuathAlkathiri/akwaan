"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useAuth } from "@/components/auth/auth-provider";
import {
  tokenBalanceQueryKey,
  useTokenBalance,
} from "@/features/entitlements/api/token-balance";
import { ARABIC_NOUNS, arabicCount, arabicNoun } from "@/lib/arabic-plural";
import { useSettlePurchase, useShopCatalogue, useStartCheckout } from "../api/shop";
import { PackCard } from "./pack-card";
import { ShopBanner } from "./shop-banner";
import { freeUntilLabel, shopState } from "./shop-state";

/**
 * Buying Matches.
 *
 * One shop with five faces, chosen by `shopState`. The parts that do not
 * change — what a Match is, what it costs, and the three things that are true
 * about paying here — stay put underneath, because a player comparing packs
 * should not have the page rearrange itself around them.
 */
export function Shop() {
  const { isAuthenticated } = useAuth();
  const catalogue = useShopCatalogue();
  const balance = useTokenBalance(isAuthenticated);
  const checkout = useStartCheckout();
  const settlement = useSettlement();

  const state = shopState({
    catalogue: catalogue.data,
    balance: balance.data,
    returning: settlement.returning,
  });
  const selling = catalogue.data?.selling ?? false;

  return (
    <main className="relative mx-auto flex w-full max-w-[80rem] flex-col gap-11 px-4 pb-20 pt-7 sm:px-8">
      <ShopBanner
        state={state}
        tokensAdded={settlement.tokensAdded}
        freeUntil={freeUntilLabel(catalogue.data?.freeUntil)}
      />

      <Balance balance={balance.data} />

      <section className="flex flex-wrap justify-center gap-7">
        {catalogue.data?.packs.map((pack) => (
          <PackCard
            key={pack.id}
            pack={pack}
            disabled={!selling || !isAuthenticated}
            disabledLabel={
              selling ? "سجّل دخولك عشان تشتري" : "يفتح بعد انتهاء المجانية"
            }
            buyLabel={state === "empty" ? "اشترِ وكمّل مباراتك" : "اشترِ"}
            busy={checkout.isPending && checkout.variables === pack.id}
            onBuy={() =>
              checkout.mutate(pack.id, {
                onSuccess: (url) => {
                  window.location.href = url;
                },
              })
            }
          />
        ))}
      </section>

      {checkout.isError ? (
        <p role="alert" className="text-center text-[17px] font-semibold">
          ما قدرنا نفتح صفحة الدفع. جرّب مرة ثانية، وإذا تكرر كلّمنا.
        </p>
      ) : null}

      <Assurances />
    </main>
  );
}

/** How many Matches you have, and what one of them buys you. */
function Balance({ balance }: { balance?: number }) {
  return (
    <section className="flex flex-wrap items-center gap-6 sm:gap-8">
      <span
        aria-hidden="true"
        className="flex size-[8.25rem] shrink-0 items-center justify-center rounded-full bg-[hsl(var(--brand-gold)/.22)]"
      >
        <svg viewBox="-10 -10 20 20" className="size-16">
          <path
            d="M0 -10 Q1.8 -1.8 10 0 Q1.8 1.8 0 10 Q-1.8 1.8 -10 0 Q-1.8 -1.8 0 -10Z"
            fill="hsl(var(--brand-gold))"
            stroke="hsl(var(--brand-navy))"
            strokeWidth="1.5"
          />
        </svg>
      </span>
      <div className="flex flex-1 basis-[26rem] flex-col gap-2.5">
        <h1 className="font-display text-[2.6rem] font-black leading-tight sm:text-[3.375rem]">
          {balance === undefined ? (
            // Nothing rather than a zero that is only a loading state: a shop
            // that opens by saying you have none is wrong more often than not.
            <span className="opacity-0">عندك</span>
          ) : balance === 0 ? (
            "ما عندك مباريات"
          ) : balance >= 3 ? (
            <>
              عندك{" "}
              <span className="font-body font-bold tabular-nums">{balance}</span>{" "}
              {arabicNoun(balance, ARABIC_NOUNS.match)}
            </>
          ) : (
            <>عندك {arabicCount(balance, ARABIC_NOUNS.match)}</>
          )}
        </h1>
        <p className="max-w-[40rem] text-[19px] leading-8 text-[hsl(var(--brand-navy)/.65)]">
          مباراة وحدة = 3 عوالم تختارونها، الفريق كله يلعب، شاشة وحدة للكل
          وجوال لكل لاعب.
        </p>
      </div>
    </section>
  );
}

/** Three things that are true about paying here, and the ways to pay. */
function Assurances() {
  return (
    <section className="flex flex-wrap items-start gap-7 sm:gap-10">
      <ul className="flex flex-1 basis-[28.75rem] list-none flex-col gap-3.5 p-0">
        {[
          "ما فيه اشتراك ولا تجديد تلقائي، تدفع مرة وخلاص.",
          "المباريات ما لها تاريخ انتهاء.",
          "الدفع يتم عند مُيسّر، وبيانات بطاقتك ما تمرّ على أكوان أبدًا.",
        ].map((line) => (
          <li key={line} className="flex items-center gap-3 text-[17px] leading-7">
            <span
              aria-hidden="true"
              className="inline-flex size-[1.875rem] shrink-0 items-center justify-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <div className="flex flex-1 basis-[23.75rem] flex-col gap-4 rounded-[20px] border-2 border-dashed border-[hsl(var(--brand-purple)/.4)] bg-[hsl(var(--brand-purple)/.06)] p-6">
        <div className="flex flex-col gap-2.5">
          <span className="text-sm font-semibold text-[hsl(var(--brand-navy)/.65)]">
            طرق الدفع
          </span>
          <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
            {["مدى", "Visa", "Mastercard", "Apple Pay", "سداد"].map((method) => (
              <li
                key={method}
                dir="ltr"
                className="inline-flex min-h-9 items-center rounded-[10px] border-2 border-[hsl(var(--brand-navy))] bg-white px-3.5 text-sm font-bold"
              >
                {method}
              </li>
            ))}
          </ul>
        </div>
        {/* The name on the bank statement is the business, not the game. A
            player who does not recognise it opens a dispute with their bank
            instead of writing to us, and that costs far more than this line. */}
        <p className="text-[15px] leading-7 text-[hsl(var(--brand-navy)/.65)]">
          يظهر الخصم في كشف حسابك باسم النشاط التجاري المسجّل، مو باسم «أكوان».
        </p>
        <Link href="/refund" className="min-h-11 text-[15px] font-bold underline">
          سياسة الاسترجاع
        </Link>
      </div>
    </section>
  );
}

/**
 * The charge a player may have come back carrying.
 *
 * Asked about once, on arrival. The query string says `status=paid`, and that
 * claim is not read: the server is asked instead, and it reads the charge from
 * the gateway. This is the second of three ways a purchase can land — the
 * webhook is the first, and a sweeper behind both catches the player who
 * closed the tab before any of this ran.
 */
function useSettlement() {
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const settle = useSettlePurchase();
  const invoiceId = params.get("invoice_id");
  const asked = useRef<string | null>(null);
  const [outcome, setOutcome] = useState<"settled" | "unsettled" | undefined>();
  const [tokensAdded, setTokensAdded] = useState<number | undefined>();

  useEffect(() => {
    if (!invoiceId || asked.current === invoiceId) return;
    asked.current = invoiceId;
    settle.mutate(invoiceId, {
      onSuccess: (result) => {
        setOutcome(result.granted ? "settled" : "unsettled");
        if (result.granted) setTokensAdded(result.tokens);
        void queryClient.invalidateQueries({ queryKey: tokenBalanceQueryKey });
      },
      onError: () => setOutcome("unsettled"),
      onSettled: () => {
        // Take the charge out of the address bar so a refresh, a shared link
        // or a back button cannot replay it.
        router.replace("/shop");
      },
    });
  }, [invoiceId, settle, queryClient, router]);

  return { returning: outcome, tokensAdded };
}
