"use client";
import { ResolutionSubmissions } from "../match/components/resolution-submissions";
import { useEffect, useMemo, useState } from "react";
import { teamIdentityOf } from "@/lib/team-identity";
import { AnswerEntry } from "../match/components/answer-entry";
import {
  ChallengeContextStrip,
  TeamDot,
  useChallengeContext,
} from "../match/components/challenge-context-strip";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { MobileActionArea } from "../match/components/mobile-action-area";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/api/media-url";
import { FIRST_NOTE_OPENING_MIN_BID } from "../match/first-note.presentation";
import { useLiveSession } from "../hooks/live-session-context";
import { useBoundedAudio } from "../hooks/use-bounded-audio";
import { useTeamActionHold } from "../hooks/use-team-action-hold";
import type { GameplayRuntimeSnapshot } from "../model";
import type { MatchActor } from "../match/types";
import {
  FIRST_NOTE_NAME,
  readFirstNoteView,
} from "../match/first-note.presentation";

const NAVY = "border-[3px] border-[hsl(var(--brand-navy))]";
const GOLD_ACTION =
  "inline-flex min-h-[62px] items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-7 font-display text-xl font-extrabold text-[hsl(var(--brand-navy))] shadow-[4px_5px_0_hsl(var(--brand-navy))] disabled:shadow-none";
const WHITE_ACTION =
  "inline-flex min-h-[54px] items-center justify-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white px-6 text-base font-bold text-[hsl(var(--brand-navy))]";
const STEP_BUTTON =
  "grid size-12 flex-none place-items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-white text-2xl font-bold text-[hsl(var(--brand-navy))] active:bg-brand-lavender disabled:opacity-50";
const CHIP =
  "inline-flex min-h-9 items-center gap-2 whitespace-nowrap rounded-full bg-white px-4 text-[15px] font-bold text-[hsl(var(--brand-navy))]";

/** A correct answer pays 16 minus the seconds asked for. */
const rewardFor = (seconds: number) => 16 - seconds;

/** «ثانية», «ثانيتين», «5 ثواني». */
function secondsLabel(count: number) {
  if (count === 1) return "ثانية";
  if (count === 2) return "ثانيتين";
  if (count >= 3 && count <= 10) return `${count} ثواني`;
  return `${count} ثانية`;
}

/** «نقطة», «نقطتين», «3 نقاط» — never «2 نقاط». */
function pointsLabel(count: number) {
  if (count === 1) return "نقطة";
  if (count === 2) return "نقطتين";
  if (count >= 3 && count <= 10) return `${count} نقاط`;
  return `${count} نقطة`;
}

/** Decoration for a clip that is playing: the room hears it, this only says so. */
function Waveform() {
  const bars = [
    30, 55, 80, 45, 95, 60, 35, 75, 100, 50, 70, 40, 85, 55, 30, 65, 90, 45, 60,
    35,
  ];
  return (
    <div aria-hidden className="flex h-24 items-center justify-center gap-1.5">
      {bars.map((height, index) => (
        <span
          key={index}
          style={{ height: `${height}%` }}
          className="w-2.5 rounded-full bg-[hsl(var(--brand-navy))]"
        />
      ))}
    </div>
  );
}

export function FirstNoteGameplayPanel({
  runtime,
  actor,
}: {
  runtime: GameplayRuntimeSnapshot;
  actor: MatchActor;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const context = useChallengeContext();
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
  // During a steal the clip is the stealing team's own bid, not the winner's:
  // each side hears the duration it asked for, which is what stops an
  // ignorant undercut from denying an opponent the song.
  const clipSeconds =
    view.phase === "steal"
      ? (view.stealSeconds ?? view.finalBidSeconds)
      : view.finalBidSeconds;
  const audioRef = useBoundedAudio({
    src: masterUrl || undefined,
    seconds: clipSeconds,
    enabled: !phone && (view.phase === "answering" || view.phase === "steal"),
  });
  const live = connection === "connected";
  const max = (view.currentBidSeconds ?? 16) - 1;
  // An opening bid may not end the auction before the other team has bid, so
  // the first bid has a floor as well as a ceiling. The server refuses a lower
  // one regardless; offering it here would only invite a rejected tap.
  const min = view.currentBidSeconds == null ? FIRST_NOTE_OPENING_MIN_BID : 1;
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
  // The turn — a bid, a pass or the answer — is one phone's: the captain if
  // the team chose one, otherwise the rotation. Teammates watch it read-only.
  const mayAct = useTeamActionHold(view.isAssignedActor, view.standInAt);
  const holderName =
    snapshot?.participants?.find(
      (person) => person.id === view.assignedParticipantId,
    )?.displayName ?? "زميلكم";
  // The slider always rests on a legal value: the highest one, which is the
  // safest bid, until the holder moves it.
  const chosen = bid ? Number(bid) : max;
  const dotOf = (id: string) => teamIdentityOf(id, snapshot?.teams ?? []).dot;
  const step = `الأغنية ${view.songIndex + 1} من ${view.songCount}`;

  const clue = view.phase !== "preparing" && view.phase !== "completed" && (
    <section
      className={cn(
        "flex flex-col gap-1 bg-brand-lavender text-start",
        phone
          ? "shrink-0 rounded-2xl border-2 border-[hsl(var(--brand-navy))] px-3.5 py-2.5"
          : cn("rounded-[22px] px-5 py-4", NAVY),
      )}
      data-testid="first-note-clue"
    >
      <p className="text-sm font-bold text-brand-slate">
        {view.clueLabel?.ar ?? "التلميح"}
      </p>
      <p
        className={cn(
          "font-display font-extrabold",
          phone ? "text-lg" : "text-2xl",
        )}
      >
        {view.clue.ar}
      </p>
    </section>
  );

  const reveal = view.phase === "resolved" && view.reveal && (
    <section
      className="akwaan-rise flex flex-col items-center gap-3 text-center"
      data-testid="first-note-reveal"
    >
      <p className="text-sm font-bold text-brand-slate">الأغنية</p>
      <h2
        className={cn(
          "font-display font-black",
          phone ? "text-2xl" : "text-[44px] leading-tight",
        )}
      >
        {view.reveal.title}
      </h2>
      <ResolutionSubmissions answers={view.reveal.answers} teamName={team} />
      <p className="text-base text-brand-slate">
        آخر مزايدة: {secondsLabel(view.reveal.finalBidSeconds)}
      </p>
      <p
        className={cn(
          "inline-flex items-center gap-2.5 rounded-2xl px-5 py-2.5 font-display text-xl font-extrabold",
          NAVY,
          view.reveal.winnerTeamId
            ? "bg-[hsl(var(--brand-gold))] shadow-[4px_5px_0_hsl(var(--brand-navy))]"
            : "bg-white",
        )}
      >
        {view.reveal.winnerTeamId ? (
          <>
            <TeamDot className={dotOf(view.reveal.winnerTeamId)} />
            {team(view.reveal.winnerTeamId)}
            {view.reveal.stolen ? " سرقوها" : ""} ·{" "}
            <bdi dir="ltr" className="akwaan-numeral">
              +{view.reveal.points[view.reveal.winnerTeamId]}
            </bdi>
          </>
        ) : (
          "ما أحد عرفها"
        )}
      </p>
      {actor === "controller" && can("advance-first-note") && (
        <button
          type="button"
          className={GOLD_ACTION}
          onClick={() => send("advance-first-note")}
        >
          {view.songIndex + 1 === view.songCount
            ? "نشوف النتيجة"
            : "الأغنية الجاية"}
        </button>
      )}
    </section>
  );

  const recap = view.phase === "completed" && view.result && (
    <section
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5"
      data-testid="first-note-recap"
    >
      {/* Who took it, said in words: two bare numbers leave the room to work
          the winner out for itself. */}
      {view.result.winnerTeamId ? (
        <p
          className="inline-flex items-center gap-2.5 rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-6 py-2 font-display text-2xl font-black shadow-[4px_5px_0_hsl(var(--brand-navy))]"
          data-testid="first-note-recap-winner"
        >
          <TeamDot className={dotOf(view.result.winnerTeamId)} />
          فاز {team(view.result.winnerTeamId)} بالتحدي
        </p>
      ) : (
        <p
          className="font-display text-2xl font-black"
          data-testid="first-note-tie"
        >
          تعادل! الفريقين خلصوا بنفس المجموع.
        </p>
      )}
      <div className="grid w-full max-w-3xl grid-cols-2 gap-4">
        {Object.entries(view.result.points).map(([id, points]) => (
          <div
            key={id}
            className={cn(
              "flex min-h-[150px] flex-col items-center justify-center gap-1.5 rounded-3xl p-5 text-center",
              NAVY,
              view.result?.winnerTeamId === id
                ? "bg-[hsl(var(--brand-gold))] shadow-[5px_6px_0_hsl(var(--brand-navy))]"
                : "bg-white",
            )}
          >
            <p className="inline-flex items-center gap-2.5 font-display text-xl font-extrabold">
              <TeamDot className={dotOf(id)} />
              {team(id)}
            </p>
            <p className="akwaan-numeral text-[56px] font-bold leading-none">
              {points}
            </p>
          </div>
        ))}
      </div>
    </section>
  );

  if (!phone) {
    const playing = view.phase === "answering" || view.phase === "steal";
    const answering =
      view.phase === "steal"
        ? (snapshot?.teams ?? []).find(
            (candidate) =>
              candidate.id !== view.answerOwnerTeamId &&
              candidate.active !== false,
          )?.id
        : view.answerOwnerTeamId;
    return (
      <section
        dir="rtl"
        data-testid="first-note-panel"
        className="flex min-h-0 flex-1 flex-col gap-[18px] text-[hsl(var(--brand-navy))]"
      >
        <ChallengeContextStrip
          {...(context.eyebrow ? { eyebrow: context.eyebrow } : {})}
          title={context.title ?? FIRST_NOTE_NAME}
          aside={
            view.phase === "auction" && view.biddingTeamId ? (
              <span className="inline-flex min-h-11 items-center gap-2.5 whitespace-nowrap rounded-full border-2 border-white bg-[hsl(var(--brand-gold))] px-[18px] text-lg font-extrabold text-[hsl(var(--brand-navy))]">
                <TeamDot className={dotOf(view.biddingTeamId)} />
                الدور على {team(view.biddingTeamId)}
              </span>
            ) : (
              <span className={CHIP}>
                {view.phase === "completed" ? "نتيجة التحدي" : step}
              </span>
            )
          }
        />

        {view.phase === "preparing" && (
          <p className="py-8 text-center text-lg font-bold text-brand-slate">
            نجهّز المقطع…
          </p>
        )}
        {recap}

        {view.phase !== "preparing" && view.phase !== "completed" && (
          <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
            <main
              className={cn(
                "flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-[28px] bg-brand-paper px-[34px] py-7 text-center shadow-[7px_8px_0_hsl(var(--brand-navy))]",
                NAVY,
              )}
            >
              {view.phase === "auction" && (
                <section
                  className="flex flex-col items-center gap-3"
                  data-testid="first-note-auction"
                >
                  {masterUrl && (
                    <audio
                      className="hidden"
                      preload="auto"
                      src={masterUrl}
                      data-testid="first-note-audio-preload"
                    />
                  )}
                  <p className="text-lg font-bold text-brand-slate">
                    أقل مزايدة
                  </p>
                  {view.currentBidSeconds ? (
                    <>
                      <p className="font-display text-[4.5rem] font-black leading-none lg:text-[112px]">
                        {secondsLabel(view.currentBidSeconds)}
                      </p>
                      <p className="inline-flex items-center gap-2.5 font-display text-2xl font-extrabold">
                        <TeamDot
                          className={dotOf(view.currentBidTeamId ?? "")}
                        />
                        {team(view.currentBidTeamId)}
                      </p>
                      <p className="inline-flex min-h-11 items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-5 text-lg font-extrabold">
                        لو جاوبوا صح:{" "}
                        {pointsLabel(rewardFor(view.currentBidSeconds))}
                      </p>
                    </>
                  ) : (
                    <p className="font-display text-[3rem] font-black leading-tight lg:text-[64px]">
                      ما بدت المزايدة
                    </p>
                  )}
                  <p className="text-base text-brand-slate">
                    {team(view.biddingTeamId)} يزايدون من {min} إلى{" "}
                    {secondsLabel(max)}، أو ينسحبون.
                  </p>
                  {view.canPass && can("pass-first-note-bid") && (
                    <button
                      type="button"
                      disabled={!live}
                      onClick={() => send("pass-first-note-bid")}
                      className={WHITE_ACTION}
                      data-testid="first-note-pass"
                    >
                      ننسحب، خلهم يجاوبون
                    </button>
                  )}
                </section>
              )}

              {playing && (
                <section
                  className="flex w-full flex-col items-center gap-4"
                  data-testid="first-note-answer-phase"
                >
                  <span className="inline-flex min-h-[52px] -rotate-2 items-center rounded-full border-[3px] border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-6 font-display text-2xl font-black">
                    المقطع شغّال · مدة المقطع: {secondsLabel(clipSeconds ?? 0)}
                  </span>
                  <Waveform />
                  <p className="font-display text-2xl font-extrabold lg:text-[32px]">
                    {view.phase === "steal"
                      ? `فرصة سرقة وحدة بمزايدتهم: ${secondsLabel(clipSeconds ?? 0)}`
                      : `${team(view.answerOwnerTeamId)} قالوا يعرفونها من ${secondsLabel(view.finalBidSeconds ?? 0)}`}
                  </p>
                  {masterUrl && (
                    <audio
                      ref={audioRef}
                      controls
                      preload="auto"
                      // One canonical Master, identical for every bid and for
                      // the steal. Only how far it is allowed to run changes.
                      src={masterUrl}
                      data-clip-seconds={clipSeconds}
                      data-testid="first-note-audio"
                      className="w-full max-w-md"
                    />
                  )}
                </section>
              )}

              {reveal}
            </main>

            <aside className="flex flex-col gap-3.5">
              {clue}
              {playing && answering && (
                <div
                  className={cn(
                    "flex items-center justify-between gap-2.5 rounded-[18px] bg-white px-4 py-3",
                    NAVY,
                  )}
                >
                  <span className="inline-flex items-center gap-2 font-display text-[19px] font-extrabold">
                    <TeamDot className={dotOf(answering)} />
                    {team(answering)}
                  </span>
                  <span className="text-sm font-bold">
                    {view.phase === "steal"
                      ? "يحاولون يسرقونها"
                      : "يجاوبون أول"}
                    {clipSeconds
                      ? ` · ${pointsLabel(rewardFor(clipSeconds))}`
                      : ""}
                  </span>
                </div>
              )}
              <p className="text-center text-sm leading-[1.7] text-brand-slate">
                {view.phase === "auction"
                  ? "كل ما قلّت الثواني زادت النقاط. صاحب أقل مزايدة يسمع المقطع ويجاوب أول."
                  : view.phase === "answering"
                    ? "لو غلطوا، الخصم له محاولة سرقة وحدة بمزايدته هو."
                    : view.phase === "steal"
                      ? "محاولة وحدة بس، والإجابة من الجوال."
                      : ""}
              </p>
            </aside>
          </div>
        )}
      </section>
    );
  }

  return (
    <ChallengeFrame
      compact
      aside={
        remainingMs !== undefined ? (
          <ChallengeCountdown remainingMs={remainingMs} sound={false} />
        ) : null
      }
      title={view.phase === "completed" ? "نتيجة التحدي" : step}
      progressValue={
        view.phase === "completed"
          ? 100
          : ((view.songIndex + 1) / view.songCount) * 100
      }
      className="flex min-h-0 flex-1 flex-col"
    >
      <div
        dir="rtl"
        className="flex min-h-0 flex-1 flex-col gap-3 text-[hsl(var(--brand-navy))]"
        data-testid="first-note-panel"
      >
        {view.phase === "preparing" && (
          <p className="text-center font-bold text-brand-slate">
            نجهّز المقطع…
          </p>
        )}
        {clue}
        {view.phase === "auction" && (
          <section
            className="flex min-h-0 flex-1 flex-col gap-2.5 text-center"
            data-testid="first-note-auction"
          >
            <p className="text-sm font-bold text-brand-slate">
              {view.currentBidSeconds ? (
                <>
                  أقل مزايدة: {secondsLabel(view.currentBidSeconds)} ·{" "}
                  {team(view.currentBidTeamId)}
                </>
              ) : (
                "ما بدت المزايدة"
              )}
            </p>
            {view.canBid && can("submit-first-note-bid") && !mayAct ? (
              <section
                className="flex flex-1 flex-col justify-center gap-3"
                data-testid="first-note-auction-teammate"
              >
                <div className="flex flex-col gap-2 rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] bg-white p-4 text-center">
                  <p className="text-sm font-bold text-brand-slate">
                    المزايدة عند
                  </p>
                  <p className="font-display text-2xl font-extrabold">
                    <bdi>{holderName}</bdi>
                  </p>
                  <p className="text-sm leading-relaxed text-brand-slate">
                    تشاوروا معه: في كم ثانية تعرفونها؟
                  </p>
                </div>
              </section>
            ) : view.canBid && can("submit-first-note-bid") ? (
              <>
                <div className="flex flex-1 flex-col items-center justify-center gap-1">
                  <p className="text-sm font-bold text-brand-slate">مزايدتكم</p>
                  <p
                    className="font-display text-[52px] font-black leading-none"
                    data-testid="first-note-bid-value"
                  >
                    {secondsLabel(chosen)}
                  </p>
                  <p className="inline-flex min-h-9 items-center rounded-full border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] px-3.5 text-sm font-extrabold">
                    لو جاوبتوا صح: {pointsLabel(rewardFor(chosen))}
                  </p>
                </div>
                <MobileActionArea>
                  {/* Only the seconds the current floor allows. Sliding picks,
                      the button sends: an auction is latency-sensitive and a
                      mis-touch on the slider must not be a bid. */}
                  {/* The same control as «مين أقرب»: a step button each side
                      of the gold track. */}
                  <div dir="ltr" className="flex w-full items-center gap-2.5">
                    <button
                      type="button"
                      aria-label="نقّص ثانية"
                      data-testid="first-note-bid-down"
                      disabled={!live || Boolean(sending) || chosen <= min}
                      onClick={() => setBid(String(Math.max(min, chosen - 1)))}
                      className={STEP_BUTTON}
                    >
                      −
                    </button>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <input
                        type="range"
                        dir="ltr"
                        min={min}
                        max={max}
                        step={1}
                        value={chosen}
                        disabled={!live || Boolean(sending) || max <= min}
                        onChange={(event) => setBid(event.target.value)}
                        aria-label="عدد الثواني"
                        aria-valuetext={secondsLabel(chosen)}
                        data-testid="first-note-bid-slider"
                        style={
                          {
                            "--closest-progress": `${max > min ? ((chosen - min) / (max - min)) * 100 : 100}%`,
                          } as React.CSSProperties
                        }
                        className="closest-slider h-11 w-full cursor-pointer"
                      />
                      <div className="akwaan-numeral flex justify-between px-1 text-sm font-bold text-brand-slate">
                        <span>{min}</span>
                        <span>{max}</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label="زوّد ثانية"
                      data-testid="first-note-bid-up"
                      disabled={!live || Boolean(sending) || chosen >= max}
                      onClick={() => setBid(String(Math.min(max, chosen + 1)))}
                      className={STEP_BUTTON}
                    >
                      +
                    </button>
                  </div>
                  <button
                    type="button"
                    disabled={
                      !live ||
                      Boolean(sending) ||
                      !Number.isInteger(chosen) ||
                      chosen < min ||
                      chosen > max
                    }
                    onClick={() =>
                      dispatch("bid", "submit-first-note-bid", {
                        seconds: chosen,
                      })
                    }
                    data-testid="first-note-submit-bid"
                    className={cn(GOLD_ACTION, "w-full")}
                  >
                    {sending === "bid"
                      ? "نرسلها…"
                      : `زايد بـ ${secondsLabel(chosen)}`}
                  </button>
                  {view.canPass && can("pass-first-note-bid") && (
                    <button
                      type="button"
                      disabled={!live || Boolean(sending)}
                      onClick={() => dispatch("pass", "pass-first-note-bid")}
                      data-testid="first-note-pass"
                      className={cn(WHITE_ACTION, "w-full")}
                    >
                      {sending === "pass" ? "ننسحب…" : "ننسحب، خلهم يجاوبون"}
                    </button>
                  )}
                </MobileActionArea>
              </>
            ) : (
              // Waiting still means nothing to do — but "the other team" is
              // nobody. Naming who holds the bid and what their two moves are
              // turns an empty screen into a thing worth watching.
              <section
                className="flex flex-1 flex-col justify-center gap-3"
                data-testid="first-note-auction-waiting"
              >
                <div className="flex flex-col gap-2 rounded-[20px] border-[3px] border-[hsl(var(--brand-navy))] bg-white p-4 text-center">
                  <p className="text-sm font-bold text-brand-slate">ننتظر</p>
                  <p className="font-display text-2xl font-extrabold">
                    {team(view.biddingTeamId)}
                  </p>
                  <p className="text-sm leading-relaxed text-brand-slate">
                    يزايدون أو ينسحبون. لو انسحبوا، المقطع يروح لصاحب آخر
                    مزايدة.
                  </p>
                </div>
              </section>
            )}
          </section>
        )}
        {(view.phase === "answering" || view.phase === "steal") && (
          <section
            className="flex min-h-0 flex-1 flex-col gap-2.5 text-center"
            data-testid="first-note-answer-phase"
          >
            <p className="font-display text-lg font-extrabold">
              {view.phase === "steal"
                ? `فرصة سرقة وحدة بمزايدتكم: ${secondsLabel(clipSeconds ?? 0)}`
                : `${team(view.answerOwnerTeamId)} قالوا يعرفونها من ${secondsLabel(view.finalBidSeconds ?? 0)}`}
            </p>
            {view.canAnswer && can("submit-first-note-answer") && !mayAct ? (
              <p
                className="flex flex-1 items-center justify-center text-lg font-bold text-brand-slate"
                data-testid="first-note-answer-teammate"
              >
                <span>
                  الإجابة من جوال <bdi>{holderName}</bdi>. عرفتوها؟ قولوا له.
                </span>
              </p>
            ) : view.canAnswer && can("submit-first-note-answer") ? (
              <form
                className="flex min-h-0 flex-1 flex-col"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (answer.trim())
                    dispatch("answer", "submit-first-note-answer", {
                      answer: answer.trim(),
                    });
                }}
              >
                <div className="flex flex-1 flex-col justify-center">
                  <AnswerEntry
                    value={answer}
                    onChange={setAnswer}
                    placeholder="اسم الأغنية"
                    inputTestId="first-note-answer-input"
                  />
                </div>
                <MobileActionArea>
                  <button
                    type="submit"
                    disabled={!live || Boolean(sending) || !answer.trim()}
                    data-testid="first-note-submit-answer"
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
              <p
                className="flex flex-1 items-center justify-center text-lg font-bold text-brand-slate"
                data-testid="first-note-answer-waiting"
              >
                {view.phase === "steal"
                  ? "فرصة السرقة مع الخصم"
                  : "ننتظر الفريق اللي يجاوب"}
              </p>
            )}
          </section>
        )}
        {reveal}
        {recap}
      </div>
    </ChallengeFrame>
  );
}
