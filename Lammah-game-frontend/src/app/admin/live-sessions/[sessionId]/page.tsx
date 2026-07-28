"use client";

import { useParams } from "next/navigation";
import {
  LiveSessionProvider,
  LiveSessionView,
} from "@/features/live-game-session";

export default function LiveSessionDevelopmentPage() {
  const params = useParams();
  const sessionId = Array.isArray(params.sessionId)
    ? params.sessionId[0]
    : params.sessionId;
  if (!sessionId) return null;
  return (
    <div className="py-8">
      <LiveSessionProvider sessionId={sessionId}>
        <LiveSessionView />
      </LiveSessionProvider>
    </div>
  );
}
