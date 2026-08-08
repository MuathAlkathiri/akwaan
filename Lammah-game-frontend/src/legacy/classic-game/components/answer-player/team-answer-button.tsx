import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  resolveTeamColor,
  TeamColorKey,
} from "../../config/team-colors";

export function TeamAnswerButton({
  name,
  score,
  disabled,
  onClick,
  color,
  teamIndex,
}: {
  name: string;
  score: number;
  disabled: boolean;
  onClick: () => void;
  color?: TeamColorKey;
  teamIndex: number;
}) {
  return (
    <Button
      size="lg"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-auto min-h-24 flex-col gap-1 rounded-3xl border-2 text-xl shadow-lg",
        resolveTeamColor(color, teamIndex).background,
        resolveTeamColor(color, teamIndex).foreground,
        resolveTeamColor(color, teamIndex).border,
      )}
    >
      <span>{name}</span>
      <span className="text-sm opacity-80">{score} نقطة</span>
    </Button>
  );
}
