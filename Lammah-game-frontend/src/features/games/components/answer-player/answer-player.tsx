"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  useGame,
  useGameQuestionAnswer,
  useSubmitGameQuestionResult,
} from "../../hooks/use-games";
import { resolveCurrentGameTurn } from "../../utils/current-game-turn";
import { QuestionHeader } from "../question-player/question-header";
import { TeamAnswerButton } from "./team-answer-button";

export function AnswerPlayer({
  gameId,
  gameQuestionId,
}: {
  gameId: string;
  gameQuestionId: string;
}) {
  const router = useRouter();
  const boardHref = `/games/${gameId}`;
  const questionHref = `${boardHref}/questions/${gameQuestionId}`;
  const answer = useGameQuestionAnswer(gameId, gameQuestionId);
  const game = useGame(gameId);
  const submit = useSubmitGameQuestionResult(gameId, gameQuestionId);
  const currentTurn = resolveCurrentGameTurn(game.data);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  if (answer.isLoading)
    return <AnswerMessage message="جاري تحميل الإجابة..." href={boardHref} />;
  if (answer.isError || !answer.data)
    return (
      <AnswerMessage
        message="لم يتم العثور على السؤال."
        href={questionHref}
        action="العودة للسؤال"
      />
    );

  const data = answer.data;
  if (data.isAnswered)
    return (
      <AnswerMessage message="تم احتساب هذا السؤال مسبقًا." href={boardHref} />
    );

  const submitResult = async (teamId: string | null) => {
    if (submittingRef.current || submit.isPending) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      await submit.mutateAsync(teamId);
      router.replace(boardHref);
    } catch {
      // A safe localized error is rendered below.
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const selectionDisabled = submit.isPending || submitting;

  return (
    <main
      dir="rtl"
      className="mx-auto min-h-[calc(100dvh-7rem)] w-full max-w-7xl space-y-7 px-3 py-4 md:px-8"
    >
      <QuestionHeader
        backHref={questionHref}
        backLabel="العودة للسؤال"
        category={data.category.name}
        points={data.points}
        currentTurn={currentTurn}
      />
      <section className="space-y-3 text-center">
        <p className="text-lg text-muted-foreground">{data.question}</p>
        <p className="text-xl font-bold text-muted-foreground">الإجابة</p>
        <h1
          data-testid="game-question-answer"
          className="text-4xl font-black text-primary sm:text-5xl md:text-7xl"
        >
          {data.answer}
        </h1>
        {!!data.acceptedAnswers?.length && (
          <p className="text-sm text-muted-foreground">
            الإجابات المقبولة: {data.acceptedAnswers.join("، ")}
          </p>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-center text-2xl font-black">من أجاب بشكل صحيح؟</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.teams.map((team, teamIndex) => (
            <TeamAnswerButton
              key={team._id ?? team.name}
              name={team.name}
              score={team.score}
              color={team.color}
              teamIndex={teamIndex}
              disabled={selectionDisabled}
              onClick={() => submitResult(team._id ?? "")}
            />
          ))}
          <Button
            size="lg"
            variant="outline"
            disabled={selectionDisabled}
            onClick={() => submitResult(null)}
            className="min-h-24 rounded-3xl text-xl"
          >
            لا أحد
          </Button>
        </div>
      </section>

      {submit.isError && (
        <p role="alert" className="text-center text-destructive">
          تعذر تحديث النتيجة، حاول مرة أخرى.
        </p>
      )}
    </main>
  );
}

function AnswerMessage({
  message,
  href,
  action = "العودة للوحة",
}: {
  message: string;
  href: string;
  action?: string;
}) {
  return (
    <main
      dir="rtl"
      className="flex min-h-[70dvh] flex-col items-center justify-center gap-5 text-center"
    >
      <p className="text-2xl font-bold">{message}</p>
      <Button asChild size="lg">
        <Link href={href}>{action}</Link>
      </Button>
    </main>
  );
}
