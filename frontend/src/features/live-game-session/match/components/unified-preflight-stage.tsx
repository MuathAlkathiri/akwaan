"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { teamIdentityOf, type TeamIdentity } from "@/lib/team-identity";
import {
  cancelUnifiedPreflight,
  launchUnifiedChallenge,
} from "@/features/match-setup";
import { usePlayableWorlds } from "@/features/worlds/hooks/use-player-catalog";
import { useLiveSession } from "../../hooks/live-session-context";
import { ChallengePreflight } from "./challenge-preflight";
import { localizeMatchError } from "../errors/match-errors";
import { teamName } from "../presentation";
import type { MatchActor, UnifiedPreflight } from "../types";

/**
 * The preflight stage of a preconfigured Match.
 *
 * Rendered entirely from `snapshot.match.unified.preflight`, which the server keeps,
 * so a refresh lands back here rather than losing the prepared position. Only the
 * controller can start or abandon it; everyone else sees what is being waited on.
 */
export function UnifiedPreflightStage({
  actor,
  participantId,
}: {
  actor: MatchActor;
  /** Present on a phone: whose phone this is, so it can say so. */
  participantId?: string;
}) {
  const { snapshot, resync, setMatchDouble } = useLiveSession();
  // A phone renders this stage too, and it has no user session: fetching the
  // catalog from a participant surface 401s and bounces the player to /login.
  const worlds = usePlayableWorlds(actor === "controller");
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
  const worldImageUrl = worlds.data?.find(
    (world) => world.id === preflight.worldId,
  )?.banner?.url;
  const selectingTeamId =
    preflight.selectingTeamId ?? match.unified?.selectingTeamId;

  if (actor === "participant") {
    // A phone is not a small shared screen. Readiness counters are the host's
    // problem; the player needs to know they are in, which team they are on, and
    // what is about to start.
    const me = snapshot.participants.find(
      (person) => person.id === participantId,
    );
    const myTeam = snapshot.teams.find((team) => team.id === me?.teamId);
    return (
      <ParticipantPreflight
        challengeName={preflight.challengeName}
        readyToLaunch={preflight.readyToLaunch}
        doubleControl={preflight.doubleControl}
        onDoubleChange={setMatchDouble}
        {...(me?.displayName ? { playerName: me.displayName } : {})}
        {...(myTeam
          ? {
              teamName: myTeam.name,
              identity: teamIdentityOf(myTeam.id, snapshot.teams),
            }
          : {})}
      />
    );
  }

  if (actor !== "controller") {
    return <PreflightWaiting preflight={preflight} />;
  }

  return (
    <ChallengePreflight
      preflight={preflight}
      {...(selectingTeamId
        ? { selectingTeamName: teamName(snapshot, selectingTeamId) }
        : {})}
      {...(worldImageUrl ? { worldImageUrl } : {})}
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
      className="surface-card space-y-3 p-6 text-center"
    >
      <h1 className="text-2xl font-black text-foreground sm:text-3xl">
        {preflight.challengeName}
      </h1>
      {preflight.requiresPhones && (
        <p className="text-sm font-bold text-warning">
          هذا التحدي يحتاج جوالات اللاعبين
        </p>
      )}
      <ul className="flex list-none flex-wrap justify-center gap-4">
        {preflight.teams.map((team) => (
          <li
            key={team.teamId}
            className="text-sm font-bold text-muted-foreground"
          >
            {team.teamName}:{" "}
            <span className="akwaan-numeral">
              {team.connectedCount}/{team.maximum ?? team.minimum}
            </span>{" "}
            متصل
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        {preflight.readyToLaunch
          ? "جاهزون. بانتظار المتحكّم لبدء التحدي."
          : "بانتظار انضمام اللاعبين."}
      </p>
    </div>
  );
}

/**
 * What a paired phone shows while the host gathers the room.
 *
 * Its whole job is reassurance: your name, your team's colour, and the challenge
 * you are about to play. A player holding this cannot launch anything and cannot
 * fix a missing teammate, so counting connections at them only invites them to
 * worry about something they have no control over.
 */
function ParticipantPreflight({
  challengeName,
  playerName,
  teamName,
  identity,
  readyToLaunch,
  doubleControl,
  onDoubleChange,
}: {
  challengeName: string;
  playerName?: string;
  teamName?: string;
  identity?: TeamIdentity;
  readyToLaunch: boolean;
  doubleControl?: UnifiedPreflight["doubleControl"];
  onDoubleChange?: (
    armed: boolean,
    assignmentSequence: number,
  ) => Promise<void>;
}) {
  const [changingDouble, setChangingDouble] = useState(false);
  return (
    <section
      dir="rtl"
      data-testid="participant-preflight"
      data-ready={readyToLaunch ? "true" : "false"}
      className="surface-card space-y-5 p-6 text-center"
    >
      <div className="space-y-1">
        <p className="inline-flex items-center gap-1.5 text-sm font-black text-success">
          <CheckCircle2 className="size-4" aria-hidden />
          أنت في المباراة
        </p>
        {playerName && (
          <p className="truncate text-3xl font-black text-foreground">
            {playerName}
          </p>
        )}
      </div>

      {teamName && identity && (
        <p
          data-testid="participant-team-badge"
          className={cn(
            "mx-auto inline-flex items-center gap-2 rounded-full border px-4 py-2 text-base font-black",
            identity.surface,
            identity.border,
            identity.text,
          )}
        >
          <span
            aria-hidden
            className={cn("size-2.5 rounded-full", identity.dot)}
          />
          {teamName}
        </p>
      )}

      <div className="space-y-1 border-t border-border/70 pt-4">
        <p className="text-xs font-black text-muted-foreground">
          التحدي القادم
        </p>
        <p className="text-xl font-black text-foreground">{challengeName}</p>
      </div>

      {doubleControl && (
        <button
          type="button"
          disabled={changingDouble}
          aria-pressed={doubleControl.status === "armed"}
          onClick={() => {
            setChangingDouble(true);
            void onDoubleChange?.(
              doubleControl.status !== "armed",
              doubleControl.assignmentSequence,
            ).finally(() => setChangingDouble(false));
          }}
          className={cn(
            "w-full rounded-2xl border px-4 py-3 text-base font-black transition",
            doubleControl.status === "armed"
              ? "border-warning bg-warning/15 text-foreground"
              : "border-border bg-background text-foreground hover:border-warning/60",
          )}
        >
          {doubleControl.status === "armed"
            ? "تم تفعيل الدبل ×2"
            : "استخدم الدبل ×2"}
        </button>
      )}

      <p className="text-sm font-bold text-muted-foreground">
        {readyToLaunch
          ? "جاهزون — التحدي على وشك أن يبدأ."
          : "بانتظار بقية اللاعبين. أبقِ جوالك مفتوحًا."}
      </p>
    </section>
  );
}
