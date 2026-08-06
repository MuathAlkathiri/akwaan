"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLiveSession } from "../hooks/live-session-context";
import { MatchStageRouter } from "./match-stage-router";

export function ControllerMatchView() {
  const { snapshot } = useLiveSession();
  return (
    <section className="space-y-3">
      {snapshot && (
        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link href={`/live-sessions/${snapshot.sessionId}/screen`} target="_blank">
              <ExternalLink className="size-4" aria-hidden />
              فتح الشاشة المشتركة
            </Link>
          </Button>
        </div>
      )}
      <MatchStageRouter actor="controller" />
    </section>
  );
}

export function SharedScreenMatchView() {
  return <MatchStageRouter actor="shared-screen" />;
}

export function ParticipantMatchView({ participantId }: { participantId: string }) {
  return <MatchStageRouter actor="participant" participantId={participantId} />;
}

