"use client";

import { useParams } from "next/navigation";
import { PlayerJoinPage } from "@/features/live-game-session/components/player-join-page";

export default function JoinLiveSessionPage() {
  const params = useParams();
  const joinCode = Array.isArray(params.joinCode)
    ? params.joinCode[0]
    : params.joinCode;
  if (!joinCode) return null;
  return <PlayerJoinPage joinCode={joinCode} />;
}
