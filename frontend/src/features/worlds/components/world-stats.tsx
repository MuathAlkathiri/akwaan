"use client";

import { Layers, Puzzle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ARABIC_NOUNS, arabicNoun } from "@/lib/arabic-plural";
import type { PlayableWorld } from "../types";

/**
 * The only two numbers a World card carries: how many regions it holds, and how
 * many different challenges it can play. Content items are an authoring concern
 * and never appear here.
 */
export function WorldStats({
  world,
  className,
  size = "md",
}: {
  world: PlayableWorld;
  className?: string;
  size?: "sm" | "md";
}) {
  const compact = size === "sm";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <Stat
        icon={<Layers className="h-4 w-4" aria-hidden="true" />}
        value={world.scopeCount}
        label={arabicNoun(world.scopeCount, ARABIC_NOUNS.scope)}
        tone="brand"
        compact={compact}
      />
      <Stat
        icon={<Puzzle className="h-4 w-4" aria-hidden="true" />}
        value={world.challengeConfigurationCount}
        label={arabicNoun(
          world.challengeConfigurationCount,
          ARABIC_NOUNS.challenge,
        )}
        tone="green"
        compact={compact}
      />
    </div>
  );
}

export function Stat({
  icon,
  value,
  label,
  tone,
  compact = false,
}: {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  tone: "brand" | "green";
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-bold",
        compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
        tone === "brand"
          ? "border-primary/15 bg-primary/[0.07] text-primary"
          : "border-success/25 bg-success-subtle text-success",
      )}
    >
      {icon}
      <span className="akwaan-numeral">{value}</span>
      <span className="opacity-75">{label}</span>
    </span>
  );
}
