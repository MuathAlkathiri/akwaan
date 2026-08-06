"use client";

import { useParams, useSearchParams } from "next/navigation";
import { WorldScreen } from "@/features/worlds";

export default function WorldPage() {
  const params = useParams<{ worldId: string }>();
  const search = useSearchParams();
  return (
    <WorldScreen
      worldId={params.worldId}
      sessionId={search.get("sessionId") ?? undefined}
    />
  );
}
