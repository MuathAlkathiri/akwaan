"use client";

import {
  ArrowRight,
  Check,
  ChevronUp,
  Copy,
  Crown,
  QrCode,
  X,
} from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { ScannableQr } from "@/components/akwaan/scannable-qr";
import { getMediaUrl } from "@/lib/api/media-url";
import { STATE_ACTION } from "@/components/akwaan/state-card";
import { STICKER } from "@/components/akwaan/sticker";
import { InlineMechanicTutorial } from "@/features/challenge-explainer/components/inline-mechanic-tutorial";
import { teamNames } from "@/features/challenge-explainer/scene-projection";
import { teamIdentity, TEAM_SLOT_ORDER } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { LiveSessionContext } from "../../hooks/live-session-context";
import type { PreflightTeam, UnifiedPreflight } from "../types";
import { CaptainControl } from "./captain-control";

interface TeamPanelPlayer {
  id: string;
  displayName: string;
  connected: boolean;
  ready: boolean;
  isCaptain: boolean;
}

export function ChallengePreflight({
  preflight,
  sessionId,
  worldImageUrl,
  launching,
  cancelling,
  onCancel,
  onLaunch,
  error,
}: {
  preflight: UnifiedPreflight;
  sessionId: string;
  selectingTeamName?: string;
  worldImageUrl?: string;
  launching: boolean;
  cancelling: boolean;
  onCancel: () => void;
  onLaunch: () => void;
  error?: string;
}) {
  const snapshot = useContext(LiveSessionContext)?.snapshot;
  const match = snapshot?.match;
  const repeat = match?.unified.board.positions.some(
    (p) =>
      p.challengeKey === preflight.challengeKey && p.status === "completed",
  );
  const [qr, setQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);

  const starting = preflight.teams.findIndex(
    (t) =>
      t.teamId ===
      (preflight.selectingTeamId ?? match?.unified.selectingTeamId),
  );

  const openTeamIndex = openTeamId
    ? preflight.teams.findIndex((team) => team.teamId === openTeamId)
    : -1;
  const openTeam: PreflightTeam | undefined =
    openTeamIndex >= 0 ? preflight.teams[openTeamIndex] : undefined;

  useEffect(() => {
    if (!openTeamId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenTeamId(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openTeamId]);

  const joinUrl =
    preflight.join && typeof window !== "undefined"
      ? new URL(preflight.join.joinPath, window.location.origin).href
      : preflight.join?.joinPath;

  const copyJoinLink = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard?.writeText(joinUrl);
      setCopied(true);
      toast.success("تم نسخ الرابط");
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* The room code stays visible if clipboard access is blocked. */
    }
  };

  const resolvePlayers = (team: PreflightTeam): TeamPanelPlayer[] => {
    const captainId = snapshot?.teams.find(
      (entry) => entry.id === team.teamId,
    )?.captainParticipantId;
    const byId = new Map<string, TeamPanelPlayer>();

    for (const participant of snapshot?.participants ?? []) {
      if (
        participant.teamId !== team.teamId ||
        participant.role !== "team-player" ||
        participant.presence === "removed"
      ) {
        continue;
      }
      const connected =
        participant.connected && participant.presence === "connected";
      byId.set(participant.id, {
        id: participant.id,
        displayName: participant.displayName,
        connected,
        ready: connected && participant.ready,
        isCaptain: Boolean(captainId && captainId === participant.id),
      });
    }

    for (const participant of team.participants) {
      const existing = byId.get(participant.participantId);
      if (existing) {
        existing.connected = existing.connected && participant.connected;
        existing.ready = existing.ready && participant.connected;
        continue;
      }
      byId.set(participant.participantId, {
        id: participant.participantId,
        displayName: participant.displayName,
        connected: participant.connected,
        ready: participant.connected,
        isCaptain: Boolean(
          captainId && captainId === participant.participantId,
        ),
      });
    }

    return Array.from(byId.values());
  };

  const openPlayers = openTeam ? resolvePlayers(openTeam) : [];
  const bannerUrl = worldImageUrl ? getMediaUrl(worldImageUrl) : undefined;
  // Named on the start button, so the host knows who the room is waiting for.
  const pending = preflight.teams
    .map((team, index) => ({ team, name: teamNames[index] ?? team.teamName }))
    .filter((entry) => !entry.team.ready);
  const waitingFor = preflight.readyToLaunch
    ? undefined
    : pending.length === 1
      ? pending[0]!.name
      : "اللاعبين";

  return (
    <section
      dir="rtl"
      className="flex flex-col gap-[18px] text-brand-navy"
      data-testid="challenge-preflight"
    >
      {/* The approved band: the World's picture on one side, who is up next on
          the other, and the challenge's name in the middle of it all. */}
      <header
        data-testid="preflight-band"
        className="relative h-[92px] flex-none overflow-hidden rounded-[22px] border-[3px] border-brand-navy bg-brand-navy text-white shadow-[6px_7px_0_hsl(var(--brand-gold))]"
      >
        {bannerUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bannerUrl}
            alt=""
            className="absolute inset-y-0 right-0 h-full w-1/2 object-cover"
          />
        )}
        <span
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(90deg,hsl(var(--brand-navy))_0%,hsl(var(--brand-navy))_50%,hsl(var(--brand-navy)/0.5)_72%,hsl(var(--brand-navy)/0.15)_100%)]"
        />
        <div className="absolute inset-0 flex items-center justify-between gap-6 px-8">
          <span className="font-display text-[22px] font-extrabold [text-shadow:0_2px_0_hsl(var(--brand-navy))]">
            {preflight.worldName}
          </span>
          <div className="flex items-center gap-[18px]">
            {starting >= 0 && (
              <span className="inline-flex min-h-[34px] items-center gap-2 rounded-full bg-white px-3.5 text-[15px] font-bold text-brand-navy">
                <i
                  aria-hidden
                  className={cn(
                    "size-3 shrink-0 rounded-full border-2 border-brand-navy",
                    teamIdentity(
                      TEAM_SLOT_ORDER[starting % TEAM_SLOT_ORDER.length],
                    ).dot,
                  )}
                />
                {teamNames[starting]} يبدأ
              </span>
            )}
            <div className="flex flex-col items-start">
              <span className="text-sm font-bold text-brand-gold">
                التحدي القادم
              </span>
              <h1 className="font-display text-4xl font-black leading-[1.25]">
                {preflight.challengeName}
              </h1>
            </div>
          </div>
        </div>
      </header>

      <InlineMechanicTutorial
        key={sessionId + preflight.positionKey}
        mechanicKey={preflight.challengeKey}
        worldId={preflight.worldId}
        worldName={preflight.worldName}
        occurrenceIndex={preflight.occurrenceIndex}
        challengeName={preflight.challengeName}
        {...(preflight.description
          ? { description: preflight.description }
          : {})}
        matchId={match?.id}
        repeatEncounter={!!repeat}
        launching={launching}
      />

      {/* The approved bottom bar: a pill per team, the join code, and the one
          button that starts the challenge. */}
      <footer
        data-testid="preflight-bottom-bar"
        className="flex flex-none flex-wrap items-center gap-3.5"
      >
        {preflight.teams.map((team, i) => {
          const players = resolvePlayers(team);
          const slots = Math.max(
            team.maximum ?? team.minimum,
            players.length,
            1,
          );
          const readyCount = players.filter((player) => player.ready).length;
          const missing = Math.max(
            0,
            Math.max(team.minimum, players.length) - readyCount,
          );
          return (
            <button
              type="button"
              key={team.teamId}
              aria-label={`تفاصيل ${teamNames[i] ?? team.teamName}`}
              aria-expanded={openTeamId === team.teamId}
              data-testid={`preflight-team-status-${team.teamId}`}
              onClick={() =>
                setOpenTeamId((current) =>
                  current === team.teamId ? null : team.teamId,
                )
              }
              className="inline-flex min-h-[60px] items-center gap-3 rounded-full border-[3px] border-brand-navy bg-white px-[18px] text-brand-navy shadow-[3px_4px_0_hsl(var(--brand-navy))] transition-transform hover:-translate-y-0.5"
            >
              <i
                aria-hidden
                className={cn(
                  "size-3.5 shrink-0 rounded-full border-2 border-brand-navy",
                  teamIdentity(TEAM_SLOT_ORDER[i % TEAM_SLOT_ORDER.length]).dot,
                )}
              />
              <span className="font-display text-[17px] font-extrabold">
                {teamNames[i] ?? team.teamName}
              </span>
              <span aria-hidden className="inline-flex">
                {Array.from({ length: slots }).map((_, slot) => (
                  <span
                    key={slot}
                    className={cn(
                      "size-[30px] shrink-0 rounded-full border-2 border-brand-navy",
                      slot > 0 && "-ms-2",
                      slot < team.connectedCount
                        ? "bg-[#E3DAF6]"
                        : "border-dashed border-brand-dash bg-white",
                    )}
                  />
                ))}
              </span>
              <bdi dir="ltr" className="akwaan-numeral text-[15px] font-bold">
                {team.connectedCount} / {slots}
              </bdi>
              <span
                className={cn(
                  "inline-flex min-h-[30px] items-center rounded-full border-2 border-brand-navy px-3 text-sm font-bold",
                  team.ready ? "bg-brand-mint" : "bg-brand-gold",
                )}
              >
                {team.ready ? (
                  "الكل جاهز"
                ) : missing === 1 ? (
                  "باقي لاعب واحد"
                ) : missing === 2 ? (
                  "باقي لاعبين"
                ) : missing > 2 ? (
                  <>
                    باقي{" "}
                    <bdi dir="ltr" className="akwaan-numeral">
                      {missing}
                    </bdi>{" "}
                    لاعبين
                  </>
                ) : (
                  "ننتظر اللاعبين"
                )}
              </span>
              <ChevronUp className="size-4" aria-hidden />
            </button>
          );
        })}

        {(preflight.requiresPhones || preflight.join) && (
          <button
            type="button"
            className="inline-flex min-h-[60px] items-center gap-2.5 rounded-full border-[3px] border-brand-navy bg-brand-lavender px-[18px] text-[15px] font-bold text-brand-navy shadow-[3px_4px_0_hsl(var(--brand-navy))] transition-transform hover:-translate-y-0.5 disabled:opacity-50"
            disabled={!preflight.join}
            aria-expanded={qr}
            onClick={() => setQr(!qr)}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg border-[3px] border-brand-navy bg-white">
              <QrCode className="size-[22px]" aria-hidden />
            </span>
            انضمام
          </button>
        )}

        <button
          type="button"
          aria-busy={launching}
          data-testid="preflight-start"
          className={cn(
            "ms-auto inline-flex min-h-[68px] items-center gap-3 rounded-full border-[3px] px-8",
            preflight.readyToLaunch && !launching && !cancelling
              ? "border-brand-navy bg-brand-gold text-brand-navy shadow-[5px_6px_0_hsl(var(--brand-navy))] transition-transform hover:-translate-y-0.5"
              : "border-brand-dash bg-brand-mist text-brand-plum",
          )}
          disabled={!preflight.readyToLaunch || launching || cancelling}
          onClick={onLaunch}
        >
          <span className="font-display text-[22px] font-extrabold">
            {launching ? "نبدأ الحين…" : "ابدأ التحدي"}
          </span>
          {!launching && waitingFor && (
            <span className="text-sm font-semibold">بانتظار {waitingFor}</span>
          )}
        </button>
      </footer>

      {qr && preflight.join && joinUrl && (
        <div className="flex justify-center py-1">
          <div
            data-testid="preflight-join-qr"
            data-join-code={preflight.join.joinCode}
            className={cn(
              "flex w-full max-w-sm flex-col items-center gap-4 rounded-[24px] bg-brand-paper p-5 text-center",
              STICKER.base,
            )}
          >
            <div className="flex w-full items-center justify-between">
              <h2 className="font-display text-lg font-extrabold">
                انضموا من الجوال
              </h2>
              <button
                type="button"
                aria-label="إغلاق بطاقة الانضمام"
                onClick={() => setQr(false)}
                className="grid size-9 place-items-center rounded-full border-2 border-brand-navy bg-white"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <ScannableQr value={joinUrl} size={172} />

            <div className="flex flex-col items-center gap-1">
              <span className="text-xs font-bold text-brand-slate">
                كود الغرفة
              </span>
              <bdi
                dir="ltr"
                data-testid="preflight-join-code"
                className="akwaan-numeral rounded-xl border-2 border-brand-navy bg-brand-lavender px-4 py-1.5 font-mono text-2xl font-black tracking-[0.2em] text-brand-navy"
              >
                {preflight.join.joinCode}
              </bdi>
            </div>

            <button
              type="button"
              onClick={() => void copyJoinLink()}
              className={cn(
                STATE_ACTION.secondary,
                STICKER.small,
                "w-full gap-2",
              )}
            >
              {copied ? (
                <>
                  <Check className="size-4" aria-hidden />
                  تم نسخ الرابط
                </>
              ) : (
                <>
                  <Copy className="size-4" aria-hidden />
                  نسخ الرابط
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="rounded-2xl border-2 border-brand-navy bg-brand-coral px-4 py-3 text-center font-bold text-brand-navy"
        >
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <button
          type="button"
          disabled={launching || cancelling}
          onClick={onCancel}
          data-testid="preflight-back-to-board"
          className={cn(
            STATE_ACTION.secondary,
            STICKER.small,
            "gap-2 disabled:opacity-50",
          )}
        >
          <ArrowRight className="size-4" aria-hidden />
          {cancelling ? "نرجع للوحة…" : "ارجع للوحة"}
        </button>
        {match && preflight.requiresPhones && <CaptainControl compact />}
      </div>

      {openTeam && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[hsl(var(--brand-navy)/0.35)]"
          onClick={() => setOpenTeamId(null)}
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={`لاعبو ${teamNames[openTeamIndex] ?? openTeam.teamName}`}
            data-testid="preflight-team-panel"
            dir="rtl"
            className="flex h-full w-full max-w-sm flex-col gap-4 border-s-[3px] border-brand-navy bg-brand-paper p-5 text-brand-navy shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b-2 border-brand-navy/15 pb-3">
              <div className="flex items-center gap-2">
                <i
                  aria-hidden
                  className={`size-3.5 rounded-full border border-brand-navy ${teamIdentity(TEAM_SLOT_ORDER[openTeamIndex % TEAM_SLOT_ORDER.length]).dot}`}
                />
                <h2 className="font-display text-xl font-extrabold">
                  {teamNames[openTeamIndex] ?? openTeam.teamName}
                </h2>
                <span className="rounded-full border-2 border-brand-navy bg-white px-2.5 py-0.5 text-xs font-bold">
                  <bdi dir="ltr" className="akwaan-numeral">
                    {openTeam.connectedCount}/
                    {openTeam.maximum ?? openTeam.minimum}
                  </bdi>
                </span>
              </div>
              <button
                type="button"
                aria-label="إغلاق"
                onClick={() => setOpenTeamId(null)}
                className="grid size-9 place-items-center rounded-full border-2 border-brand-navy bg-white"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {openPlayers.length === 0 ? (
              <p className="rounded-2xl border-2 border-dashed border-brand-dash bg-white p-4 text-center text-sm font-bold text-brand-slate">
                ما انضم أحد لهالفريق للحين.
              </p>
            ) : (
              <ul className="flex flex-col gap-2.5 overflow-y-auto">
                {openPlayers.map((player) => (
                  <li
                    key={player.id}
                    data-testid={`preflight-player-${player.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border-2 border-brand-navy bg-white px-3.5 py-3"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="truncate font-bold">
                        <bdi>{player.displayName}</bdi>
                      </span>
                      {player.isCaptain && (
                        <span className="inline-flex items-center gap-1 rounded-full border-2 border-brand-navy bg-brand-gold px-2.5 py-0.5 text-xs font-extrabold text-brand-navy">
                          <Crown className="size-3.5" aria-hidden />
                          قائد الفريق
                        </span>
                      )}
                    </div>
                    <span
                      className={cn(
                        "rounded-full border-2 border-brand-navy px-2.5 py-0.5 text-xs font-extrabold text-brand-navy",
                        player.ready ? "bg-brand-mint" : "bg-brand-coral",
                      )}
                    >
                      {player.ready
                        ? "جاهز"
                        : !player.connected
                          ? "غير متصل"
                          : "مو جاهز"}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-auto rounded-2xl border-2 border-brand-navy bg-brand-lavender p-3.5 text-sm font-bold leading-relaxed text-brand-navy">
              التحدي يبدأ بالضغط على «ابدأ التحدي» من الشاشة الرئيسية، مو من
              الجوال.
            </p>
          </aside>
        </div>
      )}
    </section>
  );
}
