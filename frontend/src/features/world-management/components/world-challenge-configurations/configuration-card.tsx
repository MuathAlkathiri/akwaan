"use client";
import { Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ANSWER_MODE_LABEL,
  FAMILY_LABEL,
  SLOT_KEY_LABEL,
  worldChallengeConfigurationName,
} from "../../utils/world-content.labels";
import type { WorldChallengeConfiguration } from "../../types";

interface ConfigurationCardProps {
  configuration: WorldChallengeConfiguration;
  onEdit: () => void;
  onDelete: () => void;
}

export function ConfigurationCard({
  configuration,
  onEdit,
  onDelete,
}: ConfigurationCardProps) {
  const { challengeType } = configuration;
  const timer = challengeType.defaultPresentation.timerSeconds;

  return (
    <div
      className="rounded-xl border p-3"
      data-testid={`configuration-${configuration.slotKey}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">
              {worldChallengeConfigurationName(configuration)}
            </p>
            <Badge variant="outline">
              {SLOT_KEY_LABEL[configuration.slotKey]}
            </Badge>
            <Badge variant="outline">
              {FAMILY_LABEL[challengeType.family]}
            </Badge>
            {!configuration.isEnabled && (
              <Badge variant="secondary">غير مفعّل</Badge>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            المكانيكا: {challengeType.name} ·{" "}
            {ANSWER_MODE_LABEL[challengeType.answerMode]}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {timer ? `${timer} ثانية لكل فقرة` : "إيقاع تحدده المكانيكا"}
          </p>
          {configuration.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {configuration.description}
            </p>
          )}
          {configuration.instructions && (
            <p className="mt-1 text-xs text-muted-foreground">
              التعليمات: {configuration.instructions}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="تعديل الإعداد"
            onClick={onEdit}
          >
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="حذف الإعداد"
            onClick={onDelete}
          >
            <Trash2 className="size-3.5 text-destructive" />
          </Button>
        </div>
      </div>
    </div>
  );
}
