"use client";

import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  helper?: string;
  className?: string;
}

export function StatsCard({
  label,
  value,
  icon: Icon,
  helper,
  className,
}: StatsCardProps) {
  return (
    <div
      className={cn(
        "glass-panel rounded-2xl p-5 transition duration-300 hover:-translate-y-0.5 hover:border-primary/35",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-muted-foreground">{label}</p>
          <p className="mt-3 text-3xl font-black leading-none">{value}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      {helper && (
        <p className="mt-4 text-xs font-semibold text-muted-foreground">
          {helper}
        </p>
      )}
    </div>
  );
}
