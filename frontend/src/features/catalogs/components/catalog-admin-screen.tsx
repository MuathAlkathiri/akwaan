"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CatalogForm } from "./catalog-form";
import { CatalogsList } from "./catalogs-list";
export function CatalogAdminScreen() {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-black text-primary">Admin only</p>
          <h1 className="text-3xl font-bold">إدارة الكتالوجات</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>إضافة كتالوج جديد</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>إضافة كتالوج جديد</DialogTitle>
            </DialogHeader>
            <CatalogForm onSuccess={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>
      <CatalogsList />
    </div>
  );
}
