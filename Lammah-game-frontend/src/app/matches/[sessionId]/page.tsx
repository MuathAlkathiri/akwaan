"use client";

import { useParams } from "next/navigation";
import { LiveSessionProvider } from "@/features/live-game-session";
import { MatchHostScreen } from "@/features/live-game-session/match/components/match-host-screen";

/**
 * The Match, as the host runs it.
 *
 * The route owns the page surface and nothing else; every stage of the Match is
 * rendered by the one router underneath.
 */
export default function MatchHostPage() {
  const params = useParams<{ sessionId: string }>();
  if (!params.sessionId) return null;
  return (
    <div className="min-h-screen bg-[#fffaf0]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <LiveSessionProvider sessionId={params.sessionId}>
          <MatchHostScreen />
        </LiveSessionProvider>
      </div>
    </div>
  );
}
