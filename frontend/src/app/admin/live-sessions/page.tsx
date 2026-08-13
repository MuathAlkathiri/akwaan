"use client";

import { LiveSessionCreator } from "@/features/live-game-session";

export default function LiveSessionsDevelopmentPage() {
  return (
    <div className="py-8">
      <LiveSessionCreator />
    </div>
  );
}
