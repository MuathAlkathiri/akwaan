"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createLiveSession } from "../api/live-session-api";

export function LiveSessionCreator() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState<string>();
  const [creating, setCreating] = useState(false);

  async function create() {
    setSubmitError(undefined);
    setCreating(true);
    try {
      // The server names the two teams; there is nothing to fill in.
      const created = await createLiveSession({});
      window.sessionStorage.setItem(
        `live-session-reconnect:${created.snapshot.sessionId}`,
        created.reconnectToken,
      );
      router.push(`/admin/live-sessions/${created.snapshot.sessionId}`);
    } catch {
      setSubmitError("Unable to create the live session.");
      setCreating(false);
    }
  }

  return (
    <Card className="mx-auto max-w-xl">
      <CardHeader>
        <CardTitle>Realtime session demo</CardTitle>
        <CardDescription>
          Internal Phase 1 surface for the neutral timed-turn engine.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {submitError && (
          <p role="alert" className="text-sm text-foreground">
            {submitError}
          </p>
        )}
        <Button type="button" disabled={creating} onClick={() => void create()}>
          {creating ? "Creating…" : "Create session"}
        </Button>
      </CardContent>
    </Card>
  );
}
