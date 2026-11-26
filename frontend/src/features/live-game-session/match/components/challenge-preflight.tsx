"use client";

import { ArrowRight, Check, Copy, Crown, X } from "lucide-react";
import { useContext, useEffect, useState } from "react";
import { toast } from "sonner";
import { ScannableQr } from "@/components/akwaan/scannable-qr";
import { STATE_ACTION } from "@/components/akwaan/state-card";
import { STICKER } from "@/components/akwaan/sticker";
import { InlineMechanicTutorial } from "@/features/challenge-explainer/components/inline-mechanic-tutorial";
import { teamNames } from "@/features/challenge-explainer/scene-projection";
import { teamIdentity, TEAM_SLOT_ORDER } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { LiveSessionContext } from "../../hooks/live-session-context";
import type { PreflightTeam, UnifiedPreflight } from "../types";
import { CaptainControl } from "./captain-control";

const pill =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-brand-navy bg-white px-4 py-2 font-bold text-brand-navy transition-transform hover:-translate-y-0.5";

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

  return (
    <section
      dir="rtl"
      className="space-y-3 text-brand-navy"
      data-testid="challenge-preflight"
    >
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-brand-navy px-5 py-2 font-bold text-white">
        <span>{preflight.worldName}</span>
        <span className="text-brand-gold">التحدي القادم</span>
        <h1 className="font-display text-xl">{preflight.challengeName}</h1>
        {starting >= 0 && (
          <span className="ms-auto">يبدأ {teamNames[starting]}</span>
        )}
      </header>

      <InlineMechanicTutorial
        key={sessionId + preflight.positionKey}
        mechanicKey={preflight.challengeKey}
        worldId={preflight.worldId}
        challengeName={preflight.challengeName}
        {...(preflight.description
          ? { description: preflight.description }
          : {})}
        matchId={match?.id}
        repeatEncounter={!!repeat}
        launching={launching}
      />

      <footer className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border-2 border-brand-navy bg-white p-3">
        {preflight.teams.map((team, i) => (
          <button
            type="button"
            key={team.teamId}
            className={pill}
            aria-expanded={openTeamId === team.teamId}
            data-testid={`preflight-team-status-${team.teamId}`}
            onClick={() =>
              setOpenTeamId((current) =>
                current === team.teamId ? null : team.teamId,
              )
            }
          >
            <i
              aria-hidden
              className={`size-3 rounded-full border border-brand-navy ${teamIdentity(TEAM_SLOT_ORDER[i % TEAM_SLOT_ORDER.length]).dot}`}
            />
            {teamNames[i] ?? team.teamName} ·{" "}
            <bdi dir="ltr" className="akwaan-numeral">
              {team.connectedCount}/{team.maximum ?? team.minimum}
            </bdi>
            <span
              className={
                team.ready
                  ? "rounded-full border-2 border-brand-navy bg-brand-mint px-2 text-brand-navy"
                  : ""
              }
            >
              {team.ready ? "✓ جاهز" : "ننتظر اللاعبين"}
            </span>
          </button>
        ))}

        {(preflight.requiresPhones || preflight.join) && (
          <button
            type="button"
            className={pill}
            disabled={!preflight.join}
            aria-expanded={qr}
            onClick={() => setQr(!qr)}
          >
            انضمام
          </button>
        )}

        <button
          type="button"
          aria-busy={launching}
          data-testid="preflight-start"
          className={cn(
            pill,
            "bg-brand-gold shadow-[3px_4px_0_hsl(var(--brand-navy))] disabled:opacity-50 disabled:shadow-none",
          )}
          disabled={!preflight.readyToLaunch || launching || cancelling}
          onClick={onLaunch}
        >
          {launching ? "نبدأ الحين…" : "ابدأ التحدي"}
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
              className={cn(STATE_ACTION.secondary, STICKER.small, "w-full gap-2")}
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
