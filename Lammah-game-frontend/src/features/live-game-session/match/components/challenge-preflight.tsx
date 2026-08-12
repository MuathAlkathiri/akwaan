"use client";

import { useMemo, useState } from "react";
import {
  Check,
  Copy,
  Layers,
  Smartphone,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { WorldMedia } from "@/components/akwaan/world-media";
import { teamIdentity, TEAM_SLOT_ORDER } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { ARABIC_NOUNS, arabicCount, arabicNoun } from "@/lib/arabic-plural";
import { occurrenceLabel } from "@/features/match-setup";
import type { PreflightTeam, UnifiedPreflight } from "../types";

/**
 * The moment between choosing a position and starting it.
 *
 * A launch moment, not a form. The World's own artwork heads the brief so the host
 * can see what is about to be played from across the room; the pairing side answers
 * one question — are the phones here — with a per-team progress bar and the players'
 * own names.
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
  selectingTeamName,
  worldImageUrl,
  launching,
  cancelling,
  error,
  onCancel,
  onLaunch,
}: {
  preflight: UnifiedPreflight;
  selectingTeamName?: string;
  /** The approved World banner, from the catalog the client already reads. */
  worldImageUrl?: string;
  launching: boolean;
  cancelling: boolean;
  error?: string;
  onCancel: () => void;
  onLaunch: () => void;
}) {
  const alreadyPaired = preflight.requiresPhones && preflight.allTeamsReady;

  return (
    <div className="space-y-4" data-testid="challenge-preflight" dir="rtl">
      {/* items-start: a challenge with no description must not stretch its card
          to the height of the pairing panel and read as an empty box. */}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(19rem,0.75fr)]">
        <ChallengeBrief
          preflight={preflight}
          selectingTeamName={selectingTeamName}
          {...(worldImageUrl ? { worldImageUrl } : {})}
          launching={launching}
          cancelling={cancelling}
          onLaunch={onLaunch}
        />
        {preflight.requiresPhones ? (
          <PairingPanel preflight={preflight} collapsed={alreadyPaired} />
        ) : (
          <aside className="surface-card p-5 text-sm leading-6 text-muted-foreground">
            يُلعب هذا التحدي من الشاشة المشتركة. لا حاجة لجوالات.
          </aside>
        )}
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="font-bold">{error}</AlertDescription>
        </Alert>
      )}

      {/* Only the way *out* stays outside the cards. The action that starts this
          challenge now sits inside the challenge's own card — see ChallengeBrief. */}
      <footer className="flex flex-wrap items-center gap-3 px-1 py-2">
        <Button
          type="button"
          variant="outline"
          disabled={launching || cancelling}
          onClick={onCancel}
          className="border-transparent bg-transparent font-black text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
        >
          {cancelling ? "جارٍ الإلغاء…" : "رجوع إلى اللوحة"}
        </Button>
      </footer>
    </div>
  );
}

/**
 * What is about to be played, and the button that plays it.
 *
 * The launch action lives *in* this card rather than floating under the grid: it acts
 * on this challenge, and a primary action orphaned below a card whose other half is
 * empty reads as unfinished layout rather than as the obvious next step.
 */
function ChallengeBrief({
  preflight,
  selectingTeamName,
  worldImageUrl,
  launching,
  cancelling,
  onLaunch,
}: {
  preflight: UnifiedPreflight;
  selectingTeamName?: string;
  worldImageUrl?: string;
  launching: boolean;
  cancelling: boolean;
  onLaunch: () => void;
}) {
  const requirement = preflight.requirement;
  return (
    <section className="surface-card overflow-hidden">
      <WorldMedia
        name={preflight.worldName ?? "عالم"}
        eyebrow={occurrenceLabel(preflight.occurrenceIndex)}
        variant="strip"
        {...(worldImageUrl ? { imageUrl: worldImageUrl } : {})}
        className="rounded-none"
      />
      <div className="space-y-3.5 p-5">
        <header>
          <h1 className="text-2xl font-black text-foreground sm:text-3xl">
            {preflight.challengeName}
          </h1>
          {preflight.description && (
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              {preflight.description}
            </p>
          )}
        </header>

        {preflight.instructions && (
          <p className="rounded-[var(--radius)] bg-muted p-3 text-sm leading-6 text-foreground/85">
            {preflight.instructions}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {requirement && (
            <p
              data-testid="preflight-requirement"
              className="flex items-center gap-2 text-sm font-bold text-foreground/80"
            >
              <Users className="size-4 shrink-0 text-primary" aria-hidden />
              {playerRequirementLabel(requirement)}
            </p>
          )}
          {preflight.requiresPhones && (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">
              <Smartphone className="size-3" aria-hidden />
              يحتاج جوالات
            </span>
          )}
        </div>

        {preflight.selectedScopes.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-black text-muted-foreground">
                <Layers className="size-3.5" aria-hidden />
                نطاقات هذه المحطة
              </p>
              <p className="text-sm font-bold leading-6 text-foreground/75">
                {preflight.selectedScopes
                  .map((scope) => scope.name || scope.scopeId)
                  .join(" · ")}
              </p>
            </div>
          </>
        )}

        {selectingTeamName && (
          <p
            data-testid="preflight-selecting-team"
            className="text-sm font-bold text-muted-foreground"
          >
            دور الاختيار: {selectingTeamName}
          </p>
        )}

        <Separator />

        <div className="flex flex-wrap items-center justify-between gap-3">
          {!preflight.readyToLaunch ? (
            <p className="text-sm font-bold text-muted-foreground">
              {blockingSummary(preflight)}
            </p>
          ) : (
            <span />
          )}
          <Button
            type="button"
            size="lg"
            data-testid="preflight-start"
            disabled={!preflight.readyToLaunch || launching || cancelling}
            onClick={onLaunch}
            className={cn(
              "min-w-48 font-black transition-shadow",
              preflight.readyToLaunch &&
                "shadow-[0_12px_28px_-16px_hsl(var(--primary)/0.65)]",
            )}
          >
            {launching ? "جارٍ البدء…" : "ابدأ التحدي"}
          </Button>
        </div>
      </div>
    </section>
  );
}

/**
 * The QR and the team counters.
 *
 * `collapsed` is the already-paired case: the code is still reachable for a phone
 * that needs to join late, but it stops taking up the screen.
 */
function PairingPanel({
  preflight,
  collapsed,
}: {
  preflight: UnifiedPreflight;
  collapsed: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const join = preflight.join;
  const joinUrl = useMemo(() => {
    if (!join) return undefined;
    // Only the client knows its own public origin, which is what a phone scans.
    const origin =
      typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}${join.joinPath}`;
  }, [join]);
  const showQr = Boolean(join) && (!collapsed || expanded);

  const copy = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // A clipboard-denied browser still shows the code and the URL.
    }
  };

  return (
    <aside className={cn("surface-card space-y-3 p-4", collapsed && !expanded && "bg-card/70")}>
      {collapsed && !expanded ? (
        <div className="flex items-center justify-between gap-3">
          <p
            data-testid="preflight-players-paired"
            className="flex items-center gap-2 text-sm font-black text-success"
          >
            <Check className="size-4 shrink-0" aria-hidden />
            اللاعبون مرتبطون وجاهزون
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setExpanded(true)}
            size="sm"
            className="shrink-0 font-black"
          >
            <UserPlus className="size-4" aria-hidden />
            إضافة لاعب أو إدارة اللاعبين
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-xs font-black text-muted-foreground">
            <Smartphone className="size-3.5" aria-hidden />
            هذا التحدي يحتاج جوالات اللاعبين
          </p>
          {showQr && joinUrl && (
            <div className="flex items-center gap-3 rounded-[var(--radius)] bg-muted/55 p-2.5">
              <span className="rounded-xl border border-border bg-white p-1.5">
                <QRCodeSVG value={joinUrl} size={88} level="M" />
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

      <ul className="list-none space-y-2">
        {preflight.teams.map((team, index) => (
          <li key={team.teamId}>
            <TeamReadinessCard team={team} order={index} />
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * One team's phones, at a glance.
 *
 * Two dimensions, and they are drawn with two different systems on purpose:
 *
 *  - **Which team this is** — the team's own colour, always. The card belonged to this
 *    team before its phones arrived and still will after.
 *  - **Whether they are ready** — a semantic status chip. This used to be carried by
 *    the *presence* of the team colour: a not-ready team was drawn plain and went
 *    coloured once its phones arrived, which made the team's identity flicker on and
 *    off with its readiness and left the host comparing two team colours to find the
 *    blocked side.
 *
 * Now both read at once, and neither borrows the other's meaning. Status is stated in
 * words and with an icon as well as colour, so a host scanning from two metres does
 * not have to resolve a hue to know what is holding the launch up.
 */
function TeamReadinessCard({
  team,
  order,
}: {
  team: PreflightTeam;
  order: number;
}) {
  const identity = teamIdentity(
    TEAM_SLOT_ORDER[order % TEAM_SLOT_ORDER.length],
  );
  const target = team.maximum ?? team.minimum;
  const progress = target
    ? Math.min(100, (team.connectedCount / target) * 100)
    : 0;

  return (
    <div
      data-testid={`preflight-team-${team.teamId}`}
      data-ready={team.ready}
      className={cn(
        "space-y-2 rounded-[var(--radius)] border p-3 transition-colors duration-base ease-akwaan",
        identity.surface,
        identity.border,
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={cn("flex items-center gap-1.5 text-sm font-black", identity.text)}
        >
          <span
            aria-hidden
            className={cn("size-2 shrink-0 rounded-full", identity.dot)}
          />
          {team.teamName}
        </p>
        <p className="akwaan-numeral text-sm font-black text-foreground/80">
          {team.connectedCount}/{target}
        </p>
      </div>

      <Progress
        value={progress}
        aria-label={`${team.teamName}: ${team.connectedCount} من ${target} متصل`}
        className="h-1.5"
      />

      {team.participants.length > 0 && (
        <ul className="list-none space-y-1">
          {team.participants.map((participant) => (
            <li
              key={participant.participantId}
              className={cn(
                "flex min-h-7 items-center gap-1.5 rounded-lg px-1.5 py-1 text-xs font-bold",
                participant.connected
                  ? "bg-card text-foreground/85"
                  : "bg-muted text-disabled-foreground",
              )}
            >
              <Avatar className="size-5">
                <AvatarFallback
                  className={cn(
                    "text-[0.6rem] font-black",
                    participant.connected
                      ? cn(identity.surface, identity.text)
                      : "bg-secondary text-disabled-foreground",
                  )}
                >
                  {participant.displayName.trim().charAt(0) || "؟"}
                </AvatarFallback>
              </Avatar>
              {participant.connected ? (
                <Wifi className="size-3 shrink-0" aria-label="متصل" />
              ) : (
                <WifiOff className="size-3 shrink-0" aria-label="غير متصل" />
              )}
              {participant.displayName}
              <span className="ms-auto text-[0.65rem] font-bold text-muted-foreground">
                {participant.connected ? "متصل" : "غير متصل"}
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* The status, in the status system: green means ready, amber means still
          waiting, and neither is ever this team's colour. */}
      <p
        data-testid={`preflight-team-status-${team.teamId}`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-black",
          team.ready
            ? "border-success/30 bg-success-subtle text-success"
            : "border-warning/30 bg-warning-subtle text-warning",
        )}
      >
        {team.ready ? (
          <Check className="size-3.5 shrink-0" aria-hidden />
        ) : (
          <Smartphone className="size-3.5 shrink-0" aria-hidden />
        )}
        {team.ready
          ? "جاهزون"
          : team.connectedCount < team.minimum
            ? "بانتظار لاعب"
            : "بانتظار اكتمال الجاهزية"}
      </p>
    </div>
  );
}

/** The requirement in words, from the numbers the mechanic declared. */
function playerRequirementLabel(
  requirement: NonNullable<UnifiedPreflight["requirement"]>,
): string {
  const { minParticipantsPerTeam: min, maxParticipantsPerTeam: max } =
    requirement;
  // Arabic does not pluralise the way `{n} {noun}` assumes. "1 لاعبًا" and
  // "2 لاعبين" are both broken to a native reader; one is "لاعب واحد" and the other
  // "لاعبان". The rules live in one utility, never in a template.
  const range =
    max === undefined
      ? `${arabicCount(min, ARABIC_NOUNS.player)} على الأقل`
      : max === min
        ? `${arabicCount(min, ARABIC_NOUNS.player)} بالضبط`
        : `${min} أو ${max} ${arabicNoun(max, ARABIC_NOUNS.player)}`;
  return requirement.requiresBothTeams
    ? `${range} في كل فريق`
    : `${range} في فريق واحد`;
}

function blockingSummary(preflight: UnifiedPreflight): string {
  const waiting = preflight.teams.filter((team) => !team.ready);
  if (!waiting.length) return "بانتظار الجاهزية…";
  return `بانتظار ${waiting.map((team) => team.teamName).join(" و")}`;
}
