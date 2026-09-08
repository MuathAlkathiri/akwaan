"use client";

import { useEffect, useState } from "react";
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
  media?: { type: "image" | "audio"; url: string; altText?: AuthoredText } | null;
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
  const item = parsed<ClosestItem | null>(state.currentItemJson, null);
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
  const actorTeamId = typeof state.actorTeamId === "string" ? state.actorTeamId : "";
  const ownSubmitted = actorTeamId ? submitted[actorTeamId] : false;
  const canAnswer =
    state.isAssignedActor === true &&
    !ownSubmitted &&
    !revealed &&
    runtime.availableActions.includes("mode:submit-estimate") &&
    connection === "connected";
  const nameOf = (id: string) =>
    snapshot?.participants.find((person) => person.id === id)?.displayName ?? "لاعب الفريق";
  const teamName = (id: string) =>
    snapshot?.teams.find((team) => team.id === id)?.name ?? "الفريق";

  // The same panel instance serves all three questions. Never carry a previous
  // estimate into the next item, even when the server advances without remounting.
  useEffect(() => {
    setEstimate("");
    setSending(false);
  }, [runtime.runtimeId, round?.id, item?.id, itemIndex]);

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
          <div className="grid gap-3 sm:grid-cols-2" data-testid="closest-submission-status">
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
                  <p className={cn("font-black", identity.text)}>{teamName(teamId)}</p>
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
              <div className="flex flex-1 flex-col justify-center">
                <label
                  htmlFor="closest-estimate"
                  className="mb-2 text-center text-xs font-black text-muted-foreground"
                >
                  تقدير فريقكم
                </label>
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
                  {sending ? "جارٍ الإرسال…" : "إرسال الإجابة"}
                </Button>
              </MobileActionArea>
            </div>
          ) : (
            <div className="mx-auto flex max-w-sm gap-2" data-testid="closest-answer-controls">
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
            <p
              className={
                phone
                  ? "text-base font-black text-foreground"
                  : "rounded-[var(--radius)] bg-muted p-4 text-center font-bold text-muted-foreground"
              }
            >
              {ownSubmitted
                ? phone
                  ? "تم إرسال إجابتكم"
                  : "انرسلت إجابتكم. ننتظر الفريق الثاني…"
                : `${nameOf(assigned[actorTeamId])} يرسل إجابة الفريق`}
            </p>
            {phone && ownSubmitted && (
              <p className="text-sm font-bold text-muted-foreground">
                ننتظر الفريق الثاني…
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
              الإجابة الصحيحة
            </p>
            <p className="akwaan-numeral text-5xl font-black text-foreground">
              {result.correctValue}
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
          <section className="akwaan-rise space-y-4 text-center" data-testid="closest-item-reveal">
            <div className="rounded-[var(--radius)] bg-primary px-5 py-4 text-primary-foreground">
              <p className="text-sm font-bold opacity-80">الإجابة الصحيحة</p>
              <p className="akwaan-numeral text-4xl font-black">{result.correctValue}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {teams.map((teamId) => {
                const identity = teamIdentityOf(teamId, snapshot?.teams ?? []);
                return (
                  <div key={teamId} className={cn("rounded-[var(--radius)] border p-4", identity.surface, identity.border)}>
                    <p className={cn("font-black", identity.text)}>{teamName(teamId)}</p>
                    <p className="akwaan-numeral mt-1 text-3xl font-black">{result.answers[teamId] ?? "—"}</p>
                    <p className="text-sm font-bold text-muted-foreground">
                      {result.distances[teamId] === null ? "لم تُرسل إجابة" : `بفارق ${result.distances[teamId]}`}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="text-xl font-black">
              {result.tie ? "نفس المسافة! الجولة تعادل" : `${teamName(result.winnerTeamId!)} كان الأقرب!`}
            </p>
            {snapshot?.match?.availableActions.includes("challenge:continue") ? null : null}
            {snapshot?.participants.some((person) => person.role === "controller") &&
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
                <p className="text-sm font-bold text-muted-foreground">بانتظار المضيف للمتابعة…</p>
              )}
          </section>
        )}
      </div>
    </ChallengeFrame>
  );
}
