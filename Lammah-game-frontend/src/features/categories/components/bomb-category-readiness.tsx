"use client";

import { Badge } from "@/components/ui/badge";
import { useBombReadiness } from "@/features/questions/hooks/use-questions";

export function BombCategoryReadiness({ categoryId }: { categoryId: string }) {
  const query = useBombReadiness(categoryId);
  const readiness = query.data?.data;
  if (!readiness) return <Badge variant="outline">Bomb · جاري فحص الجاهزية</Badge>;
  return (
    <div className="mt-3 space-y-1 text-xs">
      <Badge variant={readiness.isComplete ? "default" : "secondary"}>
        Bomb · {readiness.isComplete ? "جاهزة" : "غير جاهزة"}
      </Badge>
      <p className="text-muted-foreground">
        سهل: {readiness.easy} متاح / 2 مطلوب · متوسط: {readiness.medium} متاح /
        2 مطلوب · صعب: {readiness.hard} متاح / 2 مطلوب
      </p>
      {readiness.invalidQuestionCount > 0 && (
        <p className="text-destructive">
          أسئلة غير صالحة: {readiness.invalidQuestionCount}
        </p>
      )}
    </div>
  );
}
