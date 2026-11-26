"use client";

import { ClosestResultRecap } from "../live-game-session/match/components/closest-result-recap";
import { RyoResultRecap } from "../live-game-session/match/components/ryo-result-recap";
import { OddPieceResultRecap } from "../live-game-session/match/components/odd-piece-result-recap";
import { MarhalaResultRecap } from "../live-game-session/match/components/marhala-result-recap";
import { MarhalaAnswerReveal } from "../live-game-session/match/components/marhala-answer-reveal";
import { ResultRoundCard } from "../live-game-session/match/components/challenge-result-banner";
import { usePrefersReducedMotion } from "./use-explainer-timeline";
import styles from "./scene.module.css";
import { LiveSessionContext } from "../live-game-session/hooks/live-session-context";
import { LiveSessionClockContext } from "../live-game-session/hooks/live-session-clock-context";
import { CountdownSurfaceProvider } from "../live-game-session/match/components/countdown-presentation";
import { MobileGameplayShell } from "../live-game-session/match/components/mobile-gameplay-shell";
import { MovingXoScreen } from "../live-game-session/components/moving-xo-screen";
import { MovingXoPhonePanel } from "../live-game-session/components/moving-xo-phone-panel";
import { RyoGameplayPanel } from "../live-game-session/components/ryo-gameplay-panel";
import { ClosestGameplayPanel } from "../live-game-session/components/closest-gameplay-panel";
import { BombGameplayPanel } from "../live-game-session/components/bomb-gameplay-panel";
import { Top5Panel } from "../live-game-session/components/top5-panel";
import { ComboGameplayPanel } from "../live-game-session/components/combo-gameplay-panel";
import { OddPieceGameplayPanel } from "../live-game-session/components/odd-piece-gameplay-panel";
import { MarhalaScreen } from "../live-game-session/components/marhala-screen";
import { MarhalaPhonePanel } from "../live-game-session/components/marhala-phone-panel";
import { BombResultRecap } from "../live-game-session/match/components/bomb-result-recap";
import { Top5ResultReveal } from "../live-game-session/match/components/top5-result-reveal";
import type { MatchChallengeResult } from "../live-game-session/match/types";
import { sceneProjection, type SceneExample } from "./scene-projection";
import { SceneTemplate } from "./scene-template";

const captions = {
  "moving-xo": [
    "جاوبوا اللغز عشان تاخذون حركة.",
    "إذا صح جوابكم، اختاروا خانة وثبّتوا العلامة.",
    "أول فريق يصف 3 علامات يفوز.",
  ],
  ryo: [
    "فريق يجاوب، وخصمه يتوقّع إذا يعرف الجواب.",
    "شوفوا الجواب الصحيح وقرار الخصم.",
    "شوفوا كيف أثّرت قراءة الخصم على نقاط الجولة.",
  ],
  closest: [
    "كل فريق يرسل تقديره من جواله.",
    "قارنوا تقدير كل فريق بالجواب الصحيح.",
    "الفريق الأقرب ياخذ الجولة، وإذا المسافة نفسها تتعادلون.",
  ],
  bomb: [
    "جاوبوا قبل ما يخلص وقتكم.",
    "الجواب الصح ينقل القنبلة للفريق الثاني.",
    "إذا خلص وقت فريق، يفوز خصمه.",
  ],
  "top-5": [
    "خلّوا البطاقة عندكم أو عطوها للخصم.",
    "شوفوا عند مين راحت البطاقة.",
    "اكشفوا الترتيب وشوفوا مين جمع أكثر من التوب 5.",
  ],
  combo: [
    "جاوبوا وقرروا تكمّلون الكومبو أو تحفظون نقاطكم.",
    "إذا الخصم كسر الكومبو، لازم تجاوبون السؤال الجاي.",
    "إذا غلطتم في سؤال الكسر، تروح النقاط اللي ما حفظتوها.",
  ],
  "odd-piece": [
    "لقّطوا القطعة الدخيلة وحددوا مكانها.",
    "شوفوا مكان القطعة وقارنوا الصورتين.",
    "النتيجة تبيّن نقاط الفريقين ومين فاز.",
  ],
  marhala: [
    "اختاروا الصعوبة وجاوبوا السؤال.",
    "الجواب الصح يحرّككم على اللوحة.",
    "شوفوا وين وقفتوا. أول فريق يوصل للنهاية يفوز.",
  ],
} as const;

export function GameScene({ example }: { example: SceneExample }) {
  return (
    <SceneTemplate
      captions={
        example.kind === "moving-xo" && !example.prompt
          ? [
              "ما فيه سؤال مثال منشور لهالعالم. جاوبوا اللغز عشان تاخذون حركة.",
              captions["moving-xo"][1],
              captions["moving-xo"][2],
            ]
          : captions[example.kind ?? "ryo"]
      }
      renderSurface={(step, team) => (
        <Surface
          key={step}
          example={example}
          step={step}
          {...(team ? { team } : {})}
        />
      )}
    />
  );
}
const noop = () => {};
function Surface({
  example,
  step,
  team,
}: {
  example: SceneExample;
  step: number;
  team?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const { runtime, snapshot } = sceneProjection(example, step, team);
  const baseResult: MatchChallengeResult = {
    id: "example",
    positionKey: "example",
    occurrenceIndex: 1,
    slotKey: "slot_1",
    worldId: "example",
    challengeTypeId: runtime.mode.key,
    challengeKey: runtime.mode.key,
    selectedScopeIds: [],
    winnerTeamId: null,
    tie: false,
    matchPoints: [],
    startedAt: snapshot.createdAt,
    completedAt: snapshot.createdAt,
    details: {},
  };
  const teamName = (id: string) =>
    snapshot.teams.find((t) => t.id === id)?.name ?? "الفريق";
  function content() {
    switch (example.kind) {
      case "moving-xo":
        return team ? (
          <MovingXoPhonePanel runtime={runtime} />
        ) : (
          <MovingXoScreen runtime={runtime} />
        );
      case "ryo":
      case undefined:
        if (step === 2 && !team) {
          const owner =
            example.outcome.teamRole === "answering" ? "team-a" : "team-b";
          const answer = (id: string) =>
            example.options.find((o) => o.id === id)?.label;
          const item = {
            itemIndex: 0,
            prompt: example.prompt,
            answeringTeamId: "team-a",
            opposingTeamId: "team-b",
            selectedAnswer: answer(example.answeringSelectionOptionId),
            correctAnswer: answer(example.correctOptionId),
            decision: example.opposingDecision.toLowerCase(),
            correct: example.outcome.correct,
            mechanicPoints: [{ teamId: owner, points: example.outcome.delta }],
          };
          return (
            <div className={styles.roundOnly}>
              <RyoResultRecap
                result={{ ...baseResult, details: { items: [item] } }}
                snapshot={snapshot}
              />
            </div>
          );
        }
        return <RyoGameplayPanel runtime={runtime} />;
      case "closest":
        if (step === 2 && !team)
          return (
            <div className={styles.roundOnly}>
              <ClosestResultRecap
                result={{
                  ...baseResult,
                  details: {
                    items: [
                      {
                        itemIndex: 0,
                        ...JSON.parse(
                          String(runtime.modeState.revealedResultJson),
                        ),
                      },
                    ],
                  },
                }}
                snapshot={snapshot}
              />
            </div>
          );
        return <ClosestGameplayPanel runtime={runtime} />;
      case "combo":
        return <ComboGameplayPanel runtime={runtime} />;
      case "odd-piece":
        if (step === 2 && !team)
          return (
            <OddPieceResultRecap
              snapshot={snapshot}
              result={{
                ...baseResult,
                winnerTeamId: example.outcome.winnerTeam,
                details: { points: example.outcome.points },
              }}
            />
          );
        return (
          <OddPieceGameplayPanel
            runtime={runtime}
            actor={team ? "participant" : "shared-screen"}
          />
        );
      case "marhala":
        if (step === 2 && !team)
          return (
            <div className={styles.turnOnly}>
              <MarhalaResultRecap
                result={{
                  ...baseResult,
                  details: {
                    positions: {
                      "team-a": example.outcome.teamAPosition,
                      "team-b": example.outcome.teamBPosition,
                    },
                  },
                }}
                snapshot={snapshot}
              />
            </div>
          );
        if (step === 1)
          return (
            <MarhalaAnswerReveal
              turn={{
                ...example.outcome,
                turnNumber: 1,
                teamId: example.activeTeam,
                resolvedBy: "answer",
                correctAnswer: example.correctAnswer,
                submittedAnswer: example.submittedAnswer,
              }}
              teamName={teamName}
              compact={!!team}
            />
          );
        return team ? (
          <MarhalaPhonePanel runtime={runtime} />
        ) : (
          <MarhalaScreen runtime={runtime} />
        );
      case "bomb":
      case "top-5": {
        if (example.kind === "bomb" && step === 1 && !team)
          return (
            <ol>
              <ResultRoundCard
                snapshot={snapshot}
                round={1}
                question={example.prompt}
                stamp={{ label: "إجابة صحيحة", tone: "correct" }}
                facts={[
                  {
                    label: teamName(example.startingTeam),
                    value: example.acceptedAnswer,
                  },
                ]}
              />
            </ol>
          );
        if (step !== 2 || (team && example.kind === "top-5"))
          return example.kind === "bomb" ? (
            <BombGameplayPanel runtime={runtime} />
          ) : (
            <Top5Panel runtime={runtime} />
          );
        const winnerTeamId = example.outcome.winnerTeam;
        const result: MatchChallengeResult = {
          ...baseResult,
          winnerTeamId,
          matchPoints: [{ teamId: winnerTeamId, points: 1 }],
          details:
            example.kind === "bomb"
              ? {
                  items: [
                    {
                      teamId: example.startingTeam,
                      prompt: example.prompt,
                      submittedAnswer: example.acceptedAnswer,
                      correctAnswer: example.acceptedAnswer,
                      outcome: "correct",
                    },
                    ...(example.nextQuestion
                      ? [
                          {
                            teamId: example.outcome.expiredTeam,
                            prompt: (
                              example.returnQuestion ?? example.nextQuestion
                            ).prompt,
                            submittedAnswer: null,
                            correctAnswer: (
                              example.returnQuestion ?? example.nextQuestion
                            ).acceptedAnswer,
                            outcome: "timeout",
                          },
                        ]
                      : []),
                  ],
                }
              : {
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
        return example.kind === "bomb" ? (
          <BombResultRecap result={result} snapshot={snapshot} />
        ) : (
          <div className={reduced ? styles.instantReveal : undefined}>
            <Top5ResultReveal
              result={result}
              snapshot={snapshot}
              stepMs={reduced ? 0 : 270}
            />
          </div>
        );
      }
    }
  }
  const panel = content();
  return (
    <LiveSessionContext.Provider
      value={{
        snapshot,
        connection: "connected",
        command: noop,
        gameplayCommand: noop,
        snapshotReceivedAtMs: Date.parse(snapshot.createdAt),
      }}
    >
      <LiveSessionClockContext.Provider value={Date.parse(snapshot.createdAt)}>
        <CountdownSurfaceProvider surface="compact">
          {team ? (
            <MobileGameplayShell participantId={team}>
              {panel}
            </MobileGameplayShell>
          ) : (
            panel
          )}
        </CountdownSurfaceProvider>
      </LiveSessionClockContext.Provider>
    </LiveSessionContext.Provider>
  );
}
