"use client";
import { useState } from "react";
import { usePlayableWorlds } from "@/features/worlds/hooks/use-player-catalog";
import { ChallengePreflight } from "@/features/live-game-session/match/components/challenge-preflight";
import { MatchScoreHud } from "@/features/live-game-session/match/components/match-score-hud";
import {
  teamIds,
  teamNames,
} from "@/features/challenge-explainer/scene-projection";

export function Preview({
  mechanicKey,
  name,
}: {
  mechanicKey: string;
  name: string;
}) {
  const worlds = usePlayableWorlds();
  const [worldId, select] = useState("");
  const [started, start] = useState(false);
  const world = worlds.data?.find((w) => w.id === worldId) ?? worlds.data?.[0];
  const teams = teamIds.map((id, i) => ({ id, name: teamNames[i], score: 0 }));
  return (
    <main dir="rtl" className="mx-auto max-w-6xl space-y-4 p-4">
      <label>
        العالم{" "}
        <select
          value={world?.id ?? ""}
          onChange={(e) => {
            select(e.target.value);
            start(false);
          }}
        >
          {worlds.data?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <MatchScoreHud
        teams={teams}
        canScore={false}
        canArmDouble={false}
        onScore={() => {}}
        onArmDouble={() => {}}
      />
      {worlds.isError ? (
        <p>ما قدرنا نحمّل العوالم.</p>
      ) : !world ? (
        <p>نحمّل العوالم…</p>
      ) : started ? (
        <button onClick={() => start(false)}>أعد الشرح</button>
      ) : (
        <ChallengePreflight
          key={world.id}
          preflight={{
            positionKey: "preview",
            occurrenceIndex: 1,
            slotKey: "slot_1",
            worldId: world.id,
            worldName: world.name,
            challengeTypeId: mechanicKey,
            challengeKey: mechanicKey,
            challengeName: name,
            requiresPhones: true,
            selectedScopes: [],
            teams: teams.map((t) => ({
              teamId: t.id,
              teamName: t.name,
              connectedCount: 1,
              minimum: 1,
              ready: true,
              participants: [],
            })),
            allTeamsReady: true,
            readyToLaunch: true,
            blockingReasons: [],
            preparedAt: "",
            selectingTeamId: teamIds[0],
          }}
          sessionId="preview"
          launching={false}
          cancelling={false}
          onLaunch={() => start(true)}
          onCancel={() => history.back()}
        />
      )}
    </main>
  );
}
