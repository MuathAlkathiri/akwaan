"use client";

import Link from "next/link";
import { useState } from "react";
import { AkwaanLoader } from "@/components/akwaan/akwaan-loader";
import { STATE_ACTION, StateCard } from "@/components/akwaan/state-card";
import { STICKER } from "@/components/akwaan/sticker";
import {
  teamIds,
  teamNames,
} from "@/features/challenge-explainer/scene-projection";
import { ChallengePreflight } from "@/features/live-game-session/match/components/challenge-preflight";
import { MatchScoreHud } from "@/features/live-game-session/match/components/match-score-hud";
import { usePlayableWorlds } from "@/features/worlds/hooks/use-player-catalog";
import { cn } from "@/lib/utils";

const PREVIEW_ROUTES = [
  { slug: "moving-xo", label: "إكس أو المتحركة" },
  { slug: "ryo", label: "اقرأ خصمك" },
  { slug: "closest", label: "مين أقرب" },
  { slug: "bomb", label: "القنبلة" },
  { slug: "top-5", label: "توب 5" },
  { slug: "combo", label: "الكومبو" },
  { slug: "odd-piece", label: "القطعة الدخيلة" },
  { slug: "marhala", label: "المرحلة" },
  { slug: "ekshifni", label: "اكشفني" },
  { slug: "la-tahriqha", label: "لا تحرقها" },
  { slug: "first-note", label: "من أول نغمة" },
] as const;

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
  const currentSlug =
    mechanicKey === "read-your-opponent" ? "ryo" : mechanicKey;

  return (
    <main dir="rtl" className="mx-auto max-w-[1440px] space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="معاينة الشروحات"
          className="flex flex-wrap items-center gap-1.5"
        >
          {PREVIEW_ROUTES.map((route) => (
            <Link
              key={route.slug}
              href={`/dev/explainer/${route.slug}`}
              className={cn(
                "rounded-full border-2 border-brand-navy px-3 py-1 text-xs font-bold transition-colors",
                route.slug === currentSlug
                  ? "bg-brand-navy text-white"
                  : "bg-white text-brand-navy hover:bg-brand-lavender",
              )}
            >
              {route.label}
            </Link>
          ))}
        </nav>

        <label className="flex items-center gap-2 text-sm font-bold text-brand-navy">
          العالم
          <select
            className="rounded-xl border-2 border-brand-navy bg-white px-3 py-1.5 text-sm font-bold"
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
      </div>

      <MatchScoreHud
        teams={teams}
        canScore={false}
        canArmDouble={false}
        onScore={() => {}}
        onArmDouble={() => {}}
      />

      {worlds.isError ? (
        <StateCard
          size="page"
          title="ما قدرنا نحمّل العوالم"
          line="تأكد إن الخادم المحلي شغّال وحاول مرة ثانية."
          actions={
            <button
              type="button"
              className={cn(STATE_ACTION.secondary, STICKER.small)}
              onClick={() => void worlds.refetch()}
            >
              حاول مرة ثانية
            </button>
          }
        />
      ) : !world ? (
        <AkwaanLoader label="نحمّل العوالم…" className="min-h-[260px]" />
      ) : started ? (
        <div className="flex justify-center py-6">
          <button
            type="button"
            className={cn(STATE_ACTION.secondary, STICKER.small)}
            onClick={() => start(false)}
          >
            أعد الشرح
          </button>
        </div>
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
            join: {
              joinCode: "AKWN26",
              joinPath: "/join/live-session/AKWN26",
            },
            teams: [
              {
                teamId: teams[0].id,
                teamName: teams[0].name,
                connectedCount: 2,
                minimum: 1,
                maximum: 3,
                ready: true,
                participants: [
                  { participantId: "p1", displayName: "سارة", connected: true },
                  { participantId: "p2", displayName: "خالد", connected: true },
                ],
              },
              {
                teamId: teams[1].id,
                teamName: teams[1].name,
                connectedCount: 1,
                minimum: 1,
                maximum: 3,
                ready: true,
                participants: [
                  { participantId: "p3", displayName: "نورة", connected: true },
                  {
                    participantId: "p4",
                    displayName: "فيصل",
                    connected: false,
                  },
                ],
              },
            ],
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
