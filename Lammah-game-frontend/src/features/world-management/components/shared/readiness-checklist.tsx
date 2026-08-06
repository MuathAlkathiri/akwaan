"use client";

import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  toReadinessChecklist,
  type ReadinessCheckState,
} from "../../utils/readiness.util";
import type { ReadinessReport } from "../../types";

const STATE_STYLE: Record<
  ReadinessCheckState,
  { icon: typeof CheckCircle2; className: string; label: string }
> = {
  ok: { icon: CheckCircle2, className: "text-[#15803D]", label: "مكتمل" },
  warning: { icon: AlertTriangle, className: "text-amber-600", label: "تنبيه" },
  blocker: { icon: XCircle, className: "text-destructive", label: "ناقص" },
};

/**
 * What is still missing, item by item.
 *
 * The badge says a record needs review; this says exactly why. Every entry is a
 * real rule the backend reported, so the list never claims a problem the server
 * did not find, and a fully ready record shows one satisfied line instead of an
 * empty gap.
 */
export function ReadinessChecklist({
  report,
  satisfiedText,
  className,
}: {
  report: ReadinessReport | undefined;
  satisfiedText?: string;
  className?: string;
}) {
  const checks = toReadinessChecklist(report, satisfiedText);

  return (
    <ul
      aria-label="متطلبات الجاهزية"
      className={cn("space-y-1", className)}
    >
      {checks.map((check) => {
        const style = STATE_STYLE[check.state];
        const Icon = style.icon;
        return (
          <li
            key={check.code}
            data-check-state={check.state}
            className="flex items-start gap-1.5 text-xs leading-5"
          >
            <Icon
              className={cn("mt-0.5 size-3.5 shrink-0", style.className)}
              aria-label={style.label}
            />
            <span
              className={
                check.state === "ok" ? "text-muted-foreground" : undefined
              }
            >
              {check.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
