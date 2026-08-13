"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useWorldBoard,
  useWorlds,
} from "@/features/world-management/hooks/use-world-content";
import { QuestionsList } from "./questions-list";

export function QuestionAdminScreen() {
  const searchParams = useSearchParams();
  const worldId = searchParams.get("worldId") || undefined;
  const challengeTypeId = searchParams.get("challengeTypeId") || undefined;
  const contentCategoryId = searchParams.get("contentCategoryId") || undefined;

  const { data: worlds = [] } = useWorlds();
  const { data: board } = useWorldBoard(worldId);
  const world = worlds.find((item) => item.id === worldId);
  // The player-facing challenge name lives on the World configuration.
  const challenge = board?.configurations.find(
    (configuration) => configuration.challengeTypeId === challengeTypeId,
  );
  const isFiltered = Boolean(worldId || challengeTypeId || contentCategoryId);

  const addQuestionHref =
    worldId && challengeTypeId
      ? `/admin/questions/new?worldId=${worldId}&challengeTypeId=${challengeTypeId}`
      : "/admin/questions/new";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">إدارة الأسئلة</h1>
        <Button asChild>
          <Link href={addQuestionHref}>إضافة سؤال جديد</Link>
        </Button>
      </div>

      {isFiltered && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3 text-sm">
          <span className="text-muted-foreground">عرض أسئلة:</span>
          {world && <Badge variant="outline">{world.name}</Badge>}
          {challenge && (
            <Badge variant="outline">{challenge.effectiveName}</Badge>
          )}
          <Button asChild variant="ghost" size="sm" className="ms-auto">
            <Link href="/admin/questions">
              <X className="me-1.5 size-3.5" />
              إلغاء الفلترة
            </Link>
          </Button>
        </div>
      )}

      <QuestionsList
        canPreview
        worldId={worldId}
        contentCategoryId={contentCategoryId}
        challengeTypeId={challengeTypeId}
        emptyMessage={
          isFiltered ? "لا توجد أسئلة ضمن هذا الفلتر" : "لا توجد أسئلة"
        }
      />
    </div>
  );
}
