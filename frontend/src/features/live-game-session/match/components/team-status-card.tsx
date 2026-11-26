import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One team's line under the question on the shared screen: what the team is
 * doing in this challenge, and whether it has locked its choice in.
 *
 * Neutral on purpose. The team is a dot and a name; the state is gold once it
 * is settled and a dashed outline while it is not. Nothing here says who is
 * right — that is the result's job.
 */
export function TeamStatusCard({
  role,
  name,
  dotClass,
  done,
  doneLabel = "ثبّتوا إجابتهم",
  pendingLabel = "يختارون…",
  className,
  ...rest
}: {
  /** «يجاوب», «يقرأ الخصم»… the team's part in this round. */
  role?: string;
  name: string;
  /** The team's `dot` class from `teamIdentityOf`. */
  dotClass?: string;
  done: boolean;
  doneLabel?: string;
  pendingLabel?: string;
  className?: string;
  "data-testid"?: string;
  "data-locked"?: string;
}) {
  return (
    <div
      {...rest}
      data-team-state={done ? "done" : "pending"}
      className={cn(
        "flex flex-1 flex-wrap items-center justify-between gap-x-3.5 gap-y-2 rounded-[18px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper px-5 py-4 text-[hsl(var(--brand-navy))]",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        {role && (
          <span className="text-[15px] font-semibold text-brand-slate">
            {role}
          </span>
        )}
        <span className="inline-flex min-w-0 items-center gap-2.5 font-display text-xl font-extrabold lg:text-[22px]">
          <span
            aria-hidden
            className={cn(
              "size-4 flex-none rounded-full border-2 border-[hsl(var(--brand-navy))]",
              dotClass,
            )}
          />
          <span className="break-words">{name}</span>
        </span>
      </div>
      {done ? (
        <span className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-3.5 text-base font-bold">
          <Check className="size-4" strokeWidth={3} aria-hidden />
          {doneLabel}
        </span>
      ) : (
        <span className="inline-flex min-h-9 shrink-0 items-center rounded-full border-2 border-dashed border-brand-dash bg-white px-3.5 text-base font-semibold text-brand-plum">
          {pendingLabel}
        </span>
      )}
    </div>
  );
}

/** The two cards side by side, as the approved question screen lays them out. */
export function TeamStatusRow({
  children,
  className,
  ...rest
}: {
  children: React.ReactNode;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div {...rest} className={cn("flex flex-col gap-5 sm:flex-row", className)}>
      {children}
    </div>
  );
}
