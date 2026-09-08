"use client";
import { ResolutionSubmissions } from "../match/components/resolution-submissions";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/api/media-url";
import { useLiveSession } from "../hooks/live-session-context";
import { useBoundedAudio } from "../hooks/use-bounded-audio";
import type { GameplayRuntimeSnapshot } from "../model";
import type { MatchActor } from "../match/types";
import {
  FIRST_NOTE_NAME,
  readFirstNoteView,
} from "../match/first-note.presentation";

export function FirstNoteGameplayPanel({
  runtime,
  actor,
}: {
  runtime: GameplayRuntimeSnapshot;
  actor: MatchActor;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const view = useMemo(
    () => readFirstNoteView(runtime.modeState),
    [runtime.modeState],
  );
  const [bid, setBid] = useState("");
  const [answer, setAnswer] = useState("");
  // Presentational only, exactly as in the other controllers: `gameplayCommand`
  // is fire-and-forget, so this closes the double-tap window and is released by
  // the authoritative phase moving on. It never claims the bid was accepted —
  // an auction is a race, and only the next snapshot says who leads.
  const [sending, setSending] = useState<string | undefined>();
  const can = (a: string) => runtime.availableActions.includes(`mode:${a}`);
  const send = (
    commandType: string,
    payload: Record<string, string | number> = {},
  ) =>
    gameplayCommand("gameplay-command", {
      roundId: runtime.activeRound?.id,
      commandType,
      payload,
    });
  const team = (id?: string | null) =>
    snapshot?.teams.find((t) => t.id === id)?.name ?? "الفريق";
  const phone = actor === "participant";
  // A ContentItem stores its media as a relative key, so handing that straight
  // to <audio> makes the browser resolve it against the page's own origin — the
  // frontend — and the request 404s. Every other runtime mechanic that plays
  // media resolves it through the canonical helper first; Bomb does exactly this
  // for its audio and image items. Resolved once here so the element and the
  // playback boundary key agree on one URL.
  const masterUrl = getMediaUrl(view.audio?.assets[0]?.url);
  // The authorised prefix comes from the server's frozen winning bid, never from
  // this component's own bid input.
  const audioRef = useBoundedAudio({
    src: masterUrl || undefined,
    seconds: view.finalBidSeconds,
    enabled: !phone && (view.phase === "answering" || view.phase === "steal"),
  });
  const live = connection === "connected";
  const max = (view.currentBidSeconds ?? 16) - 1;
  // The phone shows the clock for the action it is being asked to take. The
  // deadline is the server's; nothing here counts on its own.
  const remainingMs = useInteractionDeadline(
    view.deadlineAt,
    view.phase === "resolved" || view.phase === "completed",
  );

  // Any authoritative move — a new phase, a new song, a competing bid that
  // changed the floor, or the right to act being withdrawn — releases the guard
  // and drops a stale selection. This is what makes a losing race converge.
  useEffect(() => {
    setSending(undefined);
    setBid("");
  }, [
    view.phase,
    view.songIndex,
    view.currentBidSeconds,
    view.canBid,
    view.canAnswer,
  ]);

  const dispatch = (
    key: string,
    commandType: string,
    payload: Record<string, string | number> = {},
  ) => {
    if (sending) return;
    setSending(key);
    send(commandType, payload);
  };
  return (
    <ChallengeFrame
      {...(phone ? {} : { eyebrow: FIRST_NOTE_NAME })}
      compact={phone}
      aside={
        phone && remainingMs !== undefined ? (
          <ChallengeCountdown remainingMs={remainingMs} />
        ) : null
      }
      title={
        view.phase === "completed"
          ? "نتيجة التحدي"
          : `الأغنية ${view.songIndex + 1} من ${view.songCount}`
      }
      progressValue={
        view.phase === "completed"
          ? 100
          : ((view.songIndex + 1) / view.songCount) * 100
      }
      className={phone ? "flex min-h-0 flex-1 flex-col" : "mx-auto max-w-4xl"}
    >
      <div
        dir="rtl"
        className={phone ? "flex min-h-0 flex-1 flex-col gap-3" : "space-y-5"}
        data-testid="first-note-panel"
      >
        {view.phase === "preparing" && (
          <p className="text-center font-bold">جارٍ تجهيز المقطع…</p>
        )}
        {view.phase !== "preparing" && view.phase !== "completed" && (
          <section
            className={
              phone
                ? "shrink-0 text-center"
                : "rounded-[var(--radius)] border bg-card p-5 text-center"
            }
            data-testid="first-note-clue"
          >
            {view.clueLabel?.ar && (
              <p className="text-xs text-muted-foreground">
                {view.clueLabel.ar}
              </p>
            )}
            <p className={phone ? "text-lg font-black" : "text-2xl font-black"}>
              {view.clue.ar}
            </p>
          </section>
        )}
        {view.phase === "auction" && (
          <section
            className={
              phone
                ? "flex min-h-0 flex-1 flex-col gap-2 text-center"
                : "space-y-4 text-center"
            }
            data-testid="first-note-auction"
          >
            {!phone && masterUrl && (
              <audio
                className="hidden"
                preload="auto"
                src={masterUrl}
                data-testid="first-note-audio-preload"
              />
            )}
            <p className="text-lg font-bold">
              أقل مزايدة:{" "}
              <strong>
                {view.currentBidSeconds
                  ? `${view.currentBidSeconds} ثانية · ${team(view.currentBidTeamId)}`
                  : "لم تبدأ"}
              </strong>
            </p>
            <p>
              {team(view.biddingTeamId)} عليه الدور · المسموح 1–{max} ثانية
            </p>
            {phone && view.canBid && can("submit-first-note-bid") ? (
              <MobileActionArea>
                {/* Only the seconds the current floor actually allows — the same
                    1..max the panel has always computed from `currentBidSeconds`.
                    Picking then confirming, rather than bidding on first tap: an
                    auction is latency-sensitive and a mis-tap is unrecoverable. */}
                <ol
                  className="grid list-none grid-cols-5 gap-1.5"
                  data-testid="first-note-bid-options"
                  dir="ltr"
                >
                  {Array.from(
                    { length: Math.max(max, 0) },
                    (_u, i) => max - i,
                  ).map((seconds) => (
                    <li key={seconds}>
                      <button
                        type="button"
                        disabled={!live || Boolean(sending)}
                        onClick={() => setBid(String(seconds))}
                        data-testid={`first-note-bid-${seconds}`}
                        data-selected={
                          Number(bid) === seconds ? "true" : undefined
                        }
                        className={cn(
                          "akwaan-numeral h-12 w-full rounded-[var(--radius)] border-2 text-base font-black transition-colors duration-fast ease-akwaan disabled:opacity-40",
                          Number(bid) === seconds
                            ? "border-brand-gold bg-brand-gold/15 text-foreground"
                            : "border-border bg-card text-muted-foreground",
                        )}
                      >
                        {seconds}
                      </button>
                    </li>
                  ))}
                </ol>
                <Button
                  size="lg"
                  disabled={
                    !live ||
                    Boolean(sending) ||
                    !Number.isInteger(Number(bid)) ||
                    Number(bid) < 1 ||
                    Number(bid) > max
                  }
                  onClick={() =>
                    dispatch("bid", "submit-first-note-bid", {
                      seconds: Number(bid),
                    })
                  }
                  data-testid="first-note-submit-bid"
                  className="h-14 w-full text-base font-black"
                >
                  {sending === "bid"
                    ? "جارٍ الإرسال…"
                    : bid
                      ? `زايد بـ ${bid} ثانية`
                      : "اختاروا عدد الثواني"}
                </Button>
                {view.canPass && can("pass-first-note-bid") && (
                  <Button
                    variant="outline"
                    disabled={!live || Boolean(sending)}
                    onClick={() => dispatch("pass", "pass-first-note-bid")}
                    data-testid="first-note-pass"
                    className="h-12 w-full font-black"
                  >
                    {sending === "pass" ? "جارٍ…" : "توقف عن المزايدة"}
                  </Button>
                )}
              </MobileActionArea>
            ) : phone ? (
              <p
                className="flex flex-1 items-center justify-center font-black text-muted-foreground"
                data-testid="first-note-auction-waiting"
              >
                بانتظار الفريق الآخر
              </p>
            ) : null}
            {!phone && view.canPass && can("pass-first-note-bid") && (
              <Button
                variant="outline"
                disabled={!live}
                onClick={() => send("pass-first-note-bid")}
                data-testid="first-note-pass"
              >
                توقف عن المزايدة
              </Button>
            )}
          </section>
        )}
        {(view.phase === "answering" || view.phase === "steal") && (
          <section
            className={
              phone
                ? "flex min-h-0 flex-1 flex-col gap-2 text-center"
                : "space-y-4 text-center"
            }
            data-testid="first-note-answer-phase"
          >
            <p
              className={phone ? "text-base font-black" : "text-xl font-black"}
            >
              {view.phase === "steal"
                ? "فرصة سرقة واحدة"
                : `${team(view.answerOwnerTeamId)} قال يقدر يعرفها من ${view.finalBidSeconds} ثانية`}
            </p>
            {masterUrl && !phone && (
              <audio
                ref={audioRef}
                controls
                preload="auto"
                // One canonical Master, identical for every bid and for the
                // steal. Only how far it is allowed to run changes.
                src={masterUrl}
                data-clip-seconds={view.finalBidSeconds}
                data-testid="first-note-audio"
              />
            )}
            {!phone && <p>مدة المقطع: {view.finalBidSeconds} ثانية</p>}
            {phone && view.canAnswer && can("submit-first-note-answer") ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex flex-1 flex-col justify-center">
                  <Input
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="اسم الأغنية"
                    data-testid="first-note-answer-input"
                    className="h-16 rounded-[var(--radius)] border-2 text-center text-xl font-black focus-visible:border-brand-gold"
                  />
                </div>
                <MobileActionArea>
                  <Button
                    size="lg"
                    disabled={!live || Boolean(sending) || !answer.trim()}
                    onClick={() =>
                      dispatch("answer", "submit-first-note-answer", {
                        answer: answer.trim(),
                      })
                    }
                    data-testid="first-note-submit-answer"
                    className="h-14 w-full text-base font-black"
                  >
                    {sending === "answer" ? "جارٍ الإرسال…" : "إرسال الإجابة"}
                  </Button>
                </MobileActionArea>
              </div>
            ) : phone ? (
              <p
                className="flex flex-1 items-center justify-center font-black text-muted-foreground"
                data-testid="first-note-answer-waiting"
              >
                {view.phase === "steal"
                  ? "فرصة السرقة مع الفريق الآخر"
                  : "بانتظار الفريق المجيب"}
              </p>
            ) : null}
          </section>
        )}
        {view.phase === "resolved" && view.reveal && (
          <section
            className="space-y-2 text-center"
            data-testid="first-note-reveal"
          >
            <h2 className="text-3xl font-black">{view.reveal.title}</h2>
            <ResolutionSubmissions
              answers={view.reveal.answers}
              teamName={team}
            />
            <p>المزايدة الأخيرة: {view.reveal.finalBidSeconds} ثانية</p>
            <p>
              {view.reveal.winnerTeamId
                ? `${team(view.reveal.winnerTeamId)} · ${view.reveal.points[view.reveal.winnerTeamId]} نقاط`
                : "بدون فائز"}
            </p>
            {actor === "controller" && can("advance-first-note") && (
              <Button onClick={() => send("advance-first-note")}>
                الأغنية التالية
              </Button>
            )}
          </section>
        )}
        {view.phase === "completed" && view.result && (
          <section className="text-center" data-testid="first-note-recap">
            {Object.entries(view.result.points).map(([id, points]) => (
              <p key={id} className="text-xl font-black">
                {team(id)}: {points}
              </p>
            ))}
          </section>
        )}
      </div>
    </ChallengeFrame>
  );
}
