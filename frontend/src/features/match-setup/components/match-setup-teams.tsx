"use client";

import type { CSSProperties } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PendingButtonContent } from "@/components/ui/pending-button-content";
import { Input } from "@/components/ui/input";
import { WorldCover } from "@/features/worlds/components/world-cover";
import { usePlayableWorlds } from "@/features/worlds/hooks/use-player-catalog";
import { cn } from "@/lib/utils";
import {
  resolveTeamColor,
  teamColorPool,
  teamColorVariables,
} from "@/lib/team-palette";
import type { MatchSetupDraft } from "../state/match-setup-draft";

const POSITION_LABELS = ["الفريق الأول", "الفريق الثاني"] as const;

/** The final, presentation-only step before the existing Match creation action. */
export function MatchSetupTeams({
  draft,
  submitting,
  rolledBack,
  onRename,
  onRecolor,
  onBack,
  onStart,
}: {
  draft: MatchSetupDraft;
  submitting: boolean;
  rolledBack: boolean;
  onRename: (index: 0 | 1, name: string) => void;
  onRecolor: (index: 0 | 1, colorId: string) => void;
  onBack: () => void;
  onStart: () => void;
}) {
  const worldsQuery = usePlayableWorlds();
  const named = draft.teamNames.every((name) => name.trim().length > 0);
  const distinct = draft.teamNames[0].trim() !== draft.teamNames[1].trim();
  const ready = named && distinct;

  return (
    <section
      id="match-teams"
      aria-labelledby="match-teams-title"
      className="mx-auto max-w-6xl pb-6 pt-2 sm:pt-4"
    >
      <header className="mx-auto max-w-2xl text-center">
        <p className="text-sm font-black text-[hsl(var(--brand-gold))]">
          آخر خطوة
        </p>
        <h1
          id="match-teams-title"
          className="mt-2 text-3xl font-black text-[hsl(var(--brand-navy))] sm:text-4xl lg:text-5xl"
        >
          جهزوا الفريقين
        </h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground sm:text-base">
          سمّوا فريقكم، اختاروا ألوانكم، وبعدها تبدأ المنافسة.
        </p>
      </header>

      <SelectedWorldsSummary
        draft={draft}
        worlds={worldsQuery.data ?? []}
        loading={worldsQuery.isLoading}
      />

      <div
        className="mt-9 space-y-6 sm:mt-10"
        style={teamColorVariables(
          draft.teamColorIds.map((colorId) => ({ colorId })),
        )}
      >
        <div className="grid items-center gap-4 md:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] md:gap-6">
          <TeamCard
            index={0}
            name={draft.teamNames[0]}
            colorId={draft.teamColorIds[0]}
            onRename={onRename}
            onRecolor={onRecolor}
          />

          <p className="text-center text-lg font-black text-[hsl(var(--brand-navy)/.72)] md:text-xl">
            ضد
          </p>

          <TeamCard
            index={1}
            name={draft.teamNames[1]}
            colorId={draft.teamColorIds[1]}
            onRename={onRename}
            onRecolor={onRecolor}
          />
        </div>

        <div className="mx-auto flex max-w-md flex-col items-center gap-3 text-center">
          {!distinct && named && (
            <p role="alert" className="text-sm font-bold text-destructive">
              اختر اسمين مختلفين للفريقين.
            </p>
          )}
          {draft.issue && (
            <p role="alert" className="text-sm font-bold text-destructive">
              {draft.issue.message}
            </p>
          )}
          {rolledBack && (
            <p className="text-sm leading-6 text-muted-foreground">
              لم تُنشأ أي مباراة، وتم إلغاء الجلسة المؤقتة. إعدادك محفوظ كما هو.
            </p>
          )}

          <Button
            type="button"
            size="lg"
            disabled={!ready || submitting}
            aria-busy={submitting}
            onClick={onStart}
            className="akwaan-primary-action h-[3.25rem] w-full max-w-xs gap-2 rounded-xl border border-[hsl(var(--brand-gold)/.28)] bg-[hsl(var(--brand-navy))] px-8 font-black text-white shadow-[0_16px_34px_-18px_hsl(var(--brand-navy)/.8)] hover:bg-[hsl(var(--brand-navy)/.93)] disabled:opacity-50"
          >
            <PendingButtonContent
              pending={submitting}
              pendingLabel="جارٍ إنشاء المباراة…"
            >
              ابدأ المباراة
            </PendingButtonContent>
          </Button>
          <button
            type="button"
            disabled={submitting}
            onClick={onBack}
            className="min-h-11 rounded-xl px-6 text-sm font-black text-[hsl(var(--brand-navy)/.68)] transition-colors hover:bg-[hsl(var(--brand-navy)/.05)] hover:text-[hsl(var(--brand-navy))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold))] disabled:cursor-not-allowed disabled:opacity-50"
          >
            تعديل العوالم
          </button>
        </div>
      </div>
    </section>
  );
}

function SelectedWorldsSummary({
  draft,
  worlds,
  loading,
}: {
  draft: MatchSetupDraft;
  worlds: NonNullable<ReturnType<typeof usePlayableWorlds>["data"]>;
  loading: boolean;
}) {
  const byId = new Map(worlds.map((world) => [world.id, world]));

  return (
    <ol
      aria-label="العوالم المختارة بالترتيب"
      data-testid="selected-worlds-summary"
      className="mx-auto mt-7 flex max-w-3xl flex-wrap justify-center gap-2.5 sm:mt-8 sm:gap-3"
    >
      {draft.occurrences.map((occurrence, index) => {
        const world = occurrence.worldId
          ? byId.get(occurrence.worldId)
          : undefined;
        return (
          <li
            key={occurrence.occurrenceIndex}
            className="flex min-h-14 min-w-[9.5rem] items-center gap-2.5 rounded-full border border-[hsl(var(--brand-navy)/.09)] bg-white/90 py-1.5 pl-4 pr-1.5 shadow-[0_8px_22px_-18px_hsl(var(--brand-navy)/.35)]"
          >
            <span className="akwaan-numeral w-6 shrink-0 text-center text-[0.68rem] font-black tracking-[.08em] text-[hsl(var(--brand-gold))]">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="relative size-10 shrink-0 overflow-hidden rounded-full border border-[hsl(var(--brand-gold)/.28)] bg-secondary">
              {world ? (
                <WorldCover world={world} sizes="40px" />
              ) : (
                <span className="absolute inset-0 animate-pulse bg-[hsl(var(--brand-navy)/.05)]" />
              )}
            </span>
            <span className="truncate text-sm font-black text-[hsl(var(--brand-navy))]">
              {world?.name ?? (loading ? "" : occurrence.worldId)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function TeamCard({
  index,
  name,
  colorId,
  onRename,
  onRecolor,
}: {
  index: 0 | 1;
  name: string;
  colorId: string;
  onRename: (index: 0 | 1, name: string) => void;
  onRecolor: (index: 0 | 1, colorId: string) => void;
}) {
  const position = POSITION_LABELS[index];
  const selected = resolveTeamColor(index, colorId);
  const slot = index + 1;
  const cardStyle = {
    borderColor: `hsl(var(--team-${slot}-base) / .22)`,
    boxShadow: `0 18px 46px -32px hsl(var(--team-${slot}-base) / .42)`,
  } as CSSProperties;

  return (
    <article
      data-testid={`team-card-${slot}`}
      className="rounded-2xl border bg-white/95 p-5 sm:p-7"
      style={cardStyle}
    >
      <h2 className="text-center text-xl font-black text-[hsl(var(--brand-navy))] sm:text-2xl">
        {position}
      </h2>

      <label className="mt-6 block space-y-2">
        <span className="text-sm font-bold text-[hsl(var(--brand-navy)/.66)]">
          اسم الفريق
        </span>
        <Input
          aria-label={`اسم ${position}`}
          dir="rtl"
          value={name}
          onChange={(event) => onRename(index, event.target.value)}
          className="h-12 rounded-xl border-[hsl(var(--brand-navy)/.12)] bg-white px-4 text-base font-bold focus-visible:ring-[hsl(var(--brand-gold))]"
        />
      </label>

      <fieldset className="mt-6">
        <legend className="text-sm font-bold text-[hsl(var(--brand-navy)/.66)]">
          اختر لون فريقك
        </legend>
        <div
          className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start"
          role="radiogroup"
          aria-label={`لون ${position}`}
        >
          {teamColorPool(index).map((color) => {
            const isSelected = color.id === selected.id;
            return (
              <button
                key={color.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={color.label}
                data-team-color={color.id}
                data-selected={isSelected ? "true" : "false"}
                onClick={() => onRecolor(index, color.id)}
                className={cn(
                  "grid size-11 place-items-center rounded-full border-2 transition-[border-color,transform] duration-fast ease-akwaan hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold))] focus-visible:ring-offset-2 motion-reduce:transform-none",
                  isSelected
                    ? "border-[hsl(var(--brand-navy)/.75)]"
                    : "border-transparent",
                )}
              >
                <span
                  aria-hidden
                  className="grid size-7 place-items-center rounded-full ring-2 ring-white"
                  style={{
                    background: `hsl(${color.base.hue} ${color.base.saturation}% ${color.base.lightness}%)`,
                  }}
                >
                  {isSelected && (
                    <Check className="size-4 text-sem-reveal-foreground" />
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
    </article>
  );
}
