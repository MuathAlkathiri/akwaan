"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useGame,
  useGameQuestion,
  useRevealGameQuestion,
} from "../../hooks/use-games";
import { resolveCurrentGameTurn } from "../../utils/current-game-turn";
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
  const game = useGame(gameId);
  const reveal = useRevealGameQuestion(gameId, gameQuestionId);
  const currentTurn = resolveCurrentGameTurn(game.data);

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
          currentTurn={currentTurn}
        />
        <RankedListRound
          gameId={gameId}
          questionId={data.sourceQuestionId}
          question={data.question}
          onComplete={() => router.replace(boardHref)}
        />
      </main>
    );

  if (data.isAnswered)
    return (
      <GameScreenMessage
        message="تم احتساب هذا السؤال مسبقًا."
        href={boardHref}
      />
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
        currentTurn={currentTurn}
      />
      <section className="flex flex-1 flex-col justify-center gap-6">
        <StandardQuestionElapsedTimer />
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

function StandardQuestionElapsedTimer() {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);

    return () => window.clearInterval(interval);
  }, []);

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;

  return (
    <div
      role="timer"
      aria-label={`الوقت المنقضي ${minutes} دقيقة و${seconds} ثانية`}
      data-testid="standard-question-elapsed-timer"
      className="mx-auto inline-flex items-center gap-2 rounded-full border border-violet-300/25 bg-violet-500/10 px-4 py-2 font-black text-violet-100 shadow-[0_8px_24px_rgba(76,29,149,.18)] backdrop-blur"
    >
      <Clock3 className="size-5 text-violet-300" aria-hidden="true" />
      <span className="min-w-[4.5rem] text-center text-2xl tabular-nums" dir="ltr">
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
    </div>
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
