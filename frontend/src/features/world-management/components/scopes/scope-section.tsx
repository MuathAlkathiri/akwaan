"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, SectionCard } from "@/components/shared";

import { useScopes } from "../../hooks/use-world-content";
import {
  EntityFormDialog,
  PermanentDeletionDialog,
  RowSkeleton,
} from "../shared";
import { ScopeCard } from "./scope-card";
import { ScopeForm } from "./scope-form";
import type { Scope } from "../../types";

export function ScopeSection({ worldId }: { worldId: string }) {
  const { data: scopes = [], isLoading } = useScopes(worldId);
  const [addOpen, setAddOpen] = useState(false);
  const [editingScope, setEditingScope] = useState<Scope | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Scope | null>(null);

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

      <PermanentDeletionDialog
        target={
          pendingDelete
            ? { kind: "scope", id: pendingDelete.id, name: pendingDelete.name }
            : null
        }
        onClose={() => setPendingDelete(null)}
      />
    </SectionCard>
  );
}
