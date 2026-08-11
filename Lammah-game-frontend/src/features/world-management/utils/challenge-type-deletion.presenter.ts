import type { ChallengeTypeDeletionPreview } from "../types";

export function presentChallengeTypeDeletion(
  name: string,
  preview: ChallengeTypeDeletionPreview,
) {
  if (!preview.canHardDelete) {
    return {
      title: `لا يمكن حذف «${name}» نهائيًا`,
      description:
        preview.blockReason === "active_match"
          ? `تُستخدم هذه الميكانيكا حاليًا في ${preview.activeMatchUsageCount} مباراة نشطة. أكمل أو ألغِ المباريات النشطة ثم حاول مجددًا.`
          : "لا يمكن حذف الميكانيكا لأن بعض سجلات المباريات السابقة لا تحتوي على لقطة تاريخية مكتملة.",
      confirmLabel: "الحذف غير متاح",
      destructive: true,
      canConfirm: false,
    };
  }
  const historyWarning = preview.historicalMatchUsageCount
    ? `\n\nتم استخدام هذه الميكانيكا سابقًا في ${preview.historicalMatchUsageCount} مباراة. ستبقى نتائج المباريات السابقة محفوظة كسجل تاريخي.`
    : "";
  return {
    title: `حذف «${name}» نهائيًا؟`,
    description: `سيتم حذف:\n• الميكانيكا\n• ${preview.contentItemCount} عنصر محتوى\n• إزالتها من ${preview.worldAssignmentCount} عوالم\n• ${preview.scopeExclusionCount} ارتباط نطاق\n• جميع الإعدادات والارتباطات التابعة لها${historyWarning}\n\nلا يمكن التراجع عن هذا الإجراء.`,
    confirmLabel: "حذف نهائي",
    destructive: true,
    canConfirm: true,
  };
}
