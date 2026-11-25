"use client";

import { createPortal } from "react-dom";
import { useTurnSlot } from "./turn-slot";
import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  occurrenceLabel,
  prepareUnifiedChallenge,
} from "@/features/match-setup";
import { usePlayableWorlds } from "@/features/worlds/hooks/use-player-catalog";
import { useLiveSession } from "../../hooks/live-session-context";
import { WorldOrbit } from "./world-orbit";
import { localizeMatchError } from "../errors/match-errors";
import { teamName } from "../presentation";
import { teamIdentityOf } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import type {
  MatchActor,
  MatchTeamStanding,
  UnifiedBoardPosition,
} from "../types";

/**
 * The Match board: three World occurrences, four positions each.
 *
 * Designed around the Worlds rather than around a flat grid of twelve. Each
 * occurrence is one column headed by its own artwork, so the host reads "this
 * World, these four challenges" instead of scanning a wall of identical cards.
 * A repeated World still gets its own column and its own artwork — the occurrence
 * label is what distinguishes them, because the two are genuinely separate boards
 * with separate Scopes.
 *
 * The artwork comes from the player World catalog the client already reads, keyed
 * by the `worldId` the board projection carries. Nothing about the Match contract
 * changed to get a picture onto this screen.
 */
export function UnifiedBoard({ actor }: { actor: MatchActor }) {
  const { snapshot, resync } = useLiveSession();
  const [pending, setPending] = useState<string>();
  const [error, setError] = useState<string>();
  // Fixed per chosen position, so a retry of the same click is a replay to the
  // server rather than a second preparation.
  const commandId = useRef<string>();
  // Host surfaces only: a participant has no user session, and a 401 here
  // would bounce the player to /login mid-Match.
  const worlds = usePlayableWorlds(actor !== "participant");

  const artworkByWorldId = useMemo(() => {
    const map = new Map<string, string>();
    for (const world of worlds.data ?? []) {
      const url = world.banner?.url ?? world.icon?.url;
      if (url) map.set(world.id, url);
    }
    return map;
  }, [worlds.data]);

  const match = snapshot?.match;
  const unified = match?.unified;
  const turnSlot = useTurnSlot();

  /**
   * Choosing a tile *prepares* it; it does not start it.
   *
   * That is the fix an earlier phase exists for: a phone-required runtime used to
   * be created here and then fail because the players were not in the room. The
   * server now answers with a preflight, and the router renders it.
   */
  const prepare = useCallback(
    async (position: UnifiedBoardPosition) => {
      if (!snapshot || !match || pending) return;
      setPending(position.positionKey);
      setError(undefined);
      commandId.current ??= crypto.randomUUID();
      try {
        await prepareUnifiedChallenge({
          sessionId: snapshot.sessionId,
          expectedMatchRevision: match.revision,
          occurrenceIndex: position.occurrenceIndex,
          slotKey: position.slotKey,
          ...(unified?.selectingTeamId
            ? { selectingTeamId: unified.selectingTeamId }
            : {}),
          commandId: commandId.current,
        });
        commandId.current = undefined;
        // The snapshot is authoritative: the preflight comes from the server,
        // never from a local guess about what happened.
        resync?.();
      } catch (cause) {
        setError(localizeMatchError(cause).message);
      } finally {
        setPending(undefined);
      }
    },
    [match, pending, resync, snapshot, unified?.selectingTeamId],
  );

  if (!snapshot || !match || !unified) return null;
  const standings: MatchTeamStanding[] =
    match.standings ??
    match.scoring.matchTotals.map((score) => ({
      ...score,
      name: teamName(snapshot, score.teamId),
    }));
  const isController = actor === "controller";
  const board = unified.board;
  // The server's own answer to "may the host start anything right now".
  const selectionOpen = match.availableActions.includes(
    "match:launch-challenge",
  );
  const selectingTeamName = unified.selectingTeamId
    ? (standings.find((team) => team.teamId === unified.selectingTeamId)
        ?.name ?? teamName(snapshot, unified.selectingTeamId))
    : undefined;
  const activeIdentity = unified.selectingTeamId
    ? teamIdentityOf(
        unified.selectingTeamId,
        standings.map((team) => ({ id: team.teamId })),
      )
    : undefined;
  // Whose turn it is, said once and out loud: one gold sticker, with the
  // side's dot. Gold because it is game state; the dot because a team's
  // colour is never more than that.
  const turnSticker = selectingTeamName ? (
    <h1
      data-testid="selecting-team-board"
      className="font-display inline-flex min-h-12 -rotate-1 items-center gap-3 rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-5 text-center text-lg font-extrabold text-[hsl(var(--brand-navy))] shadow-[5px_6px_0_hsl(var(--brand-navy))] sm:min-h-16 sm:px-7 sm:text-2xl xl:text-[30px]"
    >
      <span
        aria-hidden
        className={cn(
          "size-5 shrink-0 rounded-full border-[3px] border-[hsl(var(--brand-navy))]",
          activeIdentity?.dot ?? "bg-[hsl(var(--brand-navy))]",
        )}
      />
      {selectionOpen
        ? `دور ${selectingTeamName}، اختاروا تحديكم`
        : `دور ${selectingTeamName} — ما تقدرون تختارون تحدي الحين`}
    </h1>
  ) : null;

  return (
    <div
      className="flex flex-1 flex-col gap-4 md:min-h-0 md:gap-3"
      data-testid="unified-board"
    >
      {turnSticker &&
        (turnSlot ? (
          createPortal(turnSticker, turnSlot)
        ) : (
          <div className="flex justify-center">{turnSticker}</div>
        ))}
      {/* Read by a screen reader as a fraction; the room reads the pill at the
          foot of the board. */}
      <p data-testid="board-progress" className="sr-only">
        {board.completedPositionCount}/{board.totalPositionCount}
      </p>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="font-bold">{error}</AlertDescription>
        </Alert>
      )}

      {board.positions.length === 0 ? (
        <EmptyBoard onResync={() => resync?.()} />
      ) : (
        <div className="grid gap-10 md:min-h-0 md:flex-1 md:grid-cols-3 md:grid-rows-[minmax(0,1fr)] md:gap-6 xl:gap-10">
          {unified.occurrences.map((occurrence) => {
            // Sorted by slot, not left in whatever order the array arrived in: the
            // three columns showed their four challenges in different orders with no
            // reason a player could see, which reads as a bug. Slot order is the one
            // order the whole product names positions by.
            const positions = board.positions
              .filter(
                (position) =>
                  position.occurrenceIndex === occurrence.occurrenceIndex,
              )
              .slice()
              .sort((left, right) => left.slotKey.localeCompare(right.slotKey));
            const done = positions.filter(
              (position) => position.status === "completed",
            ).length;
            return (
              <section
                key={occurrence.occurrenceIndex}
                aria-label={`${occurrenceLabel(occurrence.occurrenceIndex)} · ${occurrence.worldName ?? ""}`}
                data-testid={`unified-occurrence-${occurrence.occurrenceIndex}`}
                className="flex flex-col md:min-h-0"
              >
                {/* The artwork is the World's name on this screen: printing it
                    underneath as well put a caption under every orbit and made
                    three systems read as three cards. Which station this is,
                    and which World, still has to reach anybody who cannot see
                    the picture — so it is said here and only here. */}
                <span className="sr-only">
                  {occurrenceLabel(occurrence.occurrenceIndex)} ·{" "}
                  {occurrence.worldName ?? "عالم"} · {done} من{" "}
                  {positions.length}
                </span>

                {/* The orbit takes whatever height the screen has left and
                    stays square inside it, so three Worlds, their names and
                    the tally always fit one screen. */}
                <div className="md:grid md:min-h-0 md:flex-1 md:place-items-center md:[container-type:size]">
                  <WorldOrbit
                    seed={occurrence.occurrenceIndex}
                    worldName={occurrence.worldName ?? "عالم"}
                    {...(artworkByWorldId.get(occurrence.worldId)
                      ? { artworkUrl: artworkByWorldId.get(occurrence.worldId) }
                      : {})}
                    positions={positions}
                    // Any available position, from any occurrence, at any time.
                    canSelect={(position) =>
                      isController &&
                      selectionOpen &&
                      position.status === "available" &&
                      position.launchability === "launchable"
                    }
                    blockedReason={(position) =>
                      isController &&
                      !selectionOpen &&
                      position.status === "available" &&
                      position.launchability === "launchable"
                        ? "ما تقدرون تختارون تحدي الحين."
                        : undefined
                    }
                    {...(pending ? { pendingKey: pending } : {})}
                    standings={standings}
                    onSelect={(chosen) => void prepare(chosen)}
                    onResume={() => resync?.()}
                  />
                </div>

                {/* The World's name, then four dashes, one per challenge:
                    gold once it has been played. Who won each one is the dot
                    on its circle above.
                    No `dir` of its own: the page is right-to-left and so is
                    the slot order, so the first dash sits under the first
                    slot's circle instead of mirroring it. */}
                <h2
                  aria-hidden
                  className="font-display mt-1 text-center text-xl font-extrabold text-[hsl(var(--brand-navy))] sm:text-2xl"
                >
                  {occurrence.worldName ?? "عالم"}
                </h2>
                <ol
                  aria-hidden
                  data-testid={`world-tally-${occurrence.occurrenceIndex}`}
                  className="mt-2.5 flex justify-center gap-1.5"
                >
                  {positions.map((position) => (
                    <li
                      key={position.positionKey}
                      className={cn(
                        "h-2.5 w-[34px] rounded-full border-2 border-[hsl(var(--brand-navy))]",
                        position.status === "completed"
                          ? "bg-[hsl(var(--brand-gold))]"
                          : "bg-brand-mist",
                      )}
                    />
                  ))}
                </ol>
              </section>
            );
          })}
        </div>
      )}

      {board.positions.length > 0 && (
        <p
          aria-hidden
          data-testid="board-progress-pill"
          className="mt-auto inline-flex min-h-10 shrink-0 items-center self-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-5 text-[17px] font-bold text-[hsl(var(--brand-navy))]"
        >
          <span className="me-1.5 text-xl font-extrabold">
            {board.completedPositionCount}
          </span>
          من {board.totalPositionCount} مكتملة
        </p>
      )}

      {!isController && board.positions.length > 0 && (
        <p className="surface-card p-4 text-center text-sm text-muted-foreground">
          بانتظار المتحكّم لاختيار التحدي التالي.
        </p>
      )}
    </div>
  );
}

/**
 * A Match whose board came back with no positions at all. Never a normal state —
 * a configured Match has twelve — so it is reported rather than drawn as an empty
 * grid the host might mistake for "nothing left to play".
 */
function EmptyBoard({ onResync }: { onResync: () => void }) {
  return (
    <Alert role="alert" data-testid="board-empty" className="text-center">
      <AlertTriangle className="mx-auto size-7 text-warning" aria-hidden />
      <AlertTitle className="text-base font-black">
        لم تصل أي خانات لهذه المباراة
      </AlertTitle>
      <AlertDescription className="space-y-3">
        <p className="text-sm">
          حدِّث اللوحة؛ إذا استمر الأمر فإعداد هذه المباراة غير مكتمل.
        </p>
        <Button type="button" onClick={onResync} className="font-black">
          <RefreshCw className="size-4" aria-hidden />
          تحديث اللوحة
        </Button>
      </AlertDescription>
    </Alert>
  );
}
