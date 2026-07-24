import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QuestionsList } from "./questions-list";
export function QuestionAdminScreen() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">إدارة الأسئلة</h1>
        <Button asChild>
          <Link href="/admin/questions/new">إضافة سؤال جديد</Link>
        </Button>
      </div>
      <QuestionsList canPreview />
    </div>
  );
}
