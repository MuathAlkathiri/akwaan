"use client";

import { useParams } from "next/navigation";
import {
  LiveSessionProvider,
  LiveSessionView,
} from "@/features/live-game-session";

export default function MatchHostPage() {
  const params = useParams<{ sessionId: string }>();
  if (!params.sessionId) return null;
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <LiveSessionProvider sessionId={params.sessionId}>
        <LiveSessionView />
      </LiveSessionProvider>
    </div>
  );
}
