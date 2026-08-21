"use client";

import { useEffect, useMemo, useState } from "react";
import { BidiText } from "@/components/akwaan/bidi-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";
import {
  COMBO_CHALLENGE_NAME,
  comboIsFinalRun,
  comboProgressValue,
  comboPromptText,
  comboRunNumber,
  comboRunOf,
  comboStreakPoints,
  describeComboRunEnd,
  readComboView,
  type ComboView,
} from "../match/combo.presentation";

/**
 * "الكومبو" — one panel for the shared screen and both teams' phones.
 *
 * Which of the three a viewer gets is not decided here. The server builds a
 * different projection per actor, and this component only renders what its own
 * projection contains: the running team gets `isActiveTeam`, the team still
 * holding a charge gets `canArmComboBreak`, the team that has already armed gets
 * `ownComboBreakArmed`, and the shared screen gets none of them. Nothing about
 * the opponent's armed charge is inferable from what the other side receives.
 */
export function ComboGameplayPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const [answer, setAnswer] = useState("");
  const round = runtime.activeRound;
  const view = useMemo(
    () => readComboView(runtime.modeState),
    [runtime.modeState],
  );

  const terminal = view.phase === "completed" || view.phase === "run-complete";
  const remainingMs = useInteractionDeadline(
    view.deadlineAt,
    view.phase === "completed",
  );
  const live = connection === "connected";
  const can = (action: string) =>
    runtime.availableActions.includes(`mode:${action}`);

  const teamName = (id: string) =>
    snapshot?.teams.find((team) => team.id === id)?.name ?? "الفريق";

  // One panel instance serves eight questions across two runs. A typed answer
  // must never survive into the next question, even when the server advances the
  // run without remounting.
  useEffect(
    () => setAnswer(""),
    [
      runtime.runtimeId,
      round?.id,
      view.runIndex,
      view.questionNumber,
      view.phase,
    ],
  );

  const send = (
    commandType: string,
    payload: Record<string, string | number | boolean | null> = {},
  ) =>
    gameplayCommand("gameplay-command", {
      roundId: round?.id,
      commandType,
      payload,
    });

  const submit = () => {
    if (!answer.trim() || !live) return;
    send("submit-combo-answer", { answer: answer.trim() });
    setAnswer("");
  };

  return (
    <ChallengeFrame
      eyebrow={COMBO_CHALLENGE_NAME}
      title={
        view.phase === "completed"
          ? "نتيجة التحدي"
          : `الجولة ${comboRunNumber(view)} — السؤال ${view.questionNumber} من ${view.questionsPerRun}`
      }
      progressValue={comboProgressValue(view)}
      aside={
        remainingMs !== undefined && !terminal ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className="mx-auto max-w-4xl"
    >
      <div className="space-y-5" dir="rtl">
        {view.phase !== "completed" && (
          <StreakMeter view={view} teamName={teamName} />
        )}

        {view.phase === "question" && (
          <>
            {view.forcedQuestion && (
              <p
                className="rounded-[var(--radius)] bg-destructive px-4 py-3 text-center font-black text-destructive-foreground"
                data-testid="combo-forced-banner"
              >
                سؤال إجباري — لا يمكن السحب
                {view.breakRevealedByTeamId
                  ? ` · ${teamName(view.breakRevealedByTeamId)} كسر كومبوكم`
                  : ""}
              </p>
            )}
            <h2
              className="text-center text-[2rem] font-black leading-snug text-foreground sm:text-[2.5rem]"
              data-testid="combo-prompt"
            >
              <BidiText>{comboPromptText(view)}</BidiText>
            </h2>

            {view.isActiveTeam ? (
              <div
                className="mx-auto flex max-w-sm gap-2"
                data-testid="combo-answer-controls"
              >
                <Input
                  key={`${runtime.runtimeId}:${view.runIndex}:${view.questionNumber}`}
                  autoComplete="off"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && submit()}
                  placeholder="اكتب الإجابة"
                />
                <Button disabled={!answer.trim() || !live} onClick={submit}>
                  إرسال
                </Button>
              </div>
            ) : (
              <p className="rounded-[var(--radius)] bg-muted p-4 text-center font-bold text-muted-foreground">
                {`${teamName(view.activeTeamId)} يجيب الآن…`}
              </p>
            )}

            {/* The break is offered only when the server said this actor may arm
                one. It is never offered to the running team, and never a second
                time — both of those are the server's determination, not ours. */}
            {view.canArmComboBreak && can("arm-combo-break") && (
              <div className="text-center">
                <Button
                  variant="destructive"
                  size="lg"
                  disabled={!live}
                  onClick={() => send("arm-combo-break")}
                  data-testid="combo-arm-break"
                >
                  كسر الكومبو
                </Button>
                <p className="mt-2 text-sm font-bold text-muted-foreground">
                  تُستخدم مرة واحدة — الفريق الآخر لن يعرف
                </p>
              </div>
            )}
            {view.ownComboBreakArmed && (
              <p
                className="rounded-[var(--radius)] border border-destructive bg-destructive/10 p-4 text-center font-black text-destructive"
                data-testid="combo-armed-acknowledgement"
              >
                كسرتم الكومبو — سيظهر لهم فقط إذا نجوا من هذا السؤال
              </p>
            )}
          </>
        )}

        {view.phase === "decision" && (
          <section
            className="akwaan-rise space-y-4 text-center"
            data-testid="combo-decision"
          >
            <p className="text-xl font-black text-foreground">إجابة صحيحة!</p>
            {view.isActiveTeam ? (
              <div className="flex flex-wrap justify-center gap-3">
                {can("cash-out-combo") && (
                  <Button
                    size="lg"
                    disabled={!live}
                    onClick={() => send("cash-out-combo")}
                    data-testid="combo-cash-out"
                  >
                    {`اسحب ${comboStreakPoints(view)}`}
                  </Button>
                )}
                {can("continue-combo") && (
                  <Button
                    size="lg"
                    variant="outline"
                    disabled={!live}
                    onClick={() => send("continue-combo")}
                    data-testid="combo-continue"
                  >
                    واصل الكومبو
                  </Button>
                )}
              </div>
            ) : (
              <p className="rounded-[var(--radius)] bg-muted p-4 font-bold text-muted-foreground">
                {`${teamName(view.activeTeamId)} يقرر: يسحب أو يواصل…`}
              </p>
            )}
          </section>
        )}

        {view.phase === "break-reveal" && (
          <section
            className="akwaan-rise space-y-4 text-center"
            data-testid="combo-break-reveal"
          >
            <div className="rounded-[var(--radius)] bg-destructive px-5 py-4 text-destructive-foreground">
              <p className="text-sm font-bold opacity-80">كسر الكومبو</p>
              <p className="text-2xl font-black">
                {view.breakRevealedByTeamId
                  ? `${teamName(view.breakRevealedByTeamId)} كسر كومبوكم`
                  : "تم كسر الكومبو"}
              </p>
            </div>
            <p className="font-bold text-muted-foreground">
              نجوتم من السؤال — لكن السؤال القادم إجباري ولا يمكنكم السحب.
            </p>
            {view.isActiveTeam && can("continue-combo") ? (
              <Button
                size="lg"
                disabled={!live}
                onClick={() => send("continue-combo")}
                data-testid="combo-forced-continue"
              >
                السؤال الإجباري
              </Button>
            ) : (
              <p className="text-sm font-bold text-muted-foreground">
                {`بانتظار ${teamName(view.activeTeamId)}…`}
              </p>
            )}
          </section>
        )}

        {(view.phase === "run-complete" || view.phase === "completed") && (
          <RunRecap
            view={view}
            teamName={teamName}
            canAdvance={can("advance-combo-run")}
            live={live}
            onAdvance={() => send("advance-combo-run")}
          />
        )}
      </div>
    </ChallengeFrame>
  );
}

/**
 * The streak, and each side's charge.
 *
 * `unbankedPoints` is taken verbatim — the runtime already folded the survival
 * bonus in when it paid the forced question, so adding anything here would
 * double-count it.
 */
function StreakMeter({
  view,
  teamName,
}: {
  view: ComboView;
  teamName: (id: string) => string;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="combo-streak">
      <div className="rounded-[var(--radius)] bg-primary px-5 py-4 text-center text-primary-foreground">
        <p className="text-sm font-bold opacity-80">الكومبو الحالي</p>
        <p
          className="akwaan-numeral text-4xl font-black"
          data-testid="combo-streak-points"
        >
          {comboStreakPoints(view)}
        </p>
        <p className="text-sm font-bold opacity-80">
          {teamName(view.activeTeamId)}
        </p>
      </div>
      <div className="grid gap-2">
        {view.teamIds.map((teamId) => {
          const identity = teamIdentityOf(teamId, []);
          const spent = view.charges[teamId] === "spent";
          return (
            <div
              key={teamId}
              className={cn(
                "flex items-center justify-between rounded-[var(--radius)] border px-4 py-2",
                identity.surface,
                identity.border,
              )}
              data-testid={`combo-charge-${teamId}`}
            >
              <span className={cn("font-black", identity.text)}>
                {teamName(teamId)}
              </span>
              <span className="text-sm font-bold text-muted-foreground">
                {spent ? "استُخدم الكسر" : "الكسر متاح"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RunRecap({
  view,
  teamName,
  canAdvance,
  live,
  onAdvance,
}: {
  view: ComboView;
  teamName: (id: string) => string;
  /**
   * Whether the server offered `mode:advance-combo-run` to *this* actor. The
   * action list is built per actor through the same authorization check the
   * command itself asserts, so it already means "controller" — deriving the role
   * again on the client could only disagree with the server.
   */
  canAdvance: boolean;
  live: boolean;
  onAdvance: () => void;
}) {
  const finished = view.phase === "completed";
  return (
    <section
      className="akwaan-rise space-y-4 text-center"
      data-testid="combo-recap"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {view.teamIds.map((teamId) => {
          const identity = teamIdentityOf(teamId, []);
          const run = comboRunOf(view, teamId);
          return (
            <div
              key={teamId}
              className={cn(
                "rounded-[var(--radius)] border p-4",
                identity.surface,
                identity.border,
              )}
              data-testid={`combo-recap-${teamId}`}
            >
              <p className={cn("font-black", identity.text)}>
                {teamName(teamId)}
              </p>
              <p className="akwaan-numeral mt-1 text-3xl font-black">
                {run ? run.bankedPoints : "—"}
              </p>
              <p className="text-sm font-bold text-muted-foreground">
                {run ? describeComboRunEnd(run) : "لم تلعب بعد"}
              </p>
              {run?.brokenByTeamId ? (
                <p className="text-sm font-bold text-destructive">
                  {`على يد ${teamName(run.brokenByTeamId)}`}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {finished && view.result ? (
        <p className="text-xl font-black" data-testid="combo-result">
          {view.result.tie
            ? "تعادل!"
            : view.result.winnerTeamId
              ? `${teamName(view.result.winnerTeamId)} فاز بالتحدي!`
              : "انتهى التحدي"}
        </p>
      ) : canAdvance ? (
        <Button
          size="lg"
          disabled={!live}
          onClick={onAdvance}
          data-testid="combo-advance-run"
        >
          {comboIsFinalRun(view) ? "عرض نتيجة التحدي" : "دور الفريق الآخر"}
        </Button>
      ) : (
        <p className="text-sm font-bold text-muted-foreground">
          بانتظار المضيف للمتابعة…
        </p>
      )}
    </section>
  );
}
