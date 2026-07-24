"use client";

import { useRouter } from "next/navigation";
import { useGame } from "../hooks/use-games";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Team } from "@/types";
import { getEntityId } from "@/lib/utils";
export { OptionalQuestionMedia } from "./question-player/question-media";

interface GameBoardProps {
  gameId: string;
}

export function GameBoard({ gameId }: GameBoardProps) {
  const router = useRouter();
  const { data: game, isLoading, error } = useGame(gameId);

  if (isLoading) return <div className="text-center py-8">جاري التحميل...</div>;
  if (error)
    return <div className="text-center py-8 text-destructive">حدث خطأ</div>;
  if (!game)
    return <div className="text-center py-8">لم يتم العثور على اللعبة</div>;

  const fallbackTeamA: Team = {
    id: "team-a",
    name: "الفريق أ",
    members: [],
    score: 0,
  };
  const fallbackTeamB: Team = {
    id: "team-b",
    name: "الفريق ب",
    members: [],
    score: 0,
  };
  const teamA = game.teamA || game.teams?.[0] || fallbackTeamA;
  const teamB = game.teamB || game.teams?.[1] || fallbackTeamB;
  const isTeamATurn =
    game.currentTeamIndex !== undefined
      ? game.currentTeamIndex === 0
      : game.currentTeamTurn === "A";
  const winner =
    teamA.score === teamB.score
      ? "draw"
      : teamA.score > teamB.score
        ? teamA.name
        : teamB.name;

  return (
    <div className="space-y-8">
      <div className="sticky top-24 z-30 grid grid-cols-2 gap-3 md:gap-5">
        <Card
          data-testid="team-a-score"
          className={`overflow-hidden ${isTeamATurn ? "border-primary/70 watermelon-glow" : ""}`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-lg md:text-2xl">{teamA.name}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-5xl md:text-7xl font-black text-primary transition-all">
              {teamA.score}
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              {teamA.members.join(", ")}
            </div>
            {isTeamATurn && (
              <Badge
                data-testid="current-turn"
                className="mt-4 bg-primary text-primary-foreground"
              >
                الدور الحالي
              </Badge>
            )}
          </CardContent>
        </Card>

        <Card
          data-testid="team-b-score"
          className={`overflow-hidden ${!isTeamATurn ? "border-primary/70 watermelon-glow" : ""}`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-lg md:text-2xl">{teamB.name}</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-5xl md:text-7xl font-black text-primary transition-all">
              {teamB.score}
            </div>
            <div className="text-sm text-muted-foreground mt-2">
              {teamB.members.join(", ")}
            </div>
            {!isTeamATurn && (
              <Badge
                data-testid="current-turn"
                className="mt-4 bg-primary text-primary-foreground"
              >
                الدور الحالي
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {game.status === "finished" ? (
        <Card className="text-center">
          <CardHeader>
            <CardTitle className="text-4xl font-black">انتهت اللعبة</CardTitle>
          </CardHeader>
          <CardContent>
            {game.winner === "draw" ? (
              <p className="text-3xl font-black text-primary">تعادل!</p>
            ) : (
              <p className="text-3xl font-black text-primary">
                الفائز:{" "}
                {game.winner
                  ? game.winner === "A"
                    ? teamA.name
                    : teamB.name
                  : winner}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="glass-panel rounded-[2rem] p-3 md:p-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            {game.board?.map((column, index) => (
              <div
                key={
                  game.categories?.[index]
                    ? getEntityId(game.categories[index])
                    : index
                }
                className="space-y-3"
              >
                <div className="min-h-20 rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/20 to-white/5 p-3 text-center text-base font-black md:text-lg flex items-center justify-center">
                  {game.categories?.[index]?.name ||
                    column[0]?.category?.name ||
                    `تصنيف ${index + 1}`}
                </div>
                {column.map((boardQuestion) => (
                  <button
                    data-testid={`board-question-${getEntityId(boardQuestion)}`}
                    aria-label={`${game.categories?.[index]?.name || column[0]?.category?.name || `تصنيف ${index + 1}`} ${boardQuestion.points}`}
                    key={getEntityId(boardQuestion)}
                    onClick={() =>
                      router.push(
                        `/games/${gameId}/questions/${getEntityId(boardQuestion)}`,
                      )
                    }
                    disabled={boardQuestion.answered}
                    className={`pop-in min-h-24 w-full rounded-3xl border text-4xl font-black transition-all duration-300 md:min-h-28 md:text-5xl ${
                      boardQuestion.answered
                        ? "border-white/5 bg-muted/40 text-muted-foreground/40 cursor-not-allowed"
                        : "border-primary/30 bg-gradient-to-br from-secondary via-violet-800 to-purple-950 text-primary shadow-xl shadow-primary/10 hover:-translate-y-1 hover:scale-[1.03] hover:border-primary hover:shadow-primary/30 cursor-pointer"
                    }`}
                  >
                    {boardQuestion.question?.questionType === "ranked_list" ? (
                      <span className="text-2xl leading-tight">
                        Top 10
                        <small className="block text-sm">600 نقطة</small>
                      </span>
                    ) : (
                      boardQuestion.points
                    )}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
