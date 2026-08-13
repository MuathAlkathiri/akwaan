"use client";

import { useParams } from "next/navigation";
import { LiveSessionProvider } from "@/features/live-game-session";
import { SharedScreenMatchView } from "@/features/live-game-session/match/views";
import { ThemeToggle } from "@/components/akwaan/theme-toggle";

export default function LiveSessionSharedScreenPage() {
  const params = useParams();
  const sessionId = Array.isArray(params.sessionId)
    ? params.sessionId[0]
    : params.sessionId;
  if (!sessionId) return null;
  return (
    <div className="min-h-screen bg-background px-4 py-6 sm:px-6">
      {/* The warm light room by default, like everywhere else. This is where a host
          driving a large screen in a dim room can opt into dark for this client. */}
      <div className="mb-3 flex justify-end">
        <ThemeToggle />
      </div>
      <LiveSessionProvider sessionId={sessionId}>
        <SharedScreenMatchView />
      </LiveSessionProvider>
    </div>
  );
}

