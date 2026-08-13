"use client";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ContentThumbnail,
  CountBadge,
  EntityStatusBadge,
  ReadinessBadge,
  ReadinessChecklist,
} from "../shared";
import type { Scope } from "../../types";

interface ScopeCardProps {
  scope: Scope;
  onEdit: () => void;
  onDelete: () => void;
}

export function ScopeCard({ scope, onEdit, onDelete }: ScopeCardProps) {
  const blockers = scope.compatibility?.blockers ?? [];
  const usable = scope.compatibility?.usableSlots?.length ?? 0;

  return (
    <div className="space-y-2 rounded-xl border p-3 transition hover:bg-muted/30">
      <div className="flex items-center gap-3">
        <ContentThumbnail url={scope.image?.url} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{scope.name}</p>
            <EntityStatusBadge status={scope.status} />
            <ReadinessBadge
              readiness={blockers.length ? "not_ready" : "ready"}
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <CountBadge count={scope.contentItemCount} />
            <CountBadge count={usable} label="تحدٍ متاح من 4" />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="تعديل النطاق"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="حذف النطاق"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      <ReadinessChecklist
        report={{
          readiness: blockers.length ? "not_ready" : "ready",
          blockers,
          warnings: scope.compatibility?.warnings ?? [],
        }}
        satisfiedText="النطاق يمكنه استخدام تحديات اللوحة."
      />
      {Boolean(scope.compatibility?.excludedSlots?.length) && (
        <p className="text-xs text-muted-foreground">
          مستثنى:{" "}
          {scope.compatibility.excludedSlots
            .map((slot) => slot.displayName)
            .join(" · ")}
        </p>
      )}
    </div>
  );
}
