"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Copy, Smartphone, Users } from "lucide-react";
import { toast } from "sonner";
import { ScannableQr } from "@/components/akwaan/scannable-qr";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PendingButtonContent } from "@/components/ui/pending-button-content";
import { WorldMedia } from "@/components/akwaan/world-media";
import { teamIdentity, TEAM_SLOT_ORDER } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { RyoExplainerDialog } from "@/features/challenge-explainer";

/** The one mechanic with an animated explainer so far. */
const RYO_CHALLENGE_KEY = "read-your-opponent";
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
      {/* One identity banner across the top — what World, what challenge, who
          starts — then the two working regions beneath it. */}
      <ChallengeIdentityBanner
        preflight={preflight}
        {...(selectingTeamName ? { selectingTeamName } : {})}
        {...(worldImageUrl ? { worldImageUrl } : {})}
      />

      {/* The explanation at ~70%, joining at the rest. items-start so a short
          brief never stretches to the sidebar's height. */}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,2.6fr)_minmax(16rem,1fr)]">
        <ChallengeExplanation preflight={preflight} launching={launching} />
        {preflight.requiresPhones ? (
          <PairingPanel preflight={preflight} sessionId={sessionId} />
        ) : (
          <aside className="surface-card p-5 text-sm leading-6 text-muted-foreground">
            يُلعب هذا التحدي من الشاشة المشتركة. لا حاجة لجوالات.
          </aside>
        )}
      </div>

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
 * What is about to be played — World, challenge, and the two facts a host needs.
 *
 * Pulled above the working columns so the identity reads once, across the full
 * width, instead of competing with the explanation for the same card. Every
 * field is canonical Match projection data; nothing about a specific mechanic is
 * hardcoded here.
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
  const summary = preflight.playerInstructions?.summary ?? preflight.description;
  return (
    <section
      data-testid="preflight-identity"
      className="surface-card overflow-hidden"
    >
      <div className="grid gap-0 sm:grid-cols-[minmax(0,13rem)_minmax(0,1fr)]">
        <WorldMedia
          name={preflight.worldName ?? "عالم"}
          eyebrow={occurrenceLabel(preflight.occurrenceIndex)}
          variant="strip"
          {...(worldImageUrl ? { imageUrl: worldImageUrl } : {})}
          className="h-20 rounded-none aspect-auto sm:h-full sm:min-h-[6rem]"
        />
        <div className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:p-4">
          <header className="min-w-0 space-y-1">
            <h1 className="text-xl font-black leading-tight text-foreground sm:text-2xl">
              {preflight.challengeName}
            </h1>
            {summary && (
              <p className="line-clamp-2 text-xs leading-5 text-muted-foreground sm:text-sm">
                {summary}
              </p>
            )}
          </header>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {preflight.requiresPhones && (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">
                <Smartphone className="size-3" aria-hidden />
                يحتاج جوالات
              </span>
            )}
            {selectingTeamName && (
              <span
                data-testid="preflight-turn-chip"
                className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-bold text-muted-foreground"
              >
                <Users className="size-3" aria-hidden />
                {selectingTeamName} يبدأ
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * "شرح التحدي" — the left region.
 *
 * An animated demonstration where the mechanic has one, the authored numbered
 * steps everywhere else. The explainer is a presentation-only simulation: it
 * holds no session, sends no command, and cannot touch readiness, Fair-Start or
 * Match state. Canonical `playerInstructions` stay on the projection untouched,
 * so withdrawing a demo loses nothing.
 *
 * `launching` only dims the region — a purely visual handoff while the
 * authoritative stage change does the real work. It never gates the launch.
 */
function ChallengeExplanation({
  preflight,
  launching,
}: {
  preflight: UnifiedPreflight;
  launching: boolean;
}) {
  const animated = preflight.challengeKey === RYO_CHALLENGE_KEY;
  return (
    <section
      data-testid="preflight-explainer"
      data-animated={animated ? "true" : "false"}
      data-launching={launching ? "true" : "false"}
      className={cn(
        "surface-card space-y-2.5 p-3 transition-all duration-base ease-akwaan sm:p-4",
        // The exit half of the handoff: the explanation steps back as the real
        // challenge is being started. Visual only, and never blocking.
        launching && "pointer-events-none translate-y-1 opacity-40",
      )}
    >
      <header className="flex items-start justify-between gap-3">
        <span className="min-w-0 space-y-0.5">
          <h2 className="text-base font-black text-foreground">شرح التحدي</h2>
          <p className="text-xs leading-5 text-muted-foreground">
            اقروا الخطوات قبل ما تبدأون.
          </p>
        </span>
        {/* The demonstration is an answer to a question the host may not have.
            It is offered here and opened on demand, so the default screen stays
            about starting the challenge. */}
        {animated && (
          <RyoExplainerDialog
            mechanicKey={preflight.challengeKey}
            launching={launching}
          />
        )}
      </header>
      {/* Every mechanic now shows the same canonical authored instructions —
          the explainer supplements them, it does not replace them. */}
      <PlayerInstructionsBrief instructions={preflight.playerInstructions} />
      {preflight.playerInstructions?.highlights?.find((item) =>
        item.trim(),
      ) && (
        <p
          data-testid="preflight-highlight"
          className="flex items-start gap-2 rounded-xl border border-brand-gold/25 bg-brand-gold/5 px-3 py-2 text-sm font-bold text-foreground/90"
        >
          <span aria-hidden className="mt-0.5 text-brand-gold">
            ★
          </span>
          {preflight.playerInstructions.highlights.find((item) => item.trim())}
        </p>
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
    <section data-testid="preflight-start-section" className="surface-card p-3">
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
}: {
  preflight: UnifiedPreflight;
  sessionId: string;
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
      // A clipboard-denied browser still shows the code and the URL.
    }
  };

  return (
    <aside className="space-y-3">
      {/* One joining card: the code to scan, then who has actually arrived.
          The readiness roster is no longer its own card — it is the answer to
          the question this card asks — but it is the same authoritative
          `preflight.teams` data and the same roster component as before. */}
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
            <Smartphone className="size-4 text-primary" aria-hidden />
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
              <div className="preflight-secondary-surface flex items-center gap-3 rounded-[var(--radius)] p-2.5">
                <span className="flex shrink-0 flex-col items-center gap-1">
                  <ScannableQr value={joinUrl} size={88} />
                  <span className="text-[0.6rem] font-bold text-muted-foreground">
                    اضغط على الكود عشان تكبّره
                  </span>
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block text-[0.65rem] font-black text-muted-foreground">
                    قولوا للاعبين: ادخلوا الكود
                  </span>
                  <span
                    data-testid="preflight-join-code"
                    className="akwaan-numeral block text-3xl font-black tracking-[0.22em] text-foreground"
                  >
                    {join!.joinCode}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copy()}
                    className="h-8 px-2 text-xs font-black"
                  >
                    <Copy className="size-3.5" aria-hidden />
                    {copied ? "تم النسخ" : "نسخ الرابط"}
                  </Button>
                </span>
              </div>
            )}
          </div>
        )}

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
  const identity = teamIdentity(TEAM_SLOT_ORDER[order % TEAM_SLOT_ORDER.length]);
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
          {Array.from({ length: Math.max(target, team.participants.length) }).map(
            (_, index) => {
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
            },
          )}
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

/**
 * "كيف نلعب؟" — the mechanic's own player-facing explanation.
 *
 * Authored on the ChallengeType and carried verbatim through the Match projection;
 * this component renders it and never invents copy. A mechanic authored before
 * instructions existed simply has none, and gets a short, honest placeholder
 * rather than a blank — the real copy is data the admins fill in, not a string
 * hardcoded here.
 */
function PlayerInstructionsBrief({
  instructions,
}: {
  instructions: UnifiedPreflight["playerInstructions"];
}) {
  const steps = (instructions?.steps ?? []).filter((step) => step.trim());

  if (steps.length === 0) {
    return (
      <p
        data-testid="preflight-instructions-fallback"
        className="rounded-[var(--radius)] bg-muted p-3 text-sm leading-6 text-muted-foreground"
      >
        شرح التحدي بيتضاف قريب. اسألوا المضيف لو تبون تفاصيل أكثر.
      </p>
    );
  }

  return (
    <div
      data-testid="preflight-player-instructions"
      className="space-y-2 text-foreground/85"
    >
      {/* No heading of its own: the card above is already titled «شرح التحدي»
          and the action beside it is «كيف تلعب؟». A third near-identical label
          here read as three competing titles for one region. */}
      <ol className="list-none space-y-2">
        {/* All authored steps, not a forced three — correctness over a fixed count. */}
        {steps.map((step, index) => (
          <li
            key={index}
            className="preflight-secondary-surface flex min-h-11 items-start gap-3 rounded-xl p-2"
          >
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-xs font-black text-primary-foreground">
              {index + 1}
            </span>
            <span className="text-sm leading-6">
              <strong className="block font-black">{stepTitle(step)}</strong>
              {stepSupport(step) && (
                <span className="text-foreground/75">{stepSupport(step)}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Keep authored wording intact while giving long steps a scannable heading. */
function stepTitle(step: string): string {
  return step.split(/[،.!؟]/, 1)[0]?.trim() || step;
}

function stepSupport(step: string): string {
  const title = stepTitle(step);
  return title === step
    ? ""
    : step.slice(title.length).replace(/^[،.!؟\s]+/, "");
}

function blockingSummary(preflight: UnifiedPreflight): string {
  const waiting = preflight.teams.filter((team) => !team.ready);
  if (!waiting.length) return "ننتظر الجاهزية…";
  return `بانتظار ${waiting.map((team) => team.teamName).join(" و")}`;
}
