"use client";

import { Check, MessageSquare, Timer } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useInteractionDeadline } from "../hooks/use-interaction-deadline";
import { useLiveSession } from "../hooks/live-session-context";
import type { GameplayRuntimeSnapshot } from "../model";

const actionLabels: Record<string, string> = {
  "interaction:prepare": "Prepare interaction",
  "interaction:open": "Open interaction",
  "interaction:close": "Close interaction",
  "interaction:resolve": "Resolve interaction",
  "interaction:cancel": "Cancel interaction",
  "submission:create": "Send signal",
};

function eventName(action: string) {
  if (action === "submission:create") return "interaction-submit";
  return action.replace(":", "-");
}

export function GameplayInteractionPanel({
  runtime,
}: {
  runtime: GameplayRuntimeSnapshot;
}) {
  const { gameplayCommand, connection } = useLiveSession();
  const round = runtime.activeRound;
  const interaction = round?.interaction;
  const terminal = Boolean(
    interaction &&
      ["closed", "resolved", "cancelled", "expired"].includes(
        interaction.status,
      ),
  );
  const remainingMs = useInteractionDeadline(
    interaction?.prompt?.deadlineAt,
    terminal,
  );
  const actions = runtime.availableActions.filter(
    (action) =>
      action.startsWith("interaction:") || action === "submission:create",
  );
  if (!interaction && !actions.includes("interaction:prepare")) return null;

  return (
    <section className="space-y-4 rounded-lg border p-4" aria-label="Interaction">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-medium">
          <MessageSquare className="size-4" aria-hidden />
          Development interaction
        </h3>
        {interaction && <Badge variant="outline">{interaction.status}</Badge>}
      </header>

      {interaction?.prompt && (
        <div>
          <p className="text-sm text-muted-foreground">Prompt</p>
          <p className="font-medium">
            {String(interaction.prompt.payload.message ?? "Prompt available")}
          </p>
          {remainingMs !== undefined && (
            <p className="mt-2 flex items-center gap-1 text-sm">
              <Timer className="size-4" aria-hidden />
              {Math.ceil(remainingMs / 1000)}s remaining
            </p>
          )}
        </div>
      )}

      {interaction?.submissions.length ? (
        <>
          <div className="border-t" />
          <ul className="space-y-2" aria-label="Visible submissions">
            {interaction.submissions.map((submission) => (
              <li
                key={submission.id}
                className="flex flex-wrap items-center justify-between gap-2 text-sm"
              >
                <span>
                  {String(submission.payload.signal ?? "Submission")} ·{" "}
                  {submission.status}
                </span>
                {runtime.availableActions.includes("submission:adjudicate") &&
                  submission.status === "pending-adjudication" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={connection !== "connected"}
                      onClick={() =>
                        gameplayCommand("interaction-adjudicate", {
                          roundId: round?.id,
                          submissionId: submission.id,
                          accepted: true,
                          reasonCode: "host-accepted",
                        })
                      }
                    >
                      <Check className="size-4" aria-hidden />
                      Accept
                    </Button>
                  )}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {interaction?.outcome && (
        <div className="rounded-lg bg-muted p-3 text-sm">
          Outcome: {String(interaction.outcome.payload.state ?? "resolved")}
        </div>
      )}

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions
            .filter((action) => action !== "submission:adjudicate")
            .map((action) => (
              <Button
                key={action}
                variant={action.endsWith(":cancel") ? "outline" : "default"}
                disabled={connection !== "connected"}
                onClick={() =>
                  gameplayCommand(eventName(action), {
                    roundId: round?.id,
                    payload:
                      action === "submission:create"
                        ? { signal: "ready" }
                        : action === "interaction:prepare"
                          ? {}
                          : undefined,
                  })
                }
              >
                {actionLabels[action] ?? action}
              </Button>
            ))}
        </div>
      )}
    </section>
  );
}
