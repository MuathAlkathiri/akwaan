import type { TokenPack } from "../api/shop";

/**
 * One pack, with what a single Match inside it costs.
 *
 * That second number is the only persuasion on the card. No "most popular",
 * no "save 33%", no countdown: the price per Match already says which is the
 * better buy, and a player who works it out themselves trusts the answer.
 */
export function PackCard({
  pack,
  disabled,
  disabledLabel,
  buyLabel,
  busy,
  onBuy,
}: {
  pack: TokenPack;
  disabled: boolean;
  disabledLabel?: string;
  buyLabel: string;
  busy: boolean;
  onBuy: () => void;
}) {
  const perMatch = Math.round(pack.priceRiyals / pack.tokens);

  return (
    <div className="flex max-w-[25rem] flex-1 basis-[17.5rem] flex-col items-center gap-3.5 rounded-3xl border-[3px] border-[hsl(var(--brand-navy))] bg-white p-6 text-center shadow-[7px_8px_0_hsl(var(--brand-navy))]">
      <Coins count={Math.min(pack.tokens, 3)} />
      <h2 className="mt-1 font-display text-2xl font-extrabold">
        {pack.label}
      </h2>
      <div className="flex items-baseline gap-2">
        <span className="text-[3.5rem] font-bold leading-none tabular-nums">
          {pack.priceRiyals}
        </span>
        <span className="text-xl font-semibold">ريال</span>
      </div>
      <span className="text-[15px] font-semibold text-[hsl(var(--brand-navy)/.65)]">
        <b className="text-[hsl(var(--brand-navy))] tabular-nums">{perMatch}</b>{" "}
        ريال للمباراة
      </span>
      <button
        type="button"
        disabled={disabled || busy}
        aria-busy={busy}
        onClick={onBuy}
        className={
          disabled
            ? "min-h-[3.625rem] w-full rounded-full border-[3px] border-[hsl(var(--brand-purple)/.35)] bg-[hsl(var(--brand-purple)/.08)] font-display text-[15px] font-bold text-[hsl(var(--brand-purple))]"
            : "min-h-[3.625rem] w-full rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] font-display text-[19px] font-extrabold text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))] transition-transform duration-150 hover:-translate-y-0.5 disabled:translate-y-0 disabled:shadow-none"
        }
      >
        {disabled ? disabledLabel : busy ? "نفتح الدفع…" : buyLabel}
      </button>
    </div>
  );
}

/** The identity's Match token: stacked gold coins with a navy spark. */
function Coins({ count }: { count: number }) {
  const coins = Array.from({ length: count });
  return (
    <span
      aria-hidden="true"
      className="flex size-[8.25rem] items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold)/.18)]"
    >
      <span
        className="relative block h-[4.125rem]"
        style={{ width: `${3.375 + (count - 1) * 0.875}rem` }}
      >
        {coins.map((_, index) => (
          <span
            key={index}
            className="absolute inline-flex size-[3.375rem] items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))]"
            style={{
              right: `${(count - 1 - index) * 0.875}rem`,
              top: `${(count - 1 - index) * 0.375}rem`,
            }}
          >
            <svg viewBox="-10 -10 20 20" className="size-[1.4rem]">
              <path
                d="M0 -10 Q1.8 -1.8 10 0 Q1.8 1.8 0 10 Q-1.8 1.8 -10 0 Q-1.8 -1.8 0 -10Z"
                fill="hsl(var(--brand-navy))"
              />
            </svg>
          </span>
        ))}
      </span>
    </span>
  );
}
