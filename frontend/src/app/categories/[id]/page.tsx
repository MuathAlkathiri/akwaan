"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RequireAdmin } from "@/components/auth/require-admin";
import { QuestionsList } from "@/features/questions";
import { useCategory } from "@/features/categories";

export default function CategoryQuestionsPage() {
  return (
    <RequireAdmin>
      <CategoryQuestionsContent />
    </RequireAdmin>
  );
}

function CategoryQuestionsContent() {
  const params = useParams<{ id: string }>();
  const categoryId = params.id;
  const { data: category, isLoading, error } = useCategory(categoryId);

  if (isLoading) {
    return <div className="py-8 text-center">جاري التحميل...</div>;
  }

  if (error || !category) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-destructive">
          تعذر تحميل الفئة.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{category.slug}</p>
          <h1 className="text-3xl font-bold">{category.name}</h1>
          {category.description && (
            <p className="mt-2 text-muted-foreground">{category.description}</p>
          )}
        </div>
        <Button asChild variant="outline">
          <Link href="/categories">رجوع للفئات</Link>
        </Button>
      </div>

      <QuestionsList
        canPreview
        categoryId={categoryId}
        emptyMessage="لا توجد أسئلة لهذه الفئة"
      />
    </div>
  );
}
