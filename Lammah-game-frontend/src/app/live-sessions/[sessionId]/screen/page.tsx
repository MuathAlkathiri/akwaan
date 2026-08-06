"use client";

import { useParams } from "next/navigation";
import { LiveSessionProvider } from "@/features/live-game-session";
import { SharedScreenMatchView } from "@/features/live-game-session/match/views";

export default function LiveSessionSharedScreenPage() {
  const params = useParams();
  const sessionId = Array.isArray(params.sessionId)
    ? params.sessionId[0]
    : params.sessionId;
  if (!sessionId) return null;
  return (
    <div className="min-h-screen bg-[#fffaf0] px-4 py-6 sm:px-6">
      <LiveSessionProvider sessionId={sessionId}>
        <SharedScreenMatchView />
      </LiveSessionProvider>
    </div>
  );
}

