"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AkwaanLoader } from "@/components/akwaan/akwaan-loader";
import { STATE_ACTION, StateCard } from "@/components/akwaan/state-card";
import { STICKER } from "@/components/akwaan/sticker";
import {
  SAMPLE_COMBO_TUTORIAL_SCENARIO,
  SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO,
  SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO,
  SAMPLE_MARHALA_TUTORIAL_SCENARIO,
  SAMPLE_ODD_PIECE_V2_TUTORIAL_SCENARIO,
  SAMPLE_TOP5_TUTORIAL_SCENARIO,
  usePublishedTutorial,
  type BombTutorialScenario,
  type ClosestTutorialScenario,
  type FirstNoteTutorialScenario,
  type PublishedTutorial,
  type RyoTutorialScenario,
  type TutorialScenario,
} from "@/features/challenge-explainer";
import {
  teamIds,
  teamNames,
  type PreviewBombRecapItem,
  type PreviewClosestRecapItem,
  type PreviewEkshifniRecapItem,
  type PreviewFirstNoteRecapItem,
  type PreviewOddPieceRecapPuzzle,
  type PreviewRyoRecapItem,
} from "@/features/challenge-explainer/scene-projection";
import { ChallengePreflight } from "@/features/live-game-session/match/components/challenge-preflight";
import { MatchScoreHud } from "@/features/live-game-session/match/components/match-score-hud";
import {
  playerCatalogKeys,
  usePlayableWorlds,
} from "@/features/worlds/hooks/use-player-catalog";
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

// Dev-preview-only fallback scenarios for mechanics whose legacy demo files
// were removed. Never imported by InlineMechanicTutorial or production code.
const PREVIEW_RYO_SCENARIO: RyoTutorialScenario & {
  previewRecapItems: PreviewRyoRecapItem[];
} = {
  kind: "ryo",
  version: 1,
  prompt: "أي دولة عربية تضم مدينة البتراء الأثرية؟",
  options: [
    { id: "opt-1", label: "الأردن" },
    { id: "opt-2", label: "لبنان" },
    { id: "opt-3", label: "عُمان" },
    { id: "opt-4", label: "تونس" },
  ],
  correctOptionId: "opt-1",
  answeringSelectionOptionId: "opt-1",
  opposingDecision: "STEAL",
  outcome: {
    teamRole: "opposing",
    delta: 1,
    reason: "ryo.correct-steal",
    correct: true,
  },
  previewRecapItems: [
    {
      prompt: "أي دولة عربية تضم مدينة البتراء الأثرية؟",
      answeringTeamId: "team-a",
      opposingTeamId: "team-b",
      selectedAnswer: "الأردن",
      correctAnswer: "الأردن",
      decision: "steal",
      correct: true,
      mechanicPoints: [{ teamId: "team-b", points: 1 }],
    },
    {
      prompt: "ما أكبر جزيرة في العالم من حيث المساحة؟",
      answeringTeamId: "team-b",
      opposingTeamId: "team-a",
      selectedAnswer: "مدغشقر",
      correctAnswer: "غرينلاند",
      decision: "steal",
      correct: false,
      mechanicPoints: [{ teamId: "team-a", points: -1 }],
    },
    {
      prompt: "في أي مدينة يقع برج خليفة؟",
      answeringTeamId: "team-a",
      opposingTeamId: "team-b",
      selectedAnswer: "دبي",
      correctAnswer: "دبي",
      decision: "trust",
      correct: true,
      mechanicPoints: [{ teamId: "team-a", points: 1 }],
    },
  ],
};

const PREVIEW_CLOSEST_SCENARIO: ClosestTutorialScenario & {
  previewRecapItems: PreviewClosestRecapItem[];
} = {
  kind: "closest",
  version: 1,
  prompt: "في أي سنة تأسست المملكة العربية السعودية؟",
  teamAEstimate: 1930,
  teamBEstimate: 1935,
  correctValue: 1932,
  outcome: {
    teamADistance: 2,
    teamBDistance: 3,
    winnerTeam: "team-a",
    tie: false,
    mechanicTallyDelta: 1,
    matchPointDelta: 0,
    reason: "closest.absolute-distance",
  },
  previewRecapItems: [
    {
      correctValue: 1932,
      answers: { "team-a": 1930, "team-b": 1935 },
      distances: { "team-a": 2, "team-b": 3 },
      winnerTeamId: "team-a",
      tie: false,
    },
    {
      correctValue: 828,
      answers: { "team-a": 790, "team-b": 820 },
      distances: { "team-a": 38, "team-b": 8 },
      winnerTeamId: "team-b",
      tie: false,
    },
    {
      correctValue: 206,
      answers: { "team-a": 208, "team-b": 195 },
      distances: { "team-a": 2, "team-b": 11 },
      winnerTeamId: "team-a",
      tie: false,
    },
  ],
};

const PREVIEW_BOMB_SCENARIO: BombTutorialScenario & {
  previewRecapItems: PreviewBombRecapItem[];
} = {
  kind: "bomb",
  version: 1,
  prompt: "ما عاصمة سلطنة عُمان؟",
  acceptedAnswer: "مسقط",
  nextPrompt: "ما أكبر محيط في العالم؟",
  nextQuestion: {
    prompt: "ما أكبر محيط في العالم؟",
    acceptedAnswer: "المحيط الهادئ",
  },
  startingTeam: "team-a",
  correctAtSecondsRemaining: 22,
  opponentExpiresAtSecondsRemaining: 0,
  outcome: {
    passedToTeam: "team-b",
    expiredTeam: "team-b",
    winnerTeam: "team-a",
    correctAnswerPassesTurn: true,
    timerResetsOnPass: false,
    matchPointDelta: 1,
    reason: "bomb.clock-expired",
  },
  previewRecapItems: [
    {
      teamId: "team-a",
      prompt: "ما عاصمة سلطنة عُمان؟",
      submittedAnswer: "مسقط",
      correctAnswer: "مسقط",
      outcome: "correct",
    },
    {
      teamId: "team-b",
      prompt: "كم عدد قارات العالم؟",
      submittedAnswer: null,
      correctAnswer: "7",
      outcome: "skipped",
    },
    {
      teamId: "team-b",
      prompt: "ما أكبر محيط في العالم؟",
      submittedAnswer: null,
      correctAnswer: "المحيط الهادئ",
      outcome: "timeout",
    },
  ],
};

const PREVIEW_FIRST_NOTE_SCENARIO: FirstNoteTutorialScenario & {
  previewRecapItems: PreviewFirstNoteRecapItem[];
  previewRecapTotals: Record<string, number>;
} = {
  kind: "first-note",
  version: 1,
  prompt: "تعرّفوا على الأغنية من مزاد ثوانٍ قصير.",
  title: "على بالي",
  clueLabel: "السياق",
  contextualClue:
    "أغنية عربية معاصرة بصوت نسائي، من ألبوم حقق انتشاراً واسعاً.",
  bids: [
    { team: "team-a", seconds: 8 },
    { team: "team-b", seconds: 5 },
    { team: "team-a", seconds: 3 },
  ],
  acceptedAnswers: ["على بالي"],
  firstSubmittedAnswer: "ليلة صيف",
  stealSubmittedAnswer: "على بالي",
  outcome: {
    songCount: 3,
    bids: [
      { team: "team-a", seconds: 8 },
      { team: "team-b", seconds: 5 },
      { team: "team-a", seconds: 3 },
    ],
    finalBidSeconds: 3,
    auctionWinner: "team-a",
    firstAnswerTeam: "team-a",
    firstAnswerFailed: true,
    stealTeam: "team-b",
    stolen: true,
    firstCorrectReward: 13,
    stealReward: 11,
    points: { "team-a": 0, "team-b": 11 },
    reason: "first-note.auction-steal",
  },
  previewRecapTotals: { "team-a": 10, "team-b": 23 },
  previewRecapItems: [
    {
      title: "على بالي",
      finalBidSeconds: 3,
      winnerTeamId: "team-b",
      stolen: true,
    },
    {
      title: "الأماكن",
      finalBidSeconds: 6,
      winnerTeamId: "team-a",
      stolen: false,
    },
    {
      title: "بنت الجيران",
      finalBidSeconds: 4,
      winnerTeamId: "team-b",
      stolen: false,
    },
  ],
};

const PREVIEW_EKSHIFNI_SCENARIO = {
  ...SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO,
  previewRecapTotals: { "team-a": 3, "team-b": 6 },
  previewRecapItems: [
    {
      identity: SAMPLE_EKSHIFNI_TUTORIAL_SCENARIO.celebrityIdentity,
      winnerTeamId: "team-b",
      value: 2,
      revealedRegionIds: ["r1", "r2", "r6"],
      resolvedBy: "answer",
    },
    {
      identity: "ناصر القصبي",
      winnerTeamId: "team-a",
      value: 3,
      revealedRegionIds: ["r1", "r2"],
      resolvedBy: "answer",
    },
    {
      identity: "محمد عبده",
      winnerTeamId: "team-b",
      value: 4,
      revealedRegionIds: ["r1"],
      resolvedBy: "answer",
    },
  ] satisfies PreviewEkshifniRecapItem[],
};

const PREVIEW_ODD_PIECE_SCENARIO = {
  ...SAMPLE_ODD_PIECE_V2_TUTORIAL_SCENARIO,
  previewRecapTotals: { "team-a": 1, "team-b": 2 },
  previewRecapPuzzles: [
    { puzzleIndex: 0, winnerTeamId: "team-b" },
    { puzzleIndex: 1, winnerTeamId: "team-a" },
    { puzzleIndex: 2, winnerTeamId: "team-b" },
  ] satisfies PreviewOddPieceRecapPuzzle[],
};

function buildSampleTutorial(
  mechanicKey: string,
  worldId: string,
): PublishedTutorial | null {
  const byKey: Record<string, TutorialScenario> = {
    "read-your-opponent": PREVIEW_RYO_SCENARIO,
    closest: PREVIEW_CLOSEST_SCENARIO,
    bomb: PREVIEW_BOMB_SCENARIO,
    "top-5": SAMPLE_TOP5_TUTORIAL_SCENARIO,
    combo: SAMPLE_COMBO_TUTORIAL_SCENARIO,
    "odd-piece": PREVIEW_ODD_PIECE_SCENARIO,
    marhala: SAMPLE_MARHALA_TUTORIAL_SCENARIO,
    ekshifni: PREVIEW_EKSHIFNI_SCENARIO,
    "la-tahriqha": SAMPLE_LA_TAHRIQHA_TUTORIAL_SCENARIO,
    "first-note": PREVIEW_FIRST_NOTE_SCENARIO,
  };

  if (mechanicKey === "moving-xo") {
    return {
      mechanicKey: "moving-xo",
      revision: 1,
      source: "generic",
      worldId: null,
      scenario: {
        kind: "moving-xo",
        prompt: "ما أطول نهر في العالم العربي؟",
      } as unknown as TutorialScenario,
    };
  }

  const scenario = byKey[mechanicKey];
  if (!scenario) return null;

  const scoped = ["read-your-opponent", "closest", "bomb"].includes(
    mechanicKey,
  );
  return {
    mechanicKey,
    revision: 1,
    source: scoped ? "world" : "generic",
    worldId: scoped ? worldId : null,
    scenario,
  };
}

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
  const [sampleOverride, setSampleOverride] = useState<boolean | null>(null);
  const world =
    worlds.data?.find((w) => w.id === worldId) ??
    worlds.data?.find((w) => Boolean(w.banner?.url)) ??
    worlds.data?.find((w) => !/smoke/i.test(w.name)) ??
    worlds.data?.[0];
  const liveTutorial = usePublishedTutorial(
    world ? mechanicKey : undefined,
    world?.id,
  );

  // Default ON when the local API returns no published tutorial.
  const useSample =
    sampleOverride ?? (!liveTutorial.isLoading && !liveTutorial.data);

  const sampleClient = useMemo(() => {
    if (!useSample || !world) return null;
    const sample = buildSampleTutorial(mechanicKey, world.id);
    if (!sample) return null;
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: Infinity,
          retry: false,
          refetchOnMount: false,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        },
      },
    });
    client.setQueryData(["mechanic-tutorial", world.id, mechanicKey], sample);
    client.setQueryData(playerCatalogKeys.worlds, worlds.data ?? []);
    return client;
  }, [useSample, world, mechanicKey, worlds.data]);

  const teams = teamIds.map((id, i) => ({ id, name: teamNames[i], score: 0 }));
  const currentSlug =
    mechanicKey === "read-your-opponent" ? "ryo" : mechanicKey;

  const preflightNode = world ? (
    <ChallengePreflight
      key={`${world.id}-${useSample ? "sample" : "api"}`}
      preflight={{
        positionKey: "preview",
        occurrenceIndex: 0,
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
  ) : null;

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

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border-2 border-brand-navy bg-brand-lavender px-3 py-1 text-xs font-bold text-brand-navy">
            <input
              type="checkbox"
              data-testid="preview-sample-toggle"
              checked={useSample}
              onChange={(event) => setSampleOverride(event.target.checked)}
              className="size-4 accent-[hsl(var(--brand-navy))]"
            />
            بيانات تجريبية (للمعاينة فقط)
          </label>

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
      ) : sampleClient ? (
        <QueryClientProvider client={sampleClient}>
          {preflightNode}
        </QueryClientProvider>
      ) : (
        preflightNode
      )}
    </main>
  );
}
