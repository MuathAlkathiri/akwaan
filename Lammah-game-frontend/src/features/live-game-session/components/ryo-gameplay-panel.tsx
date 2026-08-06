"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";

interface RyoItem {
  id: string;
  prompt: string;
  media?: { url?: string; altText?: string } | null;
  answerMode: "multiple_choice" | "closest";
  options?: Array<{ id: string; label: string }> | null;
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
  const canSubmit =
    runtime.availableActions.includes("submission:create") &&
    !alreadySubmitted &&
    connection === "connected";
  const itemIndex = Number(runtime.modeState.currentItemIndex ?? 0);
  const answeringTeamId = String(round?.modeState.answeringTeamId ?? "");
  const opposingTeamId = String(round?.modeState.opposingTeamId ?? "");
  const team = (id: string) =>
    snapshot?.teams.find((candidate) => candidate.id === id)?.name ?? "الفريق";
  const submit = (payload: Record<string, string | number>) =>
    gameplayCommand("interaction-submit", { roundId: round?.id, payload });

  return (
    <Card dir="rtl" className="overflow-hidden border-amber-200">
      <CardHeader className="bg-gradient-to-l from-amber-100 to-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-amber-800">اقرأ خصمك</p>
            <CardTitle>السؤال {Math.min(3, itemIndex + 1)} من 3</CardTitle>
          </div>
          <Badge variant="outline">
            {remainingMs === undefined
              ? "بانتظار السؤال"
              : `${Math.ceil(remainingMs / 1000)} ثانية`}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-6">
        <div className="grid gap-2 text-center text-sm sm:grid-cols-2">
          <p className="rounded-xl bg-slate-100 p-3">
            يجيب: <strong>{team(answeringTeamId)}</strong>
          </p>
          <p className="rounded-xl bg-amber-100 p-3">
            يقرأ الخصم: <strong>{team(opposingTeamId)}</strong>
          </p>
        </div>
        {item ? (
          <section className="mx-auto max-w-2xl space-y-4 text-center">
            {item.media?.url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.media.url}
                alt={item.media.altText ?? "صورة السؤال"}
                className="mx-auto max-h-52 rounded-2xl object-contain"
              />
            )}
            <h2 className="text-2xl font-black">{item.prompt}</h2>
            {role === "answering" && canSubmit && item.answerMode === "multiple_choice" && (
              <div className="grid gap-2 sm:grid-cols-2">
                {item.options?.map((option) => (
                  <Button
                    key={option.id}
                    size="lg"
                    variant="outline"
                    onClick={() =>
                      submit({ kind: "answer", mode: "multiple_choice", optionId: option.id })
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            )}
            {role === "answering" && canSubmit && item.answerMode === "closest" && (
              <div className="mx-auto flex max-w-sm gap-2">
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
              <div className="grid grid-cols-2 gap-3">
                <Button size="lg" onClick={() => submit({ kind: "decision", decision: "trust" })}>
                  أثق بإجابته
                </Button>
                <Button
                  size="lg"
                  variant="destructive"
                  onClick={() => submit({ kind: "decision", decision: "steal" })}
                >
                  أسرق النقاط
                </Button>
              </div>
            )}
            {(role === "spectator" || alreadySubmitted || !canSubmit) && !terminal && (
              <p className="rounded-xl bg-slate-100 p-4 text-slate-600">
                {alreadySubmitted ? "تم استلام اختيارك. بانتظار الطرف الآخر…" : "بانتظار اختيارات الفريقين…"}
              </p>
            )}
          </section>
        ) : (
          <p className="rounded-xl bg-slate-100 p-6 text-center text-slate-600">
            جارٍ تجهيز السؤال التالي…
          </p>
        )}
        {interaction?.outcome && (
          <div className="rounded-2xl bg-emerald-50 p-4 text-center" role="status">
            <p className="font-black">
              {interaction.outcome.payload.correct ? "إجابة صحيحة" : "إجابة غير صحيحة"}
            </p>
            <p className="text-sm text-slate-600">
              قرار الخصم: {interaction.outcome.payload.decision === "steal" ? "سرقة" : "ثقة"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

