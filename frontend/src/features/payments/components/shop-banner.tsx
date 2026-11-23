import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/support";
import { ARABIC_NOUNS, arabicCount } from "@/lib/arabic-plural";
import type { ShopState } from "./shop-state";

/**
 * The one line at the top that says why this player is here.
 *
 * Everything below it is the same shop whatever the state; this is what
 * changes. Gold for news about money that landed, lavender for news that asks
 * something of the player — the project's red and green stay reserved for
 * right and wrong answers.
 */
export function ShopBanner({
  state,
  tokensAdded,
  freeUntil,
}: {
  state: ShopState;
  tokensAdded?: number;
  freeUntil?: string;
}) {
  if (state === "normal") return null;

  const sticker =
    "rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] p-5 sm:px-7 shadow-[6px_7px_0_hsl(var(--brand-navy))]";

  if (state === "free") {
    return (
      <div
        role="status"
        className={`${sticker} flex flex-wrap items-center gap-4 bg-[hsl(var(--brand-gold))]`}
      >
        <span className="font-display text-2xl font-extrabold">
          الشهر الأول علينا
        </span>
        <span className="flex-1 basis-[26rem] text-[17px] leading-8">
          كل المباريات مجانية للكل
          {freeUntil ? <> لين <b>{freeUntil}</b></> : null}، ورصيدك ما ينقص.
          عشان كذا ما نبيعك شي بتاخذه ببلاش، والشراء يفتح بعدها.
        </span>
      </div>
    );
  }

  if (state === "settled") {
    return (
      <div
        role="status"
        className={`${sticker} flex flex-wrap items-center justify-between gap-4 bg-[hsl(var(--brand-gold))]`}
      >
        <div className="flex items-center gap-4">
          <TickDisc />
          <div className="flex flex-col gap-0.5">
            <span className="font-display text-2xl font-extrabold">
              تم الدفع
            </span>
            {tokensAdded ? (
              <span className="text-[17px]">
                انضافت <b>{arabicCount(tokensAdded, ARABIC_NOUNS.match)}</b>{" "}
                لرصيدك.
              </span>
            ) : null}
          </div>
        </div>
        <Link
          href="/"
          className="inline-flex min-h-14 items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-navy))] px-7 font-display text-lg font-extrabold text-white shadow-[4px_5px_0_hsl(var(--brand-navy))]"
        >
          ابدأ مباراة
        </Link>
      </div>
    );
  }

  if (state === "unsettled") {
    return (
      <div
        role="status"
        className={`${sticker} flex flex-wrap items-center justify-between gap-5 bg-[hsl(var(--brand-purple)/.08)]`}
      >
        <div className="flex flex-1 basis-[32rem] items-start gap-4">
          <WarnDisc />
          <div className="flex flex-col gap-1">
            <span className="font-display text-2xl font-extrabold">
              ما وصلنا تأكيد الدفع
            </span>
            <span className="text-[17px] leading-8">
              رصيدك مثل ما هو. إذا انخصم منك المبلغ، المباريات بتنضاف لرصيدك
              تلقائي خلال دقايق. وإذا ما انضافت، كلّمنا على{" "}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                dir="ltr"
                className="font-bold underline"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </span>
          </div>
        </div>
      </div>
    );
  }

  // empty
  return (
    <div
      role="status"
      className={`${sticker} flex flex-wrap items-center gap-4 bg-[hsl(var(--brand-purple)/.08)]`}
    >
      <span className="font-display text-2xl font-extrabold">رصيدك خلص</span>
      <span className="flex-1 basis-[26rem] text-[17px] leading-8">
        مباراتك محفوظة بعوالمها. اشترِ باقة ونرجّعك لها على طول.
      </span>
    </div>
  );
}

function TickDisc() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-[3.25rem] shrink-0 items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white"
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}

function WarnDisc() {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-[3.25rem] shrink-0 items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white"
    >
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
        <path d="M12 6.5v7M12 17.5v.5" />
      </svg>
    </span>
  );
}
