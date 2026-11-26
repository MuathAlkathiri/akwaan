"use client";
import { useEffect, useRef, useState } from "react";
import { GameScene } from "../game-scene";
import {
  MechanicTutorialRenderer,
  SUPPORTED_TUTORIAL_MECHANIC_KEYS,
} from "../tutorial-renderer";
import { usePublishedTutorial } from "../use-published-tutorial";
export function InlineMechanicTutorial({
  mechanicKey,
  worldId,
  challengeName,
  description,
  launching,
  repeatEncounter,
  matchId,
}: {
  mechanicKey: string;
  worldId?: string;
  challengeName: string;
  description?: string;
  launching?: boolean;
  repeatEncounter?: boolean;
  matchId?: string;
}) {
  const [replay, setReplay] = useState(false);
  const scoped = ["read-your-opponent", "closest", "bomb"].includes(
    mechanicKey,
  );
  const enabled =
    (!scoped || !!worldId) &&
    (mechanicKey === "moving-xo" ||
      SUPPORTED_TUTORIAL_MECHANIC_KEYS.some((k) => k === mechanicKey));
  const query = usePublishedTutorial(
    enabled ? mechanicKey : undefined,
    worldId,
  );
  const [seen, setSeen] = useState(false);
  const seenKey = matchId ? `explainer:${matchId}:${mechanicKey}` : undefined;
  const checkedKey = useRef<string>();
  const tutorial = query.data;
  const kind = mechanicKey === "read-your-opponent" ? "ryo" : mechanicKey;
  const matches =
    !!tutorial &&
    tutorial.mechanicKey === mechanicKey &&
    (tutorial.scenario.kind ?? "ryo") === kind &&
    (!scoped ||
      (!!worldId &&
        tutorial.source === "world" &&
        tutorial.worldId === worldId));
  useEffect(() => {
    if (
      !seenKey ||
      checkedKey.current === seenKey ||
      (!matches && mechanicKey !== "moving-xo") ||
      query.isLoading ||
      query.isError ||
      launching
    )
      return;
    checkedKey.current = seenKey;
    try {
      setSeen(window.sessionStorage.getItem(seenKey) === "1");
      window.sessionStorage.setItem(seenKey, "1");
    } catch {
      /* The board history still handles repeat encounters. */
    }
  }, [
    seenKey,
    matches,
    mechanicKey,
    query.isLoading,
    query.isError,
    launching,
  ]);
  if (launching) return null;
  if (enabled && (repeatEncounter || seen) && !replay)
    return (
      <button
        className="rounded-full border-2 border-brand-navy px-5 py-2 font-bold"
        onClick={() => setReplay(true)}
      >
        ذكّرني بالقواعد
      </button>
    );
  if (!enabled && !scoped) return <p>{description}</p>;
  if (enabled && query.isLoading) return <p role="status">نجهّز المثال…</p>;
  if (query.isError)
    return (
      <p role="status">
        ما قدرنا نحمّل المثال.{" "}
        <button onClick={() => void query.refetch()}>حاول مرة ثانية</button>
      </p>
    );

  if (mechanicKey === "moving-xo")
    return (
      <>
        <GameScene
          example={{
            kind: "moving-xo",
            ...(matches && tutorial?.scenario.prompt
              ? { prompt: tutorial.scenario.prompt }
              : {}),
          }}
        />
      </>
    );
  if (!matches || !tutorial)
    return (
      <p role="status">ما فيه مثال منشور لتحدي {challengeName} في هالعالم.</p>
    );
  return <MechanicTutorialRenderer scenario={tutorial.scenario} />;
}
