"use client";

import { useParams, useSearchParams } from "next/navigation";
import { BoardScreen } from "@/features/worlds";

export default function WorldBoardPage() {
  const params = useParams<{ worldId: string }>();
  const search = useSearchParams();
  return (
    <BoardScreen
      worldId={params.worldId}
      sessionId={search.get("sessionId") ?? undefined}
    />
  );
}
