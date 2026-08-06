"use client";

import { useParams } from "next/navigation";
import { WorldScreen } from "@/features/worlds";

export default function WorldPage() {
  const params = useParams<{ worldId: string }>();
  return <WorldScreen worldId={params.worldId} />;
}
