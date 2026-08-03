"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ConfirmationDialog,
  EmptyState,
  SectionCard,
} from "@/components/shared";
import { showToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/utils";

import { useDeleteScope, useScopes } from "../../hooks/use-world-content";
import { EntityFormDialog, RowSkeleton } from "../shared";
import { ScopeCard } from "./scope-card";
import { ScopeForm } from "./scope-form";
import type { Scope } from "../../types";

export function ScopeSection({ worldId }: { worldId: string }) {
  const { data: scopes = [], isLoading } = useScopes(worldId);
  const [addOpen, setAddOpen] = useState(false);
  const [editingScope, setEditingScope] = useState<Scope | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Scope | null>(null);
  const deleteScope = useDeleteScope();

  return (
    <SectionCard
      title="نطاقات المحتوى"
      description="تصنيف المحتوى داخل العالم — لا يغيّر أي مكانيكا"
      actions={
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="me-1.5 size-4" />
          إضافة نطاق
        </Button>
      }
    >
      {isLoading ? (
        <RowSkeleton rows={2} />
      ) : !scopes.length ? (
        <EmptyState
          title="لا توجد نطاقات بعد"
          description="أضف نطاقاً واحداً نشطاً على الأقل ليصبح العالم قابلاً للتنشيط."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {scopes.map((scope) => (
            <ScopeCard
              key={scope.id}
              scope={scope}
              onEdit={() => setEditingScope(scope)}
              onDelete={() => setPendingDelete(scope)}
            />
          ))}
        </div>
      )}

      <EntityFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="إضافة نطاق محتوى"
      >
        <ScopeForm worldId={worldId} onSuccess={() => setAddOpen(false)} />
      </EntityFormDialog>

      <EntityFormDialog
        open={Boolean(editingScope)}
        onOpenChange={(open) => {
          if (!open) setEditingScope(null);
        }}
        title="تعديل نطاق المحتوى"
      >
        {editingScope && (
          <ScopeForm
            key={editingScope.id}
            worldId={worldId}
            scope={editingScope}
            onSuccess={() => setEditingScope(null)}
          />
        )}
      </EntityFormDialog>

      <ConfirmationDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="حذف نطاق المحتوى"
        description={`هل تريد حذف "${pendingDelete?.name ?? ""}"؟ لا يمكن حذف نطاق يحتوي على عناصر محتوى.`}
        confirmLabel="حذف"
        destructive
        disabled={deleteScope.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteScope.mutate(pendingDelete.id, {
            onSuccess: () => setPendingDelete(null),
            onError: (error) => {
              showToast({
                type: "error",
                message: getApiErrorMessage(
                  error,
                  "لا يمكن حذف نطاق مرتبط بمحتوى.",
                ),
              });
              setPendingDelete(null);
            },
          });
        }}
      />
    </SectionCard>
  );
}
