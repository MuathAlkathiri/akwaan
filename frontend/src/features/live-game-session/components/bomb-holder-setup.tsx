"use client";

import { useEffect, useState } from "react";
import { Bomb, Check, Crown, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { teamIdentities } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { useLiveSession } from "../hooks/live-session-context";
import { useMobileParticipantId } from "../match/components/mobile-gameplay-shell";
import type { GameplayRuntimeSnapshot } from "../model";

/**
 * Before القنبلة starts, each team's captain chooses who holds its bomb first.
 *
 * The server holds the challenge — and both clocks — until both teams are
 * READY *and* the host presses Start Challenge, and it authorises every
 * choice and the start. This view only shows the setup: the room's screen
 * shows both teams, their holder and readiness, and the Start button, enabled
 * only once both are ready; a phone shows its team's chooser the teammates and
 * everyone else whose choice it is. A team with no captain was assigned
 * automatically.
 */
export interface BombHolderSetupTeam {
  teamId: string;
  captainParticipantId: string | null;
  holderParticipantId: string | null;
  autoAssigned: boolean;
}

export const CHOOSE_BOMB_HOLDER_COMMAND = "choose-bomb-holder";
export const START_BOMB_COMMAND = "start-bomb-challenge";

function readSetup(
  modeState: unknown,
): { teams: BombHolderSetupTeam[]; startedAt?: string } | undefined {
  const raw = (modeState as { holderSetupJson?: unknown } | undefined)
    ?.holderSetupJson;
  if (typeof raw !== "string" || !raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as {
      teams?: BombHolderSetupTeam[];
      startedAt?: string;
    };
    return Array.isArray(parsed.teams)
      ? {
          teams: parsed.teams,
          ...(parsed.startedAt ? { startedAt: parsed.startedAt } : {}),
        }
      : undefined;
  } catch {
    return undefined;
  }
}

export function readBombHolderSetup(
  modeState: unknown,
): BombHolderSetupTeam[] | undefined {
  return readSetup(modeState)?.teams;
}

/** The setup is on screen until the host has pressed Start. */
export function bombHolderSetupPending(modeState: unknown): boolean {
  const setup = readSetup(modeState);
  return Boolean(setup && !setup.startedAt);
}

export function BombHolderSetup({
  runtime,
  actor,
}: {
  runtime: GameplayRuntimeSnapshot;
  actor: "controller" | "shared-screen" | "participant";
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const me = useMobileParticipantId();
  const setup = readBombHolderSetup(runtime.modeState) ?? [];
  const people = snapshot?.participants ?? [];
  const nameOf = (id: string | null) =>
    people.find((person) => person.id === id)?.displayName ?? "—";
  const teams = teamIdentities(snapshot?.teams ?? []);
  const connectedOn = (teamId: string) =>
    people.filter(
      (person) =>
        person.teamId === teamId &&
        person.role === "team-player" &&
        person.connected &&
        !(person as { removedAt?: string }).removedAt,
    );
  // The server's rule, mirrored for presentation: the captain while
  // connected, otherwise the first connected teammate. The server decides.
  const chooserOf = (team: BombHolderSetupTeam) => {
    const here = connectedOn(team.teamId);
    if (
      team.captainParticipantId &&
      here.some((person) => person.id === team.captainParticipantId)
    ) {
      return team.captainParticipantId;
    }
    return here[0]?.id;
  };
  const allReady =
    setup.length > 0 && setup.every((team) => team.holderParticipantId);
  // Local only: closes the double-tap window. The server refuses a duplicate
  // Start anyway, and the next snapshot replaces this view.
  const [starting, setStarting] = useState(false);
  useEffect(() => {
    if (!allReady) setStarting(false);
  }, [allReady]);

  if (actor === "participant") {
    const mine = setup.find((team) =>
      people.some(
        (person) => person.id === me && person.teamId === team.teamId,
      ),
    );
    if (!mine) return <Waiting body="الفريقين يختارون حامل القنبلة…" />;
    const choosing = !mine.autoAssigned && chooserOf(mine) === me;
    if (choosing) {
      return (
        <section
          dir="rtl"
          data-testid="bomb-holder-picker"
          className="flex flex-col gap-3"
        >
          <header className="text-center">
            <p className="flex items-center justify-center gap-1.5 text-lg font-black">
              <Bomb className="size-5" aria-hidden />
              مين يمسك القنبلة؟
            </p>
            <p className="text-sm font-bold text-muted-foreground">
              تقدر تختار نفسك. ما يبدأ الوقت لين يختار الفريقين.
            </p>
          </header>
          <ul className="flex flex-col gap-2">
            {connectedOn(mine.teamId).map((person) => {
              const selected = person.id === mine.holderParticipantId;
              return (
                <li key={person.id}>
                  <Button
                    type="button"
                    variant={selected ? "default" : "outline"}
                    size="lg"
                    aria-pressed={selected}
                    data-testid={`bomb-holder-option-${person.id}`}
                    disabled={connection !== "connected"}
                    onClick={() =>
                      gameplayCommand("gameplay-command", {
                        roundId: runtime.activeRound?.id,
                        commandType: CHOOSE_BOMB_HOLDER_COMMAND,
                        payload: { participantId: person.id },
                      })
                    }
                    className="h-14 w-full justify-between text-base font-black"
                  >
                    <bdi>{person.displayName}</bdi>
                    {person.id === me && (
                      <span className="text-xs font-bold opacity-80">أنا</span>
                    )}
                    {selected && <Check className="size-5" aria-hidden />}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      );
    }
    return (
      <Waiting
        testId="bomb-holder-waiting"
        title={
          mine.holderParticipantId
            ? `القنبلة مع ${nameOf(mine.holderParticipantId)}`
            : `الاختيار عند ${nameOf(chooserOf(mine) ?? null)}`
        }
        body={
          allReady
            ? "الفريقين جاهزين — ننتظر المضيف يبدأ التحدي."
            : "ما يبدأ الوقت لين يختار الفريقين."
        }
      />
    );
  }

  // The room's screen (and the host): both teams, their holder, ready or not.
  return (
    <section
      dir="rtl"
      data-testid="bomb-holder-setup"
      data-ready={allReady}
      // Read from across a room: centred, and larger on a room-sized screen.
      className="mx-auto flex min-h-[60vh] w-full max-w-3xl flex-col justify-center gap-4 py-6 lg:max-w-5xl lg:gap-6"
    >
      <h2 className="flex items-center justify-center gap-2 text-center text-2xl font-black md:text-3xl lg:text-4xl">
        <Bomb className="size-7 lg:size-9" aria-hidden />
        كل فريق يختار مين يمسك القنبلة
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:gap-5">
        {setup.map((team) => {
          const identity = teams.find((entry) => entry.id === team.teamId);
          const ready = Boolean(team.holderParticipantId);
          return (
            <article
              key={team.teamId}
              data-testid={`bomb-holder-team-${team.teamId}`}
              data-ready={ready}
              className="surface-card overflow-hidden"
            >
              <div className={cn("h-2.5", identity?.identity.dot)} />
              <div className="space-y-2 p-4 lg:space-y-3 lg:p-6">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xl font-black lg:text-3xl">
                    {identity?.name ?? "الفريق"}
                  </p>
                  {/* Readiness in words, not by icon alone. */}
                  <span
                    data-testid={`bomb-holder-readiness-${team.teamId}`}
                    className={cn(
                      "shrink-0 rounded-full border px-2.5 py-1 text-xs font-black lg:text-sm",
                      ready
                        ? "border-brand-navy bg-success-subtle text-foreground"
                        : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    {ready ? "جاهز" : "ما بعد اختار"}
                  </span>
                </div>
                {team.captainParticipantId && (
                  <p className="flex items-center gap-1.5 text-sm font-bold text-muted-foreground lg:text-lg">
                    <Crown className="size-4 lg:size-5" aria-hidden />
                    القائد: <bdi>{nameOf(team.captainParticipantId)}</bdi>
                  </p>
                )}
                <p
                  className="flex items-center gap-2 text-lg font-black lg:text-2xl"
                  role="status"
                >
                  {ready ? (
                    <>
                      <Check className="size-5" aria-hidden />
                      القنبلة مع <bdi>{nameOf(team.holderParticipantId)}</bdi>
                    </>
                  ) : (
                    <>
                      <Loader2
                        className="size-5 animate-spin motion-reduce:animate-none"
                        aria-hidden
                      />
                      ينتظر اختيار القائد
                    </>
                  )}
                </p>
                {team.autoAssigned && (
                  <p className="text-xs font-bold text-muted-foreground lg:text-base">
                    بدون قائد — اختيار تلقائي بالتناوب
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {/* The host's Start Challenge. Enabled only once both teams are READY;
          the server refuses an early or second start regardless. */}
      <Button
        type="button"
        size="lg"
        disabled={!allReady || starting || connection !== "connected"}
        data-testid="bomb-holder-start"
        data-ready={allReady}
        onClick={() => {
          if (!allReady || starting) return;
          setStarting(true);
          gameplayCommand("gameplay-command", {
            roundId: runtime.activeRound?.id,
            commandType: START_BOMB_COMMAND,
            payload: {},
          });
        }}
        className="mx-auto h-12 min-w-56 gap-2 text-base font-black lg:h-16 lg:min-w-72 lg:text-xl"
      >
        {starting ? (
          <Loader2
            className="size-5 animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        ) : (
          <Play className="size-5" aria-hidden />
        )}
        {allReady ? "ابدأ التحدي" : "ننتظر الفريقين"}
      </Button>
    </section>
  );
}

function Waiting({
  title,
  body,
  testId = "bomb-holder-waiting",
}: {
  title?: string;
  body: string;
  testId?: string;
}) {
  return (
    <div
      dir="rtl"
      role="status"
      data-testid={testId}
      className="surface-card space-y-1 p-5 text-center"
    >
      {title && <p className="text-lg font-black">{title}</p>}
      <p className="text-sm font-bold text-muted-foreground">{body}</p>
    </div>
  );
}
