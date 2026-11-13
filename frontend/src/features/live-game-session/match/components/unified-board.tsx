"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { AlertTriangle, Layers, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  occurrenceLabel,
  prepareUnifiedChallenge,
} from "@/features/match-setup";
import { usePlayableWorlds } from "@/features/worlds/hooks/use-player-catalog";
import { getMediaUrl } from "@/lib/api/media-url";
import { teamIdentityOf } from "@/lib/team-identity";
import { ARABIC_NOUNS, arabicCount } from "@/lib/arabic-plural";
import { useLiveSession } from "../../hooks/live-session-context";
import {
  ORBIT_CORNERS,
  OrbitChallenge,
} from "./unified-board-orbit-tile";
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
  const activeIdentity = unified.selectingTeamId
    ? teamIdentityOf(
        unified.selectingTeamId,
        standings.map((team) => ({ id: team.teamId })),
      )
    : undefined;
  // The server's own answer to "may the host start anything right now".
  const selectionOpen = match.availableActions.includes(
    "match:launch-challenge",
  );
  const selectingTeamName = unified.selectingTeamId
    ? (standings.find((team) => team.teamId === unified.selectingTeamId)
        ?.name ?? teamName(snapshot, unified.selectingTeamId))
    : undefined;
  return (
    <div className="space-y-4" data-testid="unified-board">
      {/* Whose turn it is, said once and out loud. The board used to whisper
          it with a thin underline under three pictures, which is a lot of
          screen for a fact the room has to act on. */}
      {selectingTeamName && (
        <h1
          data-testid="selecting-team-board"
          className="flex items-center justify-center gap-3 text-center font-display text-2xl font-black"
        >
          <span
            aria-hidden
            className={`size-3 rounded-full ${activeIdentity?.dot ?? "bg-[hsl(var(--brand-navy))]"}`}
          />
          دور {selectingTeamName}، اختاروا تحديكم
        </h1>
      )}
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
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 xl:gap-8">
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
                className="flex flex-col items-center gap-2"
              >
                {/* The World is a planet and its four challenges are in orbit
                    around it. A column of four identical rows said nothing
                    about what a World is; this says it without a word. */}
                <div className="relative mx-auto aspect-square w-full max-w-[26rem]">
                  {/* One thin ring the four challenges actually sit on, and a
                      faint halo just outside the planet. A heavy dashed circle
                      drawn near — but not through — the things it belongs to
                      reads as decoration that slipped. */}
                  <span
                    aria-hidden
                    className="absolute inset-[16%] rounded-full border border-[hsl(var(--brand-gold)/.55)]"
                  />
                  <span
                    aria-hidden
                    className="absolute inset-[22%] rounded-full border border-[hsl(var(--brand-gold)/.18)]"
                  />
                  <span className="absolute top-1/2 left-1/2 size-[52%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 border-[hsl(var(--brand-gold)/.8)] bg-[hsl(var(--brand-gold)/.12)] shadow-[0_10px_30px_-18px_hsl(var(--brand-navy)/.6)]">
                    {/* The planet is the picture alone: its name is printed
                        under the orbit, and printing it twice put a caption
                        across the middle of the artwork. */}
                    {artworkByWorldId.get(occurrence.worldId) ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={getMediaUrl(
                          artworkByWorldId.get(occurrence.worldId)!,
                        )}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <span className="grid size-full place-items-center p-3 text-center font-display text-sm font-black text-[hsl(var(--brand-navy)/.65)]">
                        {occurrence.worldName ?? "عالم"}
                      </span>
                    )}
                  </span>
                  {positions.map((position, index) => {
                    const playable =
                      position.status === "available" &&
                      position.launchability === "launchable";
                    return (
                      <OrbitChallenge
                        key={position.positionKey}
                        position={position}
                        corner={ORBIT_CORNERS[index % ORBIT_CORNERS.length]}
                        // Any available position, from any occurrence, at any time.
                        canSelect={isController && playable && selectionOpen}
                        {...(isController && playable && !selectionOpen
                          ? { blockedReason: "ما تقدرون تختارون تحدي الحين." }
                          : {})}
                        pending={pending === position.positionKey}
                        standings={standings}
                        onSelect={(chosen) => void prepare(chosen)}
                        onResume={() => resync?.()}
                      />
                    );
                  })}
                </div>

                <p className="akwaan-numeral text-xs font-black text-[hsl(var(--brand-navy)/.62)]">
                  {occurrenceLabel(occurrence.occurrenceIndex)} ·{" "}
                  <span dir="ltr" className="inline-block">
                    {done} / {positions.length}
                  </span>
                </p>
                <h2 className="font-display text-center text-2xl font-black">
                  {occurrence.worldName ?? "عالم"}
                </h2>
                <p className="flex items-start justify-center gap-1.5 text-center text-xs font-bold leading-5 text-[hsl(var(--brand-navy)/.6)]">
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
