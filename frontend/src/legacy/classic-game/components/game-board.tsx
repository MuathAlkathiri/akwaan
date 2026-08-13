"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useAdjustGameScore,
  useChangeGameTurn,
  useGame,
} from "../hooks/use-games";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BoardQuestion, Team } from "@/types";
import { getEntityId } from "@/lib/utils";
import { getMediaUrl } from "@/lib/api/media-url";
import { Home, Minus, Plus, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolveTeamColor } from "../config/team-colors";
export { OptionalQuestionMedia } from "./question-player/question-media";

interface GameBoardProps {
  gameId: string;
}

function BoardQuestionButton({
  question,
  categoryName,
  onSelect,
}: {
  question: BoardQuestion;
  categoryName: string;
  onSelect: () => void;
}) {
  return (
    <button
      data-testid={`board-question-${getEntityId(question)}`}
      aria-label={`${categoryName} ${question.points}`}
      onClick={onSelect}
      disabled={question.answered}
      className={`pop-in min-h-24 w-full rounded-[1.65rem] border px-2 text-3xl font-black tracking-tight transition-all duration-300 md:min-h-28 md:text-4xl lg:min-h-0 lg:flex-1 ${
        question.answered
          ? "cursor-not-allowed border-white/[0.06] bg-white/[0.025] text-white/20"
          : "cursor-pointer border-violet-200/25 bg-gradient-to-b from-violet-600 to-purple-800 text-white shadow-[0_8px_18px_rgba(20,6,51,.28)] hover:-translate-y-1 hover:border-violet-200/55 hover:shadow-[0_12px_24px_rgba(91,33,182,.3)] focus-visible:border-amber-300/80 focus-visible:ring-2 focus-visible:ring-amber-300/35"
      }`}
    >
      {question.points}
    </button>
  );
}

export function GameBoard({ gameId }: GameBoardProps) {
  const router = useRouter();
  const { data: game, isLoading, error } = useGame(gameId);
  const adjustScore = useAdjustGameScore(gameId);
  const changeTurn = useChangeGameTurn(gameId);

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
  const activeTeam = isTeamATurn ? teamA : teamB;
  const activeTeamColor = resolveTeamColor(
    activeTeam.color,
    isTeamATurn ? 0 : 1,
  );
  const winner =
    teamA.score === teamB.score
      ? "draw"
      : teamA.score > teamB.score
        ? teamA.name
        : teamB.name;

  return (
    <div className="relative isolate min-h-screen lg:grid lg:h-dvh lg:min-h-0 lg:grid-rows-[clamp(4.5rem,11dvh,5.5rem)_minmax(0,1fr)] lg:overflow-hidden">
      <header
        dir="rtl"
        data-testid="game-board-header"
        className="z-40 border-b border-white/10 bg-[#17102d]/90 px-3 py-2 shadow-[0_10px_30px_rgba(4,1,16,.3)] backdrop-blur-xl md:px-5"
      >
        <div className="mx-auto grid h-full max-w-[1800px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/"
              className="relative h-10 w-20 shrink-0 sm:h-12 sm:w-28"
              aria-label="أكوان"
            >
              <Image
                src="/brand/akwaan-logo.png"
                alt="أكوان"
                fill
                priority
                sizes="112px"
                className="object-contain drop-shadow-[0_0_10px_rgba(139,92,246,.3)]"
              />
            </Link>
            <TeamHeader
              team={teamA}
              index={0}
              active={isTeamATurn}
              disabled={adjustScore.isPending}
              onAdjust={(delta) =>
                adjustScore.mutate({ teamIndex: 0, delta })
              }
            />
          </div>
          <div className="text-center">
            <p className="hidden max-w-52 truncate text-xs font-bold text-white/55 sm:block">
              {game.name}
            </p>
            <div className="mt-1 flex items-center justify-center">
              <div
                data-testid="current-turn"
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border py-1 ps-3 pe-1 text-xs font-black shadow",
                  activeTeamColor.background,
                  activeTeamColor.foreground,
                  activeTeamColor.border,
                )}
              >
                الدور: {activeTeam.name}
                <button
                  type="button"
                  aria-label="تغيير الدور"
                  title="تغيير الدور"
                  data-testid="change-turn"
                  disabled={changeTurn.isPending}
                  onClick={() => changeTurn.mutate()}
                  className="grid size-6 shrink-0 place-items-center rounded-full border border-current/20 bg-black/15 transition-colors hover:bg-black/25 disabled:cursor-wait disabled:opacity-50"
                >
                  <RefreshCw
                    className={cn(
                      "size-3.5",
                      changeTurn.isPending && "animate-spin",
                    )}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2">
            <TeamHeader
              team={teamB}
              index={1}
              active={!isTeamATurn}
              disabled={adjustScore.isPending}
              onAdjust={(delta) =>
                adjustScore.mutate({ teamIndex: 1, delta })
              }
            />
            <Link
              href="/"
              aria-label="الرئيسية"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] hover:bg-white/10"
            >
              <Home className="h-5 w-5" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      {game.status === "finished" ? (
        <Card className="m-4 text-center">
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
        <div className="grid gap-4 p-3 md:grid-cols-2 lg:min-h-0 lg:grid-cols-3 lg:grid-rows-2 lg:p-4 xl:gap-5">
            {game.board?.map((column, index) => (
              <section
                key={
                  game.categories?.[index]
                    ? getEntityId(game.categories[index])
                    : index
                }
                aria-label={
                  game.categories?.[index]?.name ||
                  column[0]?.category?.name ||
                  `تصنيف ${index + 1}`
                }
                className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-[#281a49]/88 p-3 shadow-[0_18px_42px_rgba(5,2,18,.32)] backdrop-blur lg:min-h-0"
              >
                <div className="grid h-full grid-cols-[4.75rem_minmax(0,1fr)_4.75rem] gap-2 md:grid-cols-[5.25rem_minmax(0,1fr)_5.25rem]">
                  <div className="flex flex-col gap-1.5">
                    {column
                      .filter((_, questionIndex) => questionIndex % 2 === 0)
                      .map((boardQuestion) => (
                        <BoardQuestionButton
                          key={getEntityId(boardQuestion)}
                          question={boardQuestion}
                          categoryName={
                            game.categories?.[index]?.name ||
                            column[0]?.category?.name ||
                            `تصنيف ${index + 1}`
                          }
                          onSelect={() =>
                            router.push(
                              `/games/${gameId}/questions/${getEntityId(boardQuestion)}`,
                            )
                          }
                        />
                      ))}
                  </div>

                  <div className="relative min-h-64 overflow-hidden rounded-[1.25rem] border border-white/10 bg-primary/10 shadow-[0_10px_24px_rgba(5,2,18,.24)] md:min-h-[17rem] lg:min-h-0">
                  {getMediaUrl(
                    game.categories?.[index]?.banner?.url ||
                      column[0]?.category?.banner?.url,
                  ) ? (
                    <Image
                      src={
                        getMediaUrl(
                          game.categories?.[index]?.banner?.url ||
                            column[0]?.category?.banner?.url,
                        ) as string
                      }
                      alt={
                        game.categories?.[index]?.name ||
                        column[0]?.category?.name ||
                        `تصنيف ${index + 1}`
                      }
                      fill
                      unoptimized
                      sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                      className="object-cover saturate-[1.1] contrast-[1.07]"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(139,92,246,.35),transparent_70%)]" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#130b29]/20 via-transparent to-transparent" />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {column
                      .filter((_, questionIndex) => questionIndex % 2 === 1)
                      .map((boardQuestion) => (
                        <BoardQuestionButton
                          key={getEntityId(boardQuestion)}
                          question={boardQuestion}
                          categoryName={
                            game.categories?.[index]?.name ||
                            column[0]?.category?.name ||
                            `تصنيف ${index + 1}`
                          }
                          onSelect={() =>
                            router.push(
                              `/games/${gameId}/questions/${getEntityId(boardQuestion)}`,
                            )
                          }
                        />
                      ))}
                  </div>
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

function TeamHeader({
  team,
  index,
  active,
  disabled,
  onAdjust,
}: {
  team: Team;
  index: number;
  active: boolean;
  disabled: boolean;
  onAdjust: (delta: -50 | 50) => void;
}) {
  const color = resolveTeamColor(team.color, index);
  return (
    <div
      data-testid={index === 0 ? "team-a-score" : "team-b-score"}
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 shadow-md",
        color.subtle,
        color.border,
        active && "ring-2 ring-white/35",
      )}
    >
      <button
        type="button"
        aria-label={`خصم 50 نقطة من ${team.name}`}
        disabled={disabled || team.score === 0}
        onClick={() => onAdjust(-50)}
        className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/15 bg-black/15 text-white/80 transition-colors hover:bg-black/25 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Minus className="size-4" aria-hidden="true" />
      </button>
      <span className={cn("h-3 w-3 shrink-0 rounded-full", color.swatch)} />
      <span className="max-w-20 truncate text-sm font-black">{team.name}</span>
      <strong className="min-w-10 text-center text-xl font-black tabular-nums md:text-2xl">
        {team.score}
      </strong>
      <button
        type="button"
        aria-label={`إضافة 50 نقطة إلى ${team.name}`}
        disabled={disabled}
        onClick={() => onAdjust(50)}
        className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20 disabled:cursor-wait disabled:opacity-40"
      >
        <Plus className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
