"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Check, Play, Shuffle, UserMinus } from "lucide-react";
import { ConfirmationDialog } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { ScannableQr } from "@/components/akwaan/scannable-qr";
import { teamIdentities } from "@/lib/team-identity";
import { getApiErrorMessage } from "@/lib/utils";
import { planSplit } from "../plan-split";
import { playersInRoom } from "../participants";
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
/**
 * How many places a side shows while it waits.
 *
 * Not a cap — more people are welcome and the list simply grows past it. It is
 * there so an empty side reads as a side with room in it rather than as a
 * blank rectangle, and so the first arrival lands somewhere already shaped to
 * receive them.
 */
const PLACES_PER_SIDE = 4;

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
  // The server's own reason, not a shrug. «ما قدرنا نحدّث الغرفة» told the host
  // nothing and told whoever they called even less: a refused move and a stale
  // revision are different problems with different fixes.
  const [failure, setFailure] = useState<string>();

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
    onError: (error) =>
      setFailure(getApiErrorMessage(error, "ما قدرنا نفتح باب الغرفة.")),
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
    onError: (error) =>
      setFailure(getApiErrorMessage(error, "ما قدرنا ننقل اللاعب.")),
  });
  const remove = useMutation({
    mutationFn: (participantId: string) =>
      removeLiveParticipant(
        snapshot!.sessionId,
        participantId,
        snapshot!.revision,
      ),
    onError: (error) =>
      setFailure(getApiErrorMessage(error, "ما قدرنا نطرد اللاعب.")),
  });

  const teams = useMemo(
    () => teamIdentities((snapshot?.teams ?? []).filter((team) => team.active)),
    [snapshot?.teams],
  );
  const players = useMemo(() => playersInRoom(snapshot), [snapshot]);
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
    setFailure(undefined);
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
    } catch (error) {
      setFailure(getApiErrorMessage(error, "ما قدرنا نقسّم الفريقين."));
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
    <section dir="rtl" data-testid="waiting-room" className="space-y-5">
      {/* Three columns, the way the room itself is arranged: a side, the way
          in, the other side. The code sits between the two teams because it
          belongs to neither, and because that is where every phone in the
          room looks. */}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px_1fr]">
        {teams.map((team, teamIndex) => {
          const side = sideOf(team.id);
          const openPlaces = Math.max(PLACES_PER_SIDE - side.length, 0);
          const panel = (
            <section
              key={team.id}
              data-testid={`waiting-room-side-${team.id}`}
              className={`bg-card flex flex-col overflow-hidden rounded-[20px] border shadow-[0_8px_24px_-16px_hsl(var(--brand-navy)/.35)] ${teamIndex === 0 ? "lg:order-3" : "lg:order-1"}`}
            >
              {/* The side's colour is a band across the top rather than a wash
                  behind the names: the people are what the panel is for, and a
                  tinted field makes every one of them harder to read. */}
              <div
                className={`h-3.5 border-b-[3px] border-[hsl(var(--brand-navy))] ${team.identity.dot}`}
              />
              <div className="flex items-center gap-3 px-5 pt-5 pb-4">
                <h2 className="flex-1 text-3xl font-black">{team.name}</h2>
                <span
                  className={`rounded-full border-2 border-[hsl(var(--brand-navy))] px-3 py-1 text-sm font-black ${team.identity.solid}`}
                >
                  {side.length === 0
                    ? "ما فيه أحد"
                    : `${side.length} ${side.length === 1 ? "لاعب" : "لاعبين"}`}
                </span>
              </div>
              <ul className="flex flex-col gap-2.5 px-5 pb-5">
                {side.map((person) => (
                  <li
                    key={person.id}
                    data-testid="waiting-room-player"
                    className="bg-background flex min-h-16 items-center gap-3 rounded-[14px] border px-3"
                  >
                    <span
                      className={`grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[hsl(var(--brand-navy))] ${team.identity.surface}`}
                    >
                      <PlayerCharacterIcon
                        characterKey={person.avatarKey}
                        size={34}
                      />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xl font-bold">
                      {person.displayName}
                    </span>
                    {person.connected ? (
                      <span className="text-success hidden items-center gap-1.5 text-sm font-bold sm:inline-flex">
                        <span className="bg-success size-2 rounded-full" />
                        متصل
                      </span>
                    ) : (
                      <span className="bg-muted text-muted-foreground rounded-full px-2 py-1 text-xs font-bold">
                        خرج
                      </span>
                    )}
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
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
                  </li>
                ))}
                {/* An empty place is drawn, not left blank: a side waiting for
                    people should look like it is waiting. */}
                {Array.from({ length: openPlaces }).map((_, index) => (
                  <li
                    key={`open-${index}`}
                    aria-hidden
                    data-testid="waiting-room-open-place"
                    className="text-muted-foreground flex min-h-16 items-center justify-center rounded-[14px] border-[1.5px] border-dashed"
                  >
                    مكان فاضي
                  </li>
                ))}
              </ul>
            </section>
          );
          return panel;
        })}

        {joinUrl && (
          <section className="bg-card flex flex-col items-center gap-4 rounded-[20px] border p-6 text-center shadow-[0_8px_24px_-16px_hsl(var(--brand-navy)/.35)] lg:order-2">
            <h1 className="text-2xl leading-relaxed font-black md:text-3xl">
              امسحوا الرمز واختاروا فريقكم
            </h1>
            <div className="rounded-[20px] border bg-white p-4">
              <ScannableQr value={joinUrl} size={210} />
            </div>
            <div className="flex w-full items-center gap-3">
              <span className="bg-border h-px flex-1" />
              <span className="text-muted-foreground text-sm">
                أو اكتبوا الكود
              </span>
              <span className="bg-border h-px flex-1" />
            </div>
            {/* One tile per character: a code read off a television and typed
                into a phone is copied letter by letter, and a single run of
                text is where the eye loses its place. */}
            <div
              dir="ltr"
              role="img"
              aria-label={`كود الانضمام ${access.data!.joinCode}`}
              data-testid="waiting-room-code"
              className="flex gap-1.5"
            >
              {access.data!.joinCode.split("").map((character, index) => (
                <span
                  key={`${character}-${index}`}
                  className="bg-background flex h-[3.25rem] w-11 items-center justify-center rounded-xl border border-b-[3px] text-2xl font-black"
                >
                  {character}
                </span>
              ))}
            </div>
            <span className="text-muted-foreground text-sm">
              مسحة وحدة تكفي لكل المباراة
            </span>
          </section>
        )}
      </div>

      {unplaced.length > 0 && (
        <div
          data-testid="waiting-room-unplaced"
          className="rounded-[20px] border p-4"
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

      {failure && (
        <p
          role="alert"
          data-testid="waiting-room-failure"
          className="text-destructive text-sm font-bold"
        >
          {failure}
        </p>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          data-testid="waiting-room-split"
          disabled={busy || players.length < 2}
          onClick={() => void splitThem()}
          className="inline-flex min-h-[3.25rem] items-center justify-center gap-2.5 rounded-[14px] border-[3px] border-[hsl(var(--brand-navy))] bg-white px-6 text-lg font-black text-[hsl(var(--brand-navy))] shadow-[0_5px_0_hsl(var(--brand-navy))] disabled:pointer-events-none disabled:opacity-40"
        >
          <Shuffle className="size-5" aria-hidden />
          قسّمنا عشوائي
        </button>
        <div className="flex flex-wrap items-center gap-4">
          {everyoneIsHere && (
            <span className="text-success inline-flex items-center gap-2 text-base font-bold">
              <Check className="size-4" aria-hidden />
              {players.length} {players.length === 1 ? "لاعب" : "لاعبين"}، وكل
              فريق جاهز
            </span>
          )}
          {/* The primary action of the whole screen, so it carries the gold:
              the one hard shadow on this page that is not navy. */}
          <button
            type="button"
            data-testid="waiting-room-start"
            disabled={busy || !startAction}
            onClick={() => startAction && command(startAction, {})}
            className="inline-flex min-h-16 items-center justify-center gap-2.5 rounded-[14px] border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-navy))] px-9 text-xl font-black text-white shadow-[0_5px_0_hsl(var(--brand-gold))] disabled:pointer-events-none disabled:opacity-40"
          >
            <Play className="size-5" aria-hidden />
            {/* One button, two readings: the second is the host's permission to
                leave somebody behind, which only means anything while somebody
                is still missing. */}
            {everyoneIsHere ? "يلا نبدأ" : "نبدأ واللي يتأخر يلحقنا"}
          </button>
        </div>
      </footer>
    </section>
  );
}
