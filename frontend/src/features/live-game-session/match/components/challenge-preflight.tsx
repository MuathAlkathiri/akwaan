"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ChevronDown, Copy, Users } from "lucide-react";
import { toast } from "sonner";
import { ScannableQr } from "@/components/akwaan/scannable-qr";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PendingButtonContent } from "@/components/ui/pending-button-content";
import { WorldMedia } from "@/components/akwaan/world-media";
import { teamIdentity, TEAM_SLOT_ORDER } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import {
  InlineMechanicTutorial,
  SUPPORTED_TUTORIAL_MECHANIC_KEYS,
} from "@/features/challenge-explainer";

const TUTORIAL_RENDERER_MECHANICS = new Set<string>(
  SUPPORTED_TUTORIAL_MECHANIC_KEYS,
);
import { occurrenceLabel } from "@/features/match-setup";
import type { PreflightTeam, UnifiedPreflight } from "../types";

/**
 * The moment between choosing a position and starting it.
 *
 * A launch moment, not a form. The World's own artwork heads the brief so the host
 * can see what is about to be played from across the room; the sidebar answers one
 * question — are the phones here — with a light per-team roster and the join code.
 *
 * Everything shown is server state: the readiness numbers, the requirement, and
 * `readyToLaunch` all come from the mechanic's own contract, so the button and the
 * server cannot disagree. The check is re-run at launch anyway.
 *
 * When the players are already paired the QR steps back to a secondary affordance:
 * nobody should be made to rescan between challenges.
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
  return (
    <div className="space-y-3" data-testid="challenge-preflight" dir="rtl">
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,2.6fr)_minmax(16rem,1fr)]">
        <ChallengeExplanation
          key={`${preflight.worldId}:${preflight.challengeKey}:${preflight.positionKey}`}
          preflight={preflight}
          launching={launching}
          worldImageUrl={worldImageUrl}
          selectingTeamName={selectingTeamName}
          className="order-2 min-w-0 lg:order-1"
        />
        <div
          data-testid="preflight-joining-region"
          className="order-1 min-w-0 lg:order-2"
        >
          <PairingPanel
            preflight={preflight}
            sessionId={sessionId}
            launching={launching}
            cancelling={cancelling}
            onLaunch={onLaunch}
          />
        </div>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="font-bold">{error}</AlertDescription>
        </Alert>
      )}

      {/* Only the way *out* stays outside the cards. The action that starts this
          challenge sits inside the challenge's own card — see ChallengeBrief. */}
      <footer className="flex flex-wrap items-center gap-3 px-1 py-1">
        <Button
          type="button"
          variant="outline"
          disabled={launching || cancelling}
          onClick={onCancel}
          className="border-transparent bg-transparent font-black text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
        >
          {cancelling ? "جارٍ الإلغاء…" : "ارجع للوحة"}
        </Button>
      </footer>
    </div>
  );
}

/**
 * "شرح التحدي" — the left region.
 *
 * The GSAP demonstration is the only mechanic explanation. It is a
 * presentation-only simulation: it holds no session, sends no command, and
 * cannot touch readiness, Fair-Start or Match state. It is embedded here so the
 * host can understand the challenge without opening a second surface.
 *
 * `launching` only dims the region — a purely visual handoff while the
 * authoritative stage change does the real work. It never gates the launch.
 */
function ChallengeExplanation({
  preflight,
  launching,
  className,
  worldImageUrl,
  selectingTeamName,
}: {
  preflight: UnifiedPreflight;
  launching: boolean;
  className?: string;
  worldImageUrl?: string;
  selectingTeamName?: string;
}) {
  const animated = TUTORIAL_RENDERER_MECHANICS.has(preflight.challengeKey);
  const [open, setOpen] = useState(false);
  return (
    <section
      data-testid="preflight-explainer"
      data-animated={animated ? "true" : "false"}
      data-launching={launching ? "true" : "false"}
      className={cn("surface-card min-w-0 p-4 sm:p-6", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          aria-controls={open ? "preflight-tutorial-content" : undefined}
          onClick={() => setOpen((value) => !value)}
          className="gap-2 font-black"
        >
          <BookOpen className="size-4" aria-hidden />
          {open ? "إغلاق الشرح" : "شرح قبل البداية"}
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </Button>
        {open ? (
          <h2 className="text-lg font-black text-foreground">
            {preflight.challengeName}
          </h2>
        ) : (
          <span className="rounded-full bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground">
            {occurrenceLabel(preflight.occurrenceIndex)}
          </span>
        )}
      </div>
      {open ? (
        <div id="preflight-tutorial-content" className="mt-4">
          <InlineMechanicTutorial
            embedded
            mechanicKey={preflight.challengeKey}
            worldId={preflight.worldId}
            challengeName={preflight.challengeName}
            {...(preflight.description
              ? { description: preflight.description }
              : {})}
            launching={launching}
          />
        </div>
      ) : (
        <div
          data-testid="preflight-identity"
          className="flex min-h-[min(32rem,65vh)] flex-col items-center justify-center gap-4 py-6 text-center sm:py-8"
        >
          <WorldMedia
            name={preflight.worldName ?? "عالم"}
            variant="hero"
            {...(worldImageUrl ? { imageUrl: worldImageUrl } : {})}
            className="w-full max-w-xl max-h-[min(16rem,28vh)] min-h-28 [&_h3]:sr-only"
          />
          <span className="rounded-full bg-secondary px-4 py-1.5 text-sm font-black text-secondary-foreground">
            {preflight.worldName ?? "عالم"}
          </span>
          <h1 className="text-3xl font-black leading-tight text-foreground sm:text-5xl">
            {preflight.challengeName}
          </h1>
          {preflight.description && (
            <p className="max-w-xl text-sm font-bold leading-7 text-muted-foreground sm:text-base">
              {preflight.description}
            </p>
          )}
          {selectingTeamName && (
            <span
              data-testid="preflight-turn-chip"
              className="text-xs font-bold text-muted-foreground"
            >
              {selectingTeamName} يبدأ
            </span>
          )}
          {!preflight.readyToLaunch && (
            <p className="rounded-full bg-muted px-5 py-2 text-sm font-bold text-foreground">
              {preflight.requiresPhones
                ? "بانتظار اكتمال اللاعبين"
                : "بانتظار الجاهزية"}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The launch, across the full width beneath both regions.
 *
 * Every condition is the server's: `readyToLaunch` is the single answer the
 * button reads, the blocking line names who is missing, and the check is re-run
 * server side at launch anyway. The explainer has no say in any of it.
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
  return (
    <section data-testid="preflight-start-section" className="pt-2">
      {!preflight.readyToLaunch && (
        <p className="mb-2 text-center text-sm font-bold text-muted-foreground">
          {blockingSummary(preflight)}
        </p>
      )}
      <Button
        type="button"
        size="lg"
        data-testid="preflight-start"
        disabled={!preflight.readyToLaunch || launching || cancelling}
        aria-busy={launching}
        onClick={onLaunch}
        className={cn(
          "w-full gap-2 font-black transition-shadow",
          preflight.readyToLaunch &&
            "shadow-[0_12px_28px_-16px_hsl(var(--primary)/0.65)]",
        )}
      >
        <PendingButtonContent
          pending={launching}
          pendingLabel="جارٍ بدء التحدي…"
        >
          ابدأ التحدي
        </PendingButtonContent>
      </Button>
    </section>
  );
}

/**
 * The player roster and the join code.
 *
 * `expanded` is the already-paired case: the code is still reachable for a phone
 * that needs to join late, but it stops taking up the screen. The flag is a purely
 * visual convenience scoped to this `liveSessionId`; gameplay never reads it.
 */
function PairingPanel({
  preflight,
  sessionId,
  launching,
  cancelling,
  onLaunch,
}: {
  preflight: UnifiedPreflight;
  sessionId: string;
  launching: boolean;
  cancelling: boolean;
  onLaunch: () => void;
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
    // Only the client knows its own public origin, which is what a phone scans.
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
      // The only success worth a toast: the copy leaves nothing on screen to
      // confirm it, so this one utility action says so out loud.
      toast.success("تم نسخ الرابط");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("تعذّر نسخ الرابط، امسحوا رمز الانضمام.");
    }
  };

  return (
    <aside className="space-y-3">
      {/* One joining card: the code to scan, then who has actually arrived.
          The readiness roster is no longer its own card — it is the answer to
          the question this card asks — but it is the same authoritative
          `preflight.teams` data and the same roster component as before. */}
      {preflight.requiresPhones ? (
        <section className="surface-card overflow-hidden">
          <button
            type="button"
            data-testid="preflight-join-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="flex w-full items-center justify-between gap-3 p-3 text-start transition-colors hover:bg-muted/40"
          >
            <span
              data-testid={!expanded ? "preflight-players-paired" : undefined}
              className="flex items-center gap-2 text-sm font-black text-foreground"
            >
              <Users className="size-4 text-primary" aria-hidden />
              {preflight.allTeamsReady
                ? "اللاعبين متصلين وجاهزين"
                : "انضمام اللاعبين"}
            </span>
            <ChevronDown
              className={cn(
                "size-4 text-muted-foreground transition-transform",
                expanded && "rotate-180",
              )}
              aria-hidden
            />
          </button>
          {expanded && (
            <div className="space-y-2 border-t border-border/70 p-3">
              <p className="text-xs font-bold leading-5 text-muted-foreground">
                امسحوا الرمز للانضمام إلى المباراة. لا تحتاجون لإعادة المسح بين
                التحديات.
              </p>
              {showQr && joinUrl && (
                <div className="flex flex-col items-center gap-3">
                  <ScannableQr
                    value={joinUrl}
                    size={176}
                    className="max-w-full p-4"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void copy()}
                    className="w-full gap-2 font-black"
                  >
                    <Copy className="size-4" aria-hidden />
                    {copied ? "تم النسخ" : "نسخ رابط الانضمام"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </section>
      ) : (
        <aside className="surface-card p-4 text-sm leading-6 text-muted-foreground">
          يُلعب هذا التحدي من الشاشة المشتركة. لا حاجة لجوالات.
        </aside>
      )}
      <section className="surface-card overflow-hidden">
        <div
          data-testid="preflight-readiness"
          className="space-y-2 border-t border-border/70 p-3"
        >
          <h2 className="flex items-center gap-2 text-sm font-black text-foreground">
            <Users className="size-4 text-muted-foreground" aria-hidden />
            جاهزية اللاعبين
          </h2>
          <ul className="list-none space-y-3">
            {preflight.teams.map((team, index) => (
              <li key={team.teamId}>
                <TeamRoster team={team} order={index} />
              </li>
            ))}
          </ul>
          <StartChallengeSection
            preflight={preflight}
            launching={launching}
            cancelling={cancelling}
            onLaunch={onLaunch}
          />
        </div>
      </section>
    </aside>
  );
}

/**
 * One team's phones, at a glance — a light roster row, not a filled card.
 *
 * The team's identity is a small colour dot beside its name (never a full coloured
 * surface, which made a team's identity flicker on and off with its readiness).
 * Its phones are lightweight slots — a filled disc per connected player, a dashed
 * disc per still-missing one — and readiness is stated in a short human phrase, in
 * the semantic status system, never a heavy warning pill.
 */
function TeamRoster({ team, order }: { team: PreflightTeam; order: number }) {
  const identity = teamIdentity(
    TEAM_SLOT_ORDER[order % TEAM_SLOT_ORDER.length],
  );
  const target = team.maximum ?? team.minimum;
  const missing = Math.max(0, target - team.connectedCount);

  return (
    <div
      data-testid={`preflight-team-${team.teamId}`}
      data-ready={team.ready}
      className="space-y-1.5"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-black text-foreground">
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", identity.dot)}
          />
          {team.teamName}
        </span>
        <span className="akwaan-numeral text-sm font-black text-muted-foreground">
          {team.connectedCount}/{target}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {Array.from({
            length: Math.max(target, team.participants.length),
          }).map((_, index) => {
            const participant = team.participants[index];
            if (!participant) {
              return (
                <span
                  key={`empty-${index}`}
                  aria-hidden
                  className="size-6 shrink-0 rounded-full border border-dashed border-border/70"
                />
              );
            }
            const initial = participant.displayName.trim().charAt(0) || "؟";
            return participant.connected ? (
              <span
                key={participant.participantId}
                title={participant.displayName}
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-[0.65rem] font-black",
                  identity.surface,
                  identity.text,
                )}
              >
                {initial}
                <span className="sr-only">{participant.displayName}</span>
              </span>
            ) : (
              <span
                key={participant.participantId}
                aria-label="غير متصل"
                title={participant.displayName}
                className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-border text-[0.6rem] font-black text-disabled-foreground"
              >
                {initial}
                <span className="sr-only">
                  {participant.displayName} غير متصل
                </span>
              </span>
            );
          })}
        </div>

        <TeamReadinessStatus team={team} missing={missing} />
      </div>
    </div>
  );
}

/**
 * Readiness in a word, in the status system.
 *
 * Green means ready; a warm phrase means one or more players short; a muted phrase
 * means still gathering. Never this team's own colour, so status and identity are
 * two separate signals a host reads at once.
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
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-black",
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
        "text-xs font-bold",
        missing <= 1 ? "text-warning" : "text-muted-foreground",
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
