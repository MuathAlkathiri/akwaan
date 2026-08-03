"use client";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ContentThumbnail, EntityStatusBadge, ReadinessBadge } from "../shared";
import { WorldStats } from "./world-stats";
import type { World } from "../../types";

interface WorldCardProps {
  world: World;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function WorldCard({
  world,
  selected,
  onSelect,
  onEdit,
  onDelete,
}: WorldCardProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 outline-none transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-muted/50"
      }`}
    >
      <ContentThumbnail url={world.banner?.url} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-semibold">{world.name}</p>
          <EntityStatusBadge status={world.status} />
          <ReadinessBadge readiness={world.readiness?.readiness} />
        </div>
        <WorldStats world={world} variant="compact" className="truncate" />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="تعديل العالم"
          onClick={(event) => {
            event.stopPropagation();
            onEdit();
          }}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="حذف العالم"
          onClick={(event) => {
            event.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
