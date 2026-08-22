"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Crown,
  Gamepad2,
  Puzzle,
  Rocket,
  Smartphone,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { JourneyShell } from "./journey-shell";
import { JourneyError } from "./journey-error";
import { WorldCover } from "./world-cover";
import { ScopeCardMedia } from "./scope-card-media";
import {
  usePlayableScopes,
  usePlayableWorlds,
} from "../hooks/use-player-catalog";
import { playableWorlds } from "../utils/featured-worlds";
import { isSelectableScope } from "../utils/scopes";
import { worldSignatureLabel } from "../utils/world-signature";
import type { PlayableScope, PlayableWorld } from "../types";

/**
 * The four mechanics that headline the game, orbiting the hero planet. Each is a
 * label the player recognises the game by — a title and the one-line promise of
 * what that mechanic feels like — positioned at a corner of the planet.
 */
const HERO_NODES = [
  {
    key: "combo",
    title: "الكومبو",
    subtitle: "جاوب وبراهن",
    Icon: Users,
    tone: "cyan",
    position: "hero-node-br",
  },
  {
    key: "top-5",
    title: "أفضل 5",
    subtitle: "توقع الترتيب",
    Icon: Crown,
    tone: "gold",
    position: "hero-node-tl",
  },
  {
    key: "distributed",
    title: "ركّبها",
    subtitle: "معلومات مجزأة",
    Icon: Puzzle,
    tone: "purple",
    position: "hero-node-tr",
  },
  {
    key: "marhala",
    title: "المرحلة",
    subtitle: "تحدي مراحل",
    Icon: Gamepad2,
    tone: "blue",
    position: "hero-node-bl",
  },
] as const;

type NodeTone = (typeof HERO_NODES)[number]["tone"];

const NODE_TONE: Record<NodeTone, string> = {
  cyan: "bg-[hsl(var(--brand-cyan))] text-[hsl(var(--brand-navy))]",
  gold: "bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))]",
  purple: "bg-[hsl(var(--brand-purple))] text-white",
  blue: "bg-[#3f6fd8] text-white",
};

/** Why Akwaan is different — the four promises shown under the World row. */
const FEATURES = [
  {
    key: "teams",
    title: "لعبة للفرق",
    description: "تعاون، تنافس، وعيش المتعة مع أصدقائك.",
    Icon: Users,
    tone: "cyan",
  },
  {
    key: "phone",
    title: "اللعب من جوالك",
    description: "تجربة سلسة من جوالك دون تحميل تطبيق.",
    Icon: Smartphone,
    tone: "gold",
  },
  {
    key: "variety",
    title: "تحديات متنوعة",
    description: "كل عالم بتحدياته الفريدة والممتعة.",
    Icon: Zap,
    tone: "purple",
  },
  {
    key: "leaderboard",
    title: "نافس على الصدارة",
    description: "اجمع النقاط وتصدر الترتيب العام.",
    Icon: Trophy,
    tone: "gold",
  },
] as const;

/** The categories not open yet — shown, greyed, so the roadmap reads as a promise. */
const COMING_SOON = ["الأفلام", "المسلسلات", "الأغاني", "المزيد قريباً"] as const;

export function WorldsHome() {
  const query = usePlayableWorlds();
  const worlds = query.isSuccess ? playableWorlds(query.data) : [];
  const [draft, dispatch] = useReducer(matchSetupReducer, undefined, createDraft);
  const [restored, setRestored] = useState(false);
  const [dialog, setDialog] =
    useState<{ world: PlayableWorld; occurrenceIndex: number }>();
  const [pendingScopeIds, setPendingScopeIds] = useState<string[]>([]);

  useEffect(() => {
    const stored = readStoredDraft();
    if (stored) dispatch({ type: "restore", draft: stored });
    setRestored(true);
  }, []);
  useEffect(() => {
    if (restored) writeStoredDraft(draft);
  }, [draft, restored]);

  const openWorld = (world: PlayableWorld, occurrenceIndex?: number) => {
    const existing =
      occurrenceIndex === undefined
        ? draft.occurrences.find((item) => item.worldId === world.id)
        : draft.occurrences[occurrenceIndex];
    const target = existing ?? draft.occurrences.find((item) => !item.worldId);
    if (!target) return;
    setPendingScopeIds(
      target.worldId === world.id ? target.selectedScopeIds : [],
    );
    setDialog({ world, occurrenceIndex: target.occurrenceIndex });
  };

  const confirmScopes = () => {
    if (!dialog || pendingScopeIds.length !== SCOPES_PER_OCCURRENCE) return;
    const current = draft.occurrences[dialog.occurrenceIndex];
    dispatch({
      type: "choose-world",
      occurrenceIndex: dialog.occurrenceIndex,
      worldId: dialog.world.id,
    });
    const previous =
      current.worldId === dialog.world.id ? current.selectedScopeIds : [];
    previous
      .filter((id) => !pendingScopeIds.includes(id))
      .forEach((scopeId) =>
        dispatch({
          type: "toggle-scope",
          occurrenceIndex: dialog.occurrenceIndex,
          scopeId,
        }),
      );
    pendingScopeIds
      .filter((id) => !previous.includes(id))
      .forEach((scopeId) =>
        dispatch({
          type: "toggle-scope",
          occurrenceIndex: dialog.occurrenceIndex,
          scopeId,
        }),
      );
    dispatch({ type: "confirm-scopes" });
    setDialog(undefined);
  };

  const selected = draft.occurrences.flatMap((occurrence) => {
    const world = worlds.find((entry) => entry.id === occurrence.worldId);
    return world ? [{ occurrence, world }] : [];
  });
  const selectedCount = selected.length;

  return (
    <JourneyShell className="max-w-[1440px]">
      <div className="space-y-14 pb-6">
        <AkwaanHero />

        <section id="worlds" aria-labelledby="worlds-title" className="scroll-mt-24">
          <SectionHeading id="worlds-title" title="اختر 3 عوالم للعب" />

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
              <ul className="grid list-none grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
                    <li key={world.id}>
                      <WorldSelectCard
                        world={world}
                        selected={Boolean(occurrence)}
                        order={order}
                        selectedCount={selectedCount}
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
                                  occurrenceIndex: occurrence.occurrenceIndex,
                                })
                            : undefined
                        }
                      />
                    </li>
                  );
                })}
                {COMING_SOON.map((label) => (
                  <li key={label}>
                    <ComingSoonCard label={label} />
                  </li>
                ))}
              </ul>

              <SelectionBar draft={draft} selectedCount={selectedCount} />
            </>
          ) : (
            <EmptyWorlds />
          )}
        </section>

        <FeaturesSection />
      </div>

      <WorldScopesDialog
        state={dialog}
        selectedScopeIds={pendingScopeIds}
        onSelectedScopeIdsChange={setPendingScopeIds}
        onClose={() => setDialog(undefined)}
        onConfirm={confirmScopes}
      />
    </JourneyShell>
  );
}

/** A centred section title framed by two gold diamond flourishes. */
function SectionHeading({ id, title }: { id?: string; title: string }) {
  return (
    <div className="mb-7 flex items-center justify-center gap-3">
      <Flourish />
      <h2
        id={id}
        className="text-2xl font-black text-foreground sm:text-3xl"
      >
        {title}
      </h2>
      <Flourish flip />
    </div>
  );
}

function Flourish({ flip = false }: { flip?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex items-center gap-1.5 text-[hsl(var(--brand-gold))]",
        flip && "flex-row-reverse",
      )}
    >
      <span className="h-px w-8 bg-gradient-to-l from-[hsl(var(--brand-gold))] to-transparent sm:w-12" />
      <span className="size-1.5 rotate-45 bg-[hsl(var(--brand-gold))]" />
    </span>
  );
}

function AkwaanHero() {
  return (
    <section className="akwaan-home-hero relative isolate -mx-4 overflow-hidden bg-[hsl(var(--brand-navy))] px-6 py-10 text-white sm:-mx-6 sm:px-10 lg:-mx-8 lg:grid lg:min-h-[clamp(460px,58vh,560px)] lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:items-center lg:gap-6 lg:py-14 lg:px-[max(4rem,calc((100vw-1440px)/2+4rem))]">
      <div className="akwaan-universe-stage relative z-10 order-last mt-8 min-h-[320px] lg:order-none lg:mt-0 lg:h-full lg:min-h-[420px]">
        <HeroOrbitGraphic />
        <div className="akwaan-universe-core absolute left-1/2 top-1/2 grid size-[220px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/15 bg-[radial-gradient(circle_at_38%_30%,#3a3676_0%,#242150_46%,#171536_100%)] shadow-[0_0_0_16px_rgba(255,255,255,.02),0_0_70px_rgba(135,116,255,.2),0_22px_60px_rgba(0,0,0,.32)] sm:size-[250px] lg:size-[280px]">
          <span className="absolute inset-[14%] rounded-full border border-white/10" />
          <span className="flex flex-col items-center gap-1">
            <Sparkles
              className="size-9 text-[hsl(var(--brand-gold))] lg:size-11"
              strokeWidth={1.3}
            />
            <span className="text-xl font-black tracking-wide lg:text-2xl">
              أكوان
            </span>
          </span>
        </div>
        {HERO_NODES.map(({ key, title, subtitle, Icon, tone, position }) => (
          <div
            key={key}
            className={cn(
              "hero-node absolute z-20 flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 backdrop-blur-sm",
              position,
            )}
          >
            <span
              className={cn(
                "grid size-9 shrink-0 place-items-center rounded-full shadow-[0_6px_16px_rgba(0,0,0,.28)]",
                NODE_TONE[tone],
              )}
            >
              <Icon className="size-4" strokeWidth={2} aria-hidden />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-black">{title}</span>
              <span className="block text-[0.7rem] font-bold text-white/60">
                {subtitle}
              </span>
            </span>
          </div>
        ))}
      </div>

      <div className="relative z-20 max-w-[34rem] text-right lg:justify-self-start">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-xs font-black text-white/80">
          <Star
            className="size-3.5 fill-[hsl(var(--brand-gold))] text-[hsl(var(--brand-gold))]"
            aria-hidden
          />
          لعبة فرق · تحديات · تفاعل
        </span>
        <h1 className="mt-5 text-[2.4rem] font-black leading-[1.2] sm:text-[3rem] lg:text-[3.4rem]">
          اختر 3 عوالم
          <br />
          وابدأ <span className="text-[hsl(var(--brand-gold))]">التحدي!</span>
        </h1>
        <p className="mt-5 max-w-[30rem] text-sm leading-7 text-white/70 sm:text-base">
          لعبة جماعية مليئة بالتحديات والمنافسة. اختر عوالمك المفضلة، جاوب،
          تعاون، وحقق أعلى النقاط!
        </p>
        <Button
          asChild
          size="lg"
          className="mt-7 rounded-full bg-white px-7 py-6 text-base font-black text-[hsl(var(--brand-navy))] shadow-[0_18px_44px_-18px_rgba(0,0,0,.6)] hover:bg-white/90"
        >
          <a href="#worlds">
            <Rocket className="ml-2 size-5" aria-hidden />
            أنشئ مباراة جديدة
          </a>
        </Button>
      </div>
    </section>
  );
}

function HeroOrbitGraphic() {
  return (
    <div
      aria-hidden
      className="absolute left-1/2 top-1/2 size-[320px] -translate-x-1/2 -translate-y-1/2 opacity-90 sm:size-[360px] lg:size-[400px]"
    >
      <span className="absolute inset-[6%] rounded-full border border-white/10" />
      <span className="absolute inset-[16%] rotate-[-17deg] rounded-[46%] border border-[hsl(var(--brand-purple)/.25)]" />
      <span className="absolute left-[2%] top-[34%] h-[36%] w-[96%] rotate-12 rounded-[50%] border border-[hsl(var(--brand-gold)/.22)]" />
      <Sparkles className="absolute left-[12%] top-[9%] size-4 text-[hsl(var(--brand-gold)/.8)]" />
      <Sparkles className="absolute bottom-[12%] right-[8%] size-3 text-white/45" />
      <span className="absolute right-[13%] top-[22%] size-1.5 rounded-full bg-[hsl(var(--brand-purple))]" />
      <span className="absolute bottom-[16%] left-[18%] size-1 rounded-full bg-white/60" />
      <span className="absolute left-[4%] top-[54%] size-1 rounded-full bg-[hsl(var(--brand-gold))]" />
    </div>
  );
}

/**
 * One World, as a selectable card.
 *
 * A button so it keeps its World name as its accessible name and its
 * `aria-pressed` selection state. Tapping it opens Scope selection; it never
 * navigates. Unselected, it shows the World's signature mechanic; selected, it
 * shows the four Scopes the player chose and an order badge for its slot.
 */
function WorldSelectCard({
  world,
  selected,
  order,
  selectedCount,
  selectedScopeIds,
  disabled,
  onSelect,
  onRemove,
}: {
  world: PlayableWorld;
  selected: boolean;
  order?: number;
  selectedCount: number;
  selectedScopeIds: string[];
  disabled: boolean;
  onSelect: () => void;
  onRemove?: () => void;
}) {
  const signature = worldSignatureLabel(world);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={world.name}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onSelect}
        className={cn(
          "group flex w-full flex-col items-center gap-3 rounded-3xl border-2 bg-card p-4 text-center shadow-[0_10px_30px_rgba(24,16,54,.06)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40",
          selected
            ? "border-[hsl(var(--brand-gold))] shadow-[0_14px_36px_hsl(var(--brand-gold)/.18)]"
            : "border-transparent hover:-translate-y-1 hover:shadow-[0_16px_38px_rgba(24,16,54,.12)]",
        )}
      >
        <span className="relative block aspect-square w-full max-w-[7.5rem] overflow-hidden rounded-full border-2 border-secondary bg-secondary">
          <WorldCover
            world={world}
            sizes="(min-width:1024px) 130px, 30vw"
          />
          {selected && order && (
            <span className="absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-[hsl(var(--brand-gold))] text-sm font-black text-[hsl(var(--brand-navy))] shadow-sm">
              <span className="akwaan-numeral">{order}</span>
            </span>
          )}
        </span>

        <span className="text-lg font-black text-foreground">{world.name}</span>

        {selected ? (
          <WorldCardScopes worldId={world.id} selectedScopeIds={selectedScopeIds} />
        ) : (
          signature && (
            <span className="text-xs font-bold text-[hsl(var(--brand-gold))]">
              {signature}
            </span>
          )
        )}

        <span className="akwaan-numeral rounded-full bg-secondary px-3 py-0.5 text-xs font-black text-muted-foreground">
          {selectedCount}
          <span className="text-muted-foreground/60">/{OCCURRENCE_COUNT}</span>
        </span>
      </button>

      {selected && onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`إزالة ${world.name}`}
          className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-card text-muted-foreground shadow-sm transition hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
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

/** A category that is not open yet: shown, but plainly not selectable. */
function ComingSoonCard({ label }: { label: string }) {
  return (
    <div
      aria-disabled
      className="flex w-full flex-col items-center gap-3 rounded-3xl border-2 border-dashed border-border/70 bg-muted/40 p-4 text-center opacity-70"
    >
      <span className="grid aspect-square w-full max-w-[7.5rem] place-items-center rounded-full border-2 border-border/60 bg-secondary/50 text-muted-foreground/50">
        <Sparkles className="size-7" aria-hidden />
      </span>
      <span className="text-lg font-black text-muted-foreground">{label}</span>
      <span className="rounded-full bg-secondary/70 px-3 py-0.5 text-xs font-black text-muted-foreground">
        قريباً
      </span>
    </div>
  );
}

/**
 * The order the chosen Worlds will be played, and the way into setup.
 *
 * The three slots fill in the order the player picks them, so the bar states the
 * rule ("played in the order you choose") and shows which slots are taken.
 * Continuing is blocked until all three are chosen.
 */
function SelectionBar({
  draft,
  selectedCount,
}: {
  draft: ReturnType<typeof createDraft>;
  selectedCount: number;
}) {
  const ready = selectedCount === OCCURRENCE_COUNT;
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row-reverse">
      <div
        className="flex flex-1 items-center justify-between gap-4 rounded-2xl bg-[hsl(var(--brand-navy))] px-5 py-4 text-white"
        data-testid="selection-order-bar"
      >
        <p className="text-sm font-black sm:text-base">
          سيتم لعب العوالم بالترتيب الذي تختاره
        </p>
        <ol className="flex list-none items-center gap-2">
          {draft.occurrences.map((occurrence, index) => {
            const filled = Boolean(occurrence.worldId);
            return (
              <li
                key={occurrence.occurrenceIndex}
                className={cn(
                  "grid size-9 place-items-center rounded-full border-2 text-sm font-black transition-colors",
                  filled
                    ? "border-[hsl(var(--brand-gold))] bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))]"
                    : "border-white/30 text-white/60",
                )}
              >
                <span className="akwaan-numeral">{index + 1}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <Button
        asChild
        size="lg"
        className={cn(
          "h-auto rounded-2xl px-8 py-4 text-base font-black",
          !ready && "pointer-events-none opacity-45",
        )}
      >
        <Link href={MATCH_SETUP_ROUTE} aria-disabled={!ready}>
          متابعة إعداد المباراة
          <ArrowLeft className="mr-2 size-5" aria-hidden />
        </Link>
      </Button>
    </div>
  );
}

function FeaturesSection() {
  return (
    <section aria-labelledby="why-title" className="scroll-mt-24">
      <SectionHeading id="why-title" title="ليش أكوان مختلفة؟" />
      <ul className="grid list-none gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ key, title, description, Icon, tone }) => (
          <li
            key={key}
            className="flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card p-6 text-center shadow-[0_10px_30px_rgba(24,16,54,.05)]"
          >
            <span
              className={cn(
                "grid size-12 place-items-center rounded-2xl",
                NODE_TONE[tone],
              )}
            >
              <Icon className="size-6" strokeWidth={2} aria-hidden />
            </span>
            <span className="text-lg font-black text-foreground">{title}</span>
            <span className="text-sm leading-6 text-muted-foreground">
              {description}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function WorldScopesDialog({
  state,
  selectedScopeIds,
  onSelectedScopeIdsChange,
  onClose,
  onConfirm,
}: {
  state?: { world: PlayableWorld; occurrenceIndex: number };
  selectedScopeIds: string[];
  onSelectedScopeIdsChange: (ids: string[]) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const query = usePlayableScopes(state?.world.id);
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
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[92vh] w-[min(1120px,94vw)] max-w-none flex-col overflow-hidden rounded-[1.5rem] border-primary/10 bg-card p-0 shadow-[0_30px_100px_rgba(15,12,38,.3)] sm:max-w-none"
      >
        {state && (
          <>
            <DialogHeader className="shrink-0 flex-row items-center gap-4 border-b px-5 py-4 text-right sm:px-8">
              <span className="relative size-20 shrink-0 overflow-hidden rounded-full border border-border bg-secondary shadow-[0_8px_22px_rgba(24,16,54,.1)]">
                <WorldCover world={state.world} sizes="80px" />
              </span>
              <div className="min-w-0 flex-1">
                <DialogTitle className="text-xl font-black leading-tight sm:text-2xl">
                  عالم {state.world.name}
                </DialogTitle>
                <DialogDescription className="mt-1.5 text-sm">
                  اختر النطاقات اللي تبغاها في المباراة
                </DialogDescription>
              </div>
              <DialogClose asChild>
                <button
                  type="button"
                  aria-label="إغلاق"
                  className="grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <X className="size-5" />
                </button>
              </DialogClose>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-base font-black">النطاقات المتاحة</p>
                <span
                  data-testid="scope-count"
                  className="akwaan-numeral rounded-full border border-border bg-secondary/65 px-2.5 py-1 text-xs font-black text-muted-foreground"
                >
                  {selectedScopeIds.length} / {SCOPES_PER_OCCURRENCE}
                </span>
              </div>
              {query.isLoading ? (
                <CardSkeletons count={4} />
              ) : query.isError ? (
                <JourneyError
                  title="تعذر تحميل النطاقات"
                  description="تأكد من اتصالك وجرّب مرة ثانية."
                  onRetry={() => void query.refetch()}
                  retrying={query.isFetching}
                />
              ) : (
                <ul className="grid list-none gap-4 sm:grid-cols-2">
                  {scopes.map((scope) => {
                    const selected = selectedScopeIds.includes(scope.id);
                    return (
                      <li key={scope.id}>
                        <button
                          type="button"
                          aria-pressed={selected}
                          disabled={
                            selectedScopeIds.length >= SCOPES_PER_OCCURRENCE &&
                            !selected
                          }
                          onClick={() => toggle(scope)}
                          className={cn(
                            "group flex h-[190px] w-full flex-col overflow-hidden rounded-[1.25rem] border bg-card text-right shadow-[0_8px_24px_rgba(24,16,54,.05)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:opacity-40",
                            selected
                              ? "border-[hsl(var(--brand-gold))] bg-[hsl(var(--brand-gold)/.06)] shadow-[0_10px_28px_hsl(var(--brand-gold)/.12)]"
                              : "border-border hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(24,16,54,.09)]",
                          )}
                        >
                          <ScopeCardMedia scope={scope} className="h-[130px] sm:h-[130px]">
                            {selected && (
                              <span className="absolute left-3 top-3 grid size-7 place-items-center rounded-full bg-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))] shadow-sm">
                                <Check className="size-4" />
                              </span>
                            )}
                          </ScopeCardMedia>
                          <span className="flex flex-1 items-center px-5 text-lg font-black">
                            {scope.name}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <DialogFooter className="m-0 shrink-0 flex-row items-center justify-between rounded-none border-t bg-card px-5 py-4 sm:px-8">
              <DialogClose asChild>
                <Button
                  variant="ghost"
                  className="rounded-full px-6 font-black text-muted-foreground"
                >
                  إلغاء
                </Button>
              </DialogClose>
              <Button
                onClick={onConfirm}
                disabled={selectedScopeIds.length !== SCOPES_PER_OCCURRENCE}
                className="min-w-44 rounded-full bg-[hsl(var(--brand-navy))] font-black text-white hover:bg-[hsl(var(--brand-navy)/.9)] disabled:bg-[hsl(var(--brand-navy)/.1)] disabled:text-[hsl(var(--brand-navy)/.42)] disabled:opacity-100"
              >
                تأكيد الاختيار
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function CardSkeletons({ count }: { count: number; className?: string; columns?: "featured" | "grid" }) {
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

export function EmptyWorlds({ isAuthenticated: _isAuthenticated }: { isAuthenticated?: boolean }) {
  return (
    <div className="rounded-3xl border bg-card p-10 text-center">
      <p className="text-lg font-black">لا توجد عوالم متاحة بعد</p>
      <p className="mt-2 text-sm text-muted-foreground">
        سيظهر هنا كل عالم فور تفعيله.
      </p>
    </div>
  );
}
