"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { BidiText } from "@/components/akwaan/bidi-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { TeamStatusCard, TeamStatusRow } from "../match/components/team-status-card";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useMobileSurface } from "../match/components/mobile-gameplay-shell";
import { authoredText, type AuthoredText } from "../authored-text";
import { CLOSEST_COLOUR_MODE, HUE_TRACK, hueColour } from "../closest-colour";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";
import { MarhalaQuestionAudio } from "./marhala-screen";

/**
 * `media` is already the server-narrowed safe shape (an explicit `type`, never
 * inferred from the URL) — the projection strips storage path/filename/mimetype
 * before it ever reaches this client.
 */
interface ClosestItem {
  id: string;
  prompt: AuthoredText;
  media?: {
    type: "image" | "audio";
    url: string;
    altText?: AuthoredText;
  } | null;
  slider?: {
    mode: "numeric-range" | "between-anchors" | "colour-hue";
    min: number;
    max: number;
    step?: number;
    unit?: string;
    /** Authored reading of the number; absent means an ordinary quantity. */
    displayFormat?: "number" | "calendar-year";
    leftAnchor?: string;
    rightAnchor?: string;
  };
}

interface ClosestResult {
  correctValue: number;
  answers: Record<string, number | null>;
  distances: Record<string, number | null>;
  winnerTeamId: string | null;
  tie: boolean;
}

/**
 * Where the thumb starts, snapped to the authored step.
 *
 * The midpoint of an authored range is not necessarily on that range's step
 * grid — 15→40 with a step of 1 has a midpoint of 27.5 — and the server refuses
 * an estimate that is not, with `Estimate does not match the authored step`. So
 * seeding the raw midpoint meant a player who agreed with the default and simply
 * pressed Confirm had their answer rejected, on eight of the seventeen ranges in
 * the first authored pilot. The `<input type="range">` element already snaps
 * itself, which is what made it look fine: the thumb sat on a legal value while
 * the bubble and the submitted state held the illegal one.
 *
 * Rounds to the nearest legal step and clamps to the range, so the value shown,
 * the value under the thumb, and the value submitted are the same number.
 */
export function seedClosestEstimate(slider: {
  min: number;
  max: number;
  step?: number;
}): number {
  const middle = (slider.min + slider.max) / 2;
  if (!slider.step || !Number.isFinite(slider.step) || slider.step <= 0)
    return middle;
  const steps = Math.round((middle - slider.min) / slider.step);
  return Math.min(slider.max, slider.min + steps * slider.step);
}

/**
 * How one مين أقرب number is written, everywhere it is written.
 *
 * A calendar year is a value, not an amount: it takes no unit and no thousands
 * separator, because «1930 سنة» reads as a duration and «١٬٩٣٠» reads as a
 * quantity, and the question asked for neither. Ordinary quantities keep the
 * grouped locale formatting and their authored unit.
 *
 * The distinction is read from the item's authored `displayFormat` and never
 * guessed from magnitude: a count of 1930 and the year 1930 are the same number,
 * so nothing about the value itself can tell them apart. An item that authored
 * nothing is a quantity, which is what every item written before this field
 * existed meant.
 */
export function formatClosestValue(
  value: number,
  slider?: ClosestItem["slider"],
): string {
  if (
    slider?.mode === "numeric-range" &&
    slider.displayFormat === "calendar-year"
  )
    return new Intl.NumberFormat("ar-SA", { useGrouping: false }).format(value);
  const number = new Intl.NumberFormat("ar-SA", {
    maximumFractionDigits: 4,
  }).format(value);
  return slider?.unit ? `${number} ${slider.unit}` : number;
}

function parsed<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const STEP_BUTTON =
  "grid size-12 flex-none place-items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white text-2xl font-bold text-[hsl(var(--brand-navy))] active:bg-brand-lavender";

export function ClosestGameplayPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  // Which surface is rendering this, from the shell that mounted it — never from
  // a viewport width. The host and the shared screen read `false` and keep the
  // presentation they already had.
  const phone = useMobileSurface();
  const [estimate, setEstimate] = useState("");
  // Local, presentational only. `gameplayCommand` is fire-and-forget, so there is
  // no in-flight promise to await: this simply closes the window in which a
  // second tap could queue a second command, and is released by the server's own
  // submission status.
  const [sending, setSending] = useState(false);
  /**
   * Whether the player has actually chosen, as opposed to merely being shown a
   * slider.
   *
   * A range control has to put its thumb somewhere, and the first authored pilot
   * showed what happens when that position is treated as an answer: six of
   * seventeen ranges seeded the thumb exactly on the correct value, so a team
   * that touched nothing and pressed Confirm won outright. The physical position
   * is presentation; this is the estimate. Mounting is not an act of play.
   */
  const [chosen, setChosen] = useState(false);
  const state = runtime.modeState;
  const round = runtime.activeRound;
  const item = useMemo(
    () => parsed<ClosestItem | null>(state.currentItemJson, null),
    [state.currentItemJson],
  );
  const teams = parsed<string[]>(state.teamIdsJson, []);
  const submitted = parsed<Record<string, boolean>>(
    state.submissionStatusJson,
    {},
  );
  const assigned = parsed<Record<string, string>>(
    state.assignedParticipantIdsJson,
    {},
  );
  const result = parsed<ClosestResult | null>(state.revealedResultJson, null);
  const itemIndex = Number(state.currentItemIndex ?? 0);
  const revealed = state.phase === "revealed" || state.phase === "completed";
  const remainingMs = useInteractionDeadline(
    typeof state.deadlineAt === "string" ? state.deadlineAt : undefined,
    revealed,
  );
  // «تذكّر اللون»: the picture is in colour only until the server's own moment
  // passes, read off the same corrected clock as the countdown. No moment yet
  // means grey — a screen that has not been told may not show the answer.
  const colourQuestion = item?.slider?.mode === CLOSEST_COLOUR_MODE;
  const colourRemainingMs = useInteractionDeadline(
    typeof state.mediaGreyAt === "string" ? state.mediaGreyAt : undefined,
    revealed,
  );
  const pictureGrey =
    colourQuestion &&
    !revealed &&
    (colourRemainingMs === undefined || colourRemainingMs <= 0);
  const actorTeamId =
    typeof state.actorTeamId === "string" ? state.actorTeamId : "";
  const ownSubmitted = actorTeamId ? submitted[actorTeamId] : false;
  const ownSubmittedValue =
    typeof state.ownSubmittedValue === "number"
      ? state.ownSubmittedValue
      : undefined;
  const canAnswer =
    state.isAssignedActor === true &&
    !ownSubmitted &&
    !revealed &&
    runtime.availableActions.includes("mode:submit-estimate") &&
    connection === "connected";
  const nameOf = (id: string) =>
    snapshot?.participants.find((person) => person.id === id)?.displayName ??
    "لاعب الفريق";
  const teamName = (id: string) =>
    snapshot?.teams.find((team) => team.id === id)?.name ?? "الفريق";

  // The same panel instance serves all three questions. Never carry a previous
  // estimate into the next item, even when the server advances without remounting.
  useEffect(() => {
    setEstimate(item?.slider ? String(seedClosestEstimate(item.slider)) : "");
    setSending(false);
    // A new question is unanswered, and so is a reconnect that lands before
    // Confirm: neither may arrive already holding a commitment.
    setChosen(false);
  }, [runtime.runtimeId, round?.id, item?.id, itemIndex, item?.slider]);

  // The authoritative submission is the release: once the server says this team
  // has answered, the local guard has nothing left to guard.
  useEffect(() => {
    if (ownSubmitted) setSending(false);
  }, [ownSubmitted]);

  const submitEstimate = () => {
    const value = Number(estimate);
    if (sending || !hasEstimate) return;
    setSending(true);
    gameplayCommand("gameplay-command", {
      roundId: round?.id,
      commandType: "submit-estimate",
      payload: { value },
    });
    setEstimate("");
  };
  const formatValue = (value: number) =>
    formatClosestValue(value, item?.slider);
  const sliderProgress = item?.slider
    ? Math.max(
        0,
        Math.min(
          100,
          ((Number(estimate) - item.slider.min) /
            (item.slider.max - item.slider.min)) *
            100,
        ),
      )
    : 0;
  const bubbleText =
    item?.slider?.mode === "numeric-range"
      ? formatValue(Number(estimate))
      : colourQuestion
        ? "لونكم"
      : "موضع تقديركم";
  /** A slider item is answerable only once the player has moved it. */
  const hasEstimate = item?.slider
    ? chosen && estimate.trim() !== "" && Number.isFinite(Number(estimate))
    : estimate.trim() !== "" && Number.isFinite(Number(estimate));
  /**
   * One fine step either way, for the value a thumb cannot land on. Uses the
   * question's own step, so a nudge can never produce a value the server would
   * refuse; a continuous range moves by a hundredth of its width.
   */
  const nudge = (direction: 1 | -1) => {
    const slider = item?.slider;
    if (!slider) return;
    const step =
      slider.step && slider.step > 0
        ? slider.step
        : (slider.max - slider.min) / 100;
    const current = Number.isFinite(Number(estimate))
      ? Number(estimate)
      : seedClosestEstimate(slider);
    const next = Math.min(
      slider.max,
      Math.max(slider.min, current + direction * step),
    );
    setChosen(true);
    // Trim float noise so 0.1 + 0.2 is sent as 0.3.
    setEstimate(String(Number(next.toFixed(6))));
  };

  return (
    <ChallengeFrame
      // The phone's shell header already names the world and the challenge, so
      // repeating it here is the duplication that made a controller feel like a
      // small television. The progress ("السؤال 2 من 3") is not duplicated and stays.
      // The question itself opens the card's body, so the shell adds no heading
      // of its own; the navy strip above already names the challenge.
      progressLabel={`السؤال ${itemIndex + 1} من 3`}
      compact={phone}
      aside={
        remainingMs !== undefined && !revealed ? (
          <ChallengeCountdown
            remainingMs={remainingMs}
            // Countdown cues never talk over an audio question.
            sound={item?.media?.type !== "audio"}
          />
        ) : null
      }
      className={phone ? "flex min-h-0 flex-1 flex-col" : "mx-auto max-w-4xl"}
    >
      <div
        className={phone ? "flex min-h-0 flex-1 flex-col gap-3" : "space-y-5"}
        dir="rtl"
      >
        {!phone && item?.media?.type === "image" && item.media.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.media.url}
            alt={authoredText(item.media.altText, "صورة السؤال")}
            data-testid="closest-question-image"
            data-colour={
              colourQuestion ? (pictureGrey ? "grey" : "shown") : undefined
            }
            className={cn(
              "mx-auto max-h-64 rounded-[var(--radius)] object-contain",
              colourQuestion &&
                "transition-[filter] duration-500 motion-reduce:transition-none",
              pictureGrey && "grayscale",
            )}
          />
        ) : null}
        {!phone && item?.media?.type === "audio" && item.media.url ? (
          <MarhalaQuestionAudio url={item.media.url} />
        ) : null}
        {/* The room reads the question off the shared screen. The phone keeps one
            quiet line of it so a player typing a number still knows what they are
            estimating — context, not spectacle. */}
        <h2
          className={
            phone
              ? "text-center font-display text-xl font-extrabold leading-relaxed text-[hsl(var(--brand-navy))]"
              : "font-display text-3xl font-extrabold leading-relaxed text-[hsl(var(--brand-navy))] lg:text-[44px] lg:leading-[1.55]"
          }
        >
          <BidiText>
            {item ? authoredText(item.prompt) : "جارٍ تجهيز السؤال…"}
          </BidiText>
        </h2>

        {!revealed && !phone && (
          <TeamStatusRow data-testid="closest-submission-status">
            {teams.map((teamId) => (
              <TeamStatusCard
                key={teamId}
                role="يقدّر"
                name={teamName(teamId)}
                dotClass={teamIdentityOf(teamId, snapshot?.teams ?? []).dot}
                done={Boolean(submitted[teamId])}
                doneLabel="ثبّتوا تقديرهم"
                pendingLabel={`ننتظر ${nameOf(assigned[teamId])}…`}
              />
            ))}
          </TeamStatusRow>
        )}

        {canAnswer &&
          (phone ? (
            // The controller: the number is the whole screen, and the send button
            // sits under a thumb. Nothing competes with either.
            <div
              className="flex min-h-0 flex-1 flex-col"
              data-testid="closest-answer-controls"
            >
              <div className="flex flex-1 flex-col items-center justify-center gap-3.5">
                <label
                  htmlFor="closest-estimate"
                  className="text-sm font-semibold text-brand-slate"
                >
                  تقدير فريقكم
                </label>
                {item?.slider ? (
                  <div
                    className="flex w-full flex-col items-center gap-3.5"
                    data-testid={`closest-${item.slider.mode}-slider`}
                  >
                    {/* The value appears only once the team has moved the
                        thumb: the seeded position is nobody's answer. */}
                    {chosen ? (
                      <output
                        htmlFor="closest-estimate"
                        aria-live="polite"
                        data-testid="closest-value-bubble"
                        className={cn(
                          "min-w-[150px] max-w-full rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-6 py-1.5 text-center font-bold leading-tight text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))]",
                          item.slider.mode === "numeric-range" &&
                            bubbleText.length <= 8
                            ? "akwaan-numeral text-6xl"
                            : "text-2xl",
                        )}
                      >
                          {colourQuestion && (
                            <span
                              aria-hidden
                              data-testid="closest-colour-swatch"
                              className="me-2 inline-block size-5 rounded-full border-2 border-[hsl(var(--brand-navy))] align-middle"
                              style={{
                                background: hueColour(Number(estimate)),
                              }}
                            />
                          )}
                        {bubbleText}
                      </output>
                    ) : (
                      <p className="min-w-[150px] rounded-[20px] border-[3px] border-dashed border-brand-dash bg-white px-6 py-4 text-center text-base font-bold text-brand-plum">
                        {colourQuestion
                          ? "اسحبوا للّون اللي تتذكرونه"
                          : "حرّكوا المؤشر"}
                      </p>
                    )}
                    <div className="flex w-full items-center gap-2.5">
                      <button
                        type="button"
                        aria-label="نقّص"
                        data-testid="closest-step-down"
                        onClick={() => nudge(-1)}
                        className={STEP_BUTTON}
                      >
                        −
                      </button>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <input
                          id="closest-estimate"
                          type="range"
                          dir="ltr"
                          min={item.slider.min}
                          max={item.slider.max}
                          step={item.slider.step ?? "any"}
                          value={estimate}
                          // `onChange` on a range input fires for pointer,
                          // touch and keyboard alike, so every real way of
                          // moving the thumb counts as choosing.
                          onChange={(event) => {
                            setChosen(true);
                            setEstimate(event.target.value);
                          }}
                          // …except an adjustment key pressed while already at
                          // an endpoint, which changes nothing and so fires no
                          // change. That is still a deliberate act, and a
                          // keyboard player must not be the one who cannot
                          // answer.
                          onKeyDown={(event) => {
                            if (
                              [
                                "ArrowLeft",
                                "ArrowRight",
                                "ArrowUp",
                                "ArrowDown",
                                "Home",
                                "End",
                                "PageUp",
                                "PageDown",
                              ].includes(event.key)
                            )
                              setChosen(true);
                          }}
                          aria-valuetext={
                            !chosen
                              ? "لم تختاروا تقديركم بعد"
                              : item.slider.mode === "numeric-range"
                                ? formatValue(Number(estimate))
                                : colourQuestion
                                  ? `درجة اللون ${Math.round(Number(estimate))} من 360`
                                  : `موضع ${Math.round(sliderProgress)} بالمئة`
                          }
                          style={
                            {
                              "--closest-progress": `${sliderProgress}%`,
                              ...(colourQuestion
                                ? {
                                    "--closest-track": HUE_TRACK,
                                    "--closest-thumb": chosen
                                      ? hueColour(Number(estimate))
                                      : "#ffffff",
                                  }
                                : {}),
                            } as CSSProperties
                          }
                          data-testid="closest-estimate-slider"
                          className={cn(
                            "closest-slider h-11 w-full cursor-pointer accent-[hsl(var(--brand-navy))]",
                            colourQuestion && "closest-slider--colour",
                          )}
                        />
                        <div
                          dir="ltr"
                          className={cn(
                            "flex items-start justify-between gap-3 text-[13px] font-semibold text-brand-slate",
                            // A wheel has no ends to label: the track is the legend.
                            colourQuestion && "hidden",
                          )}
                        >
                          <span className="max-w-[45%] text-start">
                            {item.slider.mode === "numeric-range"
                              ? formatValue(item.slider.min)
                              : item.slider.leftAnchor}
                          </span>
                          <span className="max-w-[45%] text-end">
                            {item.slider.mode === "numeric-range"
                              ? formatValue(item.slider.max)
                              : item.slider.rightAnchor}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        aria-label="زوّد"
                        data-testid="closest-step-up"
                        onClick={() => nudge(1)}
                        className={STEP_BUTTON}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ) : (
                  <Input
                    id="closest-estimate"
                    key={`${runtime.runtimeId}:${round?.id ?? "round"}:${item?.id ?? itemIndex}`}
                    dir="ltr"
                    inputMode="decimal"
                    autoComplete="off"
                    value={estimate}
                    onChange={(event) => setEstimate(event.target.value)}
                    placeholder="0"
                    data-testid="closest-estimate-input"
                    className="akwaan-numeral h-20 rounded-[var(--radius)] border-2 text-center text-4xl font-black tracking-wide focus-visible:border-brand-gold"
                  />
                )}
              </div>
              <MobileActionArea>
                <button
                  type="button"
                  disabled={sending || !hasEstimate}
                  onClick={submitEstimate}
                  data-testid="closest-submit"
                  className="min-h-[62px] w-full rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-6 font-display text-xl font-extrabold text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))] transition-transform duration-fast active:translate-x-[2px] active:translate-y-[2px] active:shadow-[2px_3px_0_hsl(var(--brand-navy))] disabled:cursor-not-allowed disabled:opacity-55 disabled:shadow-none"
                >
                  {sending ? "نرسلها…" : "إرسال الإجابة"}
                </button>
              </MobileActionArea>
            </div>
          ) : (
            <div
              className="mx-auto flex max-w-sm gap-2"
              data-testid="closest-answer-controls"
            >
              <Input
                key={`${runtime.runtimeId}:${round?.id ?? "round"}:${item?.id ?? itemIndex}`}
                dir="ltr"
                inputMode="decimal"
                autoComplete="off"
                value={estimate}
                onChange={(event) => setEstimate(event.target.value)}
                placeholder="اكتب تقدير فريقك"
              />
              <Button
                disabled={
                  sending ||
                  !estimate.trim() ||
                  !Number.isFinite(Number(estimate))
                }
                onClick={submitEstimate}
                data-testid="closest-submit"
              >
                إرسال
              </Button>
            </div>
          ))}
        {!revealed && !canAnswer && actorTeamId && (
          <div
            className={
              phone
                ? "flex flex-1 flex-col items-center justify-center gap-2 text-center"
                : ""
            }
            data-testid="closest-phone-status"
          >
            {phone && ownSubmitted && (
              <span
                aria-hidden
                className="grid size-14 place-items-center rounded-full border border-brand-gold/40 bg-brand-gold/10"
              >
                <Check className="size-7 text-brand-gold" />
              </span>
            )}
            {phone && ownSubmittedValue !== undefined && item?.slider && (
              <div className="w-full max-w-sm space-y-2 rounded-[var(--radius)] bg-[#fff6df] p-4 text-[#10253f]">
                {item.slider.mode === "numeric-range" && (
                  <p className="akwaan-numeral text-center text-2xl font-black">
                    {formatValue(ownSubmittedValue)}
                  </p>
                )}
                <div
                  className="relative h-3 rounded-full bg-[#10253f]/20"
                  style={colourQuestion ? { background: HUE_TRACK } : undefined}
                >
                  <span
                    className="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-brand-gold/60 bg-[#10253f] shadow-sm"
                    style={{
                      left: `${((ownSubmittedValue - item.slider.min) / (item.slider.max - item.slider.min)) * 100}%`,
                      ...(colourQuestion
                        ? {
                            background: hueColour(ownSubmittedValue),
                            borderColor: "#ffffff",
                          }
                        : {}),
                    }}
                  />
                </div>
              </div>
            )}
            <p
              className={
                phone
                  ? "text-base font-black text-foreground"
                  : "rounded-[var(--radius)] bg-muted p-4 text-center font-bold text-muted-foreground"
              }
            >
              {ownSubmitted
                ? phone
                  ? item?.slider
                    ? "تم تأكيد إجابتكم"
                    : "تم إرسال إجابتكم"
                  : "انرسلت إجابتكم. ننتظر الفريق الثاني…"
                : `${nameOf(assigned[actorTeamId])} يرسل إجابة الفريق`}
            </p>
            {phone && ownSubmitted && (
              <p className="text-sm font-bold text-muted-foreground">
                بانتظار الفريق الثاني…
              </p>
            )}
          </div>
        )}

        {result && phone && (
          // The recap is the shared screen's spectacle. The phone gets the one
          // fact a player leans over to check, then goes quiet — it does not
          // restate the round on a second screen.
          <section
            className="akwaan-rise flex flex-1 flex-col items-center justify-center gap-2 text-center"
            data-testid="closest-phone-reveal"
          >
            <p className="text-xs font-black text-muted-foreground">
              {colourQuestion
                ? "اللون الصحيح"
                : item?.slider?.mode === "between-anchors"
                ? "الموضع المرجعي"
                : "الإجابة الصحيحة"}
            </p>
            {colourQuestion ? (
              <span
                role="img"
                aria-label="اللون الصحيح"
                data-testid="closest-correct-colour"
                className="size-24 rounded-full border-4 border-white shadow-md"
                style={{ background: hueColour(result.correctValue) }}
              />
            ) : (
            <p className="akwaan-numeral text-5xl font-black text-foreground">
              {item?.slider?.mode === "between-anchors"
                ? "على المقياس"
                : item?.slider
                  ? formatValue(result.correctValue)
                  : result.correctValue}
            </p>
            )}
            <p className="text-base font-black text-foreground">
              {result.tie
                ? "تعادل"
                : `${teamName(result.winnerTeamId!)} كان الأقرب`}
            </p>
            <p className="text-sm font-bold text-muted-foreground">
              التفاصيل على الشاشة.
            </p>
          </section>
        )}

        {result && !phone && (
          <section
            className="akwaan-rise space-y-4 text-center"
            data-testid="closest-item-reveal"
          >
            <div className="rounded-[var(--radius)] bg-primary px-5 py-4 text-primary-foreground">
              <p className="text-sm font-bold opacity-80">
                {colourQuestion
                  ? "اللون الصحيح"
                  : item?.slider?.mode === "between-anchors"
                  ? "الموضع المرجعي"
                  : "الإجابة الصحيحة"}
              </p>
              {colourQuestion ? (
                <span
                  role="img"
                  aria-label="اللون الصحيح"
                  data-testid="closest-correct-colour"
                  className="mx-auto mt-2 block size-16 rounded-full border-4 border-white shadow-md"
                  style={{ background: hueColour(result.correctValue) }}
                />
              ) : (
              <p className="akwaan-numeral text-4xl font-black">
                {item?.slider?.mode === "between-anchors"
                  ? "على المقياس"
                  : item?.slider
                    ? formatValue(result.correctValue)
                    : result.correctValue}
              </p>
              )}
            </div>
            <p
              className="text-xl font-black"
              data-testid="closest-round-outcome"
            >
              {result.tie
                ? "نفس المسافة! الجولة تعادل"
                : `${teamName(result.winnerTeamId!)} كان الأقرب!`}
            </p>
            {item?.slider && (
              <div
                className="rounded-[var(--radius)] border bg-[#fff6df] px-6 py-8 text-[#10253f]"
                data-testid="closest-continuum-reveal"
              >
                <div className="relative h-16">
                  <div
                    className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-[#10253f]/20"
                    style={
                      colourQuestion ? { background: HUE_TRACK } : undefined
                    }
                  />
                  {[
                    ...teams.map((teamId, lane) => ({
                      id: teamId,
                      value: result.answers[teamId],
                      target: false,
                      lane,
                    })),
                    {
                      id: "target",
                      value: result.correctValue,
                      target: true,
                      lane: 1,
                    },
                  ].map((marker) =>
                    marker.value === null ? null : (
                      <div
                        key={marker.id}
                        className={cn(
                          "absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-white shadow",
                          marker.target
                            ? "bg-brand-gold"
                            : teamIdentityOf(marker.id, snapshot?.teams ?? [])
                                .dot,
                        )}
                        style={{
                          left: `${Math.max(0, Math.min(100, ((Number(marker.value) - item.slider!.min) / (item.slider!.max - item.slider!.min)) * 100))}%`,
                          top: marker.target
                            ? "50%"
                            : marker.lane === 0
                              ? "12%"
                              : "88%",
                        }}
                        title={
                          marker.target
                            ? "الإجابة الصحيحة"
                            : teamName(marker.id)
                        }
                      />
                    ),
                  )}
                </div>
                <div
                  dir="ltr"
                  className={cn(
                    "mt-5 flex justify-between gap-3 text-xs font-black",
                    colourQuestion && "hidden",
                  )}
                >
                  <span>
                    {item.slider.mode === "numeric-range"
                      ? formatValue(item.slider.min)
                      : item.slider.leftAnchor}
                  </span>
                  <span>
                    {item.slider.mode === "numeric-range"
                      ? formatValue(item.slider.max)
                      : item.slider.rightAnchor}
                  </span>
                </div>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {teams.map((teamId) => {
                const identity = teamIdentityOf(teamId, snapshot?.teams ?? []);
                return (
                  <div
                    key={teamId}
                    className={cn(
                      "rounded-[var(--radius)] border p-4",
                      identity.surface,
                      identity.border,
                    )}
                  >
                    <p className={cn("font-black", identity.text)}>
                      {teamName(teamId)}
                    </p>
                    <p className="akwaan-numeral mt-1 text-3xl font-black">
                      {result.answers[teamId] === null ? (
                        "—"
                      ) : colourQuestion ? (
                        <span
                          role="img"
                          aria-label={`لون ${teamName(teamId)}`}
                          data-testid={`closest-team-colour-${teamId}`}
                          className="inline-block size-10 rounded-full border-4 border-white align-middle shadow"
                          style={{
                            background: hueColour(result.answers[teamId]!),
                          }}
                        />
                      ) : item?.slider?.mode === "between-anchors" ? (
                        "موضع الفريق"
                      ) : item?.slider ? (
                        formatValue(result.answers[teamId])
                      ) : (
                        result.answers[teamId]
                      )}
                    </p>
                    <p className="text-sm font-bold text-muted-foreground">
                      {item?.slider?.mode === "between-anchors"
                        ? "على المقياس المشترك"
                        : result.distances[teamId] === null
                          ? "لم تُرسل إجابة"
                          : colourQuestion
                            ? `بفارق ${Math.round(result.distances[teamId]!)} درجة لون`
                          : `بفارق ${item?.slider ? formatValue(result.distances[teamId]!) : result.distances[teamId]}`}
                    </p>
                  </div>
                );
              })}
            </div>
            {snapshot?.match?.availableActions.includes("challenge:continue")
              ? null
              : null}
            {snapshot?.participants.some(
              (person) => person.role === "controller",
            ) &&
            runtime.availableActions.includes("mode:advance-closest-item") ? (
              <Button
                size="lg"
                onClick={() =>
                  gameplayCommand("gameplay-command", {
                    roundId: round?.id,
                    commandType: "advance-closest-item",
                    payload: {},
                  })
                }
                data-testid="closest-next-item"
              >
                {itemIndex === 2 ? "عرض نتيجة التحدي" : "السؤال التالي"}
              </Button>
            ) : (
              <p className="text-sm font-bold text-muted-foreground">
                بانتظار المضيف للمتابعة…
              </p>
            )}
          </section>
        )}
      </div>
    </ChallengeFrame>
  );
}
