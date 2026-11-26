"use client";

import { BookOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AkwaanLoader } from "@/components/akwaan/akwaan-loader";
import { STATE_ACTION, StateCard } from "@/components/akwaan/state-card";
import { STICKER } from "@/components/akwaan/sticker";
import { cn } from "@/lib/utils";
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
      <div className="flex justify-center py-2">
        <button
          type="button"
          className={cn(STATE_ACTION.secondary, STICKER.small, "gap-2")}
          onClick={() => setReplay(true)}
        >
          <BookOpen className="size-4" aria-hidden />
          ذكّرني بالقواعد
        </button>
      </div>
    );

  if (!enabled && !scoped)
    return description ? (
      <div
        className={cn(
          "rounded-[22px] bg-brand-paper px-6 py-4 text-center text-base font-bold text-brand-navy",
          STICKER.base,
        )}
      >
        <p>{description}</p>
      </div>
    ) : null;

  if (enabled && query.isLoading)
    return <AkwaanLoader label="نجهّز المثال…" className="min-h-[260px]" />;

  if (query.isError)
    return (
      <StateCard
        role="status"
        size="page"
        title="ما قدرنا نحمّل المثال"
        line="تقدرون تبدون التحدي مباشرة أو تحاولون تحميل المثال مرة ثانية."
        actions={
          <button
            type="button"
            className={cn(STATE_ACTION.secondary, STICKER.small)}
            onClick={() => void query.refetch()}
          >
            حاول مرة ثانية
          </button>
        }
      />
    );

  if (mechanicKey === "moving-xo")
    return (
      <GameScene
        example={{
          kind: "moving-xo",
          ...(matches && tutorial?.scenario.prompt
            ? { prompt: tutorial.scenario.prompt }
            : {}),
        }}
      />
    );

  if (!matches || !tutorial)
    return (
      <StateCard
        role="status"
        size="page"
        title="ما فيه مثال منشور لهالتحدي"
        line={`ما فيه مثال منشور لتحدي ${challengeName} في هالعالم. تقدرون تبدون التحدي مباشرة.`}
      />
    );

  return <MechanicTutorialRenderer scenario={tutorial.scenario} />;
}
