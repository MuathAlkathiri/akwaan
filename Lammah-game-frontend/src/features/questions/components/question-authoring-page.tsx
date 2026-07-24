"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { QuestionForm } from "./question-form";
import { useQuestion } from "../hooks/use-questions";

export function QuestionAuthoringPage({
  questionId,
}: {
  questionId?: string;
}) {
  const router = useRouter();
  const query = useQuestion(questionId ?? "");
  const editing = Boolean(questionId);

  if (editing && query.isLoading)
    return <div className="py-12 text-center">جاري تحميل السؤال...</div>;
  if (editing && (query.error || !query.data))
    return (
      <Card>
        <CardContent className="py-12 text-center text-destructive">
          تعذر تحميل السؤال المطلوب.
        </CardContent>
      </Card>
    );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">إدارة الأسئلة</p>
          <h1 className="text-3xl font-black">
            {editing ? "تحرير السؤال" : "إضافة سؤال جديد"}
          </h1>
        </div>
        <Button asChild variant="outline">
          <Link href="/admin/questions">رجوع إلى الأسئلة</Link>
        </Button>
      </header>
      <QuestionForm
        question={query.data}
        onSuccess={() => router.push("/admin/questions")}
        onCancel={() => router.push("/admin/questions")}
      />
    </main>
  );
}
