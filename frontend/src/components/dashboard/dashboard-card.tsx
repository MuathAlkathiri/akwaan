"use client";

import Link from "next/link";
import { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface DashboardCardProps {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  className?: string;
  tone?: "playful" | "admin";
  badge?: string;
}

export function DashboardCard({
  title,
  description,
  href,
  icon: Icon,
  className,
  tone = "playful",
  badge,
}: DashboardCardProps) {
  return (
    <Link href={href} className="block h-full">
      <Card
        className={cn(
          "group h-full overflow-hidden p-5 transition duration-300 hover:-translate-y-1",
          tone === "playful"
            ? "bg-white/[0.08] hover:scale-[1.015] hover:border-primary/60 hover:shadow-primary/15"
            : "rounded-2xl bg-white/[0.055] hover:border-primary/35 hover:bg-white/[0.075]",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div
            className={cn(
              "grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-white/10 shadow-lg transition group-hover:scale-105",
              tone === "playful"
                ? "bg-primary/20 text-primary shadow-primary/10"
                : "bg-white/[0.06] text-primary shadow-black/15",
            )}
          >
            <Icon className="h-6 w-6" aria-hidden="true" />
          </div>
          {badge && (
            <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
              {badge}
            </span>
          )}
        </div>
        <div className="mt-5 space-y-2">
          <h3 className="text-xl font-black leading-tight">{title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </Card>
    </Link>
  );
}
