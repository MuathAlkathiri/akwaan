import { Badge } from "@/components/ui/badge";

interface TeamBadgeProps {
  name: string;
  score: number;
}

export function TeamBadge({ name, score }: TeamBadgeProps) {
  return (
    <Badge variant="secondary" className="h-auto gap-2 px-3 py-1">
      <span>{name}</span>
      <span className="font-bold text-primary">{score}</span>
    </Badge>
  );
}
