"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EkshifniBoard } from "@/components/akwaan/ekshifni-board";
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

/**
 * The shared board's marker strip, and the phone's keypad.
 *
 * The numbers are the whole player-facing vocabulary of this mechanic: nobody
 * ever hears "the eyes" or "the outfit", because a labelled mask is half the
 * answer. `onPick` is present only where the server said this actor holds
 * initiative.
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
  return (
    <ul
      className="grid grid-cols-6 gap-2"
      dir="rtl"
      data-testid="ekshifni-regions"
    >
      {regions.map((region) => (
        <li key={region.id}>
          {onPick ? (
            <Button
              type="button"
              variant={region.revealed ? "ghost" : "secondary"}
              disabled={disabled || region.revealed}
              onClick={() => onPick(region.id)}
              data-testid={`ekshifni-pick-${region.number}`}
              className="akwaan-numeral h-16 w-full text-2xl font-black"
            >
              {region.number}
            </Button>
          ) : (
            <div
              data-testid={`ekshifni-chip-${region.number}`}
              className={cn(
                "akwaan-numeral grid h-12 place-items-center rounded-[var(--radius)] border text-lg font-black",
                region.revealed
                  ? "border-border/40 text-muted-foreground line-through"
                  : "border-border bg-card text-foreground",
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

export function EkshifniGameplayPanel({
  runtime,
  actor,
}: {
  runtime: GameplayRuntimeSnapshot;
  actor: MatchActor;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
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

  const teamName = (teamId?: string | null) =>
    snapshot?.teams.find((team) => team.id === teamId)?.name ?? "الفريق";

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

  return (
    <ChallengeFrame
      {...(phone ? {} : { eyebrow: EKSHIFNI_CHALLENGE_NAME })}
      compact={phone}
      title={
        view.phase === "completed"
          ? "نتيجة التحدي"
          : `المشهور ${view.imageNumber} من ${view.imageCount}`
      }
      progressValue={
        view.phase === "completed"
          ? 100
          : (view.imageNumber / view.imageCount) * 100
      }
      className={phone ? "flex min-h-0 flex-1 flex-col" : "mx-auto max-w-4xl"}
    >
      <div
        className={phone ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-5"}
        dir="rtl"
        data-testid="ekshifni-panel"
      >
        {playing && (
          <div
            className={cn(
              "flex items-center justify-center",
              phone ? "shrink-0 gap-2 text-sm" : "gap-3",
            )}
            data-testid="ekshifni-value"
          >
            {/* The stake, not a score. It answers "لو جاوبنا الآن، كم ناخذ؟" —
                which is the whole tension of buying another part. */}
            <span
              className={cn(
                "font-bold text-muted-foreground",
                phone ? "text-xs" : "text-base",
              )}
            >
              لو جاوبتم الآن
            </span>
            <span
              className={cn(
                "akwaan-numeral grid place-items-center rounded-full bg-primary font-black text-primary-foreground transition-all duration-300",
                phone ? "size-8 text-lg" : "size-16 text-4xl",
              )}
            >
              {view.currentValue}
            </span>
          </div>
        )}

        {/* Whose turn it is to lift a panel — which is the only thing initiative
            decides. Answering stays open to both teams, so this says so in the
            same breath and never implies the turn owns the answer. */}
        {!phone && playing && view.initiativeTeamId && (
          <p
            className="text-center text-base font-black"
            data-testid="ekshifni-initiative"
          >
            <span className="text-brand-gold">
              {teamName(view.initiativeTeamId)}
            </span>
            <span className="text-muted-foreground"> يختار الجزء</span>
            <span className="mx-2 text-muted-foreground/40">·</span>
            <span className="text-muted-foreground">
              الإجابة مفتوحة للفريقين
            </span>
          </p>
        )}

        {/* The shared board is the hero. A phone renders no picture at all — the
            server sends it none — so this is unreachable there by construction. */}
        {!phone && view.media?.assets[0] && view.phase !== "completed" && (
          <EkshifniBoard
            url={view.media.assets[0].url}
            altText={
              view.reveal?.identity ??
              view.media.assets[0].altText ??
              "صورة المشهور"
            }
            regions={view.regions}
            unmasked={view.phase === "resolved"}
            imageClassName={
              view.phase === "resolved" ? "max-h-[24vh]" : "max-h-[58vh]"
            }
            {...(view.revealedRegionIds.length
              ? { newestRegionId: view.revealedRegionIds.at(-1) }
              : {})}
          />
        )}

        {/* Phone controller: the numbers this team may press, and the answer
            field. Both can be live at once — they are different rights. */}
        {phone && playing && (
          <section
            className="flex min-h-0 flex-1 flex-col gap-3"
            data-testid="ekshifni-controller"
          >
            {view.canReveal && can("reveal-ekshifni-region") ? (
              <div className="space-y-2">
                <p className="text-center text-sm font-black text-brand-gold">
                  اختاروا رقم الجزء اللي تبغون تكشفونه
                </p>
                <RegionNumbers
                  regions={view.regions}
                  onPick={pick}
                  disabled={!live || Boolean(sending)}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <p
                  className="text-center text-sm font-bold text-muted-foreground"
                  data-testid="ekshifni-no-initiative"
                >
                  الفريق الثاني يختار الجزء التالي
                </p>
                <RegionNumbers regions={view.regions} />
              </div>
            )}

            {view.canAnswer && can("submit-ekshifni") ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2">
                {/* Said on the phone that cannot reveal, because that is the
                    phone at risk of concluding the turn owns the answer too. */}
                <p className="text-center text-sm font-black text-brand-gold">
                  {view.canReveal
                    ? "أو جاوبوا مباشرة"
                    : "الإجابة مفتوحة لكم في أي وقت"}
                </p>
                <Input
                  autoComplete="off"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  placeholder="اسم المشهور"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submit();
                  }}
                  data-testid="ekshifni-answer-input"
                  className="h-16 rounded-[var(--radius)] border-2 text-center text-xl font-black focus-visible:border-brand-gold"
                />
                <MobileActionArea>
                  <Button
                    size="lg"
                    disabled={!live || Boolean(sending) || !answer.trim()}
                    onClick={submit}
                    data-testid="ekshifni-answer-submit"
                    className="h-14 w-full text-base font-black"
                  >
                    {sending === "answer" ? "جارٍ الإرسال…" : "إرسال"}
                  </Button>
                </MobileActionArea>
              </div>
            ) : (
              /* Temporary, and worded as temporary: the team is waiting for one
                 move by the opponent, not out of the image. */
              <div
                className="rounded-[var(--radius)] border border-border bg-muted/50 p-4 text-center"
                data-testid="ekshifni-answer-locked"
              >
                <p className="text-base font-black text-foreground">
                  إجابتكم كانت غير صحيحة
                </p>
                <p className="mt-1 text-sm font-bold text-muted-foreground">
                  ترجع لكم الإجابة بعد حركة الفريق الثاني.
                </p>
              </div>
            )}
          </section>
        )}

        {view.phase === "resolved" && view.reveal && (
          <section
            className="akwaan-rise space-y-3"
            data-testid="ekshifni-reveal"
          >
            <ResolutionReveal
              title={view.reveal.identity}
              compact={phone}
            >
              {view.reveal.attempts.map((attempt, index) => (
                <ResolutionAnswerRow
                  key={`${index}:${attempt.teamId}`}
                  // Which attempt was which, so the room reads the race off the
                  // card instead of inferring it from who scored.
                  label={`${teamName(attempt.teamId)} · ${
                    attempt.correct ? "إجابة صحيحة" : "إجابة خاطئة"
                  }`}
                >
                  {attempt.answer}
                </ResolutionAnswerRow>
              ))}
              <ResolutionOutcome>
                {view.reveal.winnerTeamId
                  ? `${teamName(view.reveal.winnerTeamId)} · +${view.reveal.value}`
                  : "انتهت الصورة بدون إجابة صحيحة"}
              </ResolutionOutcome>
            </ResolutionReveal>
            {can("advance-ekshifni") && (
              <div className="text-center">
                <Button
                  size="lg"
                  onClick={() => send("advance-ekshifni")}
                  disabled={!live}
                  data-testid="ekshifni-advance"
                >
                  {view.imageNumber === view.imageCount
                    ? "عرض النتيجة"
                    : "المشهور التالي"}
                </Button>
              </div>
            )}
          </section>
        )}

        {view.phase === "completed" && view.result && (
          <section
            className="grid gap-3 sm:grid-cols-2"
            data-testid="ekshifni-recap"
          >
            {Object.entries(view.result.points).map(([teamId, points]) => (
              <div
                key={teamId}
                className={cn(
                  "rounded-[var(--radius)] border p-5 text-center",
                  view.result?.winnerTeamId === teamId &&
                    "border-4 border-brand-gold",
                )}
              >
                <p className="font-bold">{teamName(teamId)}</p>
                <p className="akwaan-numeral text-3xl font-black">{points}</p>
              </div>
            ))}
          </section>
        )}
      </div>
    </ChallengeFrame>
  );
}
