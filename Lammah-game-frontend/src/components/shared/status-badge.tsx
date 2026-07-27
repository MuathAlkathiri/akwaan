import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusTone = "success" | "warning" | "danger" | "neutral";

interface StatusBadgeProps extends Omit<BadgeProps, "variant"> {
  tone?: StatusTone;
}

const tones: Record<StatusTone, string> = {
  success:
    "border-transparent bg-accent/15 text-green-700 dark:text-green-300",
  warning:
    "border-transparent bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  danger:
    "border-transparent bg-destructive/10 text-destructive",
  neutral: "border-transparent bg-muted text-muted-foreground",
};

export function StatusBadge({
  tone = "neutral",
  className,
  ...props
}: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(tones[tone], className)}
      {...props}
    />
  );
}
