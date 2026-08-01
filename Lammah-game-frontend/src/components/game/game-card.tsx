import Link from "next/link";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/status-badge";
import { TeamBadge } from "./team-badge";

interface GameCardProps {
  id: string;
  name: string;
  status: string;
  teamA: { name: string; score: number };
  teamB: { name: string; score: number };
  replaying?: boolean;
  onReplay: () => void;
}

export function GameCard({
  id,
  name,
  status,
  teamA,
  teamB,
  replaying,
  onReplay,
}: GameCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <CardTitle>{name}</CardTitle>
          <StatusBadge>{status}</StatusBadge>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <TeamBadge {...teamA} />
          <TeamBadge {...teamB} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        <Button asChild size="lg">
          <Link href={`/games/${id}`}>متابعة اللعبة</Link>
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={replaying}
          onClick={onReplay}
        >
          <RotateCcw
            className={`ml-2 size-4 ${replaying ? "animate-spin" : ""}`}
            aria-hidden
          />
          {replaying ? "جاري تجهيز اللعبة..." : "العب مرة أخرى"}
        </Button>
      </CardContent>
    </Card>
  );
}
