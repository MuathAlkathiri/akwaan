import { cn } from "@/lib/utils";
import type { World } from "../../types";

interface WorldStatsProps {
  world: Pick<
    World,
    "scopeCount" | "challengeConfigurationCount" | "contentItemCount"
  >;
  variant?: "compact" | "detailed";
  className?: string;
}

export function WorldStats({
  world,
  variant = "compact",
  className,
}: WorldStatsProps) {
  return (
    <p className={cn("text-xs text-muted-foreground", className)}>
      {variant === "compact" ? (
        <>
          {world.scopeCount} نطاق · {world.challengeConfigurationCount} تحدٍ ·{" "}
          {world.contentItemCount} عنصر
        </>
      ) : (
        <>
          {world.scopeCount} نطاق محتوى · {world.challengeConfigurationCount} تحدٍ
          مُهيأ من 4 · {world.contentItemCount} عنصر محتوى
        </>
      )}
    </p>
  );
}
