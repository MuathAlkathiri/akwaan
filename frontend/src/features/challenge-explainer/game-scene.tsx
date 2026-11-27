"use client";

import {
  QueryClient,
  QueryClientContext,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useContext, useEffect, useMemo, useState } from "react";
import { Top5ResultReveal } from "../live-game-session/match/components/top5-result-reveal";
import styles from "./scene.module.css";
import { LiveSessionContext } from "../live-game-session/hooks/live-session-context";
import { LiveSessionClockContext } from "../live-game-session/hooks/live-session-clock-context";
import { CountdownSurfaceProvider } from "../live-game-session/match/components/countdown-presentation";
import { MobileGameplayShell } from "../live-game-session/match/components/mobile-gameplay-shell";
import { ParticipantWaiting } from "../live-game-session/match/components/participant-waiting";
import { UnifiedChallengeResultStage } from "../live-game-session/match/components/unified-challenge-result-stage";
import { MovingXoScreen } from "../live-game-session/components/moving-xo-screen";
import { MovingXoPhonePanel } from "../live-game-session/components/moving-xo-phone-panel";
import { RyoGameplayPanel } from "../live-game-session/components/ryo-gameplay-panel";
import { ClosestGameplayPanel } from "../live-game-session/components/closest-gameplay-panel";
import { BombGameplayPanel } from "../live-game-session/components/bomb-gameplay-panel";
import { Top5Panel } from "../live-game-session/components/top5-panel";
import { ComboGameplayPanel } from "../live-game-session/components/combo-gameplay-panel";
import { OddPieceGameplayPanel } from "../live-game-session/components/odd-piece-gameplay-panel";
import { MarhalaScreen } from "../live-game-session/components/marhala-screen";
import type { GameplayRuntimeSnapshot } from "../live-game-session/model";
import { MarhalaPhonePanel } from "../live-game-session/components/marhala-phone-panel";
import { EkshifniGameplayPanel } from "../live-game-session/components/ekshifni-gameplay-panel";
import { LaTahriqhaGameplayPanel } from "../live-game-session/components/la-tahriqha-gameplay-panel";
import { FirstNoteGameplayPanel } from "../live-game-session/components/first-note-gameplay-panel";
import { playerCatalogKeys } from "../worlds/hooks/use-player-catalog";
import {
  sceneProjection,
  type SceneExample,
  type SceneWorldContext,
} from "./scene-projection";
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
    "الفريقين يقدّرون الرقم بالمؤشر في نفس الوقت.",
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

/**
 * What each phone is doing in each step, as the approved boards label them.
 *
 * `[الفريق الأول, الفريق الثاني]` per step. The first team is the one the
 * projection puts in the acting seat, so the pill and the phone under it always
 * tell the same story.
 */
const deviceRoles = {
  "moving-xo": [
    ["يجاوب", "ينتظر دوره"],
    ["الكابتن يختار الخانة", "ينتظر دوره"],
    ["يتابع الشاشة", "يتابع الشاشة"],
  ],
  ryo: [
    ["يجاوب", "يقرأ الخصم"],
    ["يتابع الشاشة", "يتابع الشاشة"],
    ["يشوف النتيجة", "يشوف النتيجة"],
  ],
  closest: [
    ["يقدّر", "يقدّر"],
    ["يتابع الشاشة", "يتابع الشاشة"],
    ["يشوف النتيجة", "يشوف النتيجة"],
  ],
  bomb: [
    ["القنبلة عنده", "ساعته واقفة"],
    ["ساعته وقفت", "القنبلة وصلته"],
    ["يشوف النتيجة", "يشوف النتيجة"],
  ],
  "top-5": [
    ["القائد يقرر", "ينتظر دوره"],
    ["يتابع الكشف", "يتابع الكشف"],
    ["يشوف النتيجة", "يشوف النتيجة"],
  ],
  combo: [
    ["يجاوب", "معه كسر الكومبو"],
    ["القائد يقرر", "معه كسر الكومبو"],
    ["يشوف النتيجة", "يشوف النتيجة"],
  ],
  "odd-piece": [
    ["ضغط «جاوب» أول", "يدوّر عليها"],
    ["يتابع الكشف", "يتابع الكشف"],
    ["يشوف النتيجة", "يشوف النتيجة"],
  ],
  marhala: [
    ["يختار المستوى", "ينتظر دوره"],
    ["يرمي النرد", "ينتظر دوره"],
    ["يشوف النتيجة", "يشوف النتيجة"],
  ],
  ekshifni: [
    ["يكشف منطقة", "ينتظر دوره"],
    ["يكشف أو يجاوب", "يكشف أو يجاوب"],
    ["يشوف النتيجة", "يشوف النتيجة"],
  ],
  "la-tahriqha": [
    ["قائد الطبق يختار", "قائد الطبق يختار"],
    ["يتابع الكشف", "يتابع الكشف"],
    ["يشوف النتيجة", "يشوف النتيجة"],
  ],
  "first-note": [
    ["الكابتن يزايد", "كابتنهم زايد وينتظر"],
    ["يجاوب أول", "ينتظر فرصة السرقة"],
    ["يشوف النتيجة", "يشوف النتيجة"],
  ],
} as const;

export function GameScene({
  example,
  world,
}: {
  example: SceneExample;
  world?: SceneWorldContext;
}) {
  return (
    <SceneTemplate
      captions={captions[example.kind ?? "ryo"]}
      roles={deviceRoles[example.kind ?? "ryo"]}
      renderSurface={(step, team) => (
        <Surface
          key={step}
          example={example}
          step={step}
          {...(team ? { team } : {})}
          {...(world ? { world } : {})}
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

/**
 * المرحلة's second step: the board, replaying the turn it has just been told
 * about.
 *
 * The board's own replay only runs when a *new* turn arrives, so the scene
 * mounts without one and hands it over a beat later. The reveal, the roll and
 * the walk are then the board's own, not a card drawn beside it.
 */
function MarhalaTurnScene({
  runtime,
  phone,
}: {
  runtime: GameplayRuntimeSnapshot;
  phone: boolean;
}) {
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setPlayed(true), 120);
    return () => window.clearTimeout(timer);
  }, []);
  const waiting = useMemo(() => {
    const modeState = { ...runtime.modeState, lastTurnJson: null };
    return {
      ...runtime,
      modeState,
      ...(runtime.activeRound
        ? { activeRound: { ...runtime.activeRound, modeState } }
        : {}),
    };
  }, [runtime]);
  const live = played ? runtime : waiting;
  return phone ? (
    <MarhalaPhonePanel runtime={live} />
  ) : (
    <MarhalaScreen runtime={live} />
  );
}

function InertResultStage() {
  const parentClient = useContext(QueryClientContext);
  const cachedWorlds = parentClient?.getQueryData(playerCatalogKeys.worlds);
  const inertClient = useMemo(() => {
    const client = new QueryClient({
      defaultOptions: {
        queries: {
          enabled: false,
          retry: false,
          staleTime: Infinity,
          refetchOnMount: false,
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
        },
      },
    });
    client.setQueryData(playerCatalogKeys.worlds, cachedWorlds ?? []);
    return client;
  }, [cachedWorlds]);
  return (
    <QueryClientProvider client={inertClient}>
      <UnifiedChallengeResultStage actor="shared-screen" previewOnly />
    </QueryClientProvider>
  );
}

function Surface({
  example,
  step,
  team,
  world,
}: {
  example: SceneExample;
  step: number;
  team?: string;
  world?: SceneWorldContext;
}) {
  const { runtime, snapshot } = sceneProjection(example, step, team, world);
  const teamName = (id: string) =>
    snapshot.teams.find((t) => t.id === id)?.name ?? "الفريق";
  function content() {
    if (step === 2) {
      const challengeResult = snapshot.match?.challengeResult;
      if (team) {
        return (
          <ParticipantWaiting
            teamName={teamName(team)}
            {...(challengeResult ? { challengeResult } : {})}
          />
        );
      }
      if (example.kind === "moving-xo") {
        return <MovingXoScreen runtime={runtime} />;
      }
      if (example.kind === "marhala") {
        return <MarhalaScreen runtime={runtime} />;
      }
      return <InertResultStage />;
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
        if (step === 1 && !team) {
          return (
            <div className={styles.panelFill}>
              <RyoGameplayPanel runtime={runtime} />
              <p data-testid="ryo-explain-line" className={styles.ryoExplain}>
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
        return <ClosestGameplayPanel runtime={runtime} />;
      case "combo":
        return <ComboGameplayPanel runtime={runtime} />;
      case "odd-piece":
        return (
          <OddPieceGameplayPanel
            runtime={runtime}
            actor={team ? "participant" : "shared-screen"}
          />
        );
      case "marhala":
        if (step === 1) {
          return <MarhalaTurnScene runtime={runtime} phone={!!team} />;
        }
        return team ? (
          <MarhalaPhonePanel runtime={runtime} />
        ) : (
          <MarhalaScreen runtime={runtime} />
        );
      case "bomb":
        return <BombGameplayPanel runtime={runtime} />;
      case "top-5":
        // Step 2 is the reveal itself, card by card, on the shared screen.
        return !team && step === 1 && snapshot.match?.challengeResult ? (
          <Top5ResultReveal
            result={snapshot.match.challengeResult}
            snapshot={snapshot}
          />
        ) : (
          <Top5Panel runtime={runtime} />
        );
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
