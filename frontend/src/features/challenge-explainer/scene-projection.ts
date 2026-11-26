import type {
  GameplayRuntimeSnapshot,
  LiveSessionSnapshot,
} from "../live-game-session/model";
import type { TutorialScenario } from "./tutorial-scenario";

export type SceneExample =
  | Exclude<TutorialScenario, { kind: "one-clue" | "laqatha" }>
  | { kind: "moving-xo"; prompt?: string };
export const teamIds = ["team-a", "team-b"];
export const teamNames = ["الفريق الأول", "الفريق الثاني"];
const [a, b] = teamIds;
const stamp = "2026-01-01T00:00:00Z";
const json = JSON.stringify;
const tutorialMediaUrl = (url?: string) =>
  url?.startsWith("/tutorial-media/") && typeof window !== "undefined"
    ? new URL(url, window.location.origin).href
    : (url ?? null);
export function sceneProjection(
  example: SceneExample,
  step: number,
  actor?: string,
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
  const setMatchEnd = (
    winnerTeamId: string | null,
    totals: Record<string, number>,
    tie = winnerTeamId === null,
  ) => {
    if (step !== 2 || !snapshot.match) return;
    const teamScores = teamIds.map((id) => ({
      teamId: id,
      signedTotal: totals[id] ?? 0,
      displayTotal: totals[id] ?? 0,
    }));
    snapshot.match.scoring.matchTotals = teamScores;
    snapshot.match.standings = teamIds.map((id, i) => ({
      teamId: id,
      name: teamNames[i],
      signedTotal: totals[id] ?? 0,
      displayTotal: totals[id] ?? 0,
    }));
    snapshot.match.result = {
      teams: teamScores,
      winnerTeamId,
      tie,
      worlds: [],
    };
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
      if (actor === a)
        allow("mode:submit-moving-xo-answer", "mode:place-moving-xo-mark");
      setMatchEnd(a, { [a]: 1, [b]: 0 });
      break;
    }
    case "ryo":
    case undefined: {
      const label = (id: string) =>
        example.options.find((o) => o.id === id)?.label ?? "";
      const teamId = example.outcome.teamRole === "answering" ? a : b;
      const otherTeamId = teamId === a ? b : a;
      const ryoWinner =
        example.outcome.delta > 0
          ? teamId
          : example.outcome.delta < 0
            ? otherTeamId
            : null;
      const payload = {
        correct: example.outcome.correct,
        selectedAnswer: label(example.answeringSelectionOptionId),
        correctAnswer: label(example.correctOptionId),
        decision: example.opposingDecision.toLowerCase(),
        teamId,
        delta: example.outcome.delta,
        readMatchedOutcome:
          example.outcome.teamRole === "opposing" && example.outcome.delta > 0,
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
        submissions: [],
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
      setMatchEnd(ryoWinner, {
        [teamId]: example.outcome.delta,
        [otherTeamId]: 0,
      });
      break;
    }
    case "closest": {
      const { outcome } = example;
      Object.assign(state, {
        phase: step ? "revealed" : "collecting",
        currentItemJson: json({ id: "example", prompt: example.prompt }),
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
      allow("mode:submit-estimate");
      setMatchEnd(
        outcome.winnerTeam,
        {
          [a]: outcome.winnerTeam === a ? 1 : 0,
          [b]: outcome.winnerTeam === b ? 1 : 0,
        },
        outcome.tie,
      );
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
      if (actor === active) allow("mode:submit-answer");
      setMatchEnd(example.outcome.winnerTeam, {
        [a]: example.outcome.winnerTeam === a ? 1 : 0,
        [b]: example.outcome.winnerTeam === b ? 1 : 0,
      });
      break;
    }
    case "top-5": {
      const turn = example.outcome.ownership[0];
      const activeTurn = example.outcome.ownership[step === 1 ? 1 : 0];
      Object.assign(state, {
        phase: step === 2 ? "completed" : "deciding",
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
      if (actor === state.activeTeamId) allow("mode:decide-card");
      setMatchEnd(example.outcome.winnerTeam, example.outcome.top5Counts);
      break;
    }
    case "combo": {
      const question =
        example.stages.find(
          (s) => s.stage === example.outcome.forcedQuestionStage,
        ) ?? example.stages.at(-1);
      if (!question) break;
      Object.assign(state, {
        phase: step === 2 ? "run-complete" : step ? "break-reveal" : "question",
        questionPrompt: json(question.prompt),
        questionNumber: question.stage,
        questionStage: question.stage,
        assignedParticipantId: a,
        unbankedPoints:
          step === 2 ? 0 : example.outcome.unbankedPointsBeforeForcedQuestion,
        forcedQuestion: true,
        comboBreakRevealedByTeamId: b,
        lastQuestionRevealJson:
          step === 1
            ? json({
                teamId: a,
                correct: false,
                submittedAnswer: question.submittedAnswer,
                correctAnswer: question.correctAnswer,
                earned: 0,
                resolvedAt: stamp,
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
      if (actor === a) allow("mode:submit-combo-answer");
      break;
    }
    case "odd-piece": {
      Object.assign(state, {
        phase: ["open", "revealed", "completed"][step],
        prompt: example.prompt,
        modifiedImageJson: json(example.modifiedImage),
        canClaim: !!actor && !step,
        revealJson: step ? json(example) : null,
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
      setMatchEnd(example.outcome.winnerTeam, example.outcome.points);
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
        phase: step === 2 ? "difficulty-choice" : "question",
        activeTeamId: active,
        isAssignedActor: actor === active,
        isActiveTeam: actor === active,
        assignedParticipantId: active,
        selectedDifficulty: example.difficulty,
        questionPrompt: json(example.prompt),
        positionsJson: json(positions),
        lastTurnJson: step
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
      if (actor === active) allow("mode:submit-marhala-answer");
      const posA = positions[a] ?? 0;
      const posB = positions[b] ?? 0;
      setMatchEnd(
        posA > posB ? a : posB > posA ? b : null,
        positions,
        posA === posB,
      );
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
      setMatchEnd(example.outcome.winnerTeam, example.outcome.finalTotals);
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
            committedCount: step > 0 ? (dish?.teamASelection.length ?? 0) : null,
          },
          [b]: {
            locked: step > 0,
            committedCount: step > 0 ? (dish?.teamBSelection.length ?? 0) : null,
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
      setMatchEnd(
        example.outcome.winnerTeam,
        example.outcome.finalTotals,
        example.outcome.tie,
      );
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
      setMatchEnd(matchWinner, example.outcome.points, matchWinner === null);
      break;
    }
  }
  return { snapshot, runtime };
}
