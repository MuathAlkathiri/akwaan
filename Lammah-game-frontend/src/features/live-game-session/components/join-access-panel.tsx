"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, QrCode, RefreshCw, Unplug } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { ConfirmationDialog } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createJoinAccess,
  getJoinAccess,
  regenerateJoinAccess,
  revokeJoinAccess,
} from "../api/live-session-api";

const defaults = {
  assignmentPolicy: "explicit" as const,
  maximumParticipantCount: 24,
  teamCapacity: 12,
  expiresInMinutes: 120,
};

export function JoinAccessPanel({
  sessionId,
  autoCreate = false,
}: {
  sessionId: string;
  autoCreate?: boolean;
}) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const access = useQuery({
    queryKey: ["live-game-session", sessionId, "join-access"],
    queryFn: () => getJoinAccess(sessionId),
    retry: false,
  });
  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: ["live-game-session", sessionId, "join-access"],
    });
  const create = useMutation({
    mutationFn: () => createJoinAccess(sessionId, defaults),
    onSuccess: refresh,
  });
  const autoCreateAttempted = useRef(false);
  useEffect(() => {
    if (
      !autoCreate ||
      access.isLoading ||
      access.data ||
      !access.error ||
      autoCreateAttempted.current
    )
      return;
    autoCreateAttempted.current = true;
    create.mutate();
  }, [access.data, access.error, access.isLoading, autoCreate, create]);
  const regenerate = useMutation({
    mutationFn: () => regenerateJoinAccess(sessionId, defaults),
    onSuccess: refresh,
  });
  const revoke = useMutation({
    mutationFn: () => revokeJoinAccess(sessionId),
    onSuccess: refresh,
  });
  const joinUrl = useMemo(() => {
    if (!access.data?.joinCode || typeof window === "undefined") return "";
    return `${window.location.origin}/join/live-session/${access.data.joinCode}`;
  }, [access.data?.joinCode]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-lg">
          <QrCode className="size-5" aria-hidden />
          Player pairing
        </CardTitle>
        {access.data && (
          <Badge variant={access.data.enabled ? "secondary" : "outline"}>
            {access.data.enabled ? "Open" : "Revoked"}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!access.data ? (
          <Button
            onClick={() => create.mutate()}
            disabled={create.isPending || access.isLoading}
          >
            Create join code
          </Button>
        ) : (
          <>
            <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
              {joinUrl && access.data.enabled && (
                <div className="rounded-lg border bg-white p-3">
                  <QRCodeSVG
                    value={joinUrl}
                    size={160}
                    title="Player join QR code"
                  />
                </div>
              )}
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Scan the QR code or enter this code:
                </p>
                <p className="font-mono text-3xl font-bold tracking-[0.2em]">
                  {access.data.joinCode}
                </p>
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(joinUrl);
                    setCopied(true);
                  }}
                  disabled={!joinUrl}
                >
                  <Copy className="mr-2 size-4" aria-hidden />
                  {copied ? "Copied" : "Copy join link"}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <ConfirmationDialog
                trigger={
                  <Button variant="outline">
                    <RefreshCw className="mr-2 size-4" aria-hidden />
                    Regenerate
                  </Button>
                }
                title="Regenerate the join code?"
                description="The current code will stop accepting new players."
                confirmLabel="Regenerate"
                onConfirm={() => regenerate.mutate()}
              />
              {access.data.enabled && (
                <ConfirmationDialog
                  trigger={
                    <Button variant="outline">
                      <Unplug className="mr-2 size-4" aria-hidden />
                      Revoke
                    </Button>
                  }
                  title="Close player joining?"
                  description="Connected players remain enrolled, but this code can no longer be used."
                  confirmLabel="Revoke"
                  destructive
                  onConfirm={() => revoke.mutate()}
                />
              )}
            </div>
          </>
        )}
        {(access.error || create.error || regenerate.error || revoke.error) && (
          <p role="alert" className="text-sm text-destructive">
            Unable to update player pairing. Try again.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
