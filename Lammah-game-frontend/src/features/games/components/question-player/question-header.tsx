import Link from "next/link";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { resolveTeamColor } from "../../config/team-colors";
import type { CurrentGameTurn } from "../../utils/current-game-turn";

export function QuestionHeader({
  backHref,
  category,
  points,
  currentTurn,
  backLabel = "العودة للوحة",
}: {
  backHref: string;
  category: string;
  points: number;
  currentTurn?: CurrentGameTurn;
  backLabel?: string;
}) {
  const teamColor = currentTurn
    ? resolveTeamColor(currentTurn.team.color, currentTurn.teamIndex)
    : undefined;

  return (
    <header className="grid items-center gap-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <Button asChild variant="outline" size="lg">
        <Link href={backHref}>{backLabel}</Link>
      </Button>
      {currentTurn && teamColor ? (
        <div
          data-testid="question-current-turn"
          className={cn(
            "mx-auto inline-flex w-fit items-center gap-2 rounded-2xl border p-1.5 pe-3 shadow-[0_10px_30px_rgba(0,0,0,.22)] backdrop-blur-md",
            teamColor.border,
            teamColor.subtle,
          )}
        >
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-black shadow-sm md:text-base",
              teamColor.background,
              teamColor.foreground,
            )}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {currentTurn.team.name}
          </span>
          <span className="whitespace-nowrap text-xs font-bold text-white/70 md:text-sm">
            الدور الآن
          </span>
        </div>
      ) : (
        <span aria-hidden="true" />
      )}
      <div className="flex items-center gap-3 text-lg font-bold md:text-2xl">
        <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2">
          {category}
        </span>
        <span className="rounded-full bg-primary px-4 py-2 text-primary-foreground">
          {points} نقطة
        </span>
      </div>
    </header>
  );
}
