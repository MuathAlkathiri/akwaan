import type { ChallengeTypeDeletionPreview } from "../types";

export function presentChallengeTypeDeletion(
  name: string,
  preview: ChallengeTypeDeletionPreview,
) {
  if (preview.archiveRequired) {
    return {
      title: `لا يمكن حذف «${name}» نهائيًا`,
      description: `تم استخدام هذه الميكانيكا في ${preview.historicalMatchUsageCount} مباراة، وحذفها قد يؤثر على سجل المباريات والنتائج.\n\nيمكن أرشفتها لمنع استخدامها في مباريات جديدة مع الاحتفاظ بالسجل السابق.`,
      confirmLabel: "أرشفة الميكانيكا",
      destructive: false,
    };
  }
  return {
    title: `حذف «${name}» نهائيًا؟`,
    description: `سيتم حذف:\n• ${preview.contentItemCount} عنصر محتوى\n• إزالتها من ${preview.worldAssignmentCount} عوالم\n• ${preview.scopeExclusionCount} ارتباط نطاق\n• جميع الإعدادات والارتباطات التابعة لها\n\nلا يمكن التراجع عن هذا الإجراء.`,
    confirmLabel: "حذف نهائي",
    destructive: true,
  };
}
