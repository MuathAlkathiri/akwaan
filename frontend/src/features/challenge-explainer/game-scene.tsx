"use client";

import { ClosestResultRecap } from "../live-game-session/match/components/closest-result-recap";
import { RyoResultRecap } from "../live-game-session/match/components/ryo-result-recap";
import { OddPieceResultRecap } from "../live-game-session/match/components/odd-piece-result-recap";
import { MarhalaResultRecap } from "../live-game-session/match/components/marhala-result-recap";
import { MarhalaAnswerReveal } from "../live-game-session/match/components/marhala-answer-reveal";
import styles from "./scene.module.css";
import { LiveSessionContext } from "../live-game-session/hooks/live-session-context";
import { LiveSessionClockContext } from "../live-game-session/hooks/live-session-clock-context";
import { CountdownSurfaceProvider } from "../live-game-session/match/components/countdown-presentation";
import { MobileGameplayShell } from "../live-game-session/match/components/mobile-gameplay-shell";
import { ParticipantWaiting } from "../live-game-session/match/components/participant-waiting";
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
import { EkshifniGameplayPanel } from "../live-game-session/components/ekshifni-gameplay-panel";
import { LaTahriqhaGameplayPanel } from "../live-game-session/components/la-tahriqha-gameplay-panel";
import { FirstNoteGameplayPanel } from "../live-game-session/components/first-note-gameplay-panel";
import { BombResultRecap } from "../live-game-session/match/components/bomb-result-recap";
import { Top5ResultReveal } from "../live-game-session/match/components/top5-result-reveal";
import type { MatchChallengeResult } from "../live-game-session/match/types";
import { sceneProjection, type SceneExample } from "./scene-projection";
import { SceneTemplate } from "./scene-template";

const captions = {
  "moving-xo": [
    "الفريق اللي عليه الدور يجاوب من جواله. الجواب الصح يعطيكم علامة.",
    "الكابتن يحط العلامة. عندكم 3 بس، والرابعة تنقل أقدم وحدة. والغلط يعطي الدور للخصم.",
    "أول فريق يصف 3 علامات في خط واحد يفوز بالتحدي.",
  ],
  ryo: [
    "فريق يجاوب، والخصم يقرر: متأكد منهم ولا شاكك فيهم؟",
    "تنكشف الإجابة. القراءة الصح تعطيكم نقطة، والغلط تاخذ منكم وحدة.",
    "الأكثر نقاط بعد 3 أسئلة يفوز بالتحدي.",
  ],
  closest: [
    "الفريقين يقدّرون الرقم بالسلايدر في نفس الوقت.",
    "ينكشف الرقم الصح، والأقرب له ياخذ النقطة.",
    "الأكثر نقاط بعد 3 أسئلة يفوز بالتحدي.",
  ],
  bomb: [
    "القنبلة عندك وساعتك تمشي. جاوب صح عشان ترميها على خصمك.",
    "الجواب الصح ينقل القنبلة للخصم وتبدأ ساعته. والتخطي يكلفك 5 ثواني.",
    "اللي تخلص ساعته والقنبلة عنده يخسر التحدي.",
  ],
  "top-5": [
    "تطلع بطاقة: تحتفظون فيها، ولا تدسّونها على الخصم؟",
    "البطاقات تنكشف وحدة وحدة. كل بطاقة عندكم من التوب 5 تعطيكم نقطة.",
    "الأكثر نقاط بعد كشف البطاقات العشر يفوز بالتحدي.",
  ],
  combo: [
    "فريق يجاوب أسئلة ورا بعض، وكل جواب صح يزيد رصيده.",
    "بعد كل جواب صح: ثبّت الرصيد أو كمّل. الغلط يطيّره كله، والخصم يقدر يكسر الكومبو.",
    "كل فريق يلعب جولته، والأكثر نقاط يفوز بالتحدي.",
  ],
  "odd-piece": [
    "في الصورة قطعة مو منها. أول فريق يضغط «جاوب» يلمس مكانها في جواله.",
    "ينكشف مكان القطعة مع الصورة الأصلية. اللمسة الصح تعطي نقطة.",
    "الأكثر نقاط بعد 3 صور يفوز بالتحدي.",
  ],
  marhala: [
    "اختاروا مستوى السؤال. كل ما صعب السؤال كبر النرد.",
    "جاوبتوا صح؟ ترمون النرد وتتقدمون. السلم يطلّعكم، والزحليقة تنزّلكم لآخر نقطة حفظ.",
    "أول فريق يوصل النهاية يفوز بالتحدي.",
  ],
  ekshifni: [
    "الصورة مغطاة. كل منطقة تنكشف تنقّص قيمة الصورة نقطة.",
    "عرفته؟ جاوب من جوالك. اللي يعرفه أول ياخذ قيمة الصورة الباقية.",
    "الأكثر نقاط بعد 3 صور يفوز بالتحدي.",
  ],
  "la-tahriqha": [
    "قائد الطبق يختار من 3 إلى 5 مكونات. مكوّن واحد غلط يحرق الطبق كله.",
    "تنكشف المكونات. 3 صح تعطي 3 نقاط، 4 تعطي 4، و5 تعطي 7.",
    "الأكثر نقاط بعد 3 أطباق يفوز بالتحدي.",
  ],
  "first-note": [
    "زايدوا: في كم ثانية تعرفون الأغنية؟ كل ما قلّ الوقت زادت النقاط.",
    "صاحب أقل مزايدة يسمع المقطع ويجاوب أول. لو غلط، الخصم يحاول يسرقها.",
    "الأكثر نقاط بعد 3 أغاني يفوز بالتحدي.",
  ],
} as const;

export function GameScene({ example }: { example: SceneExample }) {
  return (
    <SceneTemplate
      captions={captions[example.kind ?? "ryo"]}
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

function ryoExplainLine(
  example: Extract<SceneExample, { kind?: "ryo" }>,
  answeringName: string,
  opposingName: string,
) {
  const correct = example.outcome.correct;
  const trusted = example.opposingDecision === "STEAL";
  if (correct && trusted) {
    return `${answeringName} جاوب صح، و${opposingName} قرأهم صح وسرق النقطة.`;
  }
  if (!correct && !trusted) {
    return `${answeringName} جاوب غلط، و${opposingName} شكّ فيهم صح وأخذ النقطة.`;
  }
  if (correct && !trusted) {
    return `${answeringName} جاوب صح، و${opposingName} شكّ فيهم غلط وخسر نقطة.`;
  }
  return `${answeringName} جاوب غلط، و${opposingName} وثق فيهم غلط وخسر نقطة.`;
}

function Surface({
  example,
  step,
  team,
}: {
  example: SceneExample;
  step: number;
  team?: string;
}) {
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
    if (step === 2 && team && snapshot.match?.result) {
      return (
        <ParticipantWaiting
          matchComplete
          teamId={team}
          teamName={teamName(team)}
        />
      );
    }
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
            <div className={`${styles.centeredRecap} ${styles.roundOnly}`}>
              <RyoResultRecap
                result={{ ...baseResult, details: { items: [item] } }}
                snapshot={snapshot}
              />
            </div>
          );
        }
        if (step === 1 && !team) {
          return (
            <div className={styles.panelFill}>
              <RyoGameplayPanel runtime={runtime} />
              <p
                data-testid="ryo-explain-line"
                className={styles.ryoExplain}
              >
                {ryoExplainLine(
                  example,
                  teamName("team-a"),
                  teamName("team-b"),
                )}
              </p>
            </div>
          );
        }
        return <RyoGameplayPanel runtime={runtime} />;
      case "closest":
        if (step === 2 && !team)
          return (
            <div className={`${styles.centeredRecap} ${styles.roundOnly}`}>
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
            <div className={styles.centeredRecap}>
              <OddPieceResultRecap
                snapshot={snapshot}
                result={{
                  ...baseResult,
                  winnerTeamId: example.outcome.winnerTeam,
                  details: { points: example.outcome.points },
                }}
              />
            </div>
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
            <div className={`${styles.centeredRecap} ${styles.turnOnly}`}>
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
        if (step === 1) {
          if (team && team !== example.activeTeam) {
            return <MarhalaPhonePanel runtime={runtime} />;
          }
          const reveal = (
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
            reveal
          ) : (
            <div className={styles.centeredRecap}>{reveal}</div>
          );
        }
        return team ? (
          <MarhalaPhonePanel runtime={runtime} />
        ) : (
          <MarhalaScreen runtime={runtime} />
        );
      case "bomb":
      case "top-5": {
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
          <div className={styles.centeredRecap}>
            <BombResultRecap result={result} snapshot={snapshot} />
          </div>
        ) : (
          <div className={styles.panelFill}>
            <Top5ResultReveal
              result={result}
              snapshot={snapshot}
              stepMs={0}
            />
          </div>
        );
      }
      case "ekshifni":
        return (
          <EkshifniGameplayPanel
            runtime={runtime}
            actor={team ? "participant" : "shared-screen"}
          />
        );
      case "la-tahriqha":
        return <LaTahriqhaGameplayPanel runtime={runtime} />;
      case "first-note":
        return (
          <FirstNoteGameplayPanel
            runtime={runtime}
            actor={team ? "participant" : "shared-screen"}
          />
        );
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
