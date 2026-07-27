"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RequireAdmin } from "@/components/auth/require-admin";
import { QuestionForm, QuestionsList } from "@/features/questions";
import { PageHeader } from "@/components/shared";

export default function QuestionsPage() {
  const [open, setOpen] = useState(false);

  return (
    <RequireAdmin>
      <div className="space-y-6">
        <PageHeader
          title="الأسئلة"
          description="إدارة بنك الأسئلة وحالات المراجعة."
          actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>إضافة سؤال جديد</Button>
            </DialogTrigger>
            <DialogContent
              className="max-h-[90dvh] max-w-2xl overflow-y-auto overscroll-contain"
              onInteractOutside={(event: Event) => event.preventDefault()}
            >
              <DialogHeader className="sticky top-0 z-10 bg-card pb-2">
                <DialogTitle>إضافة سؤال جديد</DialogTitle>
              </DialogHeader>
              <QuestionForm onSuccess={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
          }
        />

        <QuestionsList />
      </div>
    </RequireAdmin>
  );
}
