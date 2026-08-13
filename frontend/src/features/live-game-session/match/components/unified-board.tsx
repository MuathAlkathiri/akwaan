"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, Layers, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { occurrenceLabel, prepareUnifiedChallenge } from "@/features/match-setup";
import { usePlayableWorlds } from "@/features/worlds/hooks/use-player-catalog";
import { WorldMedia } from "@/components/akwaan/world-media";
import { ARABIC_NOUNS, arabicCount } from "@/lib/arabic-plural";
import { useLiveSession } from "../../hooks/live-session-context";
import { UnifiedBoardTile } from "./unified-board-tile";
import { localizeMatchError } from "../errors/match-errors";
import { teamName } from "../presentation";
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
    ? (standings.find((team) => team.teamId === unified.selectingTeamId)?.name ??
      teamName(snapshot, unified.selectingTeamId))
    : undefined;
  return (
    <div className="space-y-3" data-testid="unified-board">
      {selectingTeamName && (
        <span data-testid="selecting-team-board" className="sr-only">
          {selectingTeamName} — دوركم الآن لاختيار تحدٍ
        </span>
      )}
      {match.doubles?.length ? (
        <div className="flex flex-wrap justify-end gap-2" data-testid="match-double-tokens">
          {match.doubles.map((token) => (
            <span
              key={token.teamId}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-black text-muted-foreground"
            >
              {teamName(snapshot, token.teamId)} · {token.status === "consumed" ? "الدبل مستخدم" : "الدبل ×2 متاح"}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex justify-end lg:hidden">
        {/* The shell's own progress bar takes over at `lg`, where this became the
            same fraction printed twice on one screen. */}
        <p
          data-testid="board-progress"
          className="akwaan-numeral rounded-[var(--radius)] border border-border bg-card px-3 py-2.5 text-sm font-black text-muted-foreground lg:hidden"
        >
          {board.completedPositionCount}/{board.totalPositionCount}
        </p>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription className="font-bold">{error}</AlertDescription>
        </Alert>
      )}

      {board.positions.length === 0 ? (
        <EmptyBoard onResync={() => resync?.()} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
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
                className="flex flex-col gap-3.5 rounded-[calc(var(--radius)+0.25rem)] border border-border/75 bg-card/55 p-4 shadow-[0_12px_35px_-30px_hsl(var(--foreground)/0.45)]"
              >
                {/* A repeated World gives three columns identical artwork, so the
                    station number is stated outside the picture where nothing can
                    make it ambiguous. The numeral is the distinguishing mark; the
                    artwork is still the personality. */}
                <div className="flex items-center gap-2 px-0.5">
                  <span
                    aria-hidden
                    className="akwaan-numeral grid size-6 shrink-0 place-items-center rounded-full bg-foreground text-xs font-black text-background"
                  >
                    {occurrence.occurrenceIndex + 1}
                  </span>
                  <span className="truncate text-sm font-black text-foreground">
                    {occurrenceLabel(occurrence.occurrenceIndex)}
                  </span>
                </div>

                {/* The World is the hero of its own column. */}
                <WorldMedia
                  name={occurrence.worldName ?? "عالم"}
                  {...(artworkByWorldId.get(occurrence.worldId)
                    ? { imageUrl: artworkByWorldId.get(occurrence.worldId) }
                    : {})}
                  priority={occurrence.occurrenceIndex === 0}
                  variant="strip"
                  className="!aspect-[16/4] rounded-[calc(var(--radius)-0.2rem)]"
                >
                  <span className="akwaan-numeral rounded-full border border-white/25 bg-black/25 px-2 py-1 text-xs font-black text-white backdrop-blur-sm">
                    {done}/{positions.length}
                  </span>
                </WorldMedia>

                <p className="flex items-start gap-1.5 px-0.5 text-xs font-bold leading-5 text-muted-foreground">
                  <Layers className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0">
                    {occurrence.selectedScopes.length
                      ? occurrence.selectedScopes
                          .map((scope) => scope.name || scope.scopeId)
                          .join(" · ")
                      : arabicCount(
                          occurrence.selectedScopeIds.length,
                          ARABIC_NOUNS.scope,
                        )}
                  </span>
                </p>

                <div className="grid gap-2.5">
                  {positions.map((position) => {
                    const playable =
                      position.status === "available" &&
                      position.launchability === "launchable";
                    return (
                      <UnifiedBoardTile
                        key={position.positionKey}
                        position={position}
                        // Any available position, from any occurrence, at any time.
                        canSelect={isController && playable && selectionOpen}
                        {...(isController && playable && !selectionOpen
                          ? { blockedReason: "اختيار التحديات غير متاح الآن." }
                          : {})}
                        pending={pending === position.positionKey}
                        standings={standings}
                        onSelect={(chosen) => void prepare(chosen)}
                        onResume={() => resync?.()}
                      />
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
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
