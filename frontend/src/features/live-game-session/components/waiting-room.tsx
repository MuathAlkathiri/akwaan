"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Shuffle, UserMinus } from "lucide-react";
import { ConfirmationDialog } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { ScannableQr } from "@/components/akwaan/scannable-qr";
import { teamIdentities } from "@/lib/team-identity";
import { planSplit } from "../plan-split";
import {
  assignParticipantTeam,
  createJoinAccess,
  getJoinAccess,
  removeLiveParticipant,
} from "../api/live-session-api";
import {
  useLiveSession,
  useLiveSessionCommands,
} from "../hooks/live-session-context";
import { PlayerCharacterIcon } from "./player-characters";

/**
 * The room everybody sits in before the first challenge.
 *
 * It replaces team creation rather than dressing it up: the two teams already
 * exist and are named by their colour, so nobody builds anything here. A player
 * arrives from the QR, lands on a side, and the host's only jobs are moving
 * somebody across and saying go.
 *
 * Starting is never blocked here, even with a side empty — the QR stays up on the
 * challenge screen, so a latecomer joins mid-game. What a missing team blocks is
 * the challenge's own start button, which is where the block belongs.
 */
/**
 * What the room asks for when it issues its own join code.
 *
 * Matches the host panel's long-standing defaults so a code made here behaves
 * exactly like one made there: players pick their own side, and the code
 * outlives a long match.
 */
const JOIN_ACCESS_DEFAULTS = {
  assignmentPolicy: "explicit" as const,
  maximumParticipantCount: 24,
  teamCapacity: 12,
  expiresInMinutes: 120,
};

export function WaitingRoom() {
  const { snapshot, connection } = useLiveSession();
  const command = useLiveSessionCommands();
  const [splitting, setSplitting] = useState(false);
  const [failed, setFailed] = useState(false);

  const queryClient = useQueryClient();
  const access = useQuery({
    queryKey: ["live-game-session", snapshot?.sessionId, "join-access"],
    queryFn: () => getJoinAccess(snapshot!.sessionId),
    enabled: Boolean(snapshot?.sessionId),
    retry: false,
  });
  // A room with no way into it is not a room.
  //
  // Join access is a separate record from the session, and nothing in the
  // unified setup flow issues one, so the server answers this query with
  // nothing and the QR never appears — which is the whole point of this
  // screen. Rather than make every caller remember, the room issues its own
  // code the first time it finds none, once per mount, and only the
  // controller can: the endpoint refuses anybody else.
  const issuing = useRef(false);
  const issue = useMutation({
    mutationFn: () => createJoinAccess(snapshot!.sessionId, JOIN_ACCESS_DEFAULTS),
    onSuccess: (created) => {
      queryClient.setQueryData(
        ["live-game-session", snapshot!.sessionId, "join-access"],
        created,
      );
    },
    onError: () => setFailed(true),
  });
  useEffect(() => {
    if (!snapshot?.sessionId || !access.isFetched || issuing.current) return;
    if (access.data?.enabled) return;
    issuing.current = true;
    issue.mutate();
  }, [access.data?.enabled, access.isFetched, issue, snapshot?.sessionId]);
  const joinUrl =
    typeof window === "undefined" || !access.data?.enabled
      ? undefined
      : `${window.location.origin}/join/live-session/${access.data.joinCode}`;

  const move = useMutation({
    mutationFn: (input: { participantId: string; teamId: string }) =>
      assignParticipantTeam(
        snapshot!.sessionId,
        input.participantId,
        input.teamId,
        snapshot!.revision,
      ),
    onError: () => setFailed(true),
  });
  const remove = useMutation({
    mutationFn: (participantId: string) =>
      removeLiveParticipant(
        snapshot!.sessionId,
        participantId,
        snapshot!.revision,
      ),
    onError: () => setFailed(true),
  });

  const teams = useMemo(
    () => teamIdentities((snapshot?.teams ?? []).filter((team) => team.active)),
    [snapshot?.teams],
  );
  const players = useMemo(
    () =>
      (snapshot?.participants ?? []).filter(
        (person) => person.role !== "controller",
      ),
    [snapshot?.participants],
  );
  if (!snapshot || teams.length < 2) return null;

  const [first, second] = teams;
  const sideOf = (teamId: string) =>
    players.filter((person) => person.teamId === teamId);
  const unplaced = players.filter(
    (person) => !teams.some((team) => team.id === person.teamId),
  );
  const otherSide = (teamId: string) =>
    teamId === first.id ? second.id : first.id;
  const busy = connection !== "connected" || move.isPending || splitting;

  /**
   * Hands out the players so the two sides come out even.
   *
   * The moves go one at a time because every one of them bumps the session's
   * revision, and each call answers with the revision the next one has to send.
   * Firing them together would make all but the first stale.
   */
  const splitThem = async () => {
    setSplitting(true);
    setFailed(false);
    const moves = planSplit({
      firstSide: sideOf(first.id).map((person) => person.id),
      secondSide: sideOf(second.id).map((person) => person.id),
      unplaced: unplaced.map((person) => person.id),
      firstTeamId: first.id,
      secondTeamId: second.id,
    });
    let revision = snapshot.revision;
    try {
      for (const next of moves) {
        const updated = await assignParticipantTeam(
          snapshot.sessionId,
          next.participantId,
          next.teamId,
          revision,
        );
        revision = updated.revision;
      }
    } catch {
      setFailed(true);
    } finally {
      setSplitting(false);
    }
  };

  // `begin` is the room's own start: it does not ask whether every side has a
  // ready player, because nobody presses ready any more. `start` is the fallback
  // for a session already carried to `ready` by the older flow.
  const startAction = ["begin", "start"].find((action) =>
    snapshot.availableActions.includes(action),
  );
  const everyoneIsHere =
    unplaced.length === 0 &&
    sideOf(first.id).length > 0 &&
    sideOf(second.id).length > 0;

  return (
    <section dir="rtl" data-testid="waiting-room" className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black">يلا نجمع الفريقين</h1>
          <p className="text-muted-foreground mt-1 text-base">
            {players.length === 0
              ? "صوّروا الكود بجوالاتكم وانضموا"
              : `معنا ${players.length} ${players.length === 1 ? "لاعب" : "لاعبين"} — واللي باقي يصوّر الكود`}
          </p>
        </div>
        {joinUrl && (
          // This is read from across a room, off a television, by someone
          // holding a phone: it is the one thing on the screen that has a job
          // to do, so it is not a corner badge.
          <div className="border-border bg-card flex items-center gap-5 rounded-[var(--radius)] border-2 p-4">
            <ScannableQr value={joinUrl} size={132} />
            <div className="text-end">
              <p className="text-muted-foreground text-sm font-bold">
                أو اكتبوا الكود
              </p>
              <p
                data-testid="waiting-room-code"
                className="font-mono text-4xl font-black tracking-[0.18em]"
              >
                {access.data!.joinCode}
              </p>
            </div>
          </div>
        )}
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((team) => {
          const side = sideOf(team.id);
          return (
            <div
              key={team.id}
              data-testid={`waiting-room-side-${team.id}`}
              // The «ملصق» treatment, same as every other team surface: a
              // thick navy outline and a hard shadow. The tint inside it is
              // what says whose side this is.
              className={`flex min-h-[18rem] flex-col rounded-[var(--radius)] border-[3px] border-[hsl(var(--brand-navy))] p-4 shadow-[0_6px_0_hsl(var(--brand-navy))] ${team.identity.surface}`}
            >
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className={`text-2xl font-black ${team.identity.text}`}>
                  {team.name}
                </h2>
                <span className="text-muted-foreground text-sm font-bold">
                  {side.length === 0
                    ? "ما فيه أحد"
                    : `${side.length} ${side.length === 1 ? "لاعب" : "لاعبين"}`}
                </span>
              </div>
              {side.length === 0 ? (
                <p className="text-muted-foreground flex flex-1 items-center justify-center text-center text-sm">
                  أول واحد يختار هذا الفريق يبان هنا
                </p>
              ) : (
                // A side is its people, so it reads as faces rather than as
                // rows in an admin list: the character is the thing somebody
                // across the room recognises as theirs.
                <ul className="grid flex-1 grid-cols-2 content-start gap-2 lg:grid-cols-3">
                  {side.map((person) => (
                    <li
                      key={person.id}
                      data-testid="waiting-room-player"
                      className="bg-background/70 flex flex-col items-center gap-1 rounded-[var(--radius)] p-3"
                    >
                      <PlayerCharacterIcon
                        characterKey={person.avatarKey}
                        size={64}
                      />
                      <span className="w-full truncate text-center font-bold">
                        {person.displayName}
                      </span>
                      {!person.connected && (
                        <span className="bg-muted text-muted-foreground mt-1 rounded-full px-2 py-1 text-xs leading-none font-bold">
                          خرج
                        </span>
                      )}
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={busy}
                          aria-label={`انقل ${person.displayName} للفريق الثاني`}
                          onClick={() =>
                            move.mutate({
                              participantId: person.id,
                              teamId: otherSide(team.id),
                            })
                          }
                        >
                          <ArrowLeftRight className="size-4" aria-hidden />
                        </Button>
                        <ConfirmationDialog
                          trigger={
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`اطرد ${person.displayName}`}
                            >
                              <UserMinus className="size-4" aria-hidden />
                            </Button>
                          }
                          title={`تطرد ${person.displayName}؟`}
                          description="جواله يطلع من الجلسة على طول، ويقدر يرجع يصوّر الكود من جديد."
                          confirmLabel="اطرده"
                          destructive
                          onConfirm={() => remove.mutate(person.id)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {unplaced.length > 0 && (
        <div
          data-testid="waiting-room-unplaced"
          className="rounded-[var(--radius)] border p-4"
        >
          <p className="mb-3 font-bold">لسا ما اختاروا فريق</p>
          <ul className="flex flex-wrap gap-2">
            {unplaced.map((person) => (
              <li
                key={person.id}
                className="bg-muted flex items-center gap-2 rounded-full py-1 ps-3 pe-1"
              >
                <PlayerCharacterIcon
                  characterKey={person.avatarKey}
                  size={28}
                />
                <span className="font-bold">{person.displayName}</span>
                {teams.map((team) => (
                  <Button
                    key={team.id}
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    className="font-black"
                    aria-label={`حط ${person.displayName} في ${team.name}`}
                    onClick={() =>
                      move.mutate({
                        participantId: person.id,
                        teamId: team.id,
                      })
                    }
                  >
                    {team.name}
                  </Button>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {failed && (
        <p role="alert" className="text-destructive text-sm font-bold">
          ما قدرنا نحدّث الغرفة. جرّب مرة ثانية.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          size="lg"
          className="font-black"
          data-testid="waiting-room-start"
          disabled={busy || !startAction}
          onClick={() => startAction && command(startAction, {})}
        >
          {/* One button, two readings: the second is the host's permission to
              leave somebody behind, which only means anything while somebody is
              still missing. Two buttons firing the same command would just ask
              the room to pick a mood. */}
          {everyoneIsHere ? "يلا نبدأ" : "نبدأ واللي يتأخر يلحقنا"}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="font-black"
          data-testid="waiting-room-split"
          disabled={busy || players.length < 2}
          onClick={() => void splitThem()}
        >
          <Shuffle className="size-4" aria-hidden />
          قسّمهم لي
        </Button>
      </div>
    </section>
  );
}
