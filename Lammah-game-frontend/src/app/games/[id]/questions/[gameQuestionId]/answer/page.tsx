"use client";

import { useParams } from "next/navigation";
import { RequireAuth } from "@/components/auth/require-auth";
import { AnswerPlayer } from "@/features/games/components/answer-player/answer-player";

export default function GameQuestionAnswerPage() {
  const params = useParams();
  const gameId = Array.isArray(params.id) ? params.id[0] : params.id;
  const gameQuestionId = Array.isArray(params.gameQuestionId)
    ? params.gameQuestionId[0]
    : params.gameQuestionId;

  if (!gameId || !gameQuestionId)
    return <div className="py-8 text-center">لم يتم العثور على السؤال.</div>;

  return (
    <RequireAuth>
      <AnswerPlayer gameId={gameId} gameQuestionId={gameQuestionId} />
    </RequireAuth>
  );
}
