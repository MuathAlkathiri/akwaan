"use client";

import { createContext, useContext } from "react";
import { teamIdentity } from "@/lib/team-identity";
import { cn } from "@/lib/utils";

export interface TutorialStageTeamNames {
  blueShort: string;
  blueFull: string;
  redShort: string;
  redFull: string;
}

export interface TutorialStagePresentation {
  /** True when rendered inside the V6 Preflight TV stage bezel. */
  embedded: boolean;
  teamNames?: TutorialStageTeamNames;
}

const TutorialStagePresentationContext =
  createContext<TutorialStagePresentation>({
    embedded: false,
  });

export function TutorialStagePresentationProvider({
  embedded = true,
  teamNames,
  children,
}: {
  embedded?: boolean;
  teamNames?: TutorialStageTeamNames;
  children: React.ReactNode;
}) {
  return (
    <TutorialStagePresentationContext.Provider value={{ embedded, teamNames }}>
      {children}
    </TutorialStagePresentationContext.Provider>
  );
}

export function useTutorialStagePresentation(): TutorialStagePresentation {
  return useContext(TutorialStagePresentationContext);
}

/**
 * The two device shells the walkthrough and explainers draw their product shots inside.
 *
 * When rendered inside Preflight V6 (`embedded === true`), `SharedScreenFrame`
 * omits the outer navy TV bezel and stand so the stage never double-nests a TV
 * inside V6's outer TV frame, instead presenting a clean cream/card surface.
 */

/** The shared screen every group plays around: a TV or a laptop on the table. */
export function SharedScreenFrame({
  children,
  className,
  stand = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** The little foot under the screen. Dropped when space is tight. */
  stand?: boolean;
}) {
  const { embedded } = useTutorialStagePresentation();

  if (embedded) {
    return (
      <div
        data-tutorial-surface="shared"
        data-variant="v6-embedded"
        className={cn("flex w-full flex-col items-center", className)}
      >
        <div className="w-full overflow-hidden rounded-[14px] border border-border/80 bg-card/95 shadow-[0_10px_24px_-16px_hsl(var(--brand-navy)/0.22)]">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      data-tutorial-surface="shared"
      className={cn("flex w-full flex-col items-center", className)}
    >
      <div className="w-full rounded-[1.6rem] border border-[hsl(var(--brand-navy)/.14)] bg-[hsl(var(--brand-navy))] p-2 shadow-[0_28px_60px_-32px_hsl(var(--brand-navy)/.75)] sm:rounded-[1.9rem] sm:p-2.5">
        <div className="overflow-hidden rounded-[1.15rem] bg-white sm:rounded-[1.4rem]">
          {children}
        </div>
      </div>
      {stand && (
        <>
          <span
            aria-hidden
            className="h-3 w-16 bg-[hsl(var(--brand-navy)/.16)] sm:h-4 sm:w-20"
          />
          <span
            aria-hidden
            className="h-1.5 w-28 rounded-full bg-[hsl(var(--brand-navy)/.22)] sm:w-36"
          />
        </>
      )}
    </div>
  );
}

/**
 * A player's own phone, held at arm's length beside the shared screen.
 *
 * When `team` is supplied or the frame is rendered inside V6 (`embedded`),
 * renders the approved V6 modern iPhone shell with Dynamic Island, status bar,
 * team header tint, active elevation ring, and bottom home indicator while
 * keeping decorative `/how-to-play` hero phone illustrations unchanged.
 */
export function PhoneFrame({
  children,
  className,
  style,
  team,
  teamLabel,
  statusLabel,
  acting = false,
}: {
  children?: React.ReactNode;
  className?: string;
  /** Reserved for per-instance animation delay in the hero cluster. */
  style?: React.CSSProperties;
  team?: "team-a" | "team-b";
  teamLabel?: string;
  statusLabel?: string;
  acting?: boolean;
}) {
  const { embedded } = useTutorialStagePresentation();
  const useV6Iphone = Boolean(team || embedded);

  if (!useV6Iphone) {
    return (
      <div
        data-tutorial-surface="phone"
        style={style}
        className={cn(
          "shrink-0 rounded-[1.1rem] border border-[hsl(var(--brand-navy)/.14)] bg-[hsl(var(--brand-navy))] p-[3px] shadow-[0_16px_34px_-18px_hsl(var(--brand-navy)/.7)]",
          className,
        )}
      >
        <div className="relative aspect-[9/18] overflow-hidden rounded-[0.9rem] bg-white">
          {/* The earpiece bar, which is what makes the shape read as a phone. */}
          <span
            aria-hidden
            className="absolute left-1/2 top-1.5 h-1 w-8 -translate-x-1/2 rounded-full bg-[hsl(var(--brand-navy)/.16)]"
          />
          <div className="flex h-full flex-col items-center justify-center gap-1.5 px-2 pt-4">
            {children}
          </div>
        </div>
      </div>
    );
  }

  const slot = team === "team-b" ? "2" : "1";
  const identity = team ? teamIdentity(slot) : null;
  const headerSurface = identity ? identity.surface : "bg-muted/60";

  return (
    <div
      data-tutorial-surface="phone"
      data-phone-variant="v6-iphone"
      data-acting={acting ? "true" : "false"}
      style={style}
      className={cn(
        "v6-iphone-shell relative box-border shrink-0 rounded-[22px] border border-[#555b6b] bg-[linear-gradient(128deg,#5b6070_0%,#161821_12%,#080a10_68%,#585b66_100%)] p-[3px] transition-all duration-200 sm:rounded-[25px]",
        acting
          ? "motion-safe:-translate-y-[2px] shadow-[0_0_0_2px_hsl(var(--brand-gold)),0_12px_22px_-7px_hsl(var(--brand-navy)/0.38)]"
          : "shadow-[0_10px_18px_-8px_hsl(var(--brand-navy)/0.32)]",
        className,
      )}
    >
      <span
        aria-hidden
        className="absolute -right-[3px] top-[52px] h-[18px] w-[2px] rounded bg-[#747784]"
      />
      <span
        aria-hidden
        className="absolute -left-[3px] top-[46px] h-[24px] w-[2px] rounded bg-[#8b8e9a]"
      />

      <div className="flex h-full min-h-[196px] flex-col overflow-hidden rounded-[19px] border border-[#05060b] bg-card text-foreground sm:min-h-[220px] sm:rounded-[22px]">
        {/* Status bar + Dynamic Island */}
        <div
          dir="ltr"
          className={cn(
            "relative flex h-[19px] shrink-0 items-center justify-between px-2 pt-0.5 sm:h-[21px]",
            headerSurface,
          )}
        >
          <span className="font-sans text-[8px] font-extrabold text-foreground">
            9:41
          </span>
          <span
            data-testid={team ? `v6-dynamic-island-${team}` : "v6-dynamic-island"}
            className="absolute left-1/2 top-[3.5px] flex h-[11px] w-[36px] -translate-x-1/2 items-center justify-end rounded-full bg-[#07080c] pr-1"
          >
            <span className="size-[4px] rounded-full border border-[#222a49] bg-[#151f39]" />
          </span>
          <svg
            width="24"
            height="9"
            viewBox="0 0 27 10"
            aria-hidden
            className="text-foreground/80"
          >
            <path
              fill="currentColor"
              d="M1 9V6h3v3zM5 9V4h3v5zM9 9V2h3v7zM14 7q4-5 8 0l-4 3zM23 3h4v6h-4z"
            />
          </svg>
        </div>

        {/* Mini app bar */}
        {(teamLabel || statusLabel) && (
          <div
            className={cn(
              "flex shrink-0 items-center justify-between gap-1 border-b border-border/70 px-2 py-1",
              headerSurface,
            )}
          >
            <div className="flex min-w-0 items-center gap-1">
              <span className="grid size-[16px] shrink-0 place-items-center rounded-[5px] bg-brand-navy font-display text-[8px] font-extrabold text-white">
                أ
              </span>
              <span className="truncate text-[8.5px] font-extrabold leading-tight text-foreground sm:text-[9px]">
                {teamLabel ?? "أكوان"}
              </span>
            </div>
            {statusLabel && (
              <span className="shrink-0 rounded-full bg-background/85 px-1.5 py-0.5 text-[7.5px] font-bold text-foreground">
                {statusLabel}
              </span>
            )}
          </div>
        )}

        {/* Interactive demo body */}
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 bg-card px-2 py-2">
          {children}
        </div>

        {/* Home indicator bar */}
        <div
          aria-hidden
          className="grid h-[10px] shrink-0 place-items-center border-t border-border/40 bg-card"
        >
          <span className="h-[3px] w-[32px] rounded-full bg-brand-navy/80" />
        </div>
      </div>
    </div>
  );
}
