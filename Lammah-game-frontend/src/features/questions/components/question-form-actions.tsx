"use client";

import { Button } from "@/components/ui/button";

interface QuestionFormActionsProps {
  dirty: boolean;
  pending: boolean;
  isEditing: boolean;

  onCancel: () => void;
  onSaveDraft: () => void;
}

export function QuestionFormActions({
  dirty,
  pending,
  isEditing,
  onCancel,
  onSaveDraft,
}: QuestionFormActionsProps) {
  return (
    <div className="sticky top-16 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-background/90 p-3 backdrop-blur-xl">
      <p className="text-sm text-muted-foreground">
        {dirty
          ? "توجد تغييرات غير محفوظة"
          : "جميع التغييرات محفوظة"}
      </p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
        >
          إلغاء
        </Button>

        <Button
          type="button"
          variant="secondary"
          disabled={pending}
          onClick={onSaveDraft}
        >
          حفظ كمسودة
        </Button>

        <Button
          type="submit"
          disabled={pending}
        >
          {pending
            ? "جاري الحفظ..."
            : isEditing
              ? "تحديث السؤال"
              : "حفظ السؤال"}
        </Button>
      </div>
    </div>
  );
}