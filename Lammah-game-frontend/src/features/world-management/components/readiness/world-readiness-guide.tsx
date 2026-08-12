"use client";

import {
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Crosshair,
  Layers3,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { World } from "../../types";
import {
  presentWorldReadiness,
  type ReadinessSection,
} from "../../utils/world-readiness.presenter";

const SECTION_META: Record<
  ReadinessSection,
  { title: string; icon: typeof ClipboardList }
> = {
  board: { title: "لوحة التحديات", icon: ClipboardList },
  content: { title: "المحتوى", icon: BookOpen },
  scopes: { title: "النطاقات", icon: Layers3 },
  challenges: { title: "التحديات", icon: Crosshair },
};

export function WorldReadinessGuide({
  world,
  onNavigate,
}: {
  world: World;
  onNavigate?: (target: "board" | "content" | "scopes" | "mechanics") => void;
}) {
  const view = presentWorldReadiness(world);
  const sections = (["board", "content", "scopes"] as ReadinessSection[])
    .map((section) => ({
      section,
      items: view.items.filter((item) => item.section === section),
    }))
    .filter(({ items }) => items.length);

  return (
    <section className="space-y-4" aria-label="جاهزية العالم">
      <div className="rounded-xl border bg-muted/25 p-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="font-black">جاهزية العالم</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {view.complete} من {view.total} متطلبات مكتملة
            </p>
          </div>
          <span className="text-2xl font-black akwaan-numeral">
            {view.percent}%
          </span>
        </div>
        <div
          className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuenow={view.percent}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-green-600 transition-[width] duration-500"
            style={{ width: `${view.percent}%` }}
          />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {view.health.map((item) => (
            <div
              key={item.label}
              className="rounded-lg border bg-background p-3"
            >
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-1 font-bold akwaan-numeral">
                {item.value} / {item.total}
              </p>
            </div>
          ))}
        </div>
      </div>

      {sections.map(({ section, items }) => {
        const Icon = SECTION_META[section].icon;
        return (
          <div key={section} className="rounded-xl border p-4">
            <h3 className="mb-3 flex items-center gap-2 font-bold">
              <Icon className="size-4 text-primary" />
              {SECTION_META[section].title}
            </h3>
            <div className="divide-y">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center",
                    item.complete && "animate-in fade-in duration-500",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    {item.complete ? (
                      <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
                    ) : (
                      <XCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
                    )}
                    <div>
                      <p className="text-sm font-semibold">
                        {item.complete ? `${item.title} — تم` : item.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                        {item.explanation}
                      </p>
                    </div>
                  </div>
                  {!item.complete &&
                    item.actionLabel &&
                    item.actionTarget &&
                    onNavigate && (
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        className="self-start sm:self-center"
                        onClick={() => onNavigate(item.actionTarget!)}
                      >
                        {item.actionLabel}
                      </Button>
                    )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {view.unknownProblems > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          توجد ملاحظات إضافية تحتاج إلى مراجعة. افتح الأقسام أعلاه واتبع
          الإرشادات الظاهرة بجانب الحقول.
        </div>
      )}
    </section>
  );
}
