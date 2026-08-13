"use client";

import { Button } from "@/components/ui/button";

export default function AdminError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="space-y-4 py-10 text-center">
      <p className="text-destructive">تعذر تحميل صفحة الإدارة.</p>
      <Button onClick={reset}>إعادة المحاولة</Button>
    </div>
  );
}
