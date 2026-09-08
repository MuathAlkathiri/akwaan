"use client";

import { useEffect, useMemo, useState } from "react";
import { BidiText } from "@/components/akwaan/bidi-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useMobileSurface } from "../match/components/mobile-gameplay-shell";
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
  const [sending, setSending] = useState<
    "answer" | "cash-out" | "continue" | "force" | undefined
  >();
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
  const phone = useMobileSurface();
  const can = (action: string) =>
    runtime.availableActions.includes(`mode:${action}`);

  const teamName = (id: string) =>
    snapshot?.teams.find((team) => team.id === id)?.name ?? "الفريق";

  // One panel instance serves eight questions across two runs. A typed answer
  // must never survive into the next question, even when the server advances the
  // run without remounting.
  useEffect(
    () => {
      setAnswer("");
      setSending(undefined);
    },
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
    if (!answer.trim() || !live || sending) return;
    setSending("answer");
    send("submit-combo-answer", { answer: answer.trim() });
    setAnswer("");
  };

  const decide = (decision: "cash-out" | "continue") => {
    if (!live || sending) return;
    setSending(decision);
    send(decision === "cash-out" ? "cash-out-combo" : "continue-combo");
  };

  const force = () => {
    if (!live || sending) return;
    setSending("force");
    send("arm-combo-break");
  };

  if (phone) {
    return (
      <PhoneComboController
        runtime={runtime}
        view={view}
        answer={answer}
        setAnswer={setAnswer}
        sending={sending}
        live={live}
        remainingMs={remainingMs}
        can={can}
        teamName={teamName}
        submit={submit}
        decide={decide}
        force={force}
      />
    );
  }

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

function PhoneComboController({
  runtime,
  view,
  answer,
  setAnswer,
  sending,
  live,
  remainingMs,
  can,
  teamName,
  submit,
  decide,
  force,
}: {
  runtime: GameplayRuntimeSnapshot;
  view: ComboView;
  answer: string;
  setAnswer: (value: string) => void;
  sending: "answer" | "cash-out" | "continue" | "force" | undefined;
  live: boolean;
  remainingMs?: number;
  can: (action: string) => boolean;
  teamName: (id: string) => string;
  submit: () => void;
  decide: (decision: "cash-out" | "continue") => void;
  force: () => void;
}) {
  const latestRun = view.runResults.at(-1);
  const broken =
    latestRun?.endedBy === "combo-break" || latestRun?.endedBy === "timeout";
  const awaitingOpponent = !view.isActiveTeam;

  return (
    <ChallengeFrame
      compact
      title={
        view.phase === "completed"
          ? "انتهى التحدي"
          : `الجولة ${comboRunNumber(view)} · السؤال ${view.questionNumber} من ${view.questionsPerRun}`
      }
      progressValue={comboProgressValue(view)}
      aside={
        remainingMs !== undefined && view.phase === "question" ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        className="flex min-h-0 flex-1 flex-col gap-3 text-center"
        dir="rtl"
        data-testid="combo-phone-controller"
      >
        {view.phase !== "completed" && view.phase !== "run-complete" && (
          <div className="shrink-0" data-testid="combo-phone-balance">
            <p className="text-xs font-bold text-muted-foreground">
              الرصيد غير المثبّت
            </p>
            <p className="akwaan-numeral text-3xl font-black text-foreground">
              {comboStreakPoints(view)}
            </p>
          </div>
        )}

        {view.phase === "question" && view.isActiveTeam && (
          <section className="flex min-h-0 flex-1 flex-col" data-testid="combo-phone-answer">
            <div className="flex flex-1 flex-col justify-center gap-3">
              {view.forcedQuestion && (
                <p className="font-black text-destructive" data-testid="combo-phone-forced">
                  الخصم أجبركم تكملون
                </p>
              )}
              <h2 className="text-base font-black leading-relaxed text-foreground">
                <BidiText>{comboPromptText(view)}</BidiText>
              </h2>
              <Input
                key={`${runtime.runtimeId}:${view.runIndex}:${view.questionNumber}`}
                autoComplete="off"
                enterKeyHint="send"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                onKeyDown={(event) => event.key === "Enter" && submit()}
                placeholder="اكتب الإجابة"
                className="h-16 text-center text-xl font-black"
                data-testid="combo-answer-input"
              />
            </div>
            <MobileActionArea>
              <Button
                size="lg"
                disabled={!answer.trim() || !live || Boolean(sending)}
                onClick={submit}
                className="h-14 w-full text-base font-black"
                data-testid="combo-answer-submit"
              >
                {sending === "answer" ? "جارٍ الإرسال…" : "إرسال الإجابة"}
              </Button>
            </MobileActionArea>
          </section>
        )}

        {view.phase === "decision" && (
          <section className="flex min-h-0 flex-1 flex-col" data-testid="combo-phone-decision">
            {view.isActiveTeam ? (
              <>
                <div className="flex flex-1 flex-col items-center justify-center gap-1">
                  <p className="text-2xl font-black text-foreground">وش تبون تسوون؟</p>
                  <p className="text-sm font-bold text-muted-foreground">
                    ثبّتوا {comboStreakPoints(view)} أو خاطروا بالرصيد كاملًا
                  </p>
                </div>
                <MobileActionArea className="grid grid-cols-2">
                  {can("cash-out-combo") && (
                    <Button
                      size="lg"
                      variant="outline"
                      disabled={!live || Boolean(sending)}
                      onClick={() => decide("cash-out")}
                      className="h-16 w-full text-xl font-black"
                      data-testid="combo-phone-cash-out"
                    >
                      {sending === "cash-out" ? "جارٍ التثبيت…" : "ثبّت"}
                    </Button>
                  )}
                  {can("continue-combo") && (
                    <Button
                      size="lg"
                      variant="outline"
                      disabled={!live || Boolean(sending)}
                      onClick={() => decide("continue")}
                      className="h-16 w-full text-xl font-black"
                      data-testid="combo-phone-continue"
                    >
                      {sending === "continue" ? "جارٍ المتابعة…" : "كمّل"}
                    </Button>
                  )}
                </MobileActionArea>
              </>
            ) : (
              <PhoneWaiting>{teamName(view.activeTeamId)} يقررون الآن…</PhoneWaiting>
            )}
          </section>
        )}

        {view.phase === "break-reveal" && (
          <section className="flex min-h-0 flex-1 flex-col" data-testid="combo-phone-break-reveal">
            <div className="flex flex-1 flex-col items-center justify-center gap-2">
              <p className="text-2xl font-black text-destructive">الخصم أجبركم تكملون</p>
              <p className="text-sm font-bold text-muted-foreground">ما تقدرون تثبّتون الآن</p>
            </div>
            {view.isActiveTeam && can("continue-combo") ? (
              <MobileActionArea>
                <Button
                  size="lg"
                  disabled={!live || Boolean(sending)}
                  onClick={() => decide("continue")}
                  className="h-16 w-full text-lg font-black"
                  data-testid="combo-phone-forced-continue"
                >
                  {sending === "continue" ? "جارٍ المتابعة…" : "ابدأ السؤال الإجباري"}
                </Button>
              </MobileActionArea>
            ) : (
              <PhoneWaiting>بانتظار الفريق…</PhoneWaiting>
            )}
          </section>
        )}

        {view.phase === "question" && awaitingOpponent && (
          <section className="flex min-h-0 flex-1 flex-col" data-testid="combo-phone-opponent-run">
            <PhoneWaiting>{teamName(view.activeTeamId)} يجيبون الآن…</PhoneWaiting>
            {view.canArmComboBreak && can("arm-combo-break") && (
              <MobileActionArea>
                <Button
                  size="lg"
                  variant="outline"
                  disabled={!live || Boolean(sending)}
                  onClick={force}
                  className="h-14 w-full border-brand-gold/70 text-base font-black"
                  data-testid="combo-phone-force"
                >
                  {sending === "force" ? "جارٍ الإرسال…" : "كمّل غصب"}
                </Button>
                <p className="text-xs font-bold text-muted-foreground">
                  إذا جاوبوا صح، ما يقدرون يثبّتون
                </p>
              </MobileActionArea>
            )}
            {view.ownComboBreakArmed && (
              <p className="mt-auto rounded-[var(--radius)] bg-muted p-4 font-black" data-testid="combo-phone-force-sent">
                تم الإرسال سرًا — ننتظر إجابتهم
              </p>
            )}
          </section>
        )}

        {(view.phase === "run-complete" || view.phase === "completed") && (
          <section className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2" data-testid="combo-phone-run-result">
            {broken ? (
              <>
                <p className="text-3xl font-black text-destructive">انكسر الكومبو</p>
                <p className="font-bold text-muted-foreground">ضاع الرصيد غير المثبّت</p>
              </>
            ) : latestRun ? (
              <>
                <p className="text-2xl font-black text-foreground">تم تثبيت الرصيد</p>
                <p className="akwaan-numeral text-4xl font-black text-brand-gold">{latestRun.bankedPoints}</p>
              </>
            ) : (
              <p className="text-xl font-black">انتهى التحدي</p>
            )}
            <p className="text-sm font-bold text-muted-foreground">
              {view.phase === "completed" ? "انتظروا نتيجة الشاشة" : "بانتظار الجولة التالية…"}
            </p>
          </section>
        )}
      </div>
    </ChallengeFrame>
  );
}

function PhoneWaiting({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex flex-1 items-center justify-center px-4 font-black text-muted-foreground">
      {children}
    </p>
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
