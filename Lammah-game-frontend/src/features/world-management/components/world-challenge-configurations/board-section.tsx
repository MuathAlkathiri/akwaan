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
  useDeleteWorldChallengeConfiguration,
  useWorldBoard,
  useWorldContentMetadata,
} from "../../hooks/use-world-content";
import { EntityFormDialog, RowSkeleton } from "../shared";
import { ReadinessPanel } from "../readiness";
import { ConfigurationCard } from "./configuration-card";
import { ConfigurationForm } from "./configuration-form";
import type { WorldChallengeConfiguration } from "../../types";

export function BoardSection({ worldId }: { worldId: string }) {
  const { data, isLoading } = useWorldBoard(worldId);
  const { data: metadata } = useWorldContentMetadata();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<WorldChallengeConfiguration | null>(
    null,
  );
  const [pendingDelete, setPendingDelete] =
    useState<WorldChallengeConfiguration | null>(null);
  const deleteConfiguration = useDeleteWorldChallengeConfiguration();

  const configurations = data?.configurations ?? [];
  const enabledCount = configurations.filter(
    (configuration) => configuration.isEnabled,
  ).length;

  return (
    <SectionCard
      title="لوحة تحديات العالم"
      description={`مكانيكا عامة مُهيأة لهذا العالم — ${enabledCount} مفعّل من ${metadata?.boardSlotCount ?? "—"}`}
      actions={
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="me-1.5 size-4" />
          إضافة تحدٍ للوحة
        </Button>
      }
    >
      {isLoading ? (
        <RowSkeleton rows={3} />
      ) : !configurations.length ? (
        <EmptyState
          title="اللوحة فارغة"
          description="أضف مكانيكا توقيع واحدة، واثنتين من اقرأ خصمك، وواحدة مرنة."
        />
      ) : (
        <div className="space-y-3">
          {configurations.map((configuration) => (
            <ConfigurationCard
              key={configuration.id}
              configuration={configuration}
              onEdit={() => setEditing(configuration)}
              onDelete={() => setPendingDelete(configuration)}
            />
          ))}
        </div>
      )}

      {data?.board && (
        <ReadinessPanel
          report={{
            readiness: data.board.blockers.length
              ? "not_ready"
              : data.board.warnings.length
                ? "limited"
                : "ready",
            blockers: data.board.blockers,
            warnings: data.board.warnings,
          }}
          title="تكوين اللوحة"
          readyMessage="التكوين مطابق للقواعد: توقيع + اثنتان اقرأ خصمك + مرنة."
        />
      )}

      <EntityFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="إضافة تحدٍ إلى اللوحة"
      >
        <ConfigurationForm
          worldId={worldId}
          onSuccess={() => setAddOpen(false)}
        />
      </EntityFormDialog>

      <EntityFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title="تعديل إعداد التحدي"
      >
        {editing && (
          <ConfigurationForm
            key={editing.id}
            worldId={worldId}
            configuration={editing}
            onSuccess={() => setEditing(null)}
          />
        )}
      </EntityFormDialog>

      <ConfirmationDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="حذف إعداد التحدي"
        description={`هل تريد إزالة "${pendingDelete?.displayName ?? ""}" من لوحة هذا العالم؟`}
        confirmLabel="حذف"
        destructive
        disabled={deleteConfiguration.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteConfiguration.mutate(pendingDelete.id, {
            onSuccess: () => setPendingDelete(null),
            onError: (error) => {
              showToast({
                type: "error",
                message: getApiErrorMessage(error, "تعذر حذف الإعداد."),
              });
              setPendingDelete(null);
            },
          });
        }}
      />
    </SectionCard>
  );
}
