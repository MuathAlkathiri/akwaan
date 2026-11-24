"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Crown, Shuffle, UserMinus } from "lucide-react";
import { ConfirmationDialog } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { ScannableQr } from "@/components/akwaan/scannable-qr";
import { teamIdentities } from "@/lib/team-identity";
import { cn, getApiErrorMessage } from "@/lib/utils";
import { GoldPill, STICKER } from "@/components/akwaan/sticker";
import { planSplit } from "../plan-split";
import { playersInRoom } from "../participants";
import {
  assignParticipantTeam,
  createJoinAccess,
  getJoinAccess,
  removeLiveParticipant,
  setTeamCaptain,
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
 * Starting waits for one thing only: somebody on each side. Past that it never
 * blocks — the QR stays up on the challenge screen, so a latecomer joins
 * mid-game.
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
    mutationFn: () =>
      createJoinAccess(snapshot!.sessionId, JOIN_ACCESS_DEFAULTS),
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
  const captain = useMutation({
    mutationFn: (input: { teamId: string; participantId: string | null }) =>
      setTeamCaptain(
        snapshot!.sessionId,
        input.teamId,
        input.participantId,
        snapshot!.revision,
      ),
    onError: (error) =>
      setFailure(getApiErrorMessage(error, "ما قدرنا نغيّر القائد.")),
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
  const busy =
    connection !== "connected" ||
    move.isPending ||
    captain.isPending ||
    splitting;
  /** A captain who has since left the side reads as no captain. */
  const captainOf = (teamId: string) => {
    const id = snapshot.teams.find(
      (team) => team.id === teamId,
    )?.captainParticipantId;
    return id && sideOf(teamId).some((person) => person.id === id)
      ? id
      : undefined;
  };

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
  // The design's rule: the Match opens once each side has somebody. Whoever
  // is still on the way joins from the code on the challenge screen.
  const bothSidesHaveSomeone =
    sideOf(first.id).length > 0 && sideOf(second.id).length > 0;
  const occurrences = snapshot.match?.unified?.occurrences ?? [];
  const countLabel = (count: number) =>
    count === 1 ? "لاعب واحد" : count === 2 ? "لاعبين" : `${count} لاعبين`;

  return (
    <section dir="rtl" data-testid="waiting-room" className="flex flex-col gap-6">
      {/* What this room is for, before anybody reads a team: which Worlds, in
          which order, and how many people have made it in. */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {occurrences.length > 0 ? (
          <ol
            aria-label="عوالم المباراة"
            className="m-0 flex list-none flex-wrap items-center gap-x-6 gap-y-2 rounded-full border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender px-5 py-2.5"
          >
            {occurrences.map((occurrence, index) => (
              <li
                key={occurrence.occurrenceIndex}
                className="inline-flex items-center gap-2 text-[17px] font-bold text-[hsl(var(--brand-navy))]"
              >
                <span className="grid size-6 place-items-center rounded-full bg-[hsl(var(--brand-navy))] text-[13px] font-extrabold text-white">
                  {index + 1}
                </span>
                {occurrence.worldName ?? "عالم"}
              </li>
            ))}
          </ol>
        ) : (
          <span />
        )}
        <span
          data-testid="waiting-room-count"
          className="inline-flex min-h-12 items-center gap-2 rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-5 text-lg font-bold text-[hsl(var(--brand-navy))]"
        >
          {players.length === 0 ? (
            "ننتظر أول لاعب"
          ) : (
            <>
              انضم{" "}
              <span className="text-[22px] font-extrabold">
                {players.length}
              </span>{" "}
              {players.length === 1 ? "لاعب" : "لاعبين"}
            </>
          )}
        </span>
      </div>

      <div className="grid items-stretch gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* The way in. One panel, one job: the code is the largest thing in
            the room because every phone in it is pointed here. */}
        <section
          className={cn(
            "flex flex-col gap-5 rounded-[28px] bg-brand-lavender px-6 py-6 sm:px-[30px]",
            STICKER.base,
          )}
        >
          <h1 className="font-display text-[28px] font-black leading-[1.35] text-[hsl(var(--brand-navy))] sm:text-[38px]">
            امسحوا الرمز واختاروا فريقكم
          </h1>
          <div className="flex flex-col items-center gap-[22px]">
            <div
              data-testid="waiting-room-qr"
              data-join-code={access.data?.enabled ? access.data.joinCode : ""}
              className="grid aspect-square w-full max-w-[380px] place-items-center rounded-3xl border-4 border-[hsl(var(--brand-navy))] bg-white p-5 shadow-[7px_8px_0_hsl(var(--brand-navy))]"
            >
              {joinUrl ? (
                <ScannableQr value={joinUrl} size={300} />
              ) : (
                <span className="text-[15px] font-semibold text-brand-plum">
                  نجهّز الرمز…
                </span>
              )}
            </div>
            <ol className="m-0 flex w-full list-none flex-wrap items-center justify-between gap-3 p-0">
              {["امسح الرمز", "اختر شخصيتك", "اختر فريقك"].map(
                (step, index) => (
                  <li
                    key={step}
                    className="inline-flex items-center gap-2.5 whitespace-nowrap text-lg font-bold text-[hsl(var(--brand-navy))]"
                  >
                    <span className="grid size-[34px] shrink-0 place-items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] text-base font-extrabold">
                      {index + 1}
                    </span>
                    {step}
                  </li>
                ),
              )}
            </ol>
          </div>
          <span className="mt-auto text-lg font-semibold text-brand-slate">
            مسحة وحدة تكفي لكل المباراة.
          </span>
        </section>

        <div className="flex min-w-0 flex-col gap-6">
          {teams.map((team) => {
            const side = sideOf(team.id);
            const captainId = captainOf(team.id);
            return (
              <section
                key={team.id}
                data-testid={`waiting-room-side-${team.id}`}
                className={cn(
                  "flex flex-1 flex-col gap-4 rounded-3xl bg-brand-paper px-5 py-5 sm:px-[26px]",
                  STICKER.base,
                )}
              >
                <div className="flex items-center justify-between gap-4">
                  {/* The side's colour is a dot beside its name and nothing
                      else: never a band, a wash or a border. */}
                  <h2 className="inline-flex items-center gap-3 font-display text-[26px] font-extrabold text-[hsl(var(--brand-navy))] sm:text-[30px]">
                    <span
                      aria-hidden
                      className={cn(
                        "size-[18px] rounded-full border-2 border-[hsl(var(--brand-navy))]",
                        team.identity.dot,
                      )}
                    />
                    {team.name}
                  </h2>
                  {side.length > 0 && (
                    <span className="text-lg font-bold text-brand-slate">
                      {countLabel(side.length)}
                    </span>
                  )}
                </div>

                {side.length === 0 ? (
                  <p
                    data-testid="waiting-room-empty-side"
                    className="grid min-h-[60px] place-items-center rounded-2xl border-2 border-dashed border-brand-dash text-lg font-semibold text-brand-plum"
                  >
                    ننتظر اللاعبين…
                  </p>
                ) : (
                  <ul className="m-0 flex list-none flex-wrap gap-3.5 p-0">
                    {side.map((person) => (
                      <li
                        key={person.id}
                        data-testid="waiting-room-player"
                        className={cn(
                          "inline-flex min-h-[60px] items-center gap-2 rounded-full bg-white py-1 pe-2 ps-2 text-xl font-bold text-[hsl(var(--brand-navy))]",
                          STICKER.small,
                          !person.connected && "opacity-60",
                        )}
                      >
                        <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender">
                          <PlayerCharacterIcon
                            characterKey={person.avatarKey}
                            size={34}
                          />
                        </span>
                        <span className="max-w-[10rem] truncate">
                          {person.displayName}
                        </span>
                        {person.id === captainId && (
                          <span
                            role="img"
                            aria-label="القائد"
                            data-testid="waiting-room-captain-badge"
                            className="inline-flex"
                          >
                            <Crown
                              className="size-5 fill-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))]"
                              aria-hidden
                            />
                          </span>
                        )}
                        {!person.connected && (
                          <span className="rounded-full bg-brand-wash px-2 py-0.5 text-xs font-bold text-brand-plum">
                            خرج
                          </span>
                        )}
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          disabled={busy}
                          className="size-9 rounded-full"
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
                              className="size-9 rounded-full"
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
                  </ul>
                )}

                {/* Optional. With a captain, that phone carries every turn the
                    side has to take with one hand; without one the turns go
                    round the whole side. The host can change it during the
                    Match too. */}
                <div className="mt-auto flex flex-wrap items-center gap-x-3.5 gap-y-2 border-t-2 border-brand-mist pt-3.5">
                  <Crown
                    className="size-[22px] shrink-0 fill-[hsl(var(--brand-gold))] text-[hsl(var(--brand-navy))]"
                    aria-hidden
                  />
                  <label
                    htmlFor={`captain-${team.id}`}
                    className="whitespace-nowrap text-lg font-bold text-[hsl(var(--brand-navy))]"
                  >
                    قائد الفريق
                  </label>
                  <select
                    id={`captain-${team.id}`}
                    data-testid={`waiting-room-captain-${team.id}`}
                    value={captainId ?? ""}
                    disabled={busy || side.length === 0}
                    aria-describedby={`captain-hint-${team.id}`}
                    onChange={(event) => {
                      setFailure(undefined);
                      captain.mutate({
                        teamId: team.id,
                        participantId: event.target.value || null,
                      });
                    }}
                    className="min-h-[52px] min-w-[9rem] flex-1 rounded-[14px] border-[3px] border-[hsl(var(--brand-navy))] bg-white px-4 text-lg font-semibold text-[hsl(var(--brand-navy))] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[hsl(var(--brand-purple))] disabled:opacity-50"
                  >
                    <option value="">بدون قائد</option>
                    {side.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.displayName}
                      </option>
                    ))}
                  </select>
                  <span
                    id={`captain-hint-${team.id}`}
                    className="text-sm text-brand-slate"
                  >
                    بدون قائد = تناوب تلقائي
                  </span>
                </div>
              </section>
            );
          })}

          {unplaced.length > 0 && (
            <div
              data-testid="waiting-room-unplaced"
              className="rounded-3xl border-2 border-dashed border-brand-dash bg-white p-4"
            >
              <p className="mb-3 font-bold text-[hsl(var(--brand-navy))]">
                لسا ما اختاروا فريق
              </p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {unplaced.map((person) => (
                  <li
                    key={person.id}
                    className="flex items-center gap-2 rounded-full bg-brand-lavender py-1 pe-1 ps-3"
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
              className="rounded-2xl bg-brand-lavender px-4 py-3 text-base font-bold text-[hsl(var(--brand-navy))]"
            >
              {failure}
            </p>
          )}

          <footer className="flex flex-wrap items-center justify-between gap-5">
            <button
              type="button"
              data-testid="waiting-room-split"
              disabled={busy || players.length < 2}
              onClick={() => void splitThem()}
              className="inline-flex min-h-16 items-center justify-center gap-2.5 rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white px-7 text-xl font-bold text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))] disabled:pointer-events-none disabled:opacity-40"
            >
              <Shuffle className="size-5" aria-hidden />
              قسّمنا عشوائي
            </button>
            <GoldPill
              data-testid="waiting-room-start"
              disabled={busy || !startAction || !bothSidesHaveSomeone}
              onClick={() => startAction && command(startAction, {})}
              className="px-8 sm:min-h-[76px] sm:px-11 sm:text-[26px]"
            >
              {bothSidesHaveSomeone
                ? "نبدأ واللي يتأخر يلحقنا"
                : "نبدأ أول ما ينضم لاعب من كل فريق"}
            </GoldPill>
          </footer>
        </div>
      </div>
    </section>
  );
}
