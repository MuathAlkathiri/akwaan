import Link from "next/link";

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
}

export function GameCard({
  id,
  name,
  status,
  teamA,
  teamB,
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
      <CardContent>
        <Button asChild className="w-full" size="lg">
          <Link href={`/games/${id}`}>متابعة اللعبة</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
