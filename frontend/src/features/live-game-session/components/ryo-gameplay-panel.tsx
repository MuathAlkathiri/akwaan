"use client";

import { useState } from "react";
import { HeartHandshake, Lock, Swords, Unlock } from "lucide-react";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { ChallengeCountdown } from "../match/components/challenge-countdown";
import { AnswerOption } from "../match/components/answer-option";
import { teamIdentityOf, type TeamIdentity } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
import { BidiText } from "@/components/akwaan/bidi-text";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import { authoredText, type AuthoredText } from "../authored-text";
import type { GameplayRuntimeSnapshot } from "../model";

/**
 * The item as the runtime republishes it — which is as the author wrote it. The
 * text fields are localized objects, not strings; typing them as strings is what
 * crashed this panel the first time a read-your-opponent challenge could start.
 */
interface RyoItem {
  id: string;
  prompt: AuthoredText;
  media?: { url?: string; altText?: AuthoredText } | null;
  answerMode: "multiple_choice" | "closest";
  options?: Array<{ id: string; label: AuthoredText }> | null;
}

function parseItem(value: unknown): RyoItem | undefined {
  if (typeof value !== "string") return undefined;
  try {
    return JSON.parse(value) as RyoItem;
  } catch {
    return undefined;
  }
}

export function RyoGameplayPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { snapshot, gameplayCommand, connection } = useLiveSession();
  const [number, setNumber] = useState("");
  const round = runtime.activeRound;
  const interaction = round?.interaction;
  const prompt = interaction?.prompt;
  const item = parseItem(prompt?.payload.itemJson);
  const role = String(prompt?.payload.actorRole ?? "spectator");
  const terminal = Boolean(
    interaction && ["resolved", "cancelled", "expired"].includes(interaction.status),
  );
  const remainingMs = useInteractionDeadline(prompt?.deadlineAt, terminal);
  // Which *side* has locked in, from the server's redacted projection: it publishes
  // that a submission exists and its kind, never the choice inside it. `kind`
  // follows from the two roles the screen already shows, so this leaks nothing —
  // and it is what lets both teams watch each other commit.
  const submissions = interaction?.submissions ?? [];
  const answerLocked = submissions.some(
    (submission) => submission.payload.kind === "answer",
  );
  const decisionLocked = submissions.some(
    (submission) => submission.payload.kind === "decision",
  );
  const alreadySubmitted =
    role === "answering"
      ? answerLocked
      : role === "opposing"
        ? decisionLocked
        : false;
  // The server names one authoritative answerer and one authoritative
  // Trust/Steal decision-maker per item. Submission authorisation alone is
  // team-wide, so without this every teammate would be offered a button the
  // server would then refuse.
  //
  // The server answers this per actor and against the live runtime, so a
  // disconnect handoff moves the controls with the assignment.
  const isAssignedActor = prompt?.payload.isAssignedActor === true;
  const canSubmit =
    runtime.availableActions.includes("submission:create") &&
    isAssignedActor &&
    !alreadySubmitted &&
    connection === "connected";
  const deciderName = (participantId: unknown) =>
    snapshot?.participants.find((person) => person.id === participantId)
      ?.displayName ?? "";
  const assignedName = deciderName(
    role === "answering"
      ? prompt?.payload.answererParticipantId
      : prompt?.payload.deciderParticipantId,
  );
  const itemIndex = Number(runtime.modeState.currentItemIndex ?? 0);
  const answeringTeamId = String(round?.modeState.answeringTeamId ?? "");
  const opposingTeamId = String(round?.modeState.opposingTeamId ?? "");
  const team = (id: string) =>
    snapshot?.teams.find((candidate) => candidate.id === id)?.name ?? "الفريق";
  const submit = (payload: Record<string, string | number>) =>
    gameplayCommand("interaction-submit", { roundId: round?.id, payload });

  const answeringIdentity = teamIdentityOf(answeringTeamId, snapshot?.teams ?? []);
  const opposingIdentity = teamIdentityOf(opposingTeamId, snapshot?.teams ?? []);

  return (
    <ChallengeFrame
      eyebrow="اقرأ خصمك"
      title={`السؤال ${Math.min(3, itemIndex + 1)} من 3`}
      progressValue={(Math.min(3, itemIndex) / 3) * 100}
      className="mx-auto max-w-3xl"
    >
      <div className="space-y-5">
        {/* Both sides' lock state, one indicator each, both visible to both teams.
            That a team has committed is public; what it chose is not — the drama of
            this mechanic is watching your opponent lock in before you do. */}
        <div
          className="grid gap-2 text-sm sm:grid-cols-2"
          data-testid="ryo-lock-indicators"
        >
          <TeamLockIndicator
            teamName={team(answeringTeamId)}
            role="يجيب"
            identity={answeringIdentity}
            locked={answerLocked}
            testId="ryo-lock-answering"
          />
          <TeamLockIndicator
            teamName={team(opposingTeamId)}
            role="يقرأ الخصم"
            identity={opposingIdentity}
            locked={decisionLocked}
            testId="ryo-lock-opposing"
          />
        </div>
        {item ? (
          <section className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
            {item.media?.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.media.url}
                alt={authoredText(item.media.altText, "صورة السؤال")}
                className="mx-auto max-h-52 rounded-[var(--radius)] object-contain"
              />
            )}
            {/* The question is the largest thing on screen, at a size that reads
                from three metres on a television. */}
            <h2 className="text-[2rem] font-black leading-snug text-foreground sm:text-[2.5rem]">
              <BidiText>{authoredText(item.prompt)}</BidiText>
            </h2>

            {/* Second-largest, immediately after it: in a ~10-second blind window
                the clock is the only tension driver in the mechanic. */}
            {remainingMs !== undefined && (
              <ChallengeCountdown remainingMs={remainingMs} variant="prominent" />
            )}

            {role === "answering" && canSubmit && item.answerMode === "multiple_choice" && (
              <div
                className="grid w-full gap-2 sm:grid-cols-2"
                data-testid="ryo-answer-controls"
              >
                {item.options?.map((option) => (
                  <AnswerOption
                    key={option.id}
                    onClick={() =>
                      submit({ kind: "answer", mode: "multiple_choice", optionId: option.id })
                    }
                  >
                    <BidiText>{authoredText(option.label)}</BidiText>
                  </AnswerOption>
                ))}
              </div>
            )}
            {role === "answering" && canSubmit && item.answerMode === "closest" && (
              <div
                className="mx-auto flex max-w-sm gap-2"
                data-testid="ryo-answer-controls"
              >
                <Input
                  dir="ltr"
                  inputMode="decimal"
                  value={number}
                  onChange={(event) => setNumber(event.target.value)}
                  placeholder="اكتب تقديرك الرقمي"
                />
                <Button
                  disabled={!number.trim() || !Number.isFinite(Number(number))}
                  onClick={() => submit({ kind: "answer", mode: "closest", value: Number(number) })}
                >
                  إرسال
                </Button>
              </div>
            )}
            {role === "opposing" && canSubmit && (
              /**
               * Steal and Trust, weighted identically.
               *
               * The payoff matrix is symmetric, so the two options must look
               * symmetric. They were a bright red button and a filled navy one —
               * "danger, don't" beside "safe default" — which pushed players toward
               * Trust and removed the bluffing layer the mechanic is built on.
               *
               * Same border, same fill, same size, same padding, same weight. They
               * differ by icon and label and by nothing else, and neither takes a
               * semantic colour: at this moment nothing on screen is correct or
               * wrong yet.
               */
              <div
                className="grid w-full grid-cols-2 gap-3"
                data-testid="ryo-decision-controls"
              >
                {DECISIONS.map(({ decision, label, Icon }) => (
                  <Button
                    key={decision}
                    size="lg"
                    variant="outline"
                    data-decision={decision}
                    className="h-auto min-h-[4rem] flex-col gap-1.5 border-2 bg-card py-3 text-base font-black hover:bg-accent active:scale-[0.99]"
                    onClick={() => submit({ kind: "decision", decision })}
                  >
                    <Icon className="size-6" aria-hidden />
                    {label}
                  </Button>
                ))}
              </div>
            )}
            {(role === "spectator" || alreadySubmitted || !canSubmit) && !terminal && (
              <p
                className="rounded-[var(--radius)] bg-muted p-4 font-bold text-muted-foreground"
                data-testid="ryo-waiting"
              >
                {alreadySubmitted
                  ? "تم استلام اختيارك. بانتظار الطرف الآخر…"
                  : !isAssignedActor && role !== "spectator" && assignedName
                    ? `${assignedName} هو صاحب القرار في هذه الفقرة. ناقشوها معه.`
                    : "بانتظار اختيارات الفريقين…"}
              </p>
            )}
          </section>
        ) : (
          <p className="rounded-[var(--radius)] bg-muted p-6 text-center font-bold text-muted-foreground">
            جارٍ تجهيز السؤال التالي…
          </p>
        )}
        {interaction?.outcome && (
          /**
           * The one place a semantic colour belongs: a full-surface state that
           * exists for the moment an answer resolves and then goes away. Nothing
           * persistent in this product is allowed to be green or red, which is what
           * makes this surface legible the instant it appears.
           */
          <div
            data-testid="ryo-reveal"
            data-outcome={
              interaction.outcome.payload.correct ? "correct" : "wrong"
            }
            className={cn(
              "akwaan-rise rounded-[var(--radius)] p-5 text-center text-sem-reveal-foreground",
              interaction.outcome.payload.correct
                ? "bg-sem-success"
                : "bg-sem-error",
            )}
            role="status"
          >
            <p className="text-2xl font-black">
              {interaction.outcome.payload.correct
                ? "إجابة صحيحة"
                : "إجابة غير صحيحة"}
            </p>
            <p className="text-sm font-bold opacity-90">
              قرار الخصم:{" "}
              {interaction.outcome.payload.decision === "steal"
                ? "سرقة"
                : "ثقة"}
            </p>
          </div>
        )}
      </div>
    </ChallengeFrame>
  );
}

/**
 * The two choices, defined once.
 *
 * Kept as data rather than two hand-written buttons so the pair cannot drift apart:
 * one of them gaining a variant, a size or a colour is the defect this whole screen
 * was rebuilt to remove. A team is addressed in the plural — "أثق بإجابتكم", never
 * "بإجابته".
 */
const DECISIONS = [
  { decision: "trust", label: "نثق بإجابتكم", Icon: HeartHandshake },
  { decision: "steal", label: "نسرق النقاط", Icon: Swords },
] as const;

/**
 * One team's lock state.
 *
 * Flips the instant that team submits, independently of the other. In the team's own
 * colour, and never in a semantic colour: locking in is not a correct or a wrong
 * thing to have done. The lock icon carries the state as well, so the change is
 * readable without comparing two hues.
 */
function TeamLockIndicator({
  teamName,
  role,
  identity,
  locked,
  testId,
}: {
  teamName: string;
  role: string;
  identity: TeamIdentity;
  locked: boolean;
  testId: string;
}) {
  const Icon = locked ? Lock : Unlock;
  return (
    <p
      data-testid={testId}
      data-locked={locked ? "true" : "false"}
      className={cn(
        "flex items-center justify-between gap-2 rounded-[var(--radius)] border-2 p-3 font-bold transition-colors duration-base ease-akwaan",
        identity.border,
        // Locked fills with the team's own colour; still deciding stays a tint. An
        // opacity step alone was too quiet to read across a room, and this is the
        // moment the mechanic wants everyone to notice. Both states are the team's
        // colour: committing is not a correct or an incorrect thing to have done.
        locked ? identity.solid : cn(identity.surface, identity.text),
      )}
    >
      <span className="min-w-0">
        <span className="block text-[0.7rem] font-bold opacity-80">{role}</span>
        <strong className="block truncate font-black">{teamName}</strong>
      </span>
      <span className="flex shrink-0 items-center gap-1.5 text-xs font-black">
        <Icon className="size-4" aria-hidden />
        {/* One verb for both sides: the answering team picks an answer and the
            opposing team picks Steal or Trust, and "يقرر" only described the second. */}
        {locked ? "اختار" : "يختار…"}
      </span>
    </p>
  );
}

