"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChallengeFrame } from "../match/components/challenge-frame";
import { teamIdentityOf } from "@/lib/team-identity";
import { cn } from "@/lib/utils";
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
  const alreadySubmitted = Boolean(interaction?.submissions.length);
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
      aside={
        remainingMs !== undefined && (
          <Badge
            variant="outline"
            className="akwaan-numeral font-black"
            data-testid="ryo-timer"
          >
            {Math.ceil(remainingMs / 1000)} ثانية
          </Badge>
        )
      }
      className="mx-auto max-w-3xl"
    >
      <div className="space-y-5">
        {/* Both roles, in their own team colours, always visible. Which side a
            phone is on is the first thing its player needs to know. */}
        <div className="grid gap-2 text-center text-sm sm:grid-cols-2">
          <p
            className={cn(
              "rounded-[var(--radius)] border p-3 font-bold",
              answeringIdentity.surface,
              answeringIdentity.border,
              answeringIdentity.text,
            )}
          >
            يجيب: <strong className="font-black">{team(answeringTeamId)}</strong>
          </p>
          <p
            className={cn(
              "rounded-[var(--radius)] border p-3 font-bold",
              opposingIdentity.surface,
              opposingIdentity.border,
              opposingIdentity.text,
            )}
          >
            يقرأ الخصم:{" "}
            <strong className="font-black">{team(opposingTeamId)}</strong>
          </p>
        </div>
        {item ? (
          <section className="mx-auto max-w-2xl space-y-4 text-center">
            {item.media?.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.media.url}
                alt={authoredText(item.media.altText, "صورة السؤال")}
                className="mx-auto max-h-52 rounded-[var(--radius)] object-contain"
              />
            )}
            <h2 className="text-2xl font-black leading-snug text-foreground sm:text-3xl">
              {authoredText(item.prompt)}
            </h2>
            {role === "answering" && canSubmit && item.answerMode === "multiple_choice" && (
              <div
                className="grid gap-2 sm:grid-cols-2"
                data-testid="ryo-answer-controls"
              >
                {item.options?.map((option) => (
                  <Button
                    key={option.id}
                    size="lg"
                    variant="outline"
                    onClick={() =>
                      submit({ kind: "answer", mode: "multiple_choice", optionId: option.id })
                    }
                  >
                    {authoredText(option.label)}
                  </Button>
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
              <div
                className="grid grid-cols-2 gap-3"
                data-testid="ryo-decision-controls"
              >
                <Button
                  size="lg"
                  className="h-14 text-base font-black"
                  onClick={() => submit({ kind: "decision", decision: "trust" })}
                >
                  أثق بإجابته
                </Button>
                <Button
                  size="lg"
                  variant="destructive"
                  className="h-14 text-base font-black"
                  onClick={() => submit({ kind: "decision", decision: "steal" })}
                >
                  أسرق النقاط
                </Button>
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
          <div
            className={cn(
              "akwaan-rise rounded-[var(--radius)] border p-4 text-center",
              interaction.outcome.payload.correct
                ? "border-success/30 bg-success-subtle"
                : "border-destructive/25 bg-destructive/[0.07]",
            )}
            role="status"
          >
            <p className="text-lg font-black text-foreground">
              {interaction.outcome.payload.correct
                ? "إجابة صحيحة"
                : "إجابة غير صحيحة"}
            </p>
            <p className="text-sm font-bold text-muted-foreground">
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

