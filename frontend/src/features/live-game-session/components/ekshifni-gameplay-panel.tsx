"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getMediaUrl } from "@/lib/api/media-url";
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
 * The masked celebrity board.
 *
 * The photograph is on screen from the first second — it is the thing the room
 * is looking at — and six authored panels sit over the features that would name
 * the person. Buying a reveal lifts one panel off the picture; nothing else
 * about the image changes. That is the whole read at TV distance: a face you
 * can almost place, getting placeable.
 *
 * The panels are opaque, so the pixels under them are genuinely not rendered —
 * no blur to squint through — and the number is printed on the panel itself, so
 * "اكشفوا ٣" points at somewhere on the face rather than at a list.
 *
 * Region boxes are fractions of the source image, so one authored geometry lands
 * on the same eye at 1920×1080 and at 390 wide. The `<img>` sets the box, which
 * is what keeps the panels on the picture at any aspect ratio.
 */
function MaskedCelebrity({
  url,
  altText,
  regions,
  unmasked = false,
  newestRegionId,
  compact = false,
}: {
  url: string;
  altText: string;
  regions: EkshifniRegionView[];
  unmasked?: boolean;
  /** The region uncovered most recently, accented so the room sees what moved. */
  newestRegionId?: string;
  /** Give height back once the picture shares the screen with the reveal. */
  compact?: boolean;
}) {
  const percent = (value: number) => `${value * 100}%`;
  // One resolver for every media url in the app; a raw R2 key never reaches an
  // <img> from here either.
  const src = getMediaUrl(url) ?? url;
  const masks = unmasked ? [] : regions.filter((region) => !region.revealed);
  /**
   * A mask this client cannot place must not become a mask it does not draw.
   *
   * The panels are the only thing standing between the room and the answer, so
   * geometry going missing — a projection regression, a truncated payload —
   * fails closed: the picture is withheld entirely rather than shown naked. A
   * board that shows nothing is a bug someone reports; a board that quietly
   * shows the celebrity has already ended the image.
   */
  const undrawable = masks.some((region) => !region.shape);
  const [broken, setBroken] = useState(false);
  const withheld = undrawable || broken;
  return (
    <div className="flex justify-center">
      <div
        className="relative inline-block min-h-40 max-w-full overflow-hidden rounded-[var(--radius)] border border-border/70 bg-muted shadow-sm"
        data-testid="ekshifni-board"
        data-unmasked={String(unmasked)}
        data-withheld={String(withheld)}
      >
        {/* The box *is* the picture: natural aspect, no crop. Authored geometry
            is a fraction of the source, so cropping to a fixed ratio would slide
            every panel off the feature it was drawn over. Height is capped so a
            television shows the face large without a letterbox, width so a phone
            never overflows — neither changes the aspect, so neither moves a
            panel. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={altText}
          onError={() => setBroken(true)}
          className={cn(
            "block w-auto max-w-full",
            compact ? "max-h-[24vh]" : "max-h-[58vh]",
            withheld && "invisible",
          )}
        />
        {withheld && (
          <div
            className="absolute inset-0 grid place-items-center bg-muted p-6 text-center"
            role="status"
          >
            <p className="text-base font-black text-muted-foreground">
              تعذّر عرض الصورة الآن
            </p>
          </div>
        )}
        {!withheld &&
          masks.map((region) =>
            region.shape ? (
              <div
                key={region.id}
                data-testid={`ekshifni-marker-${region.number}`}
                // Fully opaque on purpose. At 95% a high-contrast feature — an
                // eye, a line of type — still reads through, and a panel you can
                // squint past is not a panel.
                className="absolute grid place-items-center rounded-lg bg-primary shadow-lg ring-1 ring-inset ring-primary-foreground/30"
                style={{
                  left: percent(region.shape.x),
                  top: percent(region.shape.y),
                  width: percent(region.shape.width),
                  height: percent(region.shape.height),
                }}
              >
                <span className="akwaan-numeral text-2xl font-black text-primary-foreground/90 sm:text-3xl">
                  {region.number}
                </span>
              </div>
            ) : null,
          )}
        {/* The one that just came off, so both teams register the change without
            a line of copy telling them. It is drawn from committed state, not a
            timer, so a screen that rejoins mid-image sees the same thing rather
            than a replayed animation. */}
        {!withheld &&
          !unmasked &&
          newestRegionId &&
          regions
            .filter((region) => region.id === newestRegionId && region.shape)
            .map((region) => (
              <div
                key={region.id}
                aria-hidden
                data-testid={`ekshifni-window-${region.number}`}
                className="pointer-events-none absolute rounded-lg ring-2 ring-brand-gold"
                style={{
                  left: percent(region.shape!.x),
                  top: percent(region.shape!.y),
                  width: percent(region.shape!.width),
                  height: percent(region.shape!.height),
                }}
              />
            ))}
      </div>
    </div>
  );
}

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
          <MaskedCelebrity
            url={view.media.assets[0].url}
            altText={
              view.reveal?.identity ??
              view.media.assets[0].altText ??
              "صورة المشهور"
            }
            regions={view.regions}
            unmasked={view.phase === "resolved"}
            compact={view.phase === "resolved"}
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
