"use client";

import Link from "next/link";
import { Home, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AkwaanLoader } from "@/components/akwaan/akwaan-loader";
import { useLiveSession } from "../../hooks/live-session-context";
import { MatchStageRouter } from "../match-stage-router";
import { matchErrorCopy } from "../match-error-copy";
import { MatchShell } from "./match-shell";

/**
 * The host's Match screen.
 *
 * One surface for the whole Match: the board, a preflight, a challenge, and the
 * result all render through the same router inside the same shell. The shell
 * holds what belongs to the room — teams, score, progress, connection — and the
 * router owns everything that belongs to the game.
 *
 * Deliberately not the internal live-session panel: session controls, runtime
 * debugging, and the join panel are admin tooling, and a Match host has no use
 * for any of it while running a game.
 */
export function MatchHostScreen() {
  const { snapshot, error, resync } = useLiveSession();

  if (!snapshot && error) {
    // The server's message names ids and is written in English for a log reader.
    // A room full of players gets the Arabic sentence instead; the code stays on
    // the element for support.
    const copy = matchErrorCopy(error);
    return (
      <MatchShell actor="controller">
        <Alert
          variant="destructive"
          dir="rtl"
          data-testid="match-host-error"
          data-error-code={error.code}
          className="mx-auto max-w-xl text-center"
        >
          <AlertTitle className="text-2xl font-black">{copy.title}</AlertTitle>
          <AlertDescription className="space-y-4">
            <p className="text-base leading-7">{copy.body}</p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {copy.retryable && (
                <Button
                  type="button"
                  onClick={() => resync?.()}
                  className="font-black"
                >
                  <RefreshCw className="size-4" aria-hidden />
                  إعادة المحاولة
                </Button>
              )}
              <Button
                asChild
                variant="outline"
                className="font-black no-underline [&_a]:no-underline"
              >
                <Link href="/">
                  <Home className="size-4" aria-hidden />
                  الرئيسية
                </Link>
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      </MatchShell>
    );
  }

  return (
    <MatchShell actor="controller">
      {snapshot ? (
        <MatchStageRouter actor="controller" />
      ) : (
        // Initial entry into an existing Match before its snapshot has hydrated
        // (a fresh open, or a Resume from مبارياتي): no Match state is valid yet,
        // so the branded loader owns the wait rather than blank skeleton blocks.
        <AkwaanLoader label="نجهّز المباراة..." />
      )}
    </MatchShell>
  );
}
