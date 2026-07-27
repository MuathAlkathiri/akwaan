import type { LucideIcon } from "lucide-react";
import { InboxIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
}

export function EmptyState({
  title,
  description,
  icon: Icon = InboxIcon,
}: EmptyStateProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 text-center">
        <span className="rounded-full bg-muted p-3 text-muted-foreground">
          <Icon className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
