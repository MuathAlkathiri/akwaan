"use client";

import { Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLiveSessionConnection } from "../hooks/live-session-context";

export function SessionConnectionStatus() {
  const { connection } = useLiveSessionConnection();
  const connected = connection === "connected";
  return (
    <Badge variant={connected ? "secondary" : "outline"} aria-live="polite">
      {connected ? <Wifi aria-hidden /> : <WifiOff aria-hidden />}
      {connection}
    </Badge>
  );
}
