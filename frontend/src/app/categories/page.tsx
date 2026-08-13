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
import { CategoryForm, CategoriesList } from "@/features/categories";
import { PageHeader } from "@/components/shared";

export default function CategoriesPage() {
  const [open, setOpen] = useState(false);

  return (
    <RequireAdmin>
      <div className="space-y-6">
        <PageHeader
          title="الفئات"
          description="إدارة فئات الأسئلة وإعداداتها."
          actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>إضافة فئة جديدة</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>إضافة فئة جديدة</DialogTitle>
              </DialogHeader>
              <CategoryForm onSuccess={() => setOpen(false)} />
            </DialogContent>
          </Dialog>
          }
        />

        <CategoriesList />
      </div>
    </RequireAdmin>
  );
}
