"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/shared";
import { showToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/utils";

import { useDeleteWorld } from "../../hooks/use-world-content";
import { EntityFormDialog, RowSkeleton, SearchToolbar } from "../shared";
import { WorldCard } from "./world-card";
import { WorldForm } from "./world-form";
import type { World } from "../../types";

interface WorldSidebarProps {
  worlds: World[];
  isLoading: boolean;
  selectedWorldId?: string;
  onSelect: (worldId: string) => void;
}

export function WorldSidebar({
  worlds,
  isLoading,
  selectedWorldId,
  onSelect,
}: WorldSidebarProps) {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingWorld, setEditingWorld] = useState<World | null>(null);
  const [pendingDelete, setPendingDelete] = useState<World | null>(null);
  const deleteWorld = useDeleteWorld();

  const filteredWorlds = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return worlds;
    return worlds.filter((world) => world.name.toLowerCase().includes(query));
  }, [worlds, search]);

  return (
    <div className="space-y-3">
      <SearchToolbar
        placeholder="ابحث عن عالم"
        value={search}
        onChange={setSearch}
        action={
          <Button
            size="icon"
            onClick={() => setAddOpen(true)}
            aria-label="إضافة عالم"
          >
            <Plus className="size-4" />
          </Button>
        }
      />

      {isLoading ? (
        <RowSkeleton rows={3} />
      ) : (
        <div className="space-y-2">
          {filteredWorlds.map((world) => (
            <WorldCard
              key={world.id}
              world={world}
              selected={world.id === selectedWorldId}
              onSelect={() => onSelect(world.id)}
              onEdit={() => setEditingWorld(world)}
              onDelete={() => setPendingDelete(world)}
            />
          ))}
          {!filteredWorlds.length && (
            <p className="p-3 text-center text-sm text-muted-foreground">
              لا توجد عوالم مطابقة للبحث.
            </p>
          )}
        </div>
      )}

      <EntityFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="إضافة عالم"
      >
        <WorldForm onSuccess={() => setAddOpen(false)} />
      </EntityFormDialog>

      <EntityFormDialog
        open={Boolean(editingWorld)}
        onOpenChange={(open) => {
          if (!open) setEditingWorld(null);
        }}
        title="تعديل العالم"
      >
        {editingWorld && (
          <WorldForm
            key={editingWorld.id}
            world={editingWorld}
            onSuccess={() => setEditingWorld(null)}
          />
        )}
      </EntityFormDialog>

      <ConfirmationDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="حذف العالم"
        description={`هل تريد حذف "${pendingDelete?.name ?? ""}"؟ لا يمكن حذف عالم يحتوي على نطاقات أو تحديات أو محتوى.`}
        confirmLabel="حذف"
        destructive
        disabled={deleteWorld.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteWorld.mutate(pendingDelete.id, {
            onSuccess: () => setPendingDelete(null),
            onError: (error) => {
              showToast({
                type: "error",
                message: getApiErrorMessage(
                  error,
                  "لا يمكن حذف عالم مرتبط بمحتوى آخر.",
                ),
              });
              setPendingDelete(null);
            },
          });
        }}
      />
    </div>
  );
}
