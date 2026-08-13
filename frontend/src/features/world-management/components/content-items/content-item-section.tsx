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

import {
  useContentItems,
  useDeleteContentItem,
  useScopes,
} from "../../hooks/use-world-content";
import { EntityFormDialog, RowSkeleton } from "../shared";
import { ContentItemCard } from "./content-item-card";
import { ContentItemForm } from "./content-item-form";
import type { ContentItem } from "../../types";

export function ContentItemSection({ worldId }: { worldId: string }) {
  const { data: scopes = [] } = useScopes(worldId);
  const [scopeFilter, setScopeFilter] = useState<string>();
  const { data: items = [], isLoading } = useContentItems({
    worldId,
    scopeId: scopeFilter,
  });
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ContentItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ContentItem | null>(null);
  const deleteItem = useDeleteContentItem();

  return (
    <SectionCard
      title="عناصر المحتوى"
      description="تنتمي إلى نطاق، ويمكن تشغيلها عبر كل تحدٍ متوافق"
      actions={
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          disabled={!scopes.length}
        >
          <Plus className="me-1.5 size-4" />
          إضافة عنصر
        </Button>
      }
    >
      {scopes.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={scopeFilter ? "outline" : "default"}
            onClick={() => setScopeFilter(undefined)}
          >
            كل النطاقات
          </Button>
          {scopes.map((scope) => (
            <Button
              key={scope.id}
              size="sm"
              variant={scopeFilter === scope.id ? "default" : "outline"}
              onClick={() => setScopeFilter(scope.id)}
            >
              {scope.name}
            </Button>
          ))}
        </div>
      )}

      {isLoading ? (
        <RowSkeleton rows={3} />
      ) : !items.length ? (
        <EmptyState
          title="لا يوجد محتوى بعد"
          description={
            scopes.length
              ? "أضف أول عنصر محتوى لهذا العالم."
              : "أضف نطاقاً أولاً قبل إضافة المحتوى."
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <ContentItemCard
              key={item.id}
              item={item}
              onEdit={() => setEditing(item)}
              onDelete={() => setPendingDelete(item)}
            />
          ))}
        </div>
      )}

      <EntityFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="إضافة عنصر محتوى"
      >
        <ContentItemForm
          worldId={worldId}
          defaultScopeId={scopeFilter ?? scopes[0]?.id}
          onSuccess={() => setAddOpen(false)}
        />
      </EntityFormDialog>

      <EntityFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title="تعديل عنصر المحتوى"
      >
        {editing && (
          <ContentItemForm
            key={editing.id}
            worldId={worldId}
            contentItem={editing}
            onSuccess={() => setEditing(null)}
          />
        )}
      </EntityFormDialog>

      <ConfirmationDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="حذف عنصر المحتوى"
        description="هل تريد حذف هذا العنصر؟"
        confirmLabel="حذف"
        destructive
        disabled={deleteItem.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteItem.mutate(pendingDelete.id, {
            onSuccess: () => setPendingDelete(null),
            onError: (error) => {
              showToast({
                type: "error",
                message: getApiErrorMessage(error, "تعذر حذف العنصر."),
              });
              setPendingDelete(null);
            },
          });
        }}
      />
    </SectionCard>
  );
}
