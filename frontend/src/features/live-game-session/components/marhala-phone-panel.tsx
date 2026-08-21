"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Flag, Loader2, Rocket, Send, Zap } from "lucide-react";

import { BidiText } from "@/components/akwaan/bidi-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import {
  MARHALA_CHALLENGE_NAME,
  MARHALA_DIFFICULTY_LABEL,
  marhalaBandPreviews,
  marhalaPositionOf,
  marhalaPromptText,
  readMarhalaView,
  type MarhalaDifficulty,
  type MarhalaView,
} from "../match/marhala.presentation";
import type { GameplayRuntimeSnapshot } from "../model";

/**
 * "المرحلة" on a player's phone — an input surface, not a small board.
 *
 * The board is on the shared screen and the room is looking at it; a phone that
 * tried to redraw sixteen tiles would compete with it and lose. So a phone shows
 * exactly what its holder must decide or type, plus the one number they need — the
 * tile they are standing on.
 *
 * Authorization is the server's. Every control here exists only when the actor's
 * own `availableActions` contains the command, which is a projection of what the
 * runtime would actually accept from this actor — the opposing team is not merely
 * shown disabled buttons, it is sent none.
 */
export function MarhalaPhonePanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { gameplayCommand, connection } = useLiveSession();
  const [answer, setAnswer] = useState("");
  const answerInput = useRef<HTMLInputElement>(null);
  const view = useMemo(
    () => readMarhalaView(runtime.modeState),
    [runtime.modeState],
  );
  const round = runtime.activeRound;
  const remainingMs = useInteractionDeadline(
    view.deadlineAt,
    view.phase === "completed",
  );
  const live = connection === "connected";
  const can = (action: string) =>
    runtime.availableActions.includes(`mode:${action}`);
  // Two independent gates, both the server's: the action must be offered to this
  // actor at all, and the server must consider this actor's team the one playing.
  const mayChoose = can("choose-marhala-difficulty") && view.isActiveTeam;
  const mayAnswer = can("submit-marhala-answer") && view.isActiveTeam;

  // A typed answer must never survive into the next question.
  useEffect(
    () => setAnswer(""),
    [runtime.runtimeId, round?.id, view.turnNumber, view.phase],
  );
  useEffect(() => {
    if (mayAnswer && view.phase === "question") answerInput.current?.focus();
  }, [mayAnswer, view.phase, view.turnNumber]);

  const send = (
    commandType: string,
    payload: Record<string, string | number | boolean | null> = {},
  ) =>
    gameplayCommand("gameplay-command", {
      roundId: round?.id,
      commandType,
      payload,
    });

  const choose = (difficulty: MarhalaDifficulty) => {
    if (!live) return;
    send("choose-marhala-difficulty", { difficulty });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!answer.trim() || !live || !mayAnswer) return;
    send("submit-marhala-answer", { answer: answer.trim() });
    setAnswer("");
  };

  return (
    <section
      dir="rtl"
      data-testid="marhala-phone"
      data-marhala-phase={view.phase}
      className="mx-auto w-full max-w-md space-y-3"
    >
      <header className="surface-card flex items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-black text-muted-foreground">
            {MARHALA_CHALLENGE_NAME}
          </p>
          <p className="text-sm font-black text-foreground">
            مربّعكم الحالي:{" "}
            <span className="akwaan-numeral">
              {marhalaPositionOf(view, view.actorTeamId ?? "")}
            </span>
          </p>
        </div>
        {remainingMs !== undefined && view.phase === "question" && (
          <ChallengeCountdown remainingMs={remainingMs} />
        )}
      </header>

      {view.phase === "difficulty-choice" &&
        (mayChoose ? (
          <BandChoices view={view} onChoose={choose} disabled={!live} />
        ) : (
          <WaitingCard
            title="دور الفريق الآخر"
            body="شاهدوا الشاشة — سيختارون مستوى الخطر الآن."
          />
        ))}

      {view.phase === "question-pending" && (
        <div
          className="surface-card flex items-center gap-2 p-4"
          data-testid="marhala-phone-pending"
          role="status"
        >
          <Loader2
            className="size-4 animate-spin text-muted-foreground"
            aria-hidden
          />
          <p className="text-sm font-black text-foreground">
            جارٍ تجهيز السؤال…
          </p>
        </div>
      )}

      {view.phase === "question" &&
        (mayAnswer ? (
          <form
            onSubmit={submit}
            className="surface-card space-y-3 p-4"
            data-testid="marhala-answer-form"
          >
            <p className="text-lg font-black leading-snug text-foreground">
              <BidiText>{marhalaPromptText(view)}</BidiText>
            </p>
            <Input
              ref={answerInput}
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              placeholder="اكتب الإجابة"
              aria-label="الإجابة"
              autoComplete="off"
              className="h-12 text-base"
            />
            <Button
              type="submit"
              size="lg"
              disabled={!answer.trim() || !live}
              className="h-12 w-full font-black"
              data-testid="marhala-answer-submit"
            >
              <Send className="size-4" aria-hidden />
              أرسل الإجابة
            </Button>
          </form>
        ) : (
          <WaitingCard
            title="الفريق الآخر يجيب"
            body="لا تتدخّلوا — دوركم بعد هذا السؤال."
          />
        ))}

      {view.phase === "completed" && (
        <WaitingCard title="انتهى السباق" body="النتيجة على الشاشة المشتركة." />
      )}
    </section>
  );
}

/**
 * The three bands as large tap targets, each with what it could reach.
 *
 * A band the server has no unseen content for is rendered as a disabled, labelled
 * card rather than removed: the player who was about to press صعب needs to know why
 * it is gone. It also cannot be pressed — and if it somehow were, the runtime
 * refuses the choice, which is the guarantee that matters.
 */
function BandChoices({
  view,
  onChoose,
  disabled,
}: {
  view: MarhalaView;
  onChoose: (difficulty: MarhalaDifficulty) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2" data-testid="marhala-band-choices">
      <p className="px-1 text-sm font-black text-foreground">
        اختاروا مستوى الخطر
      </p>
      {marhalaBandPreviews(view).map((band) => (
        <button
          key={band.difficulty}
          type="button"
          disabled={!band.available || disabled}
          onClick={() => onChoose(band.difficulty)}
          data-testid={`marhala-choose-${band.difficulty}`}
          data-band-available={band.available ? "true" : "false"}
          className={cn(
            "flex w-full items-center justify-between gap-3 rounded-[var(--radius)] border p-4 text-start transition-colors duration-fast ease-akwaan",
            band.available
              ? "border-border bg-card active:bg-muted"
              : "border-dashed border-border bg-muted/40 text-muted-foreground",
          )}
        >
          <span className="min-w-0">
            <span className="block text-lg font-black text-foreground">
              {MARHALA_DIFFICULTY_LABEL[band.difficulty]}
            </span>
            <span className="akwaan-numeral block text-xs font-bold text-muted-foreground">
              {band.range.min}–{band.range.max}
            </span>
          </span>
          {band.available ? (
            <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
              {band.tiles.map((tile) => (
                <span
                  key={tile.position}
                  data-testid={`marhala-phone-landing-${tile.position}`}
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[0.7rem] font-black",
                    tile.kind === "boost" &&
                      "border-brand-gold/60 text-brand-gold",
                    tile.kind === "trap" &&
                      "border-destructive/50 text-destructive",
                    tile.kind === "finish" &&
                      "border-brand-gold bg-brand-gold/20 text-brand-gold",
                    tile.kind === "normal" && "border-border text-foreground",
                  )}
                >
                  <span className="akwaan-numeral">{tile.position}</span>
                  {tile.kind === "boost" && (
                    <Rocket className="size-3" aria-hidden />
                  )}
                  {tile.kind === "trap" && (
                    <Zap className="size-3" aria-hidden />
                  )}
                  {tile.kind === "finish" && (
                    <Flag className="size-3" aria-hidden />
                  )}
                </span>
              ))}
            </span>
          ) : (
            <span className="shrink-0 text-xs font-black">لا أسئلة جديدة</span>
          )}
        </button>
      ))}
    </div>
  );
}

function WaitingCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      className="surface-card space-y-1 p-5 text-center"
      data-testid="marhala-phone-waiting"
      role="status"
    >
      <p className="text-base font-black text-foreground">{title}</p>
      <p className="text-sm font-bold text-muted-foreground">{body}</p>
    </div>
  );
}
