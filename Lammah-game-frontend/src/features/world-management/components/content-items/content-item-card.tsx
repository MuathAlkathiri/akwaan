"use client";
import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReadinessBadge } from "../shared";
import {
  ANSWER_MODE_LABEL,
  CONTENT_STATUS_LABEL,
  FAMILY_LABEL,
} from "../../utils/world-content.labels";
import type { ContentItem } from "../../types";
import { localizeReadinessIssue } from "../../utils/readiness.util";

interface ContentItemCardProps {
  item: ContentItem;
  onEdit: () => void;
  onDelete: () => void;
}

export function ContentItemCard({
  item,
  onEdit,
  onDelete,
}: ContentItemCardProps) {
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{item.prompt.ar}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="outline">{CONTENT_STATUS_LABEL[item.status]}</Badge>
            <Badge variant="outline" className="font-normal">
              {ANSWER_MODE_LABEL[item.answerPayload.mode]}
            </Badge>
            {item.compatibleFamilies.map((family) => (
              <Badge key={family} variant="secondary" className="font-normal">
                {FAMILY_LABEL[family]}
              </Badge>
            ))}
            {item.isReusableAcrossSessions && (
              <Badge variant="outline" className="font-normal">
                قابل للتكرار
              </Badge>
            )}
            <ReadinessBadge readiness={item.readiness?.readiness} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="تعديل العنصر"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="حذف العنصر"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {(item.readiness?.blockers ?? []).map((issue) => (
        <p key={issue.code} className="text-xs text-destructive">
          {localizeReadinessIssue(issue)}
        </p>
      ))}
      {(item.readiness?.warnings ?? []).map((issue) => (
        <p
          key={issue.code}
          className="text-xs text-amber-700 dark:text-amber-400"
        >
          {localizeReadinessIssue(issue)}
        </p>
      ))}
    </div>
  );
}
