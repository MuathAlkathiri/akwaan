import type {
  GameplayRuntimeSnapshot,
  LiveSessionSnapshot,
} from "../live-game-session/model";
import type { MatchChallengeResult } from "../live-game-session/match/types";
import type { TutorialScenario } from "./tutorial-scenario";

export interface PreviewRyoRecapItem {
  prompt: string;
  answeringTeamId: string;
  opposingTeamId: string;
  selectedAnswer: string;
  correctAnswer: string;
  decision: "trust" | "steal";
  correct: boolean;
  mechanicPoints: Array<{ teamId: string; points: number }>;
}

export interface PreviewClosestRecapItem {
  correctValue: number;
  answers: Record<string, number | null>;
  distances: Record<string, number | null>;
  winnerTeamId: string | null;
  tie: boolean;
}

export interface PreviewBombRecapItem {
  teamId: string;
  prompt: string;
  submittedAnswer: string | null;
  correctAnswer: string;
  outcome: "correct" | "skipped" | "timeout";
}

export interface PreviewEkshifniRecapItem {
  identity: string;
  winnerTeamId: string | null;
  value: number;
  revealedRegionIds: string[];
  resolvedBy: "answer" | "timeout";
}

export interface PreviewFirstNoteRecapItem {
  title: string;
  finalBidSeconds: number;
  winnerTeamId: string | null;
  stolen: boolean;
}

export interface PreviewOddPieceRecapPuzzle {
  puzzleIndex: number;
  winnerTeamId: string | null;
}

export type SceneExample = (
  | Exclude<TutorialScenario, { kind: "one-clue" | "laqatha" }>
  | { kind: "moving-xo"; prompt?: string }
) & {
  previewRecapItems?:
    | PreviewRyoRecapItem[]
    | PreviewClosestRecapItem[]
    | PreviewBombRecapItem[]
    | PreviewEkshifniRecapItem[]
    | PreviewFirstNoteRecapItem[];
  previewRecapPuzzles?: PreviewOddPieceRecapPuzzle[];
  previewRecapTotals?: Record<string, number>;
};

export interface SceneWorldContext {
  id?: string;
  name?: string;
  occurrenceIndex?: number;
}
export const teamIds = ["team-a", "team-b"];
export const teamNames = ["الفريق الأول", "الفريق الثاني"];
const [a, b] = teamIds;
const stamp = "2026-01-01T00:00:00Z";
const json = JSON.stringify;
const tutorialMediaUrl = (url?: string) =>
  url?.startsWith("/tutorial-media/") && typeof window !== "undefined"
    ? new URL(url, window.location.origin).href
    : (url ?? null);

interface ClosestSliderSpec {
  mode: "numeric-range" | "between-anchors" | "colour-hue";
  min: number;
  max: number;
  step?: number;
  unit?: string;
  displayFormat?: "number" | "calendar-year";
  leftAnchor?: string;
  rightAnchor?: string;
}

const NICE_STEP_BASES = [1, 5, 10] as const;

function niceSteps(maxSpan: number): number[] {
  const steps: number[] = [];
  for (let pow = 0; pow <= 9; pow++) {
    const scale = 10 ** pow;
    for (const base of NICE_STEP_BASES) {
      const candidate = base * scale;
      if (candidate > maxSpan) return steps;
      if (steps.at(-1) !== candidate) steps.push(candidate);
    }
  }
  return steps;
}

function isStepAligned(value: number, step: number): boolean {
  const ratio = value / step;
  return Math.abs(ratio - Math.round(ratio)) < 1e-6;
}

function deriveClosestSlider(
  example: Extract<SceneExample, { kind: "closest" }>,
): ClosestSliderSpec {
  const extended = example as Extract<SceneExample, { kind: "closest" }> & {
    slider?: ClosestSliderSpec;
    min?: number;
    max?: number;
    step?: number;
  };
  if (
    extended.slider &&
    typeof extended.slider.min === "number" &&
    typeof extended.slider.max === "number"
  ) {
    return {
      ...extended.slider,
      mode: extended.slider.mode ?? "numeric-range",
      ...((extended.slider.unit ?? example.unit)
        ? { unit: extended.slider.unit ?? example.unit }
        : {}),
    };
  }
  if (typeof extended.min === "number" && typeof extended.max === "number") {
    return {
      mode: "numeric-range",
      min: extended.min,
      max: extended.max,
      ...(typeof extended.step === "number" ? { step: extended.step } : {}),
      ...(example.unit ? { unit: example.unit } : {}),
    };
  }

  const values = [
    example.correctValue,
    example.teamAEstimate,
    example.teamBEstimate,
  ];
  const low = Math.min(...values);
  const high = Math.max(...values);
  const spread = Math.max(
    high - low,
    Math.max(1, Math.abs(example.correctValue) * 0.1),
  );
  const pad = spread * 0.5;
  const nonNegative = low >= 0;
  const rawMin = nonNegative ? Math.max(0, low - pad) : low - pad;
  const rawMax = high + pad;
  const span = Math.max(1, rawMax - rawMin);

  let step = 1;
  if (values.every((value) => Number.isInteger(value))) {
    const candidates = niceSteps(span);
    for (let i = candidates.length - 1; i >= 0; i--) {
      const candidate = candidates[i];
      if (
        span / candidate >= 6 &&
        values.every((value) => isStepAligned(value, candidate))
      ) {
        step = candidate;
        break;
      }
    }
  } else {
    step = values.every((value) => isStepAligned(value, 0.5)) ? 0.5 : 0.1;
  }

  let min = Math.floor(rawMin / step) * step;
  if (nonNegative && min < 0) min = 0;
  let max = Math.ceil(rawMax / step) * step;
  if (max <= min) max = min + step * 6;
  // Avoid floating-point tails for fractional steps.
  min = Number(min.toFixed(6));
  max = Number(max.toFixed(6));

  return {
    mode: "numeric-range",
    min,
    max,
    step,
    ...(example.unit ? { unit: example.unit } : {}),
  };
}
const challengeNames: Record<string, string> = {
  "moving-xo": "إكس أو المتحركة",
  "read-your-opponent": "اقرأ خصمك",
  closest: "مين أقرب",
  bomb: "القنبلة",
  "top-5": "توب 5",
  combo: "الكومبو",
  "odd-piece": "القطعة الدخيلة",
  marhala: "المرحلة",
  ekshifni: "اكشفني",
  "la-tahriqha": "لا تحرقها",
  "first-note": "من أول نغمة",
};

function buildChallengeResult(
  example: SceneExample,
  modeKey: string,
  world?: SceneWorldContext,
): MatchChallengeResult {
  const base: MatchChallengeResult = {
    id: "example",
    positionKey: "example",
    occurrenceIndex: world?.occurrenceIndex ?? 0,
    slotKey: "slot_1",
    worldId: world?.id ?? "example",
    worldName: world?.name ?? "مثال توضيحي",
    challengeTypeId: modeKey,
    challengeKey: modeKey,
    challengeName: challengeNames[modeKey] ?? "نتيجة التحدي",
    selectedScopeIds: [],
    winnerTeamId: null,
    tie: false,
    matchPoints: [],
    startedAt: stamp,
    completedAt: stamp,
    details: {},
  };

  switch (example.kind) {
    case "moving-xo":
      return {
        ...base,
        winnerTeamId: a,
        tie: false,
        matchPoints: [{ teamId: a, points: 1 }],
        details: { endedBy: "win" },
      };
    case "ryo":
    case undefined: {
      const owner = example.outcome.teamRole === "answering" ? a : b;
      const other = owner === a ? b : a;
      const answer = (id: string) =>
        example.options.find((o) => o.id === id)?.label;
      const customItems = example.previewRecapItems as
        PreviewRyoRecapItem[] | undefined;
      const items =
        customItems && customItems.length > 0
          ? customItems.map((entry, itemIndex) => ({ itemIndex, ...entry }))
          : [
              {
                itemIndex: 0,
                prompt: example.prompt,
                answeringTeamId: a,
                opposingTeamId: b,
                selectedAnswer: answer(example.answeringSelectionOptionId),
                correctAnswer: answer(example.correctOptionId),
                decision: example.opposingDecision.toLowerCase(),
                correct: example.outcome.correct,
                mechanicPoints: [
                  { teamId: owner, points: example.outcome.delta },
                ],
              },
            ];
      const mechanicTotals = items.reduce<Record<string, number>>(
        (totals, item) => {
          for (const entry of item.mechanicPoints ?? []) {
            totals[entry.teamId] = (totals[entry.teamId] ?? 0) + entry.points;
          }
          return totals;
        },
        { [a]: 0, [b]: 0 },
      );
      const winnerTeamId =
        customItems && customItems.length > 0
          ? mechanicTotals[a] === mechanicTotals[b]
            ? null
            : mechanicTotals[a] > mechanicTotals[b]
              ? a
              : b
          : example.outcome.delta > 0
            ? owner
            : example.outcome.delta < 0
              ? other
              : null;
      return {
        ...base,
        winnerTeamId,
        tie: winnerTeamId === null,
        matchPoints: winnerTeamId ? [{ teamId: winnerTeamId, points: 1 }] : [],
        details: {
          itemsPlayed: items.length,
          mechanicTotals,
          tie: winnerTeamId === null,
          items,
        },
      };
    }
    case "closest": {
      const customItems = example.previewRecapItems as
        PreviewClosestRecapItem[] | undefined;
      const singleWinner = example.outcome.tie
        ? null
        : example.outcome.winnerTeam;
      const singleTie = example.outcome.tie || singleWinner === null;
      const items =
        customItems && customItems.length > 0
          ? customItems.map((entry, itemIndex) => ({ itemIndex, ...entry }))
          : [
              {
                itemIndex: 0,
                correctValue: example.correctValue,
                answers: {
                  [a]: example.teamAEstimate,
                  [b]: example.teamBEstimate,
                },
                distances: {
                  [a]: example.outcome.teamADistance,
                  [b]: example.outcome.teamBDistance,
                },
                winnerTeamId: singleWinner,
                tie: singleTie,
              },
            ];
      const mechanicTotals =
        customItems && customItems.length > 0
          ? items.reduce<Record<string, number>>(
              (totals, item) => {
                if (item.winnerTeamId) {
                  totals[item.winnerTeamId] =
                    (totals[item.winnerTeamId] ?? 0) + 1;
                }
                return totals;
              },
              { [a]: 0, [b]: 0 },
            )
          : {
              [a]: singleWinner === a ? example.outcome.mechanicTallyDelta : 0,
              [b]: singleWinner === b ? example.outcome.mechanicTallyDelta : 0,
            };
      const winnerTeamId =
        customItems && customItems.length > 0
          ? mechanicTotals[a] === mechanicTotals[b]
            ? null
            : mechanicTotals[a] > mechanicTotals[b]
              ? a
              : b
          : singleWinner;
      const tie = winnerTeamId === null;
      return {
        ...base,
        winnerTeamId,
        tie,
        matchPoints: winnerTeamId ? [{ teamId: winnerTeamId, points: 1 }] : [],
        details: {
          mechanicTotals,
          items,
        },
      };
    }
    case "bomb": {
      const winnerTeamId = example.outcome.winnerTeam;
      const secondQuestion = example.returnQuestion ?? example.nextQuestion;
      const customItems = example.previewRecapItems as
        PreviewBombRecapItem[] | undefined;
      return {
        ...base,
        winnerTeamId,
        tie: false,
        matchPoints: [
          { teamId: winnerTeamId, points: example.outcome.matchPointDelta },
        ],
        details: {
          items:
            customItems && customItems.length > 0
              ? customItems
              : [
                  {
                    teamId: example.startingTeam,
                    prompt: example.prompt,
                    submittedAnswer: example.acceptedAnswer,
                    correctAnswer: example.acceptedAnswer,
                    outcome: "correct",
                  },
                  ...(secondQuestion
                    ? [
                        {
                          teamId: example.outcome.expiredTeam,
                          prompt: secondQuestion.prompt,
                          submittedAnswer: null,
                          correctAnswer: secondQuestion.acceptedAnswer,
                          outcome: "timeout",
                        },
                      ]
                    : []),
                ],
        },
      };
    }
    case "top-5": {
      const winnerTeamId = example.outcome.winnerTeam;
      return {
        ...base,
        winnerTeamId,
        tie: false,
        matchPoints: [
          { teamId: winnerTeamId, points: example.outcome.matchPointDelta },
        ],
        details: {
          ...example.outcome,
          title: example.title,
          rankingBasis: example.rankingBasis,
          sourceLabel: example.sourceLabel,
          winnerTeamId,
          ownership: example.outcome.ownership.map((o) => ({
            ...o,
            ownerTeamId: o.ownerTeam,
            actingTeamId: o.actingTeam,
          })),
        },
      };
    }
    case "combo": {
      const question =
        example.stages.find(
          (s) => s.stage === example.outcome.forcedQuestionStage,
        ) ?? example.stages.at(-1);
      const bankedA = example.outcome.bankedPoints;
      const bankedB = 0;
      const tie = bankedA === bankedB;
      const winnerTeamId = tie ? null : bankedA > bankedB ? a : b;
      return {
        ...base,
        winnerTeamId,
        tie,
        matchPoints: winnerTeamId ? [{ teamId: winnerTeamId, points: 1 }] : [],
        details: {
          points: { [a]: bankedA, [b]: bankedB },
          tie,
          runs: question
            ? [
                {
                  teamId: a,
                  bankedPoints: bankedA,
                  questionsAnswered: question.stage,
                  endedBy: example.outcome.endedBy,
                  brokenByTeamId: b,
                },
              ]
            : [],
        },
      };
    }
    case "odd-piece": {
      const puzzles =
        example.previewRecapPuzzles && example.previewRecapPuzzles.length > 0
          ? example.previewRecapPuzzles
          : [{ puzzleIndex: 0, winnerTeamId: example.outcome.winnerTeam }];
      const points = example.previewRecapTotals ?? example.outcome.points;
      const winnerTeamId = example.outcome.winnerTeam;
      return {
        ...base,
        winnerTeamId,
        tie: false,
        matchPoints: [
          { teamId: winnerTeamId, points: example.outcome.matchPointDelta },
        ],
        details: {
          points,
          puzzles,
        },
      };
    }
    case "marhala": {
      const reachedFinish = example.outcome.finalLanding >= 16;
      const winnerTeamId = reachedFinish ? example.activeTeam : null;
      return {
        ...base,
        winnerTeamId,
        tie: false,
        matchPoints:
          winnerTeamId && example.outcome.matchPointDelta
            ? [
                {
                  teamId: winnerTeamId,
                  points: example.outcome.matchPointDelta,
                },
              ]
            : [],
        details: {
          endedBy: "finish",
          positions: {
            [a]: example.outcome.teamAPosition,
            [b]: example.outcome.teamBPosition,
          },
        },
      };
    }
    case "ekshifni": {
      const winnerTeamId = example.outcome.winnerTeam;
      const customItems = example.previewRecapItems as
        PreviewEkshifniRecapItem[] | undefined;
      return {
        ...base,
        winnerTeamId,
        tie: false,
        matchPoints: [
          { teamId: winnerTeamId, points: example.outcome.matchPointDelta },
        ],
        details: {
          mechanicTotals:
            example.previewRecapTotals ?? example.outcome.finalTotals,
          items:
            customItems && customItems.length > 0
              ? customItems
              : [
                  {
                    identity: example.celebrityIdentity,
                    winnerTeamId: example.outcome.correctTeam,
                    value: example.outcome.resolvedValue,
                    revealedRegionIds: example.outcome.revealedRegionIds,
                    resolvedBy: "answer",
                  },
                ],
        },
      };
    }
    case "la-tahriqha": {
      const winnerTeamId = example.outcome.tie
        ? null
        : example.outcome.winnerTeam;
      const burns = example.outcome.dishResults.reduce(
        (count, dish) =>
          count + (dish.teamA.burned ? 1 : 0) + (dish.teamB.burned ? 1 : 0),
        0,
      );
      const perfectDishes = example.outcome.dishResults.reduce(
        (count, dish) =>
          count + (dish.teamA.perfect ? 1 : 0) + (dish.teamB.perfect ? 1 : 0),
        0,
      );
      return {
        ...base,
        winnerTeamId,
        tie: example.outcome.tie,
        matchPoints:
          winnerTeamId && example.outcome.matchPointDelta
            ? [
                {
                  teamId: winnerTeamId,
                  points: example.outcome.matchPointDelta,
                },
              ]
            : [],
        details: {
          mechanicTotals: example.outcome.finalTotals,
          burns,
          perfectDishes,
          dishes: example.outcome.dishResults.map((dish) => ({
            dishName: dish.dishName,
            teams: [
              {
                teamId: a,
                points: dish.teamA.points,
                burned: dish.teamA.burned,
                perfect: dish.teamA.perfect,
              },
              {
                teamId: b,
                points: dish.teamB.points,
                burned: dish.teamB.burned,
                perfect: dish.teamB.perfect,
              },
            ],
          })),
        },
      };
    }
    case "first-note": {
      const roundWinner = example.outcome.stolen
        ? example.outcome.stealTeam
        : example.outcome.firstAnswerFailed
          ? null
          : example.outcome.firstAnswerTeam;
      const customItems = example.previewRecapItems as
        PreviewFirstNoteRecapItem[] | undefined;
      const mechanicTotals: Record<string, number> =
        example.previewRecapTotals ?? example.outcome.points;
      const pointsA = mechanicTotals["team-a"] ?? 0;
      const pointsB = mechanicTotals["team-b"] ?? 0;
      const winnerTeamId =
        pointsA === pointsB ? null : pointsA > pointsB ? a : b;
      return {
        ...base,
        winnerTeamId,
        tie: winnerTeamId === null,
        matchPoints: winnerTeamId ? [{ teamId: winnerTeamId, points: 1 }] : [],
        details: {
          mechanicTotals,
          items:
            customItems && customItems.length > 0
              ? customItems
              : [
                  {
                    title: example.title,
                    finalBidSeconds: example.outcome.finalBidSeconds,
                    winnerTeamId: roundWinner,
                    stolen: example.outcome.stolen,
                  },
                ],
        },
      };
    }
  }
}

export function sceneProjection(
  example: SceneExample,
  step: number,
  actor?: string,
  world?: SceneWorldContext,
) {
  const key = example.kind ?? "ryo";
  const mode = {
    key: key === "ryo" ? "read-your-opponent" : key,
    version: 1,
    stateSchemaVersion: 1,
  };
  const state: GameplayRuntimeSnapshot["modeState"] = {
    teamIdsJson: json(teamIds),
    actorTeamId: actor ?? null,
    activeTeamId: a,
    isAssignedActor: actor === a,
    isActiveTeam: actor === a,
  };
  const round: NonNullable<GameplayRuntimeSnapshot["activeRound"]> = {
    id: "example",
    sequence: 1,
    status: "active",
    modeState: state,
    transitionRevision: 1,
    createdAt: stamp,
  };
  const runtime: GameplayRuntimeSnapshot = {
    sessionId: "example",
    runtimeId: "example",
    status: "round-active",
    revision: 1,
    mode,
    modeState: state,
    activeRound: round,
    completedRounds: [],
    transitions: [],
    availableActions: [],
    serverTimestamp: stamp,
  };
  const allow = (...actions: string[]) => {
    if (actor) runtime.availableActions = actions;
  };
  const snapshot: LiveSessionSnapshot = {
    sessionId: "example",
    mode,
    status: "active",
    revision: 1,
    round: { number: 1 },
    createdAt: stamp,
    expiresAt: stamp,
    lastTransitionAt: stamp,
    serverTimestamp: stamp,
    availableActions: [],
    gameplay: runtime,
    readiness: {
      canMarkSessionReady: false,
      readyPlayers: 2,
      totalPlayers: 2,
      readyTeamIds: teamIds,
    },
    teams: teamIds.map((id, i) => ({
      id,
      name: teamNames[i],
      active: true,
      clock: {
        allocatedMs: 30000,
        consumedMs: 0,
        remainingMs: 30000,
        running: false,
        expired: false,
      },
    })),
    participants: teamIds.map((id) => ({
      id,
      teamId: id,
      displayName: id === a ? "لاعب الفريق الأول" : "لاعب الفريق الثاني",
      role: "team-player",
      ready: true,
      joinedAt: stamp,
      connected: true,
      connectedDeviceCount: 1,
      lastSeenAt: stamp,
      presence: "connected",
    })),
  };
  snapshot.match = {
    id: "example",
    revision: 1,
    status: "active",
    stage: {
      key: step === 2 ? "challenge_result" : "challenge",
      enteredAt: stamp,
      minimumDisplayDurationMs: 0,
      animationCue: null,
      audioCue: null,
    },
    // توب 5 reveals its cards on the shared screen before the challenge is
    // over, and that reveal reads the same record the result screen reads.
    ...(step === 2 || (example.kind === "top-5" && step === 1)
      ? { challengeResult: buildChallengeResult(example, mode.key, world) }
      : {}),
    unified: {
      occurrences: [],
      board: {
        positions: [],
        completedPositionCount: 0,
        totalPositionCount: 1,
      },
    },
    scoring: { matchTotals: [], worldSubtotals: [] },
    availableActions: [],
  };
  switch (example.kind) {
    case "moving-xo": {
      const cells = [a, a, step === 2 ? a : null, b, b, null, null, null, null];
      Object.assign(state, {
        phase:
          step === 2
            ? "completed"
            : step === 1
              ? "placement"
              : example.prompt
                ? "answering"
                : "question-pending",
        board: {
          cells,
          markOrder: { [a]: step === 2 ? [0, 1, 2] : [0, 1], [b]: [3, 4] },
        },
        question: example.prompt
          ? {
              contentItemId: "example",
              scopeId: "example",
              prompt: { ar: example.prompt },
              answerMode: "match",
            }
          : undefined,
        assignedParticipantId: a,
        winningTeamId: step === 2 ? a : null,
        outcome: step === 2 ? "win" : null,
        pendingMove: step === 1,
        questionsPresented: 5,
        successfulMoveCount: step === 2 ? 5 : 4,
      });
      if (actor === a && step === 0) allow("mode:submit-moving-xo-answer");
      if (actor === a && step === 1) allow("mode:place-moving-xo-mark");
      break;
    }
    case "ryo":
    case undefined: {
      const label = (id: string) =>
        example.options.find((o) => o.id === id)?.label ?? "";
      const teamId = example.outcome.teamRole === "answering" ? a : b;
      const trusted = example.opposingDecision === "STEAL";
      const readMatchedOutcome = example.outcome.correct ? trusted : !trusted;
      const payload = {
        correct: example.outcome.correct,
        selectedAnswer: label(example.answeringSelectionOptionId),
        correctAnswer: label(example.correctOptionId),
        decision: example.opposingDecision.toLowerCase(),
        teamId,
        delta: example.outcome.delta,
        readMatchedOutcome,
      };
      Object.assign(state, {
        phase: step ? "revealed" : "collecting",
        answeringTeamId: a,
        opposingTeamId: b,
      });
      round.interaction = {
        id: "example",
        revision: 1,
        status: step ? "resolved" : "open",
        submissions: step
          ? [
              {
                id: "example-answer",
                status: "accepted",
                payload: { kind: "answer" },
                receivedAt: stamp,
              },
              {
                id: "example-decision",
                status: "accepted",
                payload: { kind: "decision" },
                receivedAt: stamp,
              },
            ]
          : [],
        prompt: {
          id: "example",
          type: "question",
          schemaVersion: 1,
          metadata: {},
          payload: {
            itemJson: json({
              id: "example",
              prompt: example.prompt,
              options: example.options,
              answerMode: "multiple_choice",
            }),
            actorRole:
              actor === a
                ? "answering"
                : actor === b
                  ? "opposing"
                  : "spectator",
            isAssignedActor: !!actor,
            answererParticipantId: a,
            deciderParticipantId: b,
          },
        },
        ...(step
          ? {
              outcome: {
                type: "resolved",
                schemaVersion: 1,
                completionReason: "answered",
                payload,
              },
            }
          : {}),
      };
      if (!step) allow("submission:create");
      break;
    }
    case "closest": {
      const { outcome } = example;
      const slider = deriveClosestSlider(example);
      Object.assign(state, {
        phase: step ? "revealed" : "collecting",
        currentItemJson: json({
          id: "example",
          prompt: example.prompt,
          slider,
        }),
        isAssignedActor: !!actor,
        assignedParticipantIdsJson: json({ [a]: a, [b]: b }),
        submissionStatusJson: json({ [a]: !!step, [b]: !!step }),
        revealedResultJson: step
          ? json({
              correctValue: example.correctValue,
              answers: {
                [a]: example.teamAEstimate,
                [b]: example.teamBEstimate,
              },
              distances: {
                [a]: outcome.teamADistance,
                [b]: outcome.teamBDistance,
              },
              winnerTeamId: outcome.winnerTeam,
              tie: outcome.tie,
            })
          : null,
      });
      if (!step) allow("mode:submit-estimate");
      break;
    }
    case "bomb": {
      const active = step
        ? example.startingTeam === a
          ? b
          : a
        : example.startingTeam;
      round.activeTeamId = active;
      round.activeParticipantId = active;
      runtime.activeTeamId = active;
      runtime.prompt = step ? example.nextPrompt : example.prompt;
      runtime.currentItem = {
        id: "example",
        index: step ? 1 : 0,
        totalItems: 3,
      };
      const media = step ? example.nextQuestion?.media : example.media;
      Object.assign(state, {
        phase: "presenting",
        itemIndex: step ? 1 : 0,
        mediaType: media?.type ?? "none",
        mediaUrl:
          media?.url.startsWith("/tutorial-media/") &&
          typeof window !== "undefined"
            ? new URL(media.url, window.location.origin).href
            : (media?.url ?? null),
        altText: media?.altText ?? null,
      });
      if (step) {
        const clock = snapshot.teams.find(
          (t) => t.id === example.startingTeam,
        )!.clock;
        clock.remainingMs = 1000 * example.correctAtSecondsRemaining;
        clock.consumedMs = clock.allocatedMs - clock.remainingMs;
      }
      if (step < 2 && actor === active) allow("mode:submit-answer");
      break;
    }
    case "top-5": {
      const turn = example.outcome.ownership[0];
      const activeTurn = example.outcome.ownership[step === 1 ? 1 : 0];
      Object.assign(state, {
        // Step 2 is the reveal: every card has been played by then.
        phase: step === 0 ? "deciding" : "completed",
        activeTeamId: activeTurn?.actingTeam ?? example.startingTeam,
        activeParticipantId: activeTurn?.actingTeam ?? example.startingTeam,
        title: example.title,
        rankingBasis: example.rankingBasis,
        currentCardJson: json(
          example.entries.find((e) => e.id === activeTurn?.entryId),
        ),
        cardNumber: step === 1 ? 2 : 1,
        cardCount: example.entries.length,
        ownershipJson: json(
          step && turn
            ? [
                {
                  ...turn,
                  ownerTeamId: turn.ownerTeam,
                  actingTeamId: turn.actingTeam,
                  label: example.entries.find((e) => e.id === turn.entryId)
                    ?.label,
                },
              ]
            : [],
        ),
      });
      if (step === 0 && actor === state.activeTeamId) allow("mode:decide-card");
      break;
    }
    case "combo": {
      // The three steps the board draws: a question in the run, the decision
      // that follows a right answer, and the run's result. The forced question
      // belongs to the record, so it is kept for the result step alone.
      const forced =
        example.stages.find(
          (s) => s.stage === example.outcome.forcedQuestionStage,
        ) ?? example.stages.at(-1);
      const open =
        example.stages.find(
          (s) => s.stage === example.outcome.forcedQuestionStage - 1,
        ) ??
        example.stages[0] ??
        forced;
      const question = step === 2 ? forced : open;
      if (!question || !open) break;
      Object.assign(state, {
        phase:
          step === 2 ? "run-complete" : step === 1 ? "decision" : "question",
        questionPrompt: json(question.prompt),
        questionNumber: question.stage,
        questionStage: question.stage,
        assignedParticipantId: a,
        // What the run is carrying: before the answer, and after it lands.
        unbankedPoints:
          step === 0 ? open.stage - 1 : step === 1 ? open.stage : 0,
        forcedQuestion: false,
        comboBreakRevealedByTeamId: step === 2 ? b : null,
        chargesJson: json({
          [a]: "available",
          [b]: step === 2 ? "spent" : "available",
        }),
        canArmComboBreak: step === 1 && actor === b,
        lastQuestionRevealJson:
          step === 1
            ? json({
                teamId: a,
                correct: true,
                submittedAnswer: open.submittedAnswer,
                correctAnswer: open.correctAnswer,
                earned: 1,
                // Dated before this scene so the shared pacing beat is over and
                // the decision — not the answer — is what the step shows.
                resolvedAt: "2025-01-01T00:00:00Z",
              })
            : null,
        runResultsJson: json(
          step === 2
            ? [
                {
                  teamId: a,
                  runIndex: 0,
                  bankedPoints: example.outcome.bankedPoints,
                  endedBy: example.outcome.endedBy,
                  brokenByTeamId: b,
                  questionsAnswered: question.stage,
                },
              ]
            : [],
        ),
      });
      if (step === 0 && actor === a) allow("mode:submit-combo-answer");
      if (step === 1 && actor === a) {
        allow("mode:cash-out-combo");
        allow("mode:continue-combo");
      }
      if (step === 1 && actor === b) allow("mode:arm-combo-break");
      break;
    }
    case "odd-piece": {
      Object.assign(state, {
        phase: ["open", "revealed", "completed"][step],
        prompt: example.prompt,
        modifiedImageJson: json(example.modifiedImage),
        isAssignedActor: !!actor,
        canClaim: !!actor && !step,
        revealJson: step === 1 ? json(example) : null,
        resultJson:
          step === 2
            ? json({
                winnerTeamId: example.outcome.winnerTeam,
                tie: false,
                points: example.outcome.points,
              })
            : null,
        attemptsJson: json(
          step
            ? [
                { teamId: a, correct: false },
                { teamId: b, correct: true },
              ]
            : [],
        ),
      });
      if (step === 0) allow("mode:claim-odd-piece");
      break;
    }
    case "marhala": {
      const active = example.activeTeam;
      const positions = {
        [a]: example.teamAPosition,
        [b]: example.teamBPosition,
      };
      if (step === 2) positions[active] = example.outcome.finalLanding;
      Object.assign(state, {
        phase: step === 2 ? "completed" : "question",
        activeTeamId: active,
        isAssignedActor: actor === active,
        isActiveTeam: actor === active,
        assignedParticipantId: active,
        selectedDifficulty: example.difficulty,
        questionPrompt: json(example.prompt),
        positionsJson: json(positions),
        resultJson:
          step === 2
            ? json({
                endedBy: "finish",
                winnerTeamId:
                  example.outcome.finalLanding >= 16 ? active : null,
              })
            : null,
        lastTurnJson:
          step === 1 && (!actor || actor === active)
            ? json({
                ...example.outcome,
                teamId: active,
                turnNumber: 1,
                correctAnswer: example.correctAnswer,
                submittedAnswer: example.submittedAnswer,
                resolvedBy: "answer",
              })
            : null,
      });
      if (step === 0 && actor === active) allow("mode:submit-marhala-answer");
      break;
    }
    case "ekshifni": {
      const initTeam = example.outcome.openingInitiative[0] ?? a;
      const openIds =
        step === 0
          ? example.outcome.revealedRegionIds.slice(0, 1)
          : example.outcome.revealedRegionIds;
      const currentValue =
        step === 0
          ? Math.max(1, 5 - openIds.length)
          : example.outcome.resolvedValue;
      const imageUrl = tutorialMediaUrl(example.image.url);
      Object.assign(state, {
        phase: step === 2 ? "completed" : step === 1 ? "resolved" : "playing",
        currentImageIndex: 0,
        imageCount: example.outcome.imageCount,
        imageNumber: 1,
        regionCount: example.regions.length,
        imageMediaJson:
          !actor && imageUrl
            ? json({
                type: "image",
                assets: [{ url: imageUrl, altText: example.image.altText }],
              })
            : null,
        promptJson: json({ ar: example.prompt }),
        regionsJson: json(
          example.regions.map((r) => ({
            id: r.id,
            number: r.number,
            revealed: openIds.includes(r.id),
            ...(actor ? {} : { shape: r.shape }),
          })),
        ),
        revealedRegionIdsJson: json(openIds),
        currentValue,
        initiativeTeamId: initTeam,
        hasInitiative: actor === initTeam,
        canReveal: step === 0 && actor === initTeam,
        canAnswer: step === 0 && !!actor,
        isAssignedActor: !!actor,
        isAssignedRevealer: true,
        isAssignedAnswerer: true,
        revealJson:
          step === 1
            ? json({
                imageIndex: 0,
                identity: example.celebrityIdentity,
                value: example.outcome.resolvedValue,
                winnerTeamId: example.outcome.correctTeam,
                resolvedBy: "answer",
                attempts: [
                  {
                    teamId: example.outcome.wrongTeam,
                    answer: example.wrongSubmittedAnswer,
                    correct: false,
                  },
                  {
                    teamId: example.outcome.correctTeam,
                    answer: example.correctSubmittedAnswer,
                    correct: true,
                  },
                ],
                points: example.outcome.imagePoints,
                revealedRegionIds: openIds,
                resolvedAt: stamp,
              })
            : null,
        resultJson:
          step === 2
            ? json({
                winnerTeamId: example.outcome.winnerTeam,
                tie: false,
                points: example.outcome.finalTotals,
              })
            : null,
      });
      if (step === 0) {
        if (actor === initTeam) {
          allow("mode:reveal-ekshifni-region", "mode:submit-ekshifni");
        } else if (actor) {
          allow("mode:submit-ekshifni");
        }
      }
      break;
    }
    case "la-tahriqha": {
      const dish = example.dishes[0];
      const dishResult = example.outcome.dishResults[0];
      const dishView = dish
        ? {
            id: dish.id,
            dishName: dish.name,
            ingredients: dish.ingredients.map((item) => ({
              localId: item.id,
              label: item.label,
            })),
          }
        : undefined;
      Object.assign(state, {
        phase: step === 2 ? "completed" : step === 1 ? "revealed" : "selecting",
        currentDishIndex: 0,
        dishCount: example.outcome.dishCount,
        minSelection: 3,
        maxSelection: 5,
        dishSeconds: example.dishWindowSeconds,
        deadlineAt: new Date(
          Date.parse(stamp) + example.dishWindowSeconds * 1000,
        ).toISOString(),
        currentDishJson: step !== 2 && dishView ? json(dishView) : null,
        teamStatusJson: json({
          [a]: {
            locked: step > 0,
            committedCount:
              step > 0 ? (dish?.teamASelection.length ?? 0) : null,
          },
          [b]: {
            locked: step > 0,
            committedCount:
              step > 0 ? (dish?.teamBSelection.length ?? 0) : null,
          },
        }),
        captainParticipantIdsJson: json({ [a]: a, [b]: b }),
        totalsJson: json(
          step === 0
            ? { [a]: 0, [b]: 0 }
            : {
                [a]: dishResult?.teamA.points ?? 0,
                [b]: dishResult?.teamB.points ?? 0,
              },
        ),
        isDishCaptain: !!actor,
        isAssignedActor: !!actor,
        ownSelectedJson: json(
          actor === a
            ? (dish?.teamASelection ?? [])
            : actor === b
              ? (dish?.teamBSelection ?? [])
              : [],
        ),
        revealJson:
          step === 1 && dish && dishResult
            ? json({
                dishIndex: 0,
                contentItemId: dish.id,
                dishName: dish.name,
                correctIngredientIds: dish.ingredients
                  .filter((item) => item.correct)
                  .map((item) => item.id),
                teams: [
                  {
                    teamId: a,
                    ...dishResult.teamA,
                    lockReason: "manual",
                    captainParticipantId: a,
                  },
                  {
                    teamId: b,
                    ...dishResult.teamB,
                    lockReason: "manual",
                    captainParticipantId: b,
                  },
                ],
                totalsAfter: {
                  [a]: dishResult.teamA.points,
                  [b]: dishResult.teamB.points,
                },
                resolutionReason: "both-locked",
                resolvedAt: stamp,
              })
            : null,
        resultJson:
          step === 2
            ? json({
                winnerTeamId: example.outcome.winnerTeam,
                tie: example.outcome.tie,
                totals: example.outcome.finalTotals,
              })
            : null,
      });
      if (step === 0 && actor) {
        allow(
          "mode:select-la-tahriqha-ingredient",
          "mode:deselect-la-tahriqha-ingredient",
          "mode:lock-la-tahriqha-dish",
        );
      }
      break;
    }
    case "first-note": {
      const prevBid =
        example.bids.length >= 2
          ? example.bids[example.bids.length - 2]
          : example.bids[0];
      const hasPriorBid = Boolean(prevBid && prevBid.seconds > 1);
      const currentBidSeconds = hasPriorBid ? prevBid.seconds : null;
      const currentBidTeamId = hasPriorBid ? prevBid.team : null;
      const biddingTeamId = hasPriorBid
        ? prevBid.team === a
          ? b
          : a
        : (example.outcome.auctionWinner ?? a);
      const roundWinner = example.outcome.stolen
        ? example.outcome.stealTeam
        : example.outcome.firstAnswerFailed
          ? null
          : example.outcome.firstAnswerTeam;
      const pointsA = example.outcome.points["team-a"] ?? 0;
      const pointsB = example.outcome.points["team-b"] ?? 0;
      const matchWinner =
        pointsA === pointsB ? null : pointsA > pointsB ? a : b;
      Object.assign(state, {
        phase: step === 2 ? "completed" : step === 1 ? "resolved" : "auction",
        currentSongIndex: 0,
        songCount: example.outcome.songCount,
        contextualClueJson: json({ ar: example.contextualClue }),
        clueLabelJson: example.clueLabel
          ? json({ ar: example.clueLabel })
          : null,
        currentBidSeconds,
        currentBidTeamId,
        biddingTeamId,
        answerOwnerTeamId: example.outcome.auctionWinner,
        finalBidSeconds: example.outcome.finalBidSeconds,
        canBid: step === 0 && actor === biddingTeamId,
        canPass: step === 0 && actor === biddingTeamId && hasPriorBid,
        canAnswer: false,
        isAssignedActor: true,
        revealJson:
          step === 1
            ? json({
                title: example.title,
                finalBidSeconds: example.outcome.finalBidSeconds,
                auctionTeamId: example.outcome.auctionWinner,
                winnerTeamId: roundWinner,
                stolen: example.outcome.stolen,
                points: example.outcome.points,
                answers: {
                  [example.outcome.firstAnswerTeam]:
                    example.firstSubmittedAnswer,
                  ...(example.outcome.stolen
                    ? {
                        [example.outcome.stealTeam]:
                          example.stealSubmittedAnswer,
                      }
                    : {}),
                },
                resolvedAt: stamp,
              })
            : null,
        resultJson:
          step === 2
            ? json({
                winnerTeamId: matchWinner,
                tie: matchWinner === null,
                points: example.outcome.points,
              })
            : null,
      });
      if (step === 0 && actor === biddingTeamId) {
        allow("mode:submit-first-note-bid", "mode:pass-first-note-bid");
      }
      break;
    }
  }
  return { snapshot, runtime };
}
