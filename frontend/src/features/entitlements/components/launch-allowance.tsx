"use client";

import { useAuth } from "@/components/auth/auth-provider";
import { cn } from "@/lib/utils";
import { useTokenAccount } from "../api/token-balance";
import { moreMatchesMailto } from "../contact";

/**
 * A count of Matches the way it is said out loud here: «مباراة وحدة»,
 * «مباراتين», «3 مباريات», «12 مباراة».
 */
export function spokenMatches(count: number): string {
  if (count === 1) return "مباراة وحدة";
  if (count === 2) return "مباراتين";
  return count >= 3 && count <= 10 ? `${count} مباريات` : `${count} مباراة`;
}

/**
 * The launch month, as a player meets it on the home page.
 *
 * One strip that answers "can I play, and how much": the week's free Matches
 * while there are some, and when they come back once there are none. It
 * never mentions a price — nothing is for sale this month.
 *
 * Shown only while the campaign is running, which the server decides. A
 * signed-out visitor is told the offer; a signed-in player is told their own
 * number.
 */
export function LaunchAllowance({ className }: { className?: string }) {
  const { isAdmin, isAuthenticated, user } = useAuth();
  const { data: account } = useTokenAccount(isAuthenticated && !isAdmin);

  if (isAdmin) return null;
  // Signed in but not known yet: say nothing rather than guess a number.
  if (isAuthenticated && !account) return null;
  // The campaign is over (or the server does not report one): no strip.
  if (isAuthenticated && !account?.weekly) return null;

  const weekly = account?.weekly;
  const out = weekly !== undefined && weekly.remaining === 0;

  return (
    <div
      data-testid="launch-allowance"
      data-state={!weekly ? "guest" : out ? "out" : "has"}
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-4 gap-y-3 rounded-[20px] border-[3px] border-brand-navy px-5 py-3.5 text-brand-navy shadow-[5px_6px_0_hsl(var(--brand-navy))]",
        out ? "bg-brand-lavender" : "bg-brand-gold",
        className,
      )}
    >
      <span className="inline-flex min-h-7 items-center rounded-full border-2 border-brand-navy bg-white px-3 text-xs font-bold">
        إطلاق تجريبي
      </span>

      {!weekly ? (
        <p className="text-base font-bold sm:text-lg">
          أول شهر ببلاش: <b className="font-extrabold">3 مباريات</b> كل أسبوع
          لكل حساب.
        </p>
      ) : out ? (
        <>
          <p className="text-base font-bold sm:text-lg">
            خلصت مبارياتك،{" "}
            {weekly.renewsAt
              ? "تتجدد يوم الخميس."
              : "وهذا آخر أسبوع في الشهر المجاني."}
            {account && account.balance > 0 ? (
              <>
                {" "}
                وعندك{" "}
                <b className="font-extrabold">
                  {spokenMatches(account.balance)}
                </b>{" "}
                في رصيدك.
              </>
            ) : null}
          </p>
          <a
            href={moreMatchesMailto(user?.email)}
            data-testid="launch-allowance-contact"
            className="inline-flex min-h-11 items-center rounded-full border-[3px] border-brand-navy bg-white px-5 text-[15px] font-bold text-brand-navy no-underline transition-transform hover:-translate-y-0.5"
          >
            تبي أكثر؟ كلمنا
          </a>
        </>
      ) : (
        <p className="text-base font-bold sm:text-lg">
          باقي لك{" "}
          <b className="font-extrabold">{spokenMatches(weekly.remaining)}</b>{" "}
          هالأسبوع.
        </p>
      )}
    </div>
  );
}
