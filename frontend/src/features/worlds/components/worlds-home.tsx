"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { ArrowLeft, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MATCH_SETUP_ROUTE } from "@/features/match-setup/routes";
import {
  OCCURRENCE_COUNT,
  SCOPES_PER_OCCURRENCE,
  createDraft,
  matchSetupReducer,
} from "@/features/match-setup/state/match-setup-draft";
import {
  readStoredDraft,
  writeStoredDraft,
} from "@/features/match-setup/state/match-setup-storage";
import { cn } from "@/lib/utils";
import { JourneyShell, SectionHeading } from "./journey-shell";
import { JourneyError } from "./journey-error";
import { WorldCover } from "./world-cover";
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
  const [draft, dispatch] = useReducer(
    matchSetupReducer,
    undefined,
    createDraft,
  );
  const [restored, setRestored] = useState(false);
  const [focusedWorld, setFocusedWorld] = useState<{
    world: PlayableWorld;
    occurrenceIndex: number;
  }>();
  const [pendingScopeIds, setPendingScopeIds] = useState<string[]>([]);
  const returnFocusWorldId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const stored = readStoredDraft();
    if (stored) dispatch({ type: "restore", draft: stored });
    setRestored(true);
  }, []);
  useEffect(() => {
    if (restored) writeStoredDraft(draft);
  }, [draft, restored]);
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
          <div
            className="grid items-start gap-7 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-10"
            dir="ltr"
          >
            <WorldSelectionSidebar
              draft={draft}
              worlds={worlds}
              selectedCount={selectedCount}
              onEdit={openWorld}
            />

            <div className="min-w-0" dir="rtl">
              <SectionHeading id="worlds-title" title="اختر عوالمك" />
              <p className="-mt-4 mb-8 text-center text-sm leading-7 text-muted-foreground sm:text-base">
                اختر 3 عوالم. والترتيب اللي تختاره هو ترتيب اللعب.
              </p>

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
                      <h3 className="mb-8 mt-12 text-center text-xl font-black text-[hsl(var(--brand-navy))] sm:text-2xl">
                        عوالم جديدة في الطريق
                      </h3>
                      <ul
                        className="flex list-none flex-wrap justify-center gap-x-5 gap-y-8 [&>li]:basis-[clamp(9.5rem,17.5%,13.5rem)]"
                        data-testid="upcoming-worlds"
                      >
                        {upcoming.map((world) => (
                          <li key={world.id} className="w-full">
                            <ComingSoonCard world={world} />
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
          </div>
        </section>

      </div>
    </JourneyShell>
  );
}

function AkwaanHero() {
  return (
    <section className="relative z-10 px-4 pb-8 pt-8 text-center lg:pb-10 lg:pt-10">
      <div className="mx-auto flex max-w-3xl flex-col items-center">
        <div className="akwaan-hero-logo-in">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/logo/akwaan-primary-logo-transparent.png"
            alt="أكوان"
            width={870}
            height={310}
            className="mx-auto h-auto w-[min(82vw,264px)] select-none sm:w-[min(76vw,410px)]"
            draggable={false}
          />
        </div>

        <h1 className="akwaan-hero-copy-in mt-3 text-3xl font-black leading-[1.25] text-[hsl(var(--brand-navy))] [animation-delay:50ms] sm:text-4xl lg:text-[2.9rem]">
          3 عوالم مختلفة، منافسة واحدة
        </h1>
        {/* One line between the headline and the button, not three. What the
            second paragraph explained — teams, the kinds of challenge — the
            page itself shows a moment later, and a visitor reads none of it
            before they have decided to start. */}
        <p className="akwaan-hero-copy-in mt-4 max-w-xl text-base font-bold leading-7 text-[hsl(var(--brand-navy))] [animation-delay:100ms] sm:text-lg sm:leading-8">
          مو مجرد أسئلة. كل عالم له{" "}
          <span className="text-[hsl(var(--brand-gold))]">تحديه الخاص</span>{" "}
          وطريقة لعب تميّزه.
        </p>

        <Button
          asChild
          size="lg"
          className="akwaan-primary-action akwaan-hero-cta-in mt-6 rounded-full border border-[hsl(var(--brand-gold)/.32)] bg-[hsl(var(--brand-navy))] px-10 py-6 text-base font-black text-white shadow-[0_16px_34px_-18px_hsl(var(--brand-navy)/.8)] [animation-delay:200ms] hover:border-[hsl(var(--brand-gold)/.72)] hover:bg-[hsl(var(--brand-navy)/.96)] hover:shadow-[0_18px_38px_-16px_hsl(var(--brand-gold)/.42)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold))] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
        >
          <a href="#worlds">
            ابدأ مباراة
          </a>
        </Button>
      </div>
      {/* Tucked into the hero's lower left rather than set beside the wordmark.
          Level with it the two read as columns of equal weight and the hero
          splits down the middle; down here the wordmark, the line and the
          button keep the page's centre line and the drawing fills the empty
          corner they leave. Out of the flow entirely, so it moves nothing.
          Narrow screens have no such corner, so it follows underneath. */}
      <HowItPlays className="mx-auto mt-6 w-[min(78vw,290px)] lg:absolute lg:-bottom-2 lg:left-[6%] lg:mt-0 lg:w-[300px] xl:left-[10%]" />
    </section>
  );
}

/**
 * What the room looks like, drawn rather than written.
 *
 * The page never said the game runs on one screen with everyone on their own
 * phone, and «كيف تلعب» is a click a first visitor has no reason to take. No
 * caption: if the drawing needs a sentence under it, the drawing has failed.
 *
 * Square-edged on purpose. The Worlds own the circles on this page, and a
 * second ring of them would blur what can be clicked.
 */
function HowItPlays({ className = "" }: { className?: string }) {
  const Phone = ({
    x,
    y,
    tone,
    tilt,
  }: {
    x: number;
    y: number;
    tone: string;
    tilt: number;
  }) => (
    // Tilted, because an upright rectangle beside a television reads as a
    // second screen rather than as a phone somebody is holding.
    <g transform={`translate(${x} ${y}) rotate(${tilt} 15 26)`}>
      <rect
        x="0"
        y="0"
        width="30"
        height="52"
        rx="7"
        fill="white"
        stroke="hsl(var(--brand-navy))"
        strokeWidth="3"
      />
      <rect x="6" y="9" width="18" height="9" rx="3" fill={tone} />
      <rect x="6" y="23" width="18" height="4.5" rx="2.25" fill="hsl(var(--brand-navy)/.2)" />
      <rect x="6" y="32" width="12" height="4.5" rx="2.25" fill="hsl(var(--brand-navy)/.2)" />
    </g>
  );
  return (
    <svg
      viewBox="0 0 380 160"
      className={className}
      role="img"
      aria-label="شاشة واحدة يشاهدها الجميع، وكل لاعب يلعب من جواله"
    >
      {/* The shared screen, mid-challenge: a question and two team scores. */}
      <rect x="112" y="6" width="156" height="94" rx="11" fill="hsl(var(--brand-navy))" />
      <rect x="136" y="24" width="108" height="9" rx="4.5" fill="hsl(40 57% 63% / .5)" />
      <rect x="152" y="40" width="76" height="7" rx="3.5" fill="hsl(43 38% 95% / .28)" />
      <rect x="134" y="64" width="50" height="18" rx="9" fill="hsl(226 72% 50%)" />
      <rect x="196" y="64" width="50" height="18" rx="9" fill="hsl(358 72% 58%)" />
      {/* The stand, so it reads as a television in a room. */}
      <rect x="180" y="100" width="20" height="12" fill="hsl(var(--brand-navy)/.55)" />
      <rect x="154" y="112" width="72" height="7" rx="3.5" fill="hsl(var(--brand-navy)/.55)" />
      {/* Two phones a side, each in its team's colour. */}
      <Phone x={48} y={54} tilt={-14} tone="hsl(226 72% 50%)" />
      <Phone x={80} y={88} tilt={-7} tone="hsl(226 72% 50%)" />
      <Phone x={270} y={88} tilt={7} tone="hsl(358 72% 58%)" />
      <Phone x={302} y={54} tilt={14} tone="hsl(358 72% 58%)" />
    </svg>
  );
}

function WorldSelectCard({
  world,
  selected,
  order,
  selectedScopeIds,
  disabled,
  onSelect,
  onRemove,
}: {
  world: PlayableWorld;
  selected: boolean;
  order?: number;
  selectedScopeIds: string[];
  disabled: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const signature = worldSignatureLabel(world);
  return (
    <div className="relative mx-auto flex w-full max-w-[20rem] flex-col items-center gap-4">
      {/* The World as a floating circular portal — artwork first, no card frame. */}
      <button
        type="button"
        data-world-id={world.id}
        aria-label={world.name}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onSelect}
        style={{ viewTransitionName: `akwaan-world-${world.id}` }}
        className={cn(
          "akwaan-portal group relative aspect-square w-full max-w-[17rem] rounded-full outline-none transition-[transform,filter] duration-200 focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold))] focus-visible:ring-offset-4 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:saturate-[.45] disabled:opacity-55 motion-reduce:transform-none motion-reduce:transition-none",
          selected
            ? "-translate-y-1 scale-[1.02] hover:-translate-y-1.5 hover:scale-[1.025] max-sm:scale-100 max-sm:hover:-translate-y-0.5 max-sm:hover:scale-100"
            : "hover:-translate-y-1.5 hover:scale-[1.02] max-sm:hover:-translate-y-0.5 max-sm:hover:scale-100",
        )}
      >
        {/* Outer cream ring + accent ring + soft glow live on ::before/::after. */}
        <span
          className={cn(
            "absolute inset-[6px] overflow-hidden rounded-full border-2 shadow-[0_20px_44px_-18px_rgba(24,16,54,.4)] transition-[border-color,box-shadow] duration-200 motion-reduce:transition-none",
            selected
              ? "border-[hsl(var(--brand-gold))] shadow-[0_24px_52px_-18px_hsl(var(--brand-navy)/.48)] ring-2 ring-[hsl(var(--brand-navy)/.18)] group-hover:border-[hsl(var(--brand-gold)/.9)] group-hover:shadow-[0_26px_56px_-16px_hsl(var(--brand-gold)/.34)]"
              : "border-white/90 group-hover:border-[hsl(var(--brand-gold)/.52)] group-hover:shadow-[0_24px_50px_-18px_hsl(var(--brand-navy)/.45)]",
          )}
        >
          <WorldCover world={world} sizes="(min-width:1024px) 260px, 44vw" />
          {selected && (
            <span className="akwaan-soft-pop absolute inset-0 rounded-full ring-[3px] ring-inset ring-[hsl(var(--brand-gold)/.55)]" />
          )}
        </span>
        {/* Selection order badge. */}
        {selected && order && (
          <span className="akwaan-soft-pop absolute -top-1 right-3 z-10 grid size-9 place-items-center rounded-full border-2 border-[hsl(var(--brand-gold))] bg-[hsl(var(--brand-navy))] text-base font-black text-white shadow-[0_7px_18px_rgba(24,16,54,.32)] sm:size-10">
            <span className="akwaan-numeral">{order}</span>
          </span>
        )}
        {/* The satellite dot is gone. Selection never needed it — a gold border, an
            inner ring and the order badge all say it — and five grey specks
            scattered over the row read as dust rather than as life. */}
        </button>

      {/* A fixed height, so the gold mechanic label sits on the same baseline for
          every World. A two-line name pushed its own label down and the row read
          as though it had been dropped. */}
      <div className="flex min-h-[4.8rem] flex-col items-center justify-between gap-1 text-center">
        <span className="text-xl font-black text-[hsl(var(--brand-navy))]">
          {world.name}
        </span>
        {signature && (
          <span className="text-xs font-bold text-[hsl(var(--brand-gold))]">
            {signature}
          </span>
        )}
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
          className="absolute -top-1 left-3 z-10 grid size-8 place-items-center rounded-full border border-[hsl(var(--brand-navy)/.08)] bg-white text-muted-foreground shadow-[0_6px_16px_rgba(24,16,54,.2)] transition-colors duration-200 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold))] focus-visible:ring-offset-2"
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

/**
 * A World that is not open yet: same portal language, plainly muted, and not
 * selectable — never a playable choice.
 *
 * It shows the World's own artwork when the catalog has any, and the neutral
 * dashed placeholder when it does not, which is the ordinary state of a World
 * announced before its art exists.
 */
/**
 * A World with no artwork yet.
 *
 * Drawn rather than fetched, so a World is never a dotted outline waiting for a
 * designer: the row reads as a row of planets whether or not every one of them
 * has been painted. Brand colours only, and no text — the name sits beneath it
 * like every other card's.
 */
function FallbackPlanet({ seed }: { seed: string }) {
  // Each unpainted World gets its own hue, derived from its slug so it is the
  // same on every visit. Five identical planets in a row read as one repeated
  // placeholder; five different ones read as five Worlds.
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  const hue = 212 + (hash % 5) * 26;
  const id = `akwaan-fallback-${seed.replace(/[^a-z0-9]/gi, "") || "world"}`;
  return (
    <svg viewBox="0 0 160 160" className="size-full" aria-hidden role="presentation">
      <defs>
        <radialGradient id={id} cx="38%" cy="32%" r="78%">
          <stop offset="0%" stopColor={`hsl(${hue} 90% 86%)`} />
          <stop offset="52%" stopColor={`hsl(${hue} 58% 62%)`} />
          <stop offset="100%" stopColor="hsl(239 40% 24%)" />
        </radialGradient>
      </defs>
      <circle cx="80" cy="80" r="52" fill={`url(#${id})`} />
      {/* Two continents and a crater, so it reads as a world and not as a ball. */}
      <path
        d="M52 66c10-9 22-6 30 1s18 6 24-2c3 13-6 25-19 28-14 3-29-4-35-13-3-5-3-10 0-14Z"
        fill="hsl(43 38% 95% / .22)"
      />
      <path
        d="M96 104c7-2 14 1 18 7-7 7-17 10-26 8 1-6 4-12 8-15Z"
        fill="hsl(43 38% 95% / .16)"
      />
      <circle cx="62" cy="96" r="7" fill="hsl(239 40% 17% / .22)" />
      {/* The ring the brand's own logo carries. */}
      <ellipse
        cx="80"
        cy="80"
        rx="72"
        ry="24"
        fill="none"
        stroke="hsl(40 57% 63%)"
        strokeWidth="2.5"
        opacity=".75"
        transform="rotate(-21 80 80)"
      />
      <circle cx="18" cy="63" r="3" fill="hsl(40 57% 63%)" />
    </svg>
  );
}

function ComingSoonCard({ world }: { world: PlayableWorld }) {
  const art = world.banner ?? world.icon;
  return (
    <div
      aria-disabled
      data-testid={`upcoming-world-${world.slug}`}
      className="mx-auto flex w-full max-w-[13rem] flex-col items-center gap-3 text-center"
    >
      {/* No grayscale and no dimming: a World on the way is still worth looking
          at, and draining the art was what made this row look unfinished. The
          «قريبًا» badge is what says it cannot be picked yet. */}
      <span className="grid aspect-square w-full max-w-[9.5rem] place-items-center overflow-hidden rounded-full">
        {art ? (
          <WorldCover world={world} sizes="(min-width:640px) 152px, 40vw" />
        ) : (
          <FallbackPlanet seed={world.slug} />
        )}
      </span>
      <span className="text-base font-black text-muted-foreground">
        {world.name}
      </span>
      <span className="rounded-full bg-secondary/70 px-2.5 py-0.5 text-[0.7rem] font-black text-muted-foreground">
        قريبًا
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
}: {
  draft: ReturnType<typeof createDraft>;
  worlds: PlayableWorld[];
  selectedCount: number;
  onEdit: (world: PlayableWorld, occurrenceIndex?: number) => void;
}) {
  const ready = selectedCount === OCCURRENCE_COUNT;
  return (
    <aside
      /* A card rather than a translucent sheet: a background planet passed
         straight through it and the 0/3 counter sat on top of the planet, so
         the one panel that tracks your choices read as debris. */
      className="sticky top-[5.25rem] z-10 rounded-2xl border border-[hsl(var(--brand-navy)/.1)] bg-white px-3.5 py-4 shadow-[0_10px_30px_-22px_hsl(var(--brand-navy)/.45)] lg:top-28"
      data-testid="world-selection-sidebar"
      dir="rtl"
      aria-label="العوالم المختارة"
    >
      <div className="flex items-center justify-between gap-3 lg:block">
        <h3 className="text-sm font-black text-[hsl(var(--brand-navy))] lg:text-lg">
          عوالمك
        </h3>
        <span className="akwaan-numeral text-xs font-black text-[hsl(var(--brand-navy)/.58)] lg:mt-1 lg:block lg:text-sm">
          {selectedCount}/{OCCURRENCE_COUNT}
        </span>
      </div>

      <ol className="mt-3 flex min-w-0 list-none items-center gap-2 lg:mt-5 lg:flex-col lg:items-stretch lg:gap-3">
        {draft.occurrences.map((occurrence, index) => {
          const world = worlds.find((entry) => entry.id === occurrence.worldId);
          return (
            <li key={occurrence.occurrenceIndex} className="min-w-0 flex-1 lg:w-full">
              {world ? (
                <button
                  type="button"
                  onClick={() => onEdit(world, occurrence.occurrenceIndex)}
                  aria-label={`تعديل ${world.name}`}
                  className="group flex w-full min-w-0 items-center gap-2 rounded-xl py-1 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold))] lg:px-1 lg:py-1.5"
                >
                  <span className="relative size-8 shrink-0 overflow-hidden rounded-full border border-[hsl(var(--brand-gold)/.5)] bg-white lg:size-9">
                    <WorldCover world={world} sizes="36px" />
                  </span>
                  <span className="hidden min-w-0 flex-1 truncate text-xs font-bold text-[hsl(var(--brand-navy)/.76)] group-hover:text-[hsl(var(--brand-navy))] lg:block">
                    {world.name}
                  </span>
                  <span className="akwaan-numeral grid size-5 shrink-0 place-items-center rounded-full bg-[hsl(var(--brand-gold)/.14)] text-[0.65rem] font-black text-[hsl(var(--brand-navy))]">
                    {index + 1}
                  </span>
                </button>
              ) : (
                <div className="flex min-w-0 items-center gap-2 py-1 text-[hsl(var(--brand-navy)/.3)] lg:px-1 lg:py-1.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-[hsl(var(--brand-navy)/.14)] bg-white/70 text-xs lg:size-9">
                    —
                  </span>
                  <span className="hidden min-w-0 flex-1 text-xs font-medium lg:block">
                    اختر عالم
                  </span>
                  <span className="akwaan-numeral text-[0.65rem] font-bold">
                    {index + 1}
                  </span>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <Button
        asChild
        size="sm"
        className={cn(
          "akwaan-primary-action mt-3 h-10 w-full rounded-xl border border-[hsl(var(--brand-gold)/.28)] bg-[hsl(var(--brand-navy))] px-3 text-xs font-black text-white shadow-[0_10px_24px_-16px_hsl(var(--brand-navy))] hover:border-[hsl(var(--brand-gold)/.65)] lg:mt-6 lg:h-11",
          !ready && "pointer-events-none opacity-40",
        )}
      >
        <Link href={MATCH_SETUP_ROUTE} aria-disabled={!ready}>
          متابعة إعداد المباراة
        </Link>
      </Button>
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
      className="animate-in fade-in slide-in-from-bottom-2 py-5 duration-300 motion-reduce:animate-none lg:py-10"
    >
      <div
        className="grid items-start gap-8 lg:grid-cols-[minmax(260px,28%)_minmax(0,72%)] lg:gap-10"
        dir="ltr"
      >
        <aside
          className="akwaan-focus-context-in flex flex-col items-center text-center lg:sticky lg:top-28"
          dir="rtl"
        >
          <div
            className="akwaan-portal relative aspect-square w-[min(54vw,190px)] rounded-full sm:w-[210px] lg:w-full lg:max-w-[250px]"
            style={{
              viewTransitionName: `akwaan-world-${state.world.id}`,
            }}
          >
            <span className="absolute inset-[7px] overflow-hidden rounded-full border-2 border-[hsl(var(--brand-gold)/.55)] bg-white shadow-[0_26px_64px_-28px_hsl(var(--brand-navy)/.58)] ring-1 ring-[hsl(var(--brand-gold)/.2)]">
              <WorldCover
                world={state.world}
                sizes="(min-width: 1024px) 250px, 210px"
              />
            </span>
          </div>
          <h2 className="mt-5 text-2xl font-black text-[hsl(var(--brand-navy))] sm:text-3xl">
            {state.world.name}
          </h2>
          {signature && (
            <span className="mt-3 rounded-full bg-[hsl(var(--brand-gold)/.12)] px-4 py-1.5 text-sm font-bold text-[hsl(var(--brand-navy)/.78)]">
              {signature}
            </span>
          )}
          <span
            data-testid="scope-count"
            className={cn(
              "mt-4 rounded-full px-4 py-2 text-sm font-bold",
              complete
                ? "bg-[hsl(var(--brand-gold)/.11)] text-[hsl(var(--brand-navy))]"
                : "bg-[hsl(var(--brand-navy)/.045)] text-[hsl(var(--brand-navy)/.6)]",
            )}
          >
            <span className="akwaan-numeral">{selectedScopeIds.length}</span>{" "}
            من <span className="akwaan-numeral">{SCOPES_PER_OCCURRENCE}</span>{" "}
            مختارة
          </span>
          <FocusActions
            complete={complete}
            onConfirm={onConfirm}
            onBack={onBack}
            className="mt-6 hidden w-full max-w-[270px] lg:flex"
          />
        </aside>

        <div className="akwaan-focus-scopes-in min-w-0" dir="rtl">
          <header className="mb-7 text-center lg:text-right">
            <h1
              ref={headingRef}
              id="scope-focus-title"
              tabIndex={-1}
              className="text-2xl font-black leading-relaxed text-[hsl(var(--brand-navy))] outline-none sm:text-3xl"
            >
              اختر نطاقات {state.world.name}
            </h1>
            <p className="mt-1 text-sm leading-7 text-[hsl(var(--brand-navy)/.58)] sm:text-base">
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
            <ul className="grid list-none gap-4 sm:grid-cols-2">
              {scopes.map((scope, index) => {
                const selected = selectedScopeIds.includes(scope.id);
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
                        "group relative aspect-video w-full overflow-hidden rounded-[1.15rem] border-2 bg-[hsl(var(--brand-navy)/.04)] text-right shadow-[0_8px_24px_rgba(24,16,54,.05)] transition-[transform,box-shadow,border-color] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold))] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none",
                        selected
                          ? "border-[hsl(var(--brand-gold))] shadow-[0_12px_30px_-16px_hsl(var(--brand-gold)/.65)] ring-1 ring-[hsl(var(--brand-gold)/.24)]"
                          : "border-[hsl(var(--brand-navy)/.1)] hover:-translate-y-[3px] hover:border-[hsl(var(--brand-gold)/.4)] hover:shadow-[0_16px_34px_-18px_hsl(var(--brand-navy)/.38)]",
                      )}
                    >
                      <ScopeCardMedia
                        scope={scope}
                        className="absolute inset-0 m-0 h-full w-full sm:h-full"
                      >
                        <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[hsl(var(--brand-navy)/.84)] via-[hsl(var(--brand-navy)/.28)] to-transparent" />
                        {selected && (
                          <span className="akwaan-soft-pop absolute left-3 top-3 grid size-8 place-items-center rounded-full border border-white/80 bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))] shadow-[0_5px_15px_rgba(24,16,54,.2)]">
                            <Check className="size-4" strokeWidth={3} aria-hidden />
                          </span>
                        )}
                        <span
                          dir="auto"
                          data-testid="scope-name-overlay"
                          className="absolute inset-x-0 bottom-0 px-4 pb-4 text-right text-base font-black text-white drop-shadow-sm sm:px-5 sm:pb-5 sm:text-lg"
                        >
                          {scope.name}
                        </span>
                      </ScopeCardMedia>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-3xl border border-[hsl(var(--brand-navy)/.1)] bg-white/80 p-10 text-center text-sm leading-6 text-muted-foreground">
              لا توجد نطاقات جاهزة في هذا العالم بعد.
            </p>
          )}

          <FocusActions
            complete={complete}
            onConfirm={onConfirm}
            onBack={onBack}
            className="mt-7 rounded-2xl border border-[hsl(var(--brand-navy)/.08)] bg-white/95 p-3 shadow-[0_18px_45px_-24px_hsl(var(--brand-navy)/.42)] lg:hidden"
          />
        </div>
      </div>
    </section>
  );
}

function ScopeCardSkeletons({ count }: { count: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-hidden>
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="aspect-video animate-pulse rounded-[1.15rem] border border-[hsl(var(--brand-navy)/.08)] bg-[hsl(var(--brand-navy)/.05)]"
        />
      ))}
    </div>
  );
}

function FocusActions({
  complete,
  onConfirm,
  onBack,
  className,
}: {
  complete: boolean;
  onConfirm: () => void;
  onBack: () => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <Button
        type="button"
        size="lg"
        disabled={!complete}
        onClick={onConfirm}
        className="akwaan-primary-action h-12 w-full rounded-xl border border-[hsl(var(--brand-gold)/.32)] bg-[hsl(var(--brand-navy))] font-black text-white shadow-[0_14px_30px_-18px_hsl(var(--brand-navy)/.8)] hover:border-[hsl(var(--brand-gold)/.7)] hover:bg-[hsl(var(--brand-navy)/.93)] hover:shadow-[0_17px_34px_-16px_hsl(var(--brand-gold)/.38)] disabled:border-transparent disabled:bg-[hsl(var(--brand-navy)/.12)] disabled:text-[hsl(var(--brand-navy)/.36)] disabled:opacity-100"
      >
        تأكيد النطاقات
      </Button>
      <button
        type="button"
        onClick={onBack}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-[hsl(var(--brand-navy)/.68)] transition-colors hover:bg-[hsl(var(--brand-navy)/.05)] hover:text-[hsl(var(--brand-navy))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--brand-gold))]"
      >
        <ArrowLeft className="size-4 rotate-180" aria-hidden />
        رجوع للعوالم
      </button>
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
