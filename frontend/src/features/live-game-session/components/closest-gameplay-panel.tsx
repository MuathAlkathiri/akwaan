"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Check } from "lucide-react";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { BidiText } from "@/components/akwaan/bidi-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useMobileSurface } from "../match/components/mobile-gameplay-shell";
import { authoredText, type AuthoredText } from "../authored-text";
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
    mode: "numeric-range" | "between-anchors";
    min: number;
    max: number;
    step?: number;
    unit?: string;
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

function parsed<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

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
    setEstimate(
      item?.slider ? String((item.slider.min + item.slider.max) / 2) : "",
    );
    setSending(false);
  }, [runtime.runtimeId, round?.id, item?.id, itemIndex, item?.slider]);

  // The authoritative submission is the release: once the server says this team
  // has answered, the local guard has nothing left to guard.
  useEffect(() => {
    if (ownSubmitted) setSending(false);
  }, [ownSubmitted]);

  const submitEstimate = () => {
    const value = Number(estimate);
    if (sending || !estimate.trim() || !Number.isFinite(value)) return;
    setSending(true);
    gameplayCommand("gameplay-command", {
      roundId: round?.id,
      commandType: "submit-estimate",
      payload: { value },
    });
    setEstimate("");
  };
  const formatValue = (value: number) =>
    `${new Intl.NumberFormat("ar-SA", { maximumFractionDigits: 4 }).format(value)}${item?.slider?.unit ? ` ${item.slider.unit}` : ""}`;
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
      : "موضع تقديركم";
  const wideBubble = bubbleText.length > 18;
  // Compact values can follow the thumb with a small edge clamp. A deliberately
  // long unit gets a predictable width and switches to side-aware placement;
  // its pointer continues to identify the true value while the card contains it.
  const bubblePlacement = (() => {
    if (!wideBubble) {
      return {
        left: `${Math.max(12, Math.min(88, sliderProgress))}%`,
        transform: "translateX(-50%)",
        pointer: "50%",
      };
    }
    if (sliderProgress <= 32) {
      return {
        left: "0%",
        transform: "translateX(0)",
        pointer: `${Math.max(8, (sliderProgress / 64) * 100)}%`,
      };
    }
    if (sliderProgress >= 68) {
      return {
        left: "100%",
        transform: "translateX(-100%)",
        pointer: `${Math.min(92, ((sliderProgress - 36) / 64) * 100)}%`,
      };
    }
    return {
      left: `${sliderProgress}%`,
      transform: "translateX(-50%)",
      pointer: "50%",
    };
  })();

  return (
    <ChallengeFrame
      // The phone's shell header already names the world and the challenge, so
      // repeating it here is the duplication that made a controller feel like a
      // small television. The progress ("السؤال 2 من 3") is not duplicated and stays.
      {...(phone ? {} : { eyebrow: "مين أقرب" })}
      title={`السؤال ${itemIndex + 1} من 3`}
      progressValue={(itemIndex / 3) * 100}
      compact={phone}
      aside={
        remainingMs !== undefined && !revealed ? (
          <ChallengeCountdown remainingMs={remainingMs} />
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
            className="mx-auto max-h-64 rounded-[var(--radius)] object-contain"
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
              ? "text-center text-sm font-bold leading-snug text-muted-foreground"
              : "text-center text-[2rem] font-black leading-snug text-foreground sm:text-[2.5rem]"
          }
        >
          <BidiText>
            {item ? authoredText(item.prompt) : "جارٍ تجهيز السؤال…"}
          </BidiText>
        </h2>

        {!revealed && !phone && (
          <div
            className="grid gap-3 sm:grid-cols-2"
            data-testid="closest-submission-status"
          >
            {teams.map((teamId) => {
              const identity = teamIdentityOf(teamId, snapshot?.teams ?? []);
              return (
                <div
                  key={teamId}
                  className={cn(
                    "rounded-[var(--radius)] border p-4 text-center",
                    identity.surface,
                    identity.border,
                  )}
                >
                  <p className={cn("font-black", identity.text)}>
                    {teamName(teamId)}
                  </p>
                  <p className="mt-1 text-sm font-bold text-muted-foreground">
                    {submitted[teamId]
                      ? "✓ تم إرسال الإجابة"
                      : `بانتظار ${nameOf(assigned[teamId])}…`}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {canAnswer &&
          (phone ? (
            // The controller: the number is the whole screen, and the send button
            // sits under a thumb. Nothing competes with either.
            <div
              className="flex min-h-0 flex-1 flex-col"
              data-testid="closest-answer-controls"
            >
              <div
                className={cn(
                  "flex flex-1 flex-col justify-center",
                  item?.slider &&
                    "rounded-[var(--radius)] bg-[#fff6df] px-4 py-5 text-[#10253f]",
                )}
              >
                <label
                  htmlFor="closest-estimate"
                  className="mb-2 text-center text-xs font-black text-muted-foreground"
                >
                  تقدير فريقكم
                </label>
                {item?.slider ? (
                  <div
                    className="space-y-4"
                    data-testid={`closest-${item.slider.mode}-slider`}
                  >
                    <p className="text-center text-xs font-bold text-[#10253f]/70">
                      حرّك المؤشر إلى تقديرك ثم أكّد الإجابة
                    </p>
                    <div className="relative pt-12">
                      <div
                        className={cn(
                          "absolute top-0 z-10 max-w-[76%] rounded-xl bg-[#10253f] px-3 py-2 text-center text-sm font-black leading-tight text-white shadow-md",
                          wideBubble && "w-48",
                        )}
                        style={{
                          left: bubblePlacement.left,
                          transform: bubblePlacement.transform,
                        }}
                        aria-live="polite"
                        data-testid="closest-value-bubble"
                      >
                        {bubbleText}
                        <span
                          aria-hidden
                          className="absolute top-full -translate-x-1/2 border-x-[6px] border-t-[7px] border-x-transparent border-t-[#10253f]"
                          style={{ left: bubblePlacement.pointer }}
                        />
                      </div>
                      <input
                        id="closest-estimate"
                        type="range"
                        dir="ltr"
                        min={item.slider.min}
                        max={item.slider.max}
                        step={item.slider.step ?? "any"}
                        value={estimate}
                        onChange={(event) => setEstimate(event.target.value)}
                        aria-valuetext={
                          item.slider.mode === "numeric-range"
                            ? formatValue(Number(estimate))
                            : `موضع ${Math.round(sliderProgress)} بالمئة`
                        }
                        style={
                          {
                            "--closest-progress": `${sliderProgress}%`,
                          } as CSSProperties
                        }
                        data-testid="closest-estimate-slider"
                        className="closest-slider h-12 w-full cursor-pointer accent-[#d6a928]"
                      />
                    </div>
                    <div
                      dir="ltr"
                      className="flex items-start justify-between gap-3 text-xs font-black"
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
                <Button
                  size="lg"
                  disabled={
                    sending ||
                    !estimate.trim() ||
                    !Number.isFinite(Number(estimate))
                  }
                  onClick={submitEstimate}
                  data-testid="closest-submit"
                  className="h-14 w-full text-base font-black"
                >
                  {sending
                    ? "جارٍ التأكيد…"
                    : item?.slider
                      ? "تأكيد الإجابة"
                      : "إرسال الإجابة"}
                </Button>
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
                <div className="relative h-3 rounded-full bg-[#10253f]/20">
                  <span
                    className="absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-brand-gold/60 bg-[#10253f] shadow-sm"
                    style={{
                      left: `${((ownSubmittedValue - item.slider.min) / (item.slider.max - item.slider.min)) * 100}%`,
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
              {item?.slider?.mode === "between-anchors"
                ? "الموضع المرجعي"
                : "الإجابة الصحيحة"}
            </p>
            <p className="akwaan-numeral text-5xl font-black text-foreground">
              {item?.slider?.mode === "between-anchors"
                ? "على المقياس"
                : item?.slider
                  ? formatValue(result.correctValue)
                  : result.correctValue}
            </p>
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
                {item?.slider?.mode === "between-anchors"
                  ? "الموضع المرجعي"
                  : "الإجابة الصحيحة"}
              </p>
              <p className="akwaan-numeral text-4xl font-black">
                {item?.slider?.mode === "between-anchors"
                  ? "على المقياس"
                  : item?.slider
                    ? formatValue(result.correctValue)
                    : result.correctValue}
              </p>
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
                  <div className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full bg-[#10253f]/20" />
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
                  className="mt-5 flex justify-between gap-3 text-xs font-black"
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
                      {result.answers[teamId] === null
                        ? "—"
                        : item?.slider?.mode === "between-anchors"
                          ? "موضع الفريق"
                          : item?.slider
                            ? formatValue(result.answers[teamId])
                            : result.answers[teamId]}
                    </p>
                    <p className="text-sm font-bold text-muted-foreground">
                      {item?.slider?.mode === "between-anchors"
                        ? "على المقياس المشترك"
                        : result.distances[teamId] === null
                          ? "لم تُرسل إجابة"
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
