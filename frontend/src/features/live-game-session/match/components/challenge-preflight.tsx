"use client";

import {
  Check,
  ChevronDown,
  Copy,
  Play,
  Smartphone,
  Users,
} from "lucide-react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ScannableQr } from "@/components/akwaan/scannable-qr";
import { WorldMedia } from "@/components/akwaan/world-media";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PendingButtonContent } from "@/components/ui/pending-button-content";
import {
  InlineMechanicTutorial,
  SUPPORTED_TUTORIAL_MECHANIC_KEYS,
} from "@/features/challenge-explainer";
import { occurrenceLabel } from "@/features/match-setup";
import { TEAM_SLOT_ORDER, teamIdentity } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import {
  PLAYER_CHARACTERS,
  PlayerCharacterIcon,
} from "../../components/player-characters";
import { LiveSessionContext } from "../../hooks/live-session-context";
import type { PreflightTeam, UnifiedPreflight } from "../types";

const TUTORIAL_RENDERER_MECHANICS = new Set<string>(
  SUPPORTED_TUTORIAL_MECHANIC_KEYS,
);

/**
 * The moment between choosing a position and starting it (approved V6 layout).
 *
 * A launch moment, not a form. A full-width navy identity banner sets the
 * World, challenge, phone requirement, and starting team across the top. Beneath
 * it sit two working columns on desktop (`>= lg`): the dominant interactive
 * tutorial stage and the compact launch rail (readiness, collapsible join QR,
 * authoritative launch CTA, and quiet back-to-board action).
 *
 * Everything driving launch gating is strictly server state: `readyToLaunch`,
 * readiness counts, and blocking summaries come from the canonical Match
 * projection; the tutorial simulation holds no session and sends no commands.
 */
export function ChallengePreflight({
  preflight,
  sessionId,
  selectingTeamName,
  worldImageUrl,
  launching,
  cancelling,
  error,
  onCancel,
  onLaunch,
}: {
  preflight: UnifiedPreflight;
  sessionId: string;
  selectingTeamName?: string;
  /** The approved World banner, from the catalog the client already reads. */
  worldImageUrl?: string;
  launching: boolean;
  cancelling: boolean;
  error?: string;
  onCancel: () => void;
  onLaunch: () => void;
}) {
  const liveSession = useContext(LiveSessionContext);
  const snapshot = liveSession?.snapshot;

  const avatarByParticipantId = useMemo(() => {
    const map = new Map<string, string>();
    for (const participant of snapshot?.participants ?? []) {
      if (participant.avatarKey) {
        map.set(participant.id, participant.avatarKey);
      }
    }
    return map;
  }, [snapshot?.participants]);

  // Repeated encounter inside the current Match switches the tutorial to a
  // compact recap card so returning players can launch right away.
  const repeatEncounter = useMemo(() => {
    const positions = snapshot?.match?.unified?.board?.positions;
    if (!positions?.length) return false;
    return positions.some(
      (position) =>
        position.challengeKey === preflight.challengeKey &&
        position.status === "completed",
    );
  }, [preflight.challengeKey, snapshot?.match?.unified?.board?.positions]);

  return (
    <div
      className="space-y-4 pb-28 lg:pb-0"
      data-testid="challenge-preflight"
      dir="rtl"
    >
      <ChallengeIdentityBanner
        preflight={preflight}
        {...(selectingTeamName ? { selectingTeamName } : {})}
        {...(worldImageUrl ? { worldImageUrl } : {})}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(270px,315px)]">
        <ChallengeExplanation
          preflight={preflight}
          launching={launching}
          repeatEncounter={repeatEncounter}
          className="order-2 min-w-0 lg:order-1 lg:col-start-1 lg:row-start-1 lg:row-span-2"
        />

        <aside
          data-testid="preflight-joining-region"
          aria-label="جاهزية الفريقين والبدء"
          className="order-1 flex min-w-0 flex-col gap-2.5 lg:order-2 lg:col-start-2 lg:row-start-1"
        >
          {preflight.requiresPhones ? (
            <PairingPanel
              preflight={preflight}
              sessionId={sessionId}
              avatarByParticipantId={avatarByParticipantId}
            />
          ) : (
            <div className="rounded-[14px] border border-border bg-card p-4 text-sm leading-6 text-muted-foreground">
              يُلعب هذا التحدي من الشاشة المشتركة. لا حاجة لجوالات.
            </div>
          )}

          <StartChallengeSection
            preflight={preflight}
            launching={launching}
            cancelling={cancelling}
            onLaunch={onLaunch}
          />

          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="font-bold">{error}</AlertDescription>
            </Alert>
          )}
        </aside>

        <div className="order-3 flex justify-center lg:col-start-2 lg:row-start-2 lg:-mt-1.5">
          <Button
            type="button"
            variant="ghost"
            disabled={launching || cancelling}
            onClick={onCancel}
            className="min-h-[44px] font-bold text-brand-navy hover:bg-muted/70"
          >
            {cancelling ? "جارٍ الإلغاء…" : "ارجع للوحة"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Full-width navy identity banner with faded World artwork on the right,
 * station eyebrow in gold, challenge title, summary, and compact status pills.
 */
function ChallengeIdentityBanner({
  preflight,
  selectingTeamName,
  worldImageUrl,
}: {
  preflight: UnifiedPreflight;
  selectingTeamName?: string;
  worldImageUrl?: string;
}) {
  const summary = preflight.description;
  const selectingIndex = preflight.selectingTeamId
    ? preflight.teams.findIndex(
        (team) => team.teamId === preflight.selectingTeamId,
      )
    : -1;
  const selectingIdentity =
    selectingIndex >= 0
      ? teamIdentity(TEAM_SLOT_ORDER[selectingIndex % TEAM_SLOT_ORDER.length])
      : undefined;

  return (
    <section
      data-testid="preflight-identity"
      aria-label="التحدي القادم"
      className="relative isolate flex min-h-[118px] overflow-hidden rounded-[18px] bg-brand-navy text-white shadow-[0_18px_40px_-24px_hsl(var(--brand-navy)/0.55)] sm:min-h-[156px]"
    >
      {/* Right artwork slot fading seamlessly into the navy copy panel */}
      <div className="relative min-h-[118px] flex-[0_0_36%] overflow-hidden sm:min-h-[156px] sm:flex-[1_1_42%]">
        <WorldMedia
          name={preflight.worldName ?? "عالم"}
          eyebrow={occurrenceLabel(preflight.occurrenceIndex)}
          variant="strip"
          {...(worldImageUrl ? { imageUrl: worldImageUrl } : {})}
          className="h-full min-h-[118px] w-full rounded-none aspect-auto sm:min-h-[156px]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_left,transparent_28%,hsl(var(--brand-navy)/0.9)_88%,hsl(var(--brand-navy))_100%)]"
        />
      </div>

      {/* Left copy slot */}
      <div className="z-[1] flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-3.5 py-3 sm:gap-2 sm:px-8 sm:py-5">
        <span className="text-[10px] font-bold tracking-wide text-brand-gold sm:text-xs">
          {occurrenceLabel(preflight.occurrenceIndex)} · التحدي القادم
        </span>
        <h1 className="font-display text-2xl font-bold leading-tight text-white sm:text-3xl lg:text-[42px]">
          {preflight.challengeName}
        </h1>
        {summary && (
          <p className="line-clamp-2 text-[11px] leading-relaxed text-white/80 sm:text-[15px]">
            {summary}
          </p>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
          {preflight.requiresPhones && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/35 px-2.5 py-1 text-[10px] font-semibold text-white sm:text-[11px]">
              <Smartphone className="size-3" aria-hidden />
              يحتاج جوالات
            </span>
          )}
          {selectingTeamName && (
            <span
              data-testid="preflight-turn-chip"
              className="inline-flex items-center gap-1.5 rounded-full border border-white/35 px-2.5 py-1 text-[10px] font-semibold text-white sm:text-[11px]"
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  selectingIdentity?.dot ?? "bg-brand-gold",
                )}
              />
              {selectingTeamName} يبدأ
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The embedded tutorial stage. Strictly presentation-only.
 */
function ChallengeExplanation({
  preflight,
  launching,
  repeatEncounter,
  className,
}: {
  preflight: UnifiedPreflight;
  launching: boolean;
  repeatEncounter: boolean;
  className?: string;
}) {
  const animated = TUTORIAL_RENDERER_MECHANICS.has(preflight.challengeKey);
  const tutorialTeams = useMemo(
    () =>
      preflight.teams.map((team, index) => ({
        teamId: team.teamId,
        teamName: team.teamName,
        slot: TEAM_SLOT_ORDER[index % TEAM_SLOT_ORDER.length],
      })),
    [preflight.teams],
  );

  return (
    <section
      data-testid="preflight-explainer"
      data-animated={animated ? "true" : "false"}
      data-launching={launching ? "true" : "false"}
      aria-label="شرح طريقة اللعب"
      className={className ?? "min-w-0"}
    >
      <InlineMechanicTutorial
        mechanicKey={preflight.challengeKey}
        worldId={preflight.worldId}
        challengeName={preflight.challengeName}
        {...(preflight.description
          ? { description: preflight.description }
          : {})}
        launching={launching}
        repeatEncounter={repeatEncounter}
        teams={tutorialTeams}
      />
    </section>
  );
}

/**
 * Single authoritative Start Challenge control:
 * - Pinned as a comfortable bottom launch bar on mobile viewports (`< lg`).
 * - Integrated directly into the launch rail on desktop (`>= lg`).
 * Keeping one button element preserves focus management and avoids duplicate
 * interactive controls across breakpoints.
 */
function StartChallengeSection({
  preflight,
  launching,
  cancelling,
  onLaunch,
}: {
  preflight: UnifiedPreflight;
  launching: boolean;
  cancelling: boolean;
  onLaunch: () => void;
}) {
  const previousReadyRef = useRef(preflight.readyToLaunch);
  const [justReady, setJustReady] = useState(false);

  useEffect(() => {
    const becameReady = !previousReadyRef.current && preflight.readyToLaunch;
    previousReadyRef.current = preflight.readyToLaunch;
    if (!becameReady) return;
    setJustReady(true);
    const timer = window.setTimeout(() => setJustReady(false), 750);
    return () => window.clearTimeout(timer);
  }, [preflight.readyToLaunch]);

  const reasonText = preflight.readyToLaunch
    ? "كلكم جاهزين — يلا نبدأ!"
    : blockingSummary(preflight);

  return (
    <section
      data-testid="preflight-start-section"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_hsl(var(--brand-navy)/0.12)] backdrop-blur lg:static lg:inset-auto lg:z-auto lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-none"
    >
      <button
        type="button"
        data-testid="preflight-start"
        disabled={!preflight.readyToLaunch || launching || cancelling}
        aria-busy={launching}
        onClick={onLaunch}
        className={cn(
          "flex min-h-[62px] w-full flex-col items-center justify-center gap-0.5 rounded-[14px] px-4 py-2.5 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-[76px]",
          preflight.readyToLaunch
            ? "border-[3px] border-brand-navy bg-brand-gold text-brand-navy shadow-[0_7px_0_hsl(var(--brand-navy))] hover:brightness-[1.03] active:translate-y-0.5 active:shadow-[0_4px_0_hsl(var(--brand-navy))]"
            : "border-2 border-border bg-muted text-disabled-foreground shadow-none",
          justReady && "motion-safe:animate-[akwaan-soft-pop_0.65s_ease]",
        )}
      >
        <PendingButtonContent
          pending={launching}
          pendingLabel="جارٍ بدء التحدي…"
        >
          <span className="flex items-center justify-center gap-2 font-display text-lg font-bold lg:text-[19px]">
            {preflight.readyToLaunch ? (
              <Play className="size-4 fill-current" aria-hidden />
            ) : (
              <Users className="size-4" aria-hidden />
            )}
            ابدأ التحدي
          </span>
        </PendingButtonContent>
        <span
          className={cn(
            "text-[11px] font-bold leading-snug",
            preflight.readyToLaunch
              ? "text-brand-navy/85"
              : "text-muted-foreground",
          )}
        >
          {reasonText}
        </span>
      </button>
    </section>
  );
}

/**
 * Authoritative readiness roster + collapsible Match-scoped QR/join card.
 * Ordering Readiness first ensures hosts immediately see who has arrived while
 * keeping the join code one click away when collapsed.
 */
function PairingPanel({
  preflight,
  sessionId,
  avatarByParticipantId,
}: {
  preflight: UnifiedPreflight;
  sessionId: string;
  avatarByParticipantId: Map<string, string>;
}) {
  const storageKey = `akwaan:preflight-join-complete:${sessionId}`;
  const [expanded, setExpanded] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.sessionStorage.getItem(storageKey) !== "true";
  });
  const [copied, setCopied] = useState(false);
  const join = preflight.join;
  const joinUrl = useMemo(() => {
    if (!join) return undefined;
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}${join.joinPath}`;
  }, [join]);

  useEffect(() => {
    if (preflight.allTeamsReady) {
      window.sessionStorage.setItem(storageKey, "true");
      setExpanded(false);
    }
  }, [preflight.allTeamsReady, storageKey]);

  const showQr = Boolean(join) && expanded;

  const copy = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      toast.success("تم نسخ الرابط");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A clipboard-denied browser still shows the code and the URL.
    }
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* 1. Team Readiness Card */}
      <section
        data-testid="preflight-readiness"
        className="rounded-[14px] border border-border bg-card px-4 py-3.5"
      >
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold text-foreground">
          <Users className="size-4 text-muted-foreground" aria-hidden />
          جاهزية اللاعبين
        </h2>
        <ul className="list-none divide-y divide-border">
          {preflight.teams.map((team, index) => (
            <li key={team.teamId} className="py-2.5 first:pt-0.5 last:pb-0.5">
              <TeamRoster
                team={team}
                order={index}
                avatarByParticipantId={avatarByParticipantId}
              />
            </li>
          ))}
        </ul>
      </section>

      {/* 2. Collapsible Join QR / Code Card */}
      <section className="overflow-hidden rounded-[14px] border border-border bg-card">
        <button
          type="button"
          data-testid="preflight-join-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-[44px] w-full items-center justify-between gap-2 px-4 py-2.5 text-start transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span
            data-testid={!expanded ? "preflight-players-paired" : undefined}
            className="flex items-center gap-2 text-[13px] font-bold text-foreground"
          >
            <Smartphone className="size-4 text-brand-navy" aria-hidden />
            {preflight.allTeamsReady
              ? "اللاعبين متصلين وجاهزين"
              : "انضمام اللاعبين"}
          </span>
          <span className="flex items-center gap-2">
            {!expanded && join?.joinCode && (
              <span
                dir="ltr"
                className="font-display text-sm font-bold tracking-widest text-foreground"
              >
                {join.joinCode}
              </span>
            )}
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
          </span>
        </button>

        {expanded && (
          <div className="space-y-2.5 border-t border-border/70 px-4 pt-3 pb-3.5">
            <p className="text-[11px] font-semibold leading-5 text-muted-foreground">
              امسحوا الرمز للانضمام إلى المباراة. لا تحتاجون لإعادة المسح بين
              التحديات.
            </p>
            {showQr && joinUrl && (
              <div className="flex items-center gap-3 rounded-[10px] border border-border/70 bg-background p-2.5">
                <span className="flex shrink-0 flex-col items-center gap-1">
                  <ScannableQr value={joinUrl} size={76} />
                  <span className="text-[9px] font-bold text-muted-foreground">
                    اضغط على الكود عشان تكبّره
                  </span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-[10px] font-bold text-muted-foreground">
                    قولوا للاعبين: ادخلوا الكود
                  </span>
                  <strong
                    data-testid="preflight-join-code"
                    dir="ltr"
                    className="akwaan-numeral block text-right font-display text-2xl font-bold tracking-[0.2em] text-foreground"
                  >
                    {join!.joinCode}
                  </strong>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copy()}
                    className="min-h-[36px] self-start px-2.5 text-[11px] font-bold"
                  >
                    <Copy className="size-3.5" aria-hidden />
                    {copied ? "تم النسخ" : "نسخ الرابط"}
                  </Button>
                </span>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * One team's phones at a glance: team identity color + player avatars/names +
 * semantic readiness status pill.
 */
function TeamRoster({
  team,
  order,
  avatarByParticipantId,
}: {
  team: PreflightTeam;
  order: number;
  avatarByParticipantId: Map<string, string>;
}) {
  const identity = teamIdentity(
    TEAM_SLOT_ORDER[order % TEAM_SLOT_ORDER.length],
  );
  const target = team.maximum ?? team.minimum;
  const missing = Math.max(0, target - team.connectedCount);

  return (
    <div
      data-testid={`preflight-team-${team.teamId}`}
      data-ready={team.ready}
      className="space-y-2"
    >
      <div className="flex items-center justify-between gap-2 text-[13px] font-bold">
        <span className="flex items-center gap-1.5 text-foreground">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", identity.dot)}
          />
          {team.teamName}
        </span>
        <span className="akwaan-numeral text-xs font-bold text-muted-foreground">
          {team.connectedCount}/{target}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-start gap-2">
          {Array.from({
            length: Math.max(target, team.participants.length),
          }).map((_, index) => {
            const participant = team.participants[index];
            if (!participant) {
              return (
                <div
                  key={`empty-${index}`}
                  aria-hidden
                  className="flex w-[48px] flex-col items-center gap-1 text-center"
                >
                  <span className="grid size-[38px] shrink-0 place-items-center rounded-full border-2 border-dashed border-border bg-card text-lg text-muted-foreground/70">
                    ＋
                  </span>
                  <span className="max-w-full truncate text-[9px] text-muted-foreground/80">
                    بانتظار لاعب
                  </span>
                </div>
              );
            }

            const avatarKey = avatarByParticipantId.get(
              participant.participantId,
            );
            const hasCharacter = Boolean(
              avatarKey && avatarKey in PLAYER_CHARACTERS,
            );
            const initial = participant.displayName.trim().charAt(0) || "؟";

            return participant.connected ? (
              <div
                key={participant.participantId}
                title={participant.displayName}
                className="flex w-[48px] flex-col items-center gap-1 text-center"
              >
                <span className="relative shrink-0">
                  <span
                    className={cn(
                      "grid size-[38px] place-items-center overflow-hidden rounded-full border-2 text-xs font-black",
                      identity.border,
                      identity.surface,
                      identity.text,
                    )}
                  >
                    {hasCharacter && avatarKey ? (
                      <PlayerCharacterIcon
                        characterKey={avatarKey}
                        size={34}
                        title={PLAYER_CHARACTERS[avatarKey].label}
                      />
                    ) : (
                      initial
                    )}
                  </span>
                  <span
                    role="img"
                    aria-label="متصل"
                    className="absolute -bottom-0.5 -left-0.5 size-2.5 rounded-full border-2 border-card bg-success"
                  />
                </span>
                <span className="max-w-[50px] truncate text-[10px] font-medium text-muted-foreground">
                  {participant.displayName}
                </span>
              </div>
            ) : (
              <div
                key={participant.participantId}
                title={participant.displayName}
                className="flex w-[48px] flex-col items-center gap-1 text-center"
              >
                <span
                  aria-label="غير متصل"
                  className="grid size-[38px] shrink-0 place-items-center rounded-full border-2 border-dashed border-border text-xs font-black text-disabled-foreground"
                >
                  {initial}
                  <span className="sr-only">
                    {participant.displayName} غير متصل
                  </span>
                </span>
                <span className="max-w-[50px] truncate text-[10px] text-disabled-foreground">
                  {participant.displayName}
                </span>
              </div>
            );
          })}
        </div>

        <TeamReadinessStatus team={team} missing={missing} />
      </div>
    </div>
  );
}

/**
 * Semantic readiness chip — green when ready, warm/muted when gathering.
 */
function TeamReadinessStatus({
  team,
  missing,
}: {
  team: PreflightTeam;
  missing: number;
}) {
  if (team.ready) {
    return (
      <span
        data-testid={`preflight-team-status-${team.teamId}`}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
          "bg-success-subtle text-success",
        )}
      >
        <Check className="size-3.5 shrink-0" aria-hidden />
        جاهز
      </span>
    );
  }
  return (
    <span
      data-testid={`preflight-team-status-${team.teamId}`}
      className={cn(
        "rounded-full px-2.5 py-1 text-[11px] font-bold",
        missing <= 1
          ? "bg-warning-subtle text-warning"
          : "bg-muted text-muted-foreground",
      )}
    >
      {readinessPhrase(missing)}
    </span>
  );
}

function readinessPhrase(missing: number): string {
  if (missing <= 0) return "بانتظار الجاهزية";
  if (missing === 1) return "باقي لاعب واحد";
  if (missing === 2) return "باقي لاعبين";
  return `بانتظار ${missing} لاعبين`;
}

function blockingSummary(preflight: UnifiedPreflight): string {
  const waiting = preflight.teams.filter((team) => !team.ready);
  if (!waiting.length) return "ننتظر الجاهزية…";
  return `بانتظار ${waiting.map((team) => team.teamName).join(" و")}`;
}
