"use client";

import { useCallback, useRef, useState } from "react";
import {
  cancelUnifiedPreflight,
  launchUnifiedChallenge,
} from "@/features/match-setup";
import { useLiveSession } from "../../hooks/live-session-context";
import { ChallengePreflight } from "./challenge-preflight";
import { localizeMatchError } from "../errors/match-errors";
import { teamName } from "../presentation";
import type { MatchActor } from "../types";

/**
 * The preflight stage of a preconfigured Match.
 *
 * Rendered entirely from `snapshot.match.unified.preflight`, which the server keeps,
 * so a refresh lands back here rather than losing the prepared position. Only the
 * controller can start or abandon it; everyone else sees what is being waited on.
 */
export function UnifiedPreflightStage({ actor }: { actor: MatchActor }) {
  const { snapshot, resync } = useLiveSession();
  const [launching, setLaunching] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string>();
  // One id per attempt, so a retry is a replay rather than a second launch.
  const commandId = useRef<string>();

  const match = snapshot?.match;
  const preflight = match?.unified?.preflight;

  const launch = useCallback(async () => {
    if (!snapshot || !match || !preflight || launching) return;
    setLaunching(true);
    setError(undefined);
    commandId.current ??= crypto.randomUUID();
    try {
      await launchUnifiedChallenge({
        sessionId: snapshot.sessionId,
        expectedMatchRevision: match.revision,
        occurrenceIndex: preflight.occurrenceIndex,
        slotKey: preflight.slotKey,
        ...(match.unified?.selectingTeamId
          ? { selectingTeamId: match.unified.selectingTeamId }
          : {}),
        commandId: commandId.current,
      });
      commandId.current = undefined;
      resync?.();
    } catch (cause) {
      // The server re-checks readiness, so this is where a player who left the
      // room between rendering and clicking is reported.
      setError(localizeMatchError(cause).message);
    } finally {
      setLaunching(false);
    }
  }, [launching, match, preflight, resync, snapshot]);

  const cancel = useCallback(async () => {
    if (!snapshot || !match || cancelling) return;
    setCancelling(true);
    setError(undefined);
    try {
      await cancelUnifiedPreflight({
        sessionId: snapshot.sessionId,
        expectedMatchRevision: match.revision,
      });
      commandId.current = undefined;
      resync?.();
    } catch (cause) {
      setError(localizeMatchError(cause).message);
    } finally {
      setCancelling(false);
    }
  }, [cancelling, match, resync, snapshot]);

  if (!snapshot || !match || !preflight) return null;
  const selectingTeamId =
    preflight.selectingTeamId ?? match.unified?.selectingTeamId;

  if (actor !== "controller") {
    return <PreflightWaiting preflight={preflight} />;
  }

  return (
    <ChallengePreflight
      preflight={preflight}
      {...(selectingTeamId
        ? { selectingTeamName: teamName(snapshot, selectingTeamId) }
        : {})}
      launching={launching}
      cancelling={cancelling}
      {...(error ? { error } : {})}
      onCancel={() => void cancel()}
      onLaunch={() => void launch()}
    />
  );
}

/**
 * What a shared screen shows while the host gathers phones: the challenge and how
 * far the room is from ready, and no controls.
 */
function PreflightWaiting({
  preflight,
}: {
  preflight: NonNullable<
    NonNullable<
      NonNullable<ReturnType<typeof useLiveSession>["snapshot"]>["match"]
    >["unified"]
  >["preflight"];
}) {
  if (!preflight) return null;
  return (
    <div
      dir="rtl"
      data-testid="preflight-waiting"
      className="space-y-3 rounded-2xl border border-black/[0.06] bg-white p-6 text-center"
    >
      <h1 className="text-2xl font-black text-slate-900">
        {preflight.challengeName}
      </h1>
      {preflight.requiresPhones && (
        <p className="text-sm font-bold text-amber-700">
          هذا التحدي يحتاج جوالات اللاعبين
        </p>
      )}
      <ul className="flex list-none flex-wrap justify-center gap-4">
        {preflight.teams.map((team) => (
          <li key={team.teamId} className="text-sm font-bold text-slate-600">
            {team.teamName}: {team.connectedCount}/
            {team.maximum ?? team.minimum} متصل
          </li>
        ))}
      </ul>
      <p className="text-sm text-slate-500">
        {preflight.readyToLaunch
          ? "جاهزون. بانتظار المتحكّم لبدء التحدي."
          : "بانتظار انضمام اللاعبين."}
      </p>
    </div>
  );
}
