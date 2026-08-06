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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { occurrenceLabel } from "@/features/match-setup";
import type { PreflightTeam, UnifiedPreflight } from "../types";

/**
 * The moment between choosing a position and starting it.
 *
 * Right side says what is about to be played; left side is how the phones get here
 * and whether they have. Everything shown is server state — the readiness numbers,
 * the requirement, and `readyToLaunch` all come from the mechanic's own contract, so
 * the button and the server cannot disagree. The check is re-run at launch anyway.
 *
 * When the players are already paired the QR steps back to a secondary affordance:
 * nobody should be made to rescan between challenges.
 */
export function ChallengePreflight({
  preflight,
  selectingTeamName,
  launching,
  cancelling,
  error,
  onCancel,
  onLaunch,
}: {
  preflight: UnifiedPreflight;
  selectingTeamName?: string;
  launching: boolean;
  cancelling: boolean;
  error?: string;
  onCancel: () => void;
  onLaunch: () => void;
}) {
  const alreadyPaired = preflight.requiresPhones && preflight.allTeamsReady;

  return (
    <div className="space-y-4" data-testid="challenge-preflight" dir="rtl">
      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <ChallengeBrief
          preflight={preflight}
          selectingTeamName={selectingTeamName}
        />
        {preflight.requiresPhones ? (
          <PairingPanel preflight={preflight} collapsed={alreadyPaired} />
        ) : (
          <aside className="rounded-2xl border border-black/[0.06] bg-white p-5 text-sm leading-6 text-slate-600">
            يُلعب هذا التحدي من الشاشة المشتركة. لا حاجة لجوالات.
          </aside>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm font-bold text-destructive">
          {error}
        </p>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[0.06] bg-white px-5 py-4">
        <Button
          type="button"
          variant="outline"
          disabled={launching || cancelling}
          onClick={onCancel}
          className="rounded-xl font-black"
        >
          {cancelling ? "جارٍ الإلغاء…" : "رجوع إلى اللوحة"}
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          {!preflight.readyToLaunch && (
            <p className="text-sm font-bold text-slate-500">
              {blockingSummary(preflight)}
            </p>
          )}
          <Button
            type="button"
            size="lg"
            data-testid="preflight-start"
            disabled={!preflight.readyToLaunch || launching || cancelling}
            onClick={onLaunch}
            className="min-w-40 rounded-xl font-black"
          >
            {launching ? "جارٍ البدء…" : "ابدأ التحدي"}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function ChallengeBrief({
  preflight,
  selectingTeamName,
}: {
  preflight: UnifiedPreflight;
  selectingTeamName?: string;
}) {
  const requirement = preflight.requirement;
  return (
    <section className="space-y-4 rounded-2xl border border-black/[0.06] bg-white p-5">
      <header>
        <p className="text-sm font-black text-primary">
          {occurrenceLabel(preflight.occurrenceIndex)}
          {preflight.worldName ? ` · ${preflight.worldName}` : ""}
        </p>
        <h1 className="mt-1 text-2xl font-black text-slate-900">
          {preflight.challengeName}
        </h1>
      </header>

      {preflight.description && (
        <p className="text-sm leading-6 text-slate-600">
          {preflight.description}
        </p>
      )}
      {preflight.instructions && (
        <p className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-700">
          {preflight.instructions}
        </p>
      )}

      {requirement && (
        <p
          data-testid="preflight-requirement"
          className="flex items-center gap-2 text-sm font-bold text-slate-700"
        >
          <Users className="size-4 shrink-0 text-primary" aria-hidden />
          {playerRequirementLabel(requirement)}
        </p>
      )}

      {preflight.selectedScopes.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-black text-slate-500">
            <Layers className="size-3.5" aria-hidden />
            نطاقات هذه المحطة
          </p>
          <ul className="flex list-none flex-wrap gap-1.5">
            {preflight.selectedScopes.map((scope) => (
              <li
                key={scope.scopeId}
                className="rounded-lg border border-primary/15 bg-primary/[0.06] px-2 py-1 text-xs font-bold text-primary"
              >
                {scope.name || scope.scopeId}
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectingTeamName && (
        <p
          data-testid="preflight-selecting-team"
          className="text-sm font-bold text-slate-600"
        >
          دور الاختيار: {selectingTeamName}
        </p>
      )}
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
    <aside className="space-y-3 rounded-2xl border border-black/[0.06] bg-white p-5">
      {collapsed && !expanded ? (
        <div className="space-y-2">
          <p
            data-testid="preflight-players-paired"
            className="flex items-center gap-2 text-sm font-black text-[#15803D]"
          >
            <Check className="size-4 shrink-0" aria-hidden />
            اللاعبون مرتبطون وجاهزون
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setExpanded(true)}
            className="w-full rounded-xl font-black"
          >
            <UserPlus className="ml-1.5 size-4" aria-hidden />
            إضافة لاعب أو إدارة اللاعبين
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-xs font-black text-slate-500">
            <Smartphone className="size-3.5" aria-hidden />
            هذا التحدي يحتاج جوالات اللاعبين
          </p>
          {showQr && joinUrl && (
            <div className="flex items-center gap-3">
              <span className="rounded-xl border border-black/[0.06] bg-white p-2">
                <QRCodeSVG value={joinUrl} size={104} level="M" />
              </span>
              <span className="min-w-0 flex-1 space-y-1.5">
                <span
                  data-testid="preflight-join-code"
                  className="block text-2xl font-black tracking-[0.2em] text-slate-900"
                >
                  {join!.joinCode}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {joinUrl}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copy()}
                  className="h-8 rounded-lg px-2 text-xs font-black"
                >
                  <Copy className="ml-1 size-3.5" aria-hidden />
                  {copied ? "تم النسخ" : "نسخ الرابط"}
                </Button>
              </span>
            </div>
          )}
        </div>
      )}

      <ul className="list-none space-y-2">
        {preflight.teams.map((team) => (
          <li key={team.teamId}>
            <TeamReadinessCard team={team} />
          </li>
        ))}
      </ul>
    </aside>
  );
}

function TeamReadinessCard({ team }: { team: PreflightTeam }) {
  return (
    <div
      data-testid={`preflight-team-${team.teamId}`}
      data-ready={team.ready}
      className={cn(
        "rounded-xl border p-3",
        team.ready
          ? "border-[#22C55E]/30 bg-[#22C55E]/[0.07]"
          : "border-amber-300 bg-amber-50",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-black text-slate-900">{team.teamName}</p>
        <p className="text-sm font-black tabular-nums text-slate-700">
          {team.connectedCount}/{team.maximum ?? team.minimum} متصل
        </p>
      </div>
      {team.participants.length > 0 && (
        <ul className="mt-2 flex list-none flex-wrap gap-1.5">
          {team.participants.map((participant) => (
            <li
              key={participant.participantId}
              className={cn(
                "inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-bold",
                participant.connected
                  ? "bg-white text-slate-700"
                  : "bg-slate-100 text-slate-400",
              )}
            >
              {participant.connected ? (
                <Wifi className="size-3" aria-label="متصل" />
              ) : (
                <WifiOff className="size-3" aria-label="غير متصل" />
              )}
              {participant.displayName}
            </li>
          ))}
        </ul>
      )}
      {!team.ready && (
        <Badge variant="outline" className="mt-2">
          {team.connectedCount < team.minimum
            ? `يحتاج ${team.minimum - team.connectedCount} لاعبًا إضافيًا`
            : `يحتاج ${team.connectedCount - (team.maximum ?? team.connectedCount)} لاعبًا أقل`}
        </Badge>
      )}
    </div>
  );
}

/** The requirement in words, from the numbers the mechanic declared. */
function playerRequirementLabel(
  requirement: NonNullable<UnifiedPreflight["requirement"]>,
): string {
  const { minParticipantsPerTeam: min, maxParticipantsPerTeam: max } =
    requirement;
  const range =
    max === undefined
      ? `${min} لاعبًا على الأقل`
      : max === min
        ? `${min} لاعبين بالضبط`
        : `${min} أو ${max} لاعبين`;
  return requirement.requiresBothTeams
    ? `${range} في كل فريق`
    : `${range} في فريق واحد`;
}

function blockingSummary(preflight: UnifiedPreflight): string {
  const waiting = preflight.teams.filter((team) => !team.ready);
  if (!waiting.length) return "بانتظار الجاهزية…";
  return `بانتظار ${waiting.map((team) => team.teamName).join(" و")}`;
}
