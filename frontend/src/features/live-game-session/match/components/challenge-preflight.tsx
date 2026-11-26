"use client";
import { useContext, useState } from "react";
import { ScannableQr } from "@/components/akwaan/scannable-qr";
import { InlineMechanicTutorial } from "@/features/challenge-explainer/components/inline-mechanic-tutorial";
import { teamNames } from "@/features/challenge-explainer/scene-projection";
import { teamIdentity, TEAM_SLOT_ORDER } from "@/lib/team-identity";
import { LiveSessionContext } from "../../hooks/live-session-context";
import type { UnifiedPreflight } from "../types";
import { CaptainControl } from "./captain-control";

const pill =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border-2 border-brand-navy px-4 py-2 font-bold";
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
  const match = useContext(LiveSessionContext)?.snapshot?.match;
  const repeat = match?.unified.board.positions.some(
    (p) =>
      p.challengeKey === preflight.challengeKey && p.status === "completed",
  );
  const [qr, setQr] = useState(false);
  const starting = preflight.teams.findIndex(
    (t) =>
      t.teamId ===
      (preflight.selectingTeamId ?? match?.unified.selectingTeamId),
  );
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
          <span
            key={team.teamId}
            className={pill}
            data-testid={`preflight-team-status-${team.teamId}`}
          >
            <i
              aria-hidden
              className={`size-3 rounded-full border border-brand-navy ${teamIdentity(TEAM_SLOT_ORDER[i]).dot}`}
            />
            {teamNames[i]} ·{" "}
            <bdi dir="ltr" className="akwaan-numeral">
              {team.connectedCount}/{team.maximum ?? team.minimum}
            </bdi>
            <span
              className={
                team.ready
                  ? "rounded-full border-2 border-brand-navy bg-[#5FD6A0] px-2 text-brand-navy"
                  : ""
              }
            >
              {team.ready ? "✓ جاهز" : "ننتظر اللاعبين"}
            </span>
          </span>
        ))}
        {(preflight.requiresPhones || preflight.join) && (
          <button
            className={pill}
            disabled={!preflight.join}
            aria-expanded={qr}
            onClick={() => setQr(!qr)}
          >
            انضمام
          </button>
        )}
        <button
          aria-busy={launching}
          data-testid="preflight-start"
          className={pill + " bg-brand-gold disabled:opacity-50"}
          disabled={!preflight.readyToLaunch || launching || cancelling}
          onClick={onLaunch}
        >
          {launching ? "نبدأ الحين…" : "ابدأ التحدي"}
        </button>
      </footer>
      {qr && preflight.join && (
        <div
          data-testid="preflight-join-qr"
          data-join-code={preflight.join.joinCode}
          className="flex justify-center"
        >
          <ScannableQr
            value={
              new URL(preflight.join.joinPath, window.location.origin).href
            }
            size={160}
          />
        </div>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex items-center justify-between">
        <button disabled={launching || cancelling} onClick={onCancel}>
          ارجع للوحة
        </button>
        {match && preflight.requiresPhones && <CaptainControl compact />}
      </div>
    </section>
  );
}
