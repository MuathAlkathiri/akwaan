"use client";

import { Check, ChevronDown, Copy, Play, Users } from "lucide-react";
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
      className="space-y-5 pb-28 lg:pb-0"
      data-testid="challenge-preflight"
      dir="rtl"
    >
      <ChallengeIdentityBanner
        preflight={preflight}
        {...(selectingTeamName ? { selectingTeamName } : {})}
        {...(worldImageUrl ? { worldImageUrl } : {})}
      />

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(290px,380px)] lg:gap-7">
        <ChallengeExplanation
          preflight={preflight}
          launching={launching}
          repeatEncounter={repeatEncounter}
          className="order-2 min-w-0 lg:order-1 lg:col-start-1 lg:row-start-1 lg:row-span-2"
        />

        <aside
          data-testid="preflight-joining-region"
          aria-label="جاهزية الفريقين والبدء"
          className="order-1 flex min-w-0 flex-col gap-[18px] lg:order-2 lg:col-start-2 lg:row-start-1"
        >
          {preflight.requiresPhones ? (
            <PairingPanel
              preflight={preflight}
              sessionId={sessionId}
              avatarByParticipantId={avatarByParticipantId}
            />
          ) : (
            <div className="rounded-[22px] border-2 border-dashed border-brand-dash bg-white p-4 text-sm leading-6 text-brand-slate">
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
            className="min-h-[44px] font-bold text-brand-navy underline decoration-2 underline-offset-4 hover:bg-transparent hover:text-brand-bronze"
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
      className="relative isolate flex min-h-[118px] overflow-hidden rounded-[26px] border-[3px] border-brand-navy bg-brand-navy text-white shadow-[7px_8px_0_hsl(var(--brand-gold))] sm:min-h-[170px]"
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
        <span className="text-xs font-bold text-brand-gold sm:text-base">
          التحدي القادم
        </span>
        <h1 className="font-display text-[28px] font-black leading-tight text-white sm:text-4xl lg:text-[52px]">
          {preflight.challengeName}
        </h1>
        {summary && (
          <p className="line-clamp-2 text-[11px] leading-relaxed text-white/80 sm:text-[15px]">
            {summary}
          </p>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 sm:gap-2">
          {selectingTeamName && (
            <span
              data-testid="preflight-turn-chip"
              className="inline-flex min-h-8 items-center gap-2 rounded-full bg-white px-3.5 text-xs font-bold text-brand-navy sm:text-sm"
            >
              <span
                aria-hidden
                className={cn(
                  "size-3 shrink-0 rounded-full border-2 border-brand-navy",
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
          "flex min-h-[62px] w-full flex-col items-center justify-center gap-0.5 rounded-[22px] px-4 py-2.5 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-purple))] lg:min-h-[84px]",
          preflight.readyToLaunch
            ? "border-[3px] border-brand-navy bg-brand-gold text-brand-navy shadow-[5px_6px_0_hsl(var(--brand-navy))] hover:-translate-y-0.5 active:translate-y-0"
            : "border-[3px] border-brand-dash bg-brand-wash text-brand-plum shadow-none",
          justReady && "motion-safe:animate-[akwaan-soft-pop_0.65s_ease]",
        )}
      >
        <PendingButtonContent
          pending={launching}
          pendingLabel="جارٍ بدء التحدي…"
        >
          <span className="flex items-center justify-center gap-2 font-display text-xl font-extrabold lg:text-2xl">
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
            "text-xs font-semibold leading-snug sm:text-sm",
            preflight.readyToLaunch ? "text-brand-navy" : "text-brand-plum",
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
    <div className="flex flex-col gap-[18px]">
      {/* 1. Team Readiness Card */}
      <section
        data-testid="preflight-readiness"
        className="rounded-[22px] border-[3px] border-brand-navy bg-brand-paper shadow-[5px_6px_0_hsl(var(--brand-navy))] px-5 py-4"
      >
        <h2 className="mb-3 font-display text-lg font-extrabold text-brand-navy sm:text-xl">
          جاهزية اللاعبين
        </h2>
        <ul className="m-0 list-none divide-y-2 divide-brand-mist p-0">
          {preflight.teams.map((team, index) => (
            <li key={team.teamId} className="py-3 first:pt-0.5 last:pb-0.5">
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
      <section className="overflow-hidden rounded-[22px] border-[3px] border-brand-navy bg-brand-paper shadow-[5px_6px_0_hsl(var(--brand-navy))]">
        <button
          type="button"
          data-testid="preflight-join-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="flex min-h-[52px] w-full items-center justify-between gap-2 px-5 py-3 text-start focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-[hsl(var(--brand-purple))]"
        >
          <span
            data-testid={!expanded ? "preflight-players-paired" : undefined}
            className="font-display text-lg font-extrabold text-brand-navy sm:text-xl"
          >
            {preflight.allTeamsReady
              ? "اللاعبين متصلين وجاهزين"
              : "انضمام اللاعبين"}
          </span>
          <span className="flex items-center gap-2">
            <ChevronDown
              className={cn(
                "size-5 text-brand-navy transition-transform",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
          </span>
        </button>

        {expanded && (
          <div className="flex items-center gap-4 border-t-2 border-brand-mist px-5 pb-4 pt-3.5">
            {showQr && joinUrl && (
              // The code itself is never printed: joining is a scan, and a
              // row of letters invited people to type something nothing reads.
              <span
                data-testid="preflight-join-qr"
                data-join-code={join!.joinCode}
                className="flex shrink-0 flex-col items-center gap-1 rounded-[14px] border-[3px] border-brand-navy bg-white p-2"
              >
                <ScannableQr value={joinUrl} size={92} />
                <span className="text-[10px] font-bold text-brand-slate">
                  اضغط على الكود عشان تكبّره
                </span>
              </span>
            )}
            <div className="flex min-w-0 flex-col items-start gap-2.5">
              <p className="text-sm leading-[1.7] text-brand-slate">
                امسحوا الرمز للانضمام. ما تحتاجون تعيدون المسح بين التحديات.
              </p>
              {showQr && joinUrl && (
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border-[3px] border-brand-navy bg-white px-4 text-sm font-bold text-brand-navy focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-purple))]"
                >
                  <Copy className="size-4" aria-hidden />
                  {copied ? "تم النسخ" : "نسخ الرابط"}
                </button>
              )}
            </div>
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
      <div className="flex items-center justify-between gap-2 text-[17px] font-bold">
        <span className="flex items-center gap-2 text-brand-navy">
          <span
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 rounded-full border-2 border-brand-navy",
              identity.dot,
            )}
          />
          {team.teamName}
        </span>
        <span className="akwaan-numeral text-[15px] font-bold text-brand-slate">
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
                  <span className="grid size-[38px] shrink-0 place-items-center rounded-full border-2 border-dashed border-brand-dash bg-white text-lg text-brand-plum">
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
                      // A neutral disc: the team is already named, with its
                      // dot, on the line above.
                      "grid size-[38px] place-items-center overflow-hidden rounded-full border-2 border-brand-navy bg-brand-lavender text-xs font-black text-brand-navy",
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
        "rounded-full border-2 border-brand-navy px-3 py-0.5 text-[13px] font-bold text-brand-navy",
        // Gold when one more phone does it, quiet while several are missing.
        missing <= 1 ? "bg-brand-gold" : "bg-brand-wash",
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
