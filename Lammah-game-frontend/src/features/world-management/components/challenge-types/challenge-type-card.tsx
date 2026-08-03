"use client";
import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ContentThumbnail,
  CountBadge,
  EntityStatusBadge,
  ReadinessBadge,
} from "../shared";
import {
  ANSWER_MODE_LABEL,
  FAMILY_LABEL,
} from "../../utils/world-content.labels";
import type { ChallengeType } from "../../types";
import { localizeReadinessIssue } from "../../utils/readiness.util";

interface ChallengeTypeCardProps {
  challengeType: ChallengeType;
  onEdit: () => void;
  onDelete: () => void;
}

export function ChallengeTypeCard({
  challengeType,
  onEdit,
  onDelete,
}: ChallengeTypeCardProps) {
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-start gap-3">
        <ContentThumbnail url={challengeType.icon?.url} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{challengeType.name}</p>
            <Badge variant="outline">
              {FAMILY_LABEL[challengeType.family]}
            </Badge>
            {challengeType.isExclusive && <Badge>حصري</Badge>}
            <EntityStatusBadge status={challengeType.status} />
            <ReadinessBadge readiness={challengeType.readiness?.readiness} />
          </div>
          {challengeType.description && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {challengeType.description}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-normal">
              {ANSWER_MODE_LABEL[challengeType.answerMode]}
            </Badge>
            <CountBadge
              count={challengeType.worldConfigurationCount}
              label="عالم يستخدمها"
            />
            <CountBadge count={challengeType.contentItemCount} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="تعديل المكانيكا"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="حذف المكانيكا"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>

      {(challengeType.readiness?.blockers ?? []).map((issue) => (
        <p key={issue.code} className="text-xs text-destructive">
          {localizeReadinessIssue(issue)}
        </p>
      ))}
      {(challengeType.readiness?.warnings ?? []).map((issue) => (
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
