import { Badge } from "@/components/ui/badge";

interface CountBadgeProps {
  count: number;
  label?: string;
}

export function CountBadge({ count, label = "عنصر محتوى" }: CountBadgeProps) {
  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      {count} {label}
    </Badge>
  );
}
