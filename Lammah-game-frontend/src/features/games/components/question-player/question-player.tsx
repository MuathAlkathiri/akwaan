"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useGameQuestion, useRevealGameQuestion } from "../../hooks/use-games";
import { RankedListRound } from "../ranked-list-round";
import { QuestionHeader } from "./question-header";
import { QuestionMedia } from "./question-media";
import { BombQuestionLaunch } from "./bomb-question-launch";

export function QuestionPlayer({
  gameId,
  gameQuestionId,
}: {
  gameId: string;
  gameQuestionId: string;
}) {
  const router = useRouter();
  const boardHref = `/games/${gameId}`;
  const answerHref = `${boardHref}/questions/${gameQuestionId}/answer`;
  const question = useGameQuestion(gameId, gameQuestionId);
  const reveal = useRevealGameQuestion(gameId, gameQuestionId);

  if (question.isLoading)
    return (
      <GameScreenMessage message="جاري تحميل السؤال..." href={boardHref} />
    );
  if (question.isError || !question.data)
    return (
      <GameScreenMessage message="لم يتم العثور على السؤال." href={boardHref} />
    );

  const data = question.data;
  if (data.questionType === "bomb_sequence")
    return (
      <BombQuestionLaunch
        gameId={gameId}
        gameQuestionId={gameQuestionId}
        categoryName={data.category.name}
        points={data.points}
      />
    );

  if (data.isAnswered)
    return (
      <GameScreenMessage
        message="تم احتساب هذا السؤال مسبقًا."
        href={boardHref}
      />
    );

  if (data.questionType === "ranked_list")
    return (
      <main
        dir="rtl"
        className="mx-auto min-h-[calc(100dvh-7rem)] w-full max-w-7xl space-y-6 px-3 py-4 md:px-8"
      >
        <QuestionHeader
          backHref={boardHref}
          category={data.category.name}
          points={data.points}
        />
        <h1 className="text-center text-3xl font-black leading-tight md:text-5xl">
          {data.question}
        </h1>
        <RankedListRound
          gameId={gameId}
          questionId={data.sourceQuestionId}
          question={data.question}
          onComplete={() => router.replace(boardHref)}
        />
      </main>
    );

  const showAnswer = async () => {
    try {
      await reveal.mutateAsync();
      router.push(answerHref);
    } catch {
      // The safe error below intentionally avoids rendering raw API details.
    }
  };

  return (
    <main
      dir="rtl"
      className="mx-auto flex min-h-[calc(100dvh-7rem)] w-full max-w-7xl flex-col gap-6 px-3 py-4 md:gap-8 md:px-8"
    >
      <QuestionHeader
        backHref={boardHref}
        category={data.category.name}
        points={data.points}
      />
      <section className="flex flex-1 flex-col justify-center gap-6">
        <h1
          data-testid="game-question-text"
          className="text-center text-3xl font-black leading-tight sm:text-4xl md:text-6xl"
        >
          {data.question}
        </h1>
        <QuestionMedia presentation={data.presentation} />
      </section>
      {reveal.isError && (
        <p role="alert" className="text-center text-destructive">
          تعذر إظهار الإجابة، حاول مرة أخرى.
        </p>
      )}
      <Button
        size="lg"
        className="sticky bottom-4 mx-auto w-full max-w-xl text-xl"
        disabled={reveal.isPending}
        onClick={showAnswer}
      >
        {reveal.isPending ? "جاري إظهار الإجابة..." : "إظهار الإجابة"}
      </Button>
    </main>
  );
}

function GameScreenMessage({
  message,
  href,
}: {
  message: string;
  href: string;
}) {
  return (
    <main
      dir="rtl"
      className="flex min-h-[70dvh] flex-col items-center justify-center gap-5 text-center"
    >
      <p className="text-2xl font-bold">{message}</p>
      <Button asChild size="lg">
        <a href={href}>العودة للوحة</a>
      </Button>
    </main>
  );
}
