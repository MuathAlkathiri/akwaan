"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { EkshifniBoard } from "@/components/akwaan/ekshifni-board";
import { AnswerEntry } from "../match/components/answer-entry";
import {
  ChallengeContextStrip,
  TeamDot,
  useChallengeContext,
} from "../match/components/challenge-context-strip";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { MobileActionArea } from "../match/components/mobile-action-area";
import {
  ResolutionAnswerRow,
  ResolutionOutcome,
  ResolutionReveal,
} from "../match/components/resolution-reveal";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";
import type { MatchActor } from "../match/types";
import {
  EKSHIFNI_CHALLENGE_NAME,
  readEkshifniView,
  type EkshifniRegionView,
} from "../match/ekshifni.presentation";

const GOLD_ACTION =
  "inline-flex min-h-[62px] items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-7 font-display text-xl font-extrabold text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))] disabled:shadow-none";
const TEAM_ROW =
  "flex items-center justify-between gap-2.5 rounded-[18px] border-[3px] border-[hsl(var(--brand-navy))] bg-white px-4 py-3";

/** A picture is worth 5 untouched and one less for every region opened. */
const TOP_VALUE = 5;

/**
 * The phone's keypad.
 *
 * The numbers are the whole player-facing vocabulary of this mechanic: nobody
 * ever hears "the eyes" or "the outfit", because a labelled mask is half the
 * answer. `onPick` is present only where the server said this actor holds
 * initiative; without it the same six numbers are shown, and none can be
 * pressed.
 */
function RegionNumbers({
  regions,
  onPick,
  disabled,
}: {
  regions: EkshifniRegionView[];
  onPick?: (regionId: string) => void;
  disabled?: boolean;
}) {
  const shut =
    "border-2 border-dashed border-brand-dash bg-[#F8F7FC] text-brand-slate";
  return (
    <ul
      className="grid grid-cols-3 gap-2"
      dir="rtl"
      data-testid="ekshifni-regions"
    >
      {regions.map((region) => (
        <li key={region.id}>
          {onPick ? (
            <button
              type="button"
              disabled={disabled || region.revealed}
              onClick={() => onPick(region.id)}
              aria-label={`اكشف المنطقة ${region.number}`}
              data-testid={`ekshifni-pick-${region.number}`}
              className={cn(
                "akwaan-numeral h-16 w-full rounded-2xl text-2xl font-bold",
                region.revealed
                  ? shut
                  : "border-[3px] border-[hsl(var(--brand-navy))] bg-white",
              )}
            >
              {region.number}
            </button>
          ) : (
            <div
              data-testid={`ekshifni-chip-${region.number}`}
              className={cn(
                "akwaan-numeral grid h-16 place-items-center rounded-2xl text-2xl font-bold",
                shut,
                region.revealed && "line-through",
              )}
            >
              {region.number}
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 5 → 1: what is spent struck through, what the picture is worth now in gold. */
function ValueLadder({ current }: { current: number }) {
  return (
    <div className="flex justify-end gap-2" dir="ltr">
      {Array.from({ length: TOP_VALUE }, (_, index) => TOP_VALUE - index).map(
        (value) => (
          <span
            key={value}
            {...(value === current ? { "aria-current": "true" as const } : {})}
            className={cn(
              "akwaan-numeral inline-flex size-[46px] items-center justify-center rounded-full text-xl font-bold",
              value > current &&
                "border-[3px] border-[hsl(var(--brand-navy))] bg-white text-brand-slate line-through",
              value === current &&
                "border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] shadow-[3px_4px_0_hsl(var(--brand-navy))]",
              value < current &&
                "border-2 border-dashed border-brand-dash bg-white",
            )}
          >
            {value}
          </span>
        ),
      )}
    </div>
  );
}

export function EkshifniGameplayPanel({
  runtime,
  actor,
}: {
  runtime: GameplayRuntimeSnapshot;
  actor: MatchActor;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const context = useChallengeContext();
  const view = useMemo(
    () => readEkshifniView(runtime.modeState),
    [runtime.modeState],
  );
  const [answer, setAnswer] = useState("");
  const [sending, setSending] = useState<"reveal" | "answer" | undefined>();
  const phone = actor === "participant";
  const live = connection === "connected";
  const can = (action: string) =>
    runtime.availableActions.includes(`mode:${action}`);

  const send = (
    commandType: string,
    payload: Record<string, string | number | boolean | null> = {},
  ) =>
    gameplayCommand("gameplay-command", {
      roundId: runtime.activeRound?.id,
      commandType,
      payload,
    });

  const teams = snapshot?.teams ?? [];
  const teamName = (teamId?: string | null) =>
    teams.find((team) => team.id === teamId)?.name ?? "الفريق";
  const dotOf = (teamId: string) => teamIdentityOf(teamId, teams).dot;

  // Any authoritative move releases the guard: the phase changing, a new image,
  // a region coming off, or either of this phone's two rights being granted or
  // withdrawn. A phone that lost the answer race stops waiting the moment the
  // server says so, rather than sitting on a stale "sending".
  useEffect(() => {
    setSending(undefined);
  }, [
    view.phase,
    view.imageIndex,
    view.revealedRegionIds.length,
    view.canReveal,
    view.canAnswer,
  ]);

  useEffect(() => {
    setAnswer("");
  }, [view.imageIndex]);

  const pick = (regionId: string) => {
    if (sending) return;
    setSending("reveal");
    send("reveal-ekshifni-region", { regionId });
  };

  const submit = () => {
    if (sending || !answer.trim()) return;
    setSending("answer");
    send("submit-ekshifni", { answer: answer.trim() });
    setAnswer("");
  };

  const playing = view.phase === "playing";
  const step = `الصورة ${view.imageNumber} من ${view.imageCount}`;

  const reveal = view.phase === "resolved" && view.reveal && (
    <section className="akwaan-rise space-y-3" data-testid="ekshifni-reveal">
      <ResolutionReveal title={view.reveal.identity} compact={phone}>
        {view.reveal.attempts.map((attempt, index) => (
          <ResolutionAnswerRow
            key={`${index}:${attempt.teamId}`}
            // Which attempt was which, so the room reads the race off the
            // card instead of inferring it from who scored.
            label={`${teamName(attempt.teamId)} · ${
              attempt.correct ? "جاوبوا صح" : "جاوبوا غلط"
            }`}
          >
            {attempt.answer}
          </ResolutionAnswerRow>
        ))}
        <ResolutionOutcome>
          {view.reveal.winnerTeamId
            ? `${teamName(view.reveal.winnerTeamId)} · +${view.reveal.value}`
            : "خلصت الصورة وما أحد عرفه"}
        </ResolutionOutcome>
      </ResolutionReveal>
      {can("advance-ekshifni") && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => send("advance-ekshifni")}
            disabled={!live}
            className={GOLD_ACTION}
            data-testid="ekshifni-advance"
          >
            {view.imageNumber === view.imageCount
              ? "نشوف النتيجة"
              : "الصورة الجاية"}
          </button>
        </div>
      )}
    </section>
  );

  const recap = view.phase === "completed" && view.result && (
    <section className="grid gap-4 sm:grid-cols-2" data-testid="ekshifni-recap">
      {Object.entries(view.result.points).map(([teamId, points]) => (
        <div
          key={teamId}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-3xl border-[3px] border-[hsl(var(--brand-navy))] p-5 text-center",
            view.result?.winnerTeamId === teamId
              ? "bg-[hsl(var(--brand-gold))] shadow-[5px_6px_0_hsl(var(--brand-navy))]"
              : "bg-white",
          )}
        >
          <p className="inline-flex items-center gap-2.5 font-display text-xl font-extrabold">
            <TeamDot className={dotOf(teamId)} />
            {teamName(teamId)}
          </p>
          <p className="akwaan-numeral text-[56px] font-bold leading-none">
            {points}
          </p>
        </div>
      ))}
    </section>
  );

  if (phone) {
    return (
      <ChallengeFrame
        compact
        title={view.phase === "completed" ? "نتيجة التحدي" : step}
        progressValue={
          view.phase === "completed"
            ? 100
            : (view.imageNumber / view.imageCount) * 100
        }
        className="flex min-h-0 flex-1 flex-col"
      >
        <div
          className="flex min-h-0 flex-1 flex-col gap-3 text-[hsl(var(--brand-navy))]"
          dir="rtl"
          data-testid="ekshifni-panel"
        >
          {playing && (
            <div
              className="flex shrink-0 items-center justify-between rounded-2xl bg-[hsl(var(--brand-navy))] px-3.5 py-2.5 text-white"
              data-testid="ekshifni-value"
            >
              {/* The stake, not a score: «لو جاوبنا الحين، كم ناخذ؟» is the
                  whole tension of buying another region. */}
              <span className="text-sm font-bold text-[hsl(var(--brand-gold))]">
                قيمة الصورة الحين
              </span>
              <span className="akwaan-numeral text-[34px] font-bold leading-none">
                {view.currentValue}
              </span>
            </div>
          )}

          {/* The numbers this team may press, and the answer field. Both can be
              live at once — they are different rights. */}
          {playing && (
            <section
              className="flex min-h-0 flex-1 flex-col gap-3"
              data-testid="ekshifni-controller"
            >
              <div className="flex flex-col gap-2">
                {view.canReveal && can("reveal-ekshifni-region") ? (
                  <>
                    <p className="font-display text-lg font-extrabold">
                      اكشف منطقة{" "}
                      <span className="font-sans text-[13px] font-semibold text-brand-slate">
                        الدور عليكم
                        {view.currentValue > 1
                          ? ` · تنزل القيمة إلى ${view.currentValue - 1}`
                          : ""}
                      </span>
                    </p>
                    <RegionNumbers
                      regions={view.regions}
                      onPick={pick}
                      disabled={!live || Boolean(sending)}
                    />
                  </>
                ) : (
                  <>
                    <p
                      className="font-display text-lg font-extrabold"
                      data-testid="ekshifni-no-initiative"
                    >
                      الخصم يختار المنطقة الجاية
                    </p>
                    <RegionNumbers regions={view.regions} />
                  </>
                )}
                <p className="text-center text-[13px] leading-[1.7] text-brand-slate">
                  الصورة على الشاشة الكبيرة بس.
                </p>
              </div>

              {view.canAnswer && can("submit-ekshifni") ? (
                <form
                  className="flex min-h-0 flex-1 flex-col gap-2.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit();
                  }}
                >
                  {/* Said on the phone that cannot reveal too, because that is
                      the phone at risk of concluding the turn owns the answer. */}
                  <p className="mt-auto font-display text-lg font-extrabold">
                    عرفته؟ جاوب{" "}
                    {!view.canReveal && (
                      <span className="font-sans text-[13px] font-semibold text-brand-slate">
                        الإجابة مفتوحة لكم في أي وقت
                      </span>
                    )}
                  </p>
                  <AnswerEntry
                    value={answer}
                    onChange={setAnswer}
                    placeholder="مين هذا؟"
                    inputTestId="ekshifni-answer-input"
                  />
                  <MobileActionArea className="mt-0 pt-0">
                    <button
                      type="submit"
                      disabled={!live || Boolean(sending) || !answer.trim()}
                      data-testid="ekshifni-answer-submit"
                      className={cn(
                        GOLD_ACTION,
                        "w-full",
                        !answer.trim() && !sending && "bg-brand-lavender",
                      )}
                    >
                      {sending === "answer" ? "نرسلها…" : "إرسال الإجابة"}
                    </button>
                  </MobileActionArea>
                </form>
              ) : (
                /* Temporary, and worded as temporary: the team is waiting for
                   one move by the opponent, not out of the picture. */
                <div
                  className="mt-auto rounded-2xl border-2 border-[hsl(var(--brand-navy))] bg-brand-lavender p-4 text-center"
                  data-testid="ekshifni-answer-locked"
                >
                  <p className="text-base font-extrabold">جوابكم ما كان صح</p>
                  <p className="mt-1 text-sm font-bold text-brand-slate">
                    ترجع لكم الإجابة بعد ما يتحرك الخصم.
                  </p>
                </div>
              )}
            </section>
          )}

          {reveal}
          {recap}
        </div>
      </ChallengeFrame>
    );
  }

  const image = view.media?.assets[0];

  return (
    <section
      dir="rtl"
      data-testid="ekshifni-panel"
      className="flex flex-col gap-[18px] text-[hsl(var(--brand-navy))]"
    >
      <ChallengeContextStrip
        {...(context.eyebrow ? { eyebrow: context.eyebrow } : {})}
        title={context.title ?? EKSHIFNI_CHALLENGE_NAME}
        aside={
          playing && view.initiativeTeamId ? (
            <span className="inline-flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-full border-2 border-white bg-[hsl(var(--brand-gold))] px-[18px] text-lg font-extrabold text-[hsl(var(--brand-navy))]">
              <TeamDot className={dotOf(view.initiativeTeamId)} />
              {teamName(view.initiativeTeamId)} يختار المنطقة
            </span>
          ) : (
            <span className="inline-flex min-h-9 items-center whitespace-nowrap rounded-full bg-white px-4 text-[15px] font-bold text-[hsl(var(--brand-navy))]">
              {view.phase === "completed" ? "نتيجة التحدي" : step}
            </span>
          )
        }
      />

      {view.phase === "completed" ? (
        recap
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* The shared board is the hero. A phone renders no picture at all —
              the server sends it none. */}
          <main className="flex min-h-[420px] items-center justify-center rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper p-4 shadow-[7px_8px_0_hsl(var(--brand-navy))]">
            {image && (
              <EkshifniBoard
                url={image.url}
                altText={
                  view.reveal?.identity ?? image.altText ?? "الصورة المغطاة"
                }
                regions={view.regions}
                unmasked={view.phase === "resolved"}
                imageClassName="max-h-[58vh]"
                {...(view.revealedRegionIds.length
                  ? { newestRegionId: view.revealedRegionIds.at(-1) }
                  : {})}
              />
            )}
          </main>

          <aside className="flex flex-col gap-3.5">
            {playing && (
              <>
                <div
                  className="flex flex-col gap-2.5 rounded-[28px] border-[3px] border-[hsl(var(--brand-navy))] bg-brand-paper p-[18px]"
                  data-testid="ekshifni-value"
                  data-value={view.currentValue}
                >
                  <span className="text-[15px] font-bold text-brand-slate">
                    {step} · قيمتها الحين
                  </span>
                  <ValueLadder current={view.currentValue} />
                  <span className="text-[15px] leading-[1.7] text-brand-slate">
                    كل منطقة تنكشف تنقّص نقطة. اللي يعرفه أول ياخذ القيمة.
                  </span>
                </div>

                {teams
                  .filter((team) => team.active !== false)
                  .map((team) => (
                    <div key={team.id} className={TEAM_ROW}>
                      <span className="inline-flex items-center gap-2 font-display text-[19px] font-extrabold">
                        <TeamDot className={dotOf(team.id)} />
                        {team.name}
                      </span>
                      <span className="text-sm font-bold">
                        {team.id === view.answerPenaltyTeamId
                          ? "موقوفين لين يتحرك الخصم"
                          : "يقدرون يجاوبون"}
                      </span>
                    </div>
                  ))}

                {/* Whose turn it is to open a region — the only thing initiative
                    decides. Answering stays open to both teams, so this says so
                    in the same breath. */}
                {view.initiativeTeamId && (
                  <p
                    className="text-center text-sm leading-[1.7] text-brand-slate"
                    data-testid="ekshifni-initiative"
                  >
                    {teamName(view.initiativeTeamId)} يختارون المنطقة. الإجابة
                    مفتوحة للفريقين في أي لحظة، من الجوال.
                  </p>
                )}
              </>
            )}
            {reveal}
          </aside>
        </div>
      )}
    </section>
  );
}
