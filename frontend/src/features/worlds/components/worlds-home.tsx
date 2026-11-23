"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import {
  OCCURRENCE_COUNT,
  SCOPES_PER_OCCURRENCE,
  type MatchSetupDraft,
} from "@/features/match-setup/state/match-setup-draft";
import { useMatchSetup } from "@/features/match-setup/state/use-match-setup";
import { cn } from "@/lib/utils";
import { JourneyShell } from "./journey-shell";
import { JourneyError } from "./journey-error";
import { getMediaUrl } from "@/lib/api/media-url";
import { ResumeMatchCard } from "./resume-match-card";
import { ScopeCardMedia } from "./scope-card-media";
import {
  usePlayableScopes,
  usePlayableWorlds,
} from "../hooks/use-player-catalog";
import { playableWorlds, upcomingWorlds } from "../utils/featured-worlds";
import { isSelectableScope } from "../utils/scopes";
import { worldSignatureLabel } from "../utils/world-signature";
import type { PlayableScope, PlayableWorld } from "../types";
import { ChallengePill, STICKER } from "@/components/akwaan/sticker";
import { WorldDisc, WorldShadow } from "./world-disc";
import { useAuth } from "@/components/auth/auth-provider";
import { useWorldRemaining } from "../api/world-remaining";
import { GoldPill, Spark } from "@/components/akwaan/sticker";
import { SectionTag } from "@/components/akwaan/sticker";

function withViewTransition(update: () => void) {
  const startViewTransition = (
    document as Document & {
      startViewTransition?: (callback: () => void) => void;
    }
  ).startViewTransition;
  const reduceMotion = window.matchMedia?.(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  if (!startViewTransition || reduceMotion) {
    update();
    return;
  }

  startViewTransition.call(document, () => flushSync(update));
}

export function WorldsHome() {
  const query = usePlayableWorlds();
  // One catalog response, partitioned. The page holds no opinion about which
  // Worlds are open — that was the bug: الأغاني shipped and the hardcoded
  // roadmap below kept calling it «قريبًا» on the same screen.
  const worlds = query.isSuccess ? playableWorlds(query.data) : [];
  const upcoming = query.isSuccess ? upcomingWorlds(query.data) : [];
  // The same setup controller the wizard route uses: one reducer, one storage
  // module, one function that talks to the server. This page builds the whole
  // plan — three Worlds and their twelve Scopes — so it finishes the job here
  // too. Sending a complete plan to a second page to be confirmed again was a
  // review step with nothing left to review.
  const setup = useMatchSetup();
  const { draft, act: dispatch } = setup;
  // One request for the whole row rather than one per card. A signed-out
  // visitor has no progress to read, so the hook stays idle and the cards
  // simply carry no count — which is the truth, not a zero.
  const { isAuthenticated } = useAuth();
  const remaining = useWorldRemaining(
    worlds.map((world) => world.id),
    isAuthenticated,
  );
  const [focusedWorld, setFocusedWorld] = useState<{
    world: PlayableWorld;
    occurrenceIndex: number;
  }>();
  const [pendingScopeIds, setPendingScopeIds] = useState<string[]>([]);
  const returnFocusWorldId = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (focusedWorld || !returnFocusWorldId.current) return;
    const worldId = returnFocusWorldId.current;
    const frame = requestAnimationFrame(() => {
      const trigger = Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-world-id]"),
      ).find((element) => element.dataset.worldId === worldId);
      trigger?.focus();
      returnFocusWorldId.current = undefined;
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedWorld]);

  const openWorld = (world: PlayableWorld, occurrenceIndex?: number) => {
    const existing =
      occurrenceIndex === undefined
        ? draft.occurrences.find((item) => item.worldId === world.id)
        : draft.occurrences[occurrenceIndex];
    const target = existing ?? draft.occurrences.find((item) => !item.worldId);
    if (!target) return;
    returnFocusWorldId.current = world.id;
    withViewTransition(() => {
      setPendingScopeIds(
        target.worldId === world.id ? target.selectedScopeIds : [],
      );
      setFocusedWorld({ world, occurrenceIndex: target.occurrenceIndex });
    });
  };

  const confirmScopes = () => {
    if (!focusedWorld || pendingScopeIds.length !== SCOPES_PER_OCCURRENCE)
      return;
    const current = draft.occurrences[focusedWorld.occurrenceIndex];
    dispatch({
      type: "choose-world",
      occurrenceIndex: focusedWorld.occurrenceIndex,
      worldId: focusedWorld.world.id,
    });
    const previous =
      current.worldId === focusedWorld.world.id ? current.selectedScopeIds : [];
    previous
      .filter((id) => !pendingScopeIds.includes(id))
      .forEach((scopeId) =>
        dispatch({
          type: "toggle-scope",
          occurrenceIndex: focusedWorld.occurrenceIndex,
          scopeId,
        }),
      );
    pendingScopeIds
      .filter((id) => !previous.includes(id))
      .forEach((scopeId) =>
        dispatch({
          type: "toggle-scope",
          occurrenceIndex: focusedWorld.occurrenceIndex,
          scopeId,
        }),
      );
    dispatch({ type: "confirm-scopes" });
    withViewTransition(() => setFocusedWorld(undefined));
  };

  const selected = draft.occurrences.flatMap((occurrence) => {
    const world = worlds.find((entry) => entry.id === occurrence.worldId);
    return world ? [{ occurrence, world }] : [];
  });
  const selectedCount = selected.length;

  if (focusedWorld) {
    return (
      <JourneyShell className="max-w-[1440px]">
        <WorldScopeFocusMode
          state={focusedWorld}
          selectedScopeIds={pendingScopeIds}
          onSelectedScopeIdsChange={setPendingScopeIds}
          onBack={() => withViewTransition(() => setFocusedWorld(undefined))}
          onConfirm={confirmScopes}
        />
      </JourneyShell>
    );
  }

  return (
    <JourneyShell className="max-w-[1440px]">
      <div className="relative space-y-16 pb-6">
        <AkwaanHero />
        <ResumeMatchCard />

        <section
          id="worlds"
          aria-labelledby="worlds-title"
          className="relative scroll-mt-24"
        >
          <div className="flex flex-col gap-8">
            <div className="min-w-0" dir="rtl">
              <div className="flex flex-col items-center gap-4">
                <SectionTag tone="purple" tilt={-2}>
                  <h2 id="worlds-title" className="m-0 font-[inherit]">
                    اختر عوالمك
                  </h2>
                </SectionTag>
                <p className="text-center text-lg text-[#4A5468]">
                  اختر 3 عوالم، والترتيب اللي تختاره هو ترتيب اللعب.
                </p>
              </div>
              <div className="h-8" />

              {query.isLoading ? (
                <CardSkeletons count={4} />
              ) : query.isError ? (
                <JourneyError
                  title="تعذر تحميل العوالم"
                  description="تأكد من اتصالك وجرّب مرة ثانية."
                  onRetry={() => void query.refetch()}
                  retrying={query.isFetching}
                />
              ) : worlds.length ? (
                <>
                  {/* Active Worlds as circular portals — all of them, still exactly-3 to select. */}
                  {/* A wrap that centres, not a fixed four-column grid. Five Worlds in four
                      columns left the fifth alone at the row's start with three columns of
                      white beside it, and the same happened again below. */}
                  <ul className="flex list-none flex-wrap justify-center gap-x-5 gap-y-8 [&>li]:basis-[clamp(9.5rem,17.5%,13.5rem)]">
                    {worlds.map((world) => {
                      const occurrence = draft.occurrences.find(
                        (item) => item.worldId === world.id,
                      );
                      const order = occurrence
                        ? draft.occurrences.findIndex(
                            (item) => item.worldId === world.id,
                          ) + 1
                        : undefined;
                      return (
                        <li key={world.id} className="w-full">
                          <WorldSelectCard
                            world={world}
                            selected={Boolean(occurrence)}
                            order={order}
                            selectedScopeIds={occurrence?.selectedScopeIds ?? []}
                            remaining={remaining.data?.get(world.id)}
                            disabled={
                              selectedCount >= OCCURRENCE_COUNT && !occurrence
                            }
                            onSelect={() =>
                              openWorld(world, occurrence?.occurrenceIndex)
                            }
                            onRemove={
                              occurrence
                                ? () =>
                                    dispatch({
                                      type: "clear-occurrence",
                                      occurrenceIndex:
                                        occurrence.occurrenceIndex,
                                    })
                                : undefined
                            }
                          />
                        </li>
                      );
                    })}
                  </ul>

                  {/* Not open yet — same portal language, plainly muted and
                      unselectable. Nothing renders when the catalog announces
                      nothing, rather than an empty heading over an empty grid. */}
                  {upcoming.length > 0 && (
                    <>
                      <div className="mb-7 mt-16 flex justify-center">
                        <SectionTag
                          tone="white"
                          tilt={-1.5}
                          className="min-h-14 px-6 text-[24px] sm:text-[28px]"
                        >
                          <h3 className="m-0 font-[inherit]">العوالم القادمة</h3>
                        </SectionTag>
                      </div>
                      <ul
                        className="flex list-none flex-wrap justify-center gap-5 p-0 [&>li]:max-w-[25rem] [&>li]:flex-1 [&>li]:basis-[18.75rem]"
                        data-testid="upcoming-worlds"
                      >
                        {upcoming.map((world, index) => (
                          <li key={world.id} className="w-full">
                            <ComingSoonCard world={world} index={index} />
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              ) : (
                <EmptyWorlds />
              )}
            </div>
            <WorldSelectionSidebar
              draft={draft}
              submitting={setup.submitting}
              onStart={setup.start}
              worlds={worlds}
              selectedCount={selectedCount}
              onEdit={openWorld}
            />
          </div>
        </section>

        <HowToPlaySection />
      </div>
    </JourneyShell>
  );
}

function AkwaanHero() {
  return (
    <section className="relative z-10 flex flex-wrap items-center justify-between gap-x-14 gap-y-12 px-4 pb-10 pt-10 sm:px-8 lg:pb-16 lg:pt-16">
      {/* Right column. Its inline padding lines the headline up with the header
          logo's edge above it, which is the one alignment the eye checks on a
          page this sparse. */}
      <div className="flex max-w-[37.5rem] flex-1 basis-[28.75rem] flex-col items-start ps-2.5">
        <h1 className="font-display text-[2.75rem] font-black leading-[1.3] text-[hsl(var(--brand-navy))] sm:text-[3.5rem] lg:text-[4.125rem]">
          {/* The numeral is set in the body face on purpose: the display face
              draws Arabic beautifully and Western digits stiffly, and this
              digit is the first thing on the page. */}
          <span className="font-body font-bold">3</span> عوالم مختلفة
          <br />
          <span className="text-[0.82em] text-[hsl(var(--brand-purple))]">
            منافسة واحدة
          </span>
        </h1>

        <p className="mt-7 max-w-[35rem] text-lg leading-[1.8] text-[#4A5468] sm:text-[23px]">
          مو مجرد أسئلة، كل عالم له تحديه الخاص.{" "}
          <b className="font-bold text-[hsl(var(--brand-navy))]">
            شاشة وحدة للكل
          </b>
          ،{" "}
          <b className="font-bold text-[hsl(var(--brand-navy))]">
            جوال لكل لاعب
          </b>
          ،{" "}
          {/* The waw is inside the bold, not beside it. In Arabic it attaches
              to the word it joins — split out, it renders at the paragraph's
              weight and detaches from «فريق», which reads as a typo. */}
          <b className="font-bold text-[hsl(var(--brand-navy))]">
            وفريق ضد فريق
          </b>
          .
        </p>

        <GoldPill
          className="mt-10"
          onClick={() => {
            document
              .getElementById("worlds")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          ابدأ مباراة
        </GoldPill>
      </div>

      {/* Left column: the logo, tilted, orbited by two faces and two sparks.
          Hidden from assistive technology as a group — the wordmark is already
          announced in the header, and a second "أكوان" here is noise. */}
      <div className="relative flex min-h-[23.75rem] max-w-[28.75rem] flex-1 basis-[22.5rem] items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-full.svg"
          alt=""
          aria-hidden="true"
          className="block w-full -rotate-[5deg] select-none"
          draggable={false}
        />
        <FacePlanet
          tone="purple"
          orbited
          className="absolute bottom-0 right-[2%]"
        />
        <FacePlanet tone="gold" className="absolute left-[4%] top-0" />
        <Spark
          className="absolute right-[8%] top-5 size-[1.875rem]"
          fill="hsl(var(--brand-gold))"
        />
        <Spark
          className="absolute bottom-6 left-[20%] size-5"
          fill="hsl(var(--brand-gold))"
        />
      </div>
    </section>
  );
}

/**
 * A little planet with a face, from the identity's cast.
 *
 * Two circles offset by a few pixels give the hard-edged depth the rest of the
 * identity gets from its shadows — the back circle is the shadow.
 */
function FacePlanet({
  tone,
  orbited = false,
  className,
}: {
  tone: "purple" | "gold";
  /** Draw a tilted ring around this one. Reserved for the hero. */
  orbited?: boolean;
  className?: string;
}) {
  const face = tone === "purple" ? "#F7F4ED" : "#1B173B";
  return (
    <span aria-hidden="true" className={cn("relative block", className)}>
      {/* The ring is drawn behind the planet and wider than it, so the planet
          sits ON the orbit rather than inside a circle. Only one face carries
          it: two rings in one hero turn a detail into a pattern, and the eye
          stops reading it as a planet and starts reading it as decoration. */}
      {orbited && (
        <svg
          viewBox="0 0 200 110"
          className="absolute left-1/2 top-1/2 w-[11rem] -translate-x-1/2 -translate-y-1/2"
        >
          <ellipse
            cx="100"
            cy="55"
            rx="94"
            ry="34"
            fill="none"
            stroke="hsl(var(--brand-gold))"
            strokeWidth="2.5"
            transform="rotate(-18 100 55)"
          />
          <circle
            cx="12"
            cy="40"
            r="5"
            fill="hsl(var(--brand-gold))"
            stroke="hsl(var(--brand-navy))"
            strokeWidth="2"
          />
        </svg>
      )}
      <svg
        viewBox="0 0 40 40"
        className={cn(
          "block",
          tone === "purple" ? "size-[5.25rem] -rotate-[10deg]" : "size-16 rotate-12",
        )}
      >
        <circle
          cx="21.5"
          cy="22"
          r="14"
          fill="hsl(var(--brand-navy))"
          stroke="hsl(var(--brand-navy))"
          strokeWidth="4"
        />
        <circle
          cx="19"
          cy="19"
          r="14"
          fill={
            tone === "purple"
              ? "hsl(var(--brand-purple))"
              : "hsl(var(--brand-gold))"
          }
          stroke="hsl(var(--brand-navy))"
          strokeWidth="4"
        />
        <ellipse cx="14.5" cy="18" rx="2.3" ry="3.4" fill={face} />
        <ellipse cx="23.5" cy="18" rx="2.3" ry="3.4" fill={face} />
        <path
          d="M15.5 24.5 Q19 27.5 22.5 24.5"
          fill="none"
          stroke={face}
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/**
 * The three steps, as sticker cards.
 *
 * It replaces the small illustration that used to sit in the hero's corner.
 * The drawing said "one screen, many phones" in a picture a visitor had to
 * decode; these say it in three sentences they can read at a glance, which is
 * what the approved design asks for.
 */
const HOW_TO_PLAY = [
  {
    tone: "gold" as const,
    title: "افتح أكوان على الشاشة",
    body: "على التلفزيون أو اللابتوب، واختر 3 عوالم.",
  },
  {
    tone: "purple" as const,
    title: "الكل يدخل من جواله",
    body: "امسحوا الكود وانقسموا فريقين.",
  },
  {
    tone: "gold" as const,
    title: "العبوا وشوفوا مين يفوز",
    body: "كل عالم فيه تحدي غير، والمعرفة لحالها ما تكفي.",
  },
];

function HowToPlaySection() {
  return (
    <section className="relative z-10 flex flex-col gap-8 px-4 py-6 sm:px-8">
      <div className="flex justify-center">
        <SectionTag tone="gold" tilt={1.5}>
          كيف تلعب
        </SectionTag>
      </div>

      <ol className="flex list-none flex-wrap gap-7 p-0">
        {HOW_TO_PLAY.map((step, index) => (
          <li
            key={step.title}
            className={cn(
              "flex flex-1 basis-[17.5rem] flex-col gap-2.5 rounded-[20px] bg-[#FEFDFB] p-6",
              STICKER.raised,
            )}
          >
            <span
              className={cn(
                "inline-grid size-13 place-items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] text-2xl font-extrabold",
                step.tone === "gold"
                  ? "bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))]"
                  : "bg-[hsl(var(--brand-purple))] text-[#FEFDFB]",
              )}
            >
              {index + 1}
            </span>
            <span className="font-display text-[22px] font-extrabold text-[hsl(var(--brand-navy))]">
              {step.title}
            </span>
            <span className="text-base leading-[1.8] text-[#3D3A5C]">
              {step.body}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function WorldSelectCard({
  world,
  selected,
  order,
  selectedScopeIds,
  disabled,
  remaining,
  onSelect,
  onRemove,
}: {
  world: PlayableWorld;
  selected: boolean;
  order?: number;
  selectedScopeIds: string[];
  disabled: boolean;
  /** Questions this World still owes the player, when we know it. */
  remaining?: number;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const signature = worldSignatureLabel(world);
  return (
    <div className="relative mx-auto flex w-full max-w-[14rem] flex-col items-center gap-2.5">
      <button
        type="button"
        data-world-id={world.id}
        aria-label={world.name}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onSelect}
        style={{ viewTransitionName: `akwaan-world-${world.id}` }}
        className={cn(
          "group flex flex-col items-center gap-2.5 rounded-3xl outline-none",
          "transition-transform duration-200 motion-reduce:transform-none motion-reduce:transition-none",
          "focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-navy))] focus-visible:ring-offset-4 focus-visible:ring-offset-white",
          "disabled:cursor-not-allowed disabled:opacity-55 disabled:saturate-[.45]",
          selected ? "-translate-y-1" : "hover:-translate-y-1",
        )}
      >
        <span className="relative block">
          <WorldDisc world={world} />

          {/* The count rides the disc at a tilt, the way a price sticker sits on
              a jar. Hidden rather than zeroed when unknown: a card that says
              "0 سؤال" to a signed-out visitor is a lie about an empty World. */}
          {remaining !== undefined && (
            <span
              style={{ transform: "rotate(12deg)" }}
              className={cn(
                "absolute -right-4 top-10 z-10 inline-flex min-h-9 items-baseline gap-1.5",
                "whitespace-nowrap rounded-xl bg-white px-3.5 pt-1 text-[13px] font-bold",
                "text-[hsl(var(--brand-navy))]",
                STICKER.small,
              )}
            >
              <span className="text-[18px] font-extrabold tabular-nums">
                {remaining}
              </span>
              سؤال
            </span>
          )}

          {/* Selection order, on the opposite corner from the count. */}
          {selected && order && (
            <span className="absolute -top-1 left-2 z-10 grid size-9 place-items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] font-display text-base font-extrabold text-[hsl(var(--brand-navy))]">
              {order}
            </span>
          )}
        </span>

        <WorldShadow />
      </button>

      {/* A fixed height, so the challenge pill sits on one baseline across the
          row. A two-line name used to push its own pill down and the row read
          as though it had been dropped. */}
      <div className="flex min-h-[4.5rem] flex-col items-center gap-1.5 text-center">
        <span className="font-display text-[22px] font-extrabold text-[hsl(var(--brand-navy))]">
          {world.name}
        </span>
        {signature && <ChallengePill>{signature}</ChallengePill>}
        {selected && (
          <WorldCardScopes
            worldId={world.id}
            selectedScopeIds={selectedScopeIds}
          />
        )}
      </div>

      {selected && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`إزالة ${world.name}`}
          className="absolute -top-1 right-2 z-10 grid size-9 place-items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white text-[hsl(var(--brand-navy))] transition-colors duration-200 hover:bg-[hsl(var(--brand-navy)/.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-navy))] focus-visible:ring-offset-2"
        >
          <Trash2 className="size-4" />
        </button>
      )}
    </div>
  );
}

/** The chosen Scopes of a selected World, by name, for the World card. */
function WorldCardScopes({
  worldId,
  selectedScopeIds,
}: {
  worldId: string;
  selectedScopeIds: string[];
}) {
  const scopes = usePlayableScopes(worldId);
  const names = (scopes.data ?? [])
    .filter((scope) => selectedScopeIds.includes(scope.id))
    .map((scope) => scope.name);
  return (
    <span className="line-clamp-2 px-1 text-xs font-bold leading-5 text-muted-foreground">
      {names.length ? names.join("، ") : `${selectedScopeIds.length} نطاقات`}
    </span>
  );
}

function ComingSoonCard({
  world,
}: {
  world: PlayableWorld;
  index: number;
}) {
  // Artwork is the admin's to supply, here as everywhere. With none, the
  // dashed disc stands on its own.
  const art = getMediaUrl(world.icon?.url) || getMediaUrl(world.banner?.url);
  return (
    <div
      aria-disabled
      data-testid={`upcoming-world-${world.slug}`}
      /* Dashed where a live World is solid: the outline itself says "not yet",
         before the badge is read. No vote button — voting has no backend, and
         a button that does nothing is worse than no button. */
      className="flex w-full items-center gap-4 rounded-[20px] border-2 border-dashed border-[#B9B2D9] bg-white px-5 py-[18px]"
    >
      <span className="relative grid size-[5.25rem] shrink-0 place-items-center overflow-hidden rounded-full border-2 border-dashed border-[#B9B2D9] bg-[#EFECF8]">
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt="" className="size-full object-cover" />
        ) : null}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-2">
        <span className="font-display text-xl font-extrabold text-[hsl(var(--brand-navy))]">
          {world.name}
        </span>
        <span className="inline-flex min-h-6 items-center rounded-full bg-[#EFECF8] px-2.5 text-xs font-bold text-[#4B4380]">
          قريبًا
        </span>
      </span>
    </div>
  );
}

/**
 * The confirmed World order and the way into setup, always visible beside the
 * World grid rather than repeated below it.
 *
 * It reads the reducer's occurrences directly: entering Focus Mode cannot create
 * a row, while confirming Scopes fills the matching slot. Continuing remains
 * blocked until all three occurrences are confirmed.
 */
function WorldSelectionSidebar({
  draft,
  worlds,
  selectedCount,
  onEdit,
  onStart,
  submitting,
}: {
  draft: MatchSetupDraft;
  worlds: PlayableWorld[];
  selectedCount: number;
  onEdit: (world: PlayableWorld, occurrenceIndex?: number) => void;
  /** Creates the Match and opens its room. */
  onStart: () => void;
  submitting: boolean;
}) {
  const ready = selectedCount === OCCURRENCE_COUNT;
  const left = OCCURRENCE_COUNT - selectedCount;

  return (
    <aside
      /* Under the row rather than beside it, which is where the approved
         design puts it — and where it belongs: the slots fill left to right in
         play order, and a vertical list could not show an order a player is
         meant to read as a sequence.

         Sticky, so the bar follows while the row is being browsed. A player
         choosing their third World should not have to scroll back up to find
         out that they have finished. */
      className={cn(
        "sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-x-6 gap-y-4",
        "rounded-[22px] bg-[#F6F3FC] px-5 py-4",
        STICKER.base,
      )}
      data-testid="world-selection-sidebar"
      dir="rtl"
      aria-label="العوالم المختارة"
    >
      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-3.5">
        <span className="inline-flex items-baseline gap-2 font-display text-xl font-extrabold text-[hsl(var(--brand-navy))]">
          عوالمك{" "}
          {/* Written tight, as «0/3». The mockup spaces the slash out, but a
              test has long pinned this counter as one string, and the spacing
              is not something the identity rests on — the guard is worth more
              than two spaces. */}
          <span
            dir="ltr"
            className="font-body text-base font-bold tabular-nums text-[#4A5468]"
          >
            {selectedCount}/{OCCURRENCE_COUNT}
          </span>
        </span>

        <ol className="m-0 flex list-none flex-wrap items-center gap-3 p-0">
          {draft.occurrences.map((occurrence, index) => {
            const world = worlds.find(
              (entry) => entry.id === occurrence.worldId,
            );
            return (
              <li key={occurrence.occurrenceIndex}>
                {world ? (
                  <span className="inline-flex min-h-14 items-center gap-2.5 rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-white py-0 pe-4 ps-2.5">
                    <span className="grid size-[1.625rem] shrink-0 place-items-center rounded-full bg-[hsl(var(--brand-navy))] text-[13px] font-extrabold text-white">
                      {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => onEdit(world, occurrence.occurrenceIndex)}
                      aria-label={`تعديل ${world.name}`}
                      className="whitespace-nowrap text-base font-bold text-[hsl(var(--brand-navy))] focus-visible:outline-none focus-visible:underline"
                    >
                      {world.name}
                    </button>
                  </span>
                ) : (
                  /* The empty slot is dashed and carries its number, so three
                     slots read as three places rather than as one control
                     that has not been used yet. */
                  <span className="inline-flex min-h-14 items-center gap-2.5 rounded-2xl border-[3px] border-dashed border-[#B9B2D9] px-4 text-[#4B4380]">
                    <span className="grid size-[1.625rem] shrink-0 place-items-center rounded-full bg-[#B9B2D9] text-[13px] font-extrabold text-[hsl(var(--brand-navy))]">
                      {index + 1}
                    </span>
                    <span className="whitespace-nowrap text-[15px] font-semibold">
                      {index === selectedCount ? "اختر العالم الجاي" : "فاضي"}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <div className="flex flex-col items-stretch gap-2">
        <GoldPill
          data-testid="worlds-home-start"
          disabled={!ready || submitting}
          onClick={onStart}
          className="min-h-[3.375rem] px-7 text-[17px] sm:min-h-[3.375rem] sm:text-[17px]"
        >
          {/* The disabled label counts down rather than scolding. "باقي عالم
              واحد" tells the player what to do next; "اختر 3 عوالم" repeats
              a rule they are already obeying. */}
          {submitting
            ? "نجهّز الغرفة…"
            : ready
              ? "كمّل لغرفة الانتظار"
              : left === 1
                ? "باقي عالم واحد"
                : left === 2
                  ? "باقي عالمين"
                  : `باقي ${left} عوالم`}
        </GoldPill>
        {draft.issue && (
          <p
            role="alert"
            data-testid="worlds-home-start-error"
            className="max-w-[18rem] text-[0.7rem] font-bold leading-5 text-[hsl(var(--destructive))]"
          >
            {draft.issue.message}
          </p>
        )}
      </div>
    </aside>
  );
}

function WorldScopeFocusMode({
  state,
  selectedScopeIds,
  onSelectedScopeIdsChange,
  onBack,
  onConfirm,
}: {
  state: { world: PlayableWorld; occurrenceIndex: number };
  selectedScopeIds: string[];
  onSelectedScopeIdsChange: (ids: string[]) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const query = usePlayableScopes(state.world.id);
  const scopes = useMemo(
    () =>
      (query.data ?? [])
        .filter(isSelectableScope)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [query.data],
  );
  const toggle = (scope: PlayableScope) =>
    onSelectedScopeIdsChange(
      selectedScopeIds.includes(scope.id)
        ? selectedScopeIds.filter((id) => id !== scope.id)
        : selectedScopeIds.length < SCOPES_PER_OCCURRENCE
          ? [...selectedScopeIds, scope.id]
          : selectedScopeIds,
    );
  const complete = selectedScopeIds.length === SCOPES_PER_OCCURRENCE;
  const signature = worldSignatureLabel(state.world);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      aria-labelledby="scope-focus-title"
      data-testid="scope-focus-mode"
      className="animate-in fade-in slide-in-from-bottom-2 py-5 duration-300 motion-reduce:animate-none lg:py-8"
    >
      <div className="flex flex-col items-stretch gap-8 lg:flex-row lg:items-start lg:gap-12">
        <div className="min-w-0 flex-[3]">
          <header className="mb-7 flex flex-col items-start gap-4">
            <button
              type="button"
              onClick={onBack}
              className={cn(
                "inline-flex min-h-11 items-center gap-2 rounded-[14px] bg-white px-4 text-[15px] font-bold text-[hsl(var(--brand-navy))] transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-purple))]",
                STICKER.small,
              )}
            >
              <ArrowLeft className="size-[18px] rotate-180" aria-hidden />
              رجوع للعوالم
            </button>
            <h1
              ref={headingRef}
              id="scope-focus-title"
              tabIndex={-1}
              className="font-display text-[30px] font-black leading-[1.35] text-[hsl(var(--brand-navy))] outline-none sm:text-[44px]"
            >
              اختر نطاقات{" "}
              <span className="text-[hsl(var(--brand-purple))]">
                {state.world.name}
              </span>
            </h1>
            <p className="text-base leading-[1.8] text-[#4A5468] sm:text-[19px]">
              حدد النطاقات اللي تبغون تدخل في المباراة.
            </p>
          </header>

          {query.isLoading ? (
            <ScopeCardSkeletons count={SCOPES_PER_OCCURRENCE} />
          ) : query.isError ? (
            <JourneyError
              title="تعذر تحميل النطاقات"
              description="تأكد من اتصالك وجرّب مرة ثانية."
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          ) : scopes.length ? (
            <ul className="grid list-none gap-x-[26px] gap-y-[30px] p-0 sm:grid-cols-2">
              {scopes.map((scope, index) => {
                const order = selectedScopeIds.indexOf(scope.id) + 1;
                const selected = order > 0;
                return (
                  <li
                    key={scope.id}
                    className="akwaan-rise"
                    style={{ animationDelay: `${Math.min(index, 3) * 40}ms` }}
                  >
                    <button
                      type="button"
                      aria-pressed={selected}
                      aria-label={scope.name}
                      disabled={complete && !selected}
                      onClick={() => toggle(scope)}
                      data-testid="scope-choice-card"
                      className={cn(
                        "group relative flex w-full flex-col rounded-[22px] bg-white text-start text-[hsl(var(--brand-navy))] transition-transform duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-purple))] disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none",
                        STICKER.base,
                        // Selection is the gold outline plus the order sticker;
                        // the card itself never changes colour.
                        selected
                          ? "outline outline-4 outline-[hsl(var(--brand-gold))]"
                          : "hover:-translate-y-0.5",
                      )}
                    >
                      <ScopeCardMedia
                        scope={scope}
                        className="m-0 h-[150px] w-full rounded-t-[18px] border-b-[3px] border-[hsl(var(--brand-navy))] bg-[#F1DCEC] sm:h-[190px]"
                      />
                      <span className="flex items-center justify-between gap-3 px-[18px] py-3.5">
                        <span
                          dir="auto"
                          data-testid="scope-name-overlay"
                          className="font-display text-lg font-extrabold sm:text-[21px]"
                        >
                          {scope.name}
                        </span>
                        {scope.readyContentItemCount > 0 && (
                          <span className="whitespace-nowrap text-sm font-semibold text-[#4A5468]">
                            <span className="font-extrabold text-[hsl(var(--brand-navy))]">
                              {scope.readyContentItemCount}
                            </span>{" "}
                            سؤال
                          </span>
                        )}
                      </span>
                      {selected && (
                        <span
                          aria-hidden
                          className={cn(
                            "akwaan-soft-pop absolute -left-3.5 -top-3.5 grid size-[46px] -rotate-[8deg] place-items-center rounded-full bg-[hsl(var(--brand-gold))] text-xl font-extrabold",
                            STICKER.small,
                          )}
                        >
                          {order}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-[22px] border-2 border-dashed border-[#B9B2D9] bg-white p-10 text-center text-sm leading-6 text-[#4A5468]">
              ما فيه نطاقات جاهزة في هالعالم للحين.
            </p>
          )}
        </div>

        {/* On a phone the panel loses the planet and rides the bottom edge, so
            the count and the confirm button stay in reach while the list
            scrolls. */}
        <aside
          className={cn(
            "sticky bottom-3 z-10 flex flex-col items-center gap-3 rounded-[26px] bg-[#F6F3FC] px-5 py-4 text-center lg:top-28 lg:bottom-auto lg:w-[340px] lg:shrink-0 lg:gap-3.5 lg:px-6 lg:pb-7 lg:pt-6",
            STICKER.base,
          )}
        >
          <div
            className="relative hidden w-[220px] lg:block"
            style={{ viewTransitionName: `akwaan-world-${state.world.id}` }}
          >
            <svg
              aria-hidden
              viewBox="0 0 280 150"
              className="absolute -inset-x-10 top-[28%] w-[calc(100%+5rem)]"
            >
              <ellipse
                cx="140"
                cy="75"
                rx="134"
                ry="46"
                fill="none"
                stroke="hsl(var(--brand-gold))"
                strokeWidth="2.5"
                transform="rotate(-14 140 75)"
              />
              <circle
                cx="18"
                cy="100"
                r="7"
                fill="hsl(var(--brand-gold))"
                stroke="hsl(var(--brand-navy))"
                strokeWidth="2"
              />
            </svg>
            <WorldDisc world={state.world} className="relative w-full" />
          </div>
          <h2 className="font-display text-xl font-extrabold text-[hsl(var(--brand-navy))] lg:text-[28px]">
            {state.world.name}
          </h2>
          {signature && <ChallengePill>{signature}</ChallengePill>}
          <div className="flex flex-col items-center gap-2.5 lg:mt-2">
            <span
              data-testid="scope-count"
              className="text-[17px] font-bold text-[hsl(var(--brand-navy))]"
            >
              <span className="text-[22px] font-extrabold">
                {selectedScopeIds.length}
              </span>{" "}
              من {SCOPES_PER_OCCURRENCE} مختارة
            </span>
            <span aria-hidden className="flex gap-1.5">
              {Array.from({ length: SCOPES_PER_OCCURRENCE }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-3 w-[34px] rounded-full border-2 border-[hsl(var(--brand-navy))]",
                    i < selectedScopeIds.length
                      ? "bg-[hsl(var(--brand-gold))]"
                      : "bg-[#E3DFF0]",
                  )}
                />
              ))}
            </span>
          </div>
          <GoldPill
            disabled={!complete}
            onClick={onConfirm}
            className="w-full px-4 text-[19px] shadow-[5px_6px_0_hsl(var(--brand-navy))] sm:min-h-[62px] sm:text-xl lg:mt-2"
          >
            تأكيد النطاقات
          </GoldPill>
        </aside>
      </div>
    </section>
  );
}

function ScopeCardSkeletons({ count }: { count: number }) {
  return (
    <div className="grid gap-x-[26px] gap-y-[30px] sm:grid-cols-2" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="h-[250px] animate-pulse rounded-[22px] border-2 border-dashed border-[#B9B2D9] bg-[#F6F3FC]"
        />
      ))}
    </div>
  );
}

export function CardSkeletons({
  count,
}: {
  count: number;
  className?: string;
  columns?: "featured" | "grid";
}) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="aspect-square animate-pulse rounded-full border bg-card"
        />
      ))}
    </div>
  );
}

export function EmptyWorlds({
  isAuthenticated: _isAuthenticated,
}: {
  isAuthenticated?: boolean;
}) {
  return (
    <div className="rounded-3xl border bg-card p-10 text-center">
      <p className="text-lg font-black">لا توجد عوالم متاحة بعد</p>
      <p className="mt-2 text-sm text-muted-foreground">
        سيظهر هنا كل عالم فور تفعيله.
      </p>
    </div>
  );
}
