"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  ConfirmationDialog,
  EmptyState,
  SectionCard,
} from "@/components/shared";
import { showToast } from "@/components/ui/toast";
import {
  describeBlockingReferences,
  extractBlockingReferences,
} from "../../utils/readiness.util";
import { getApiErrorMessage } from "@/lib/utils";

import {
  useChallengeTypes,
  useDeleteChallengeType,
} from "../../hooks/use-world-content";
import { EntityFormDialog, RowSkeleton, SearchToolbar } from "../shared";
import { ChallengeTypeCard } from "./challenge-type-card";
import { ChallengeTypeForm } from "./challenge-type-form";
import type { ChallengeType } from "../../types";

/**
 * Global mechanic definitions, deliberately outside any World. Assigning one to a
 * World happens in the World's board tab.
 */
export function ChallengeTypeCatalog() {
  const { data: challengeTypes = [], isLoading } = useChallengeTypes();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ChallengeType | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChallengeType | null>(null);
  const deleteChallengeType = useDeleteChallengeType();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return challengeTypes;
    return challengeTypes.filter(
      (challengeType) =>
        challengeType.name.toLowerCase().includes(query) ||
        challengeType.slug.includes(query),
    );
  }, [challengeTypes, search]);

  return (
    <SectionCard
      title="المكانيكا العامة"
      description="تُعرَّف مرة واحدة وتُستخدم في أكثر من عالم — الاسم الذي يراه اللاعب يُحدد داخل كل عالم"
      actions={
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="me-1.5 size-4" />
          إضافة مكانيكا
        </Button>
      }
    >
      {isLoading ? (
        <RowSkeleton rows={3} />
      ) : !challengeTypes.length ? (
        <EmptyState
          title="لا توجد مكانيكا بعد"
          description="ابدأ بتعريف مكانيكا واحدة، ثم أضفها إلى لوحة أي عالم."
        />
      ) : (
        <div className="space-y-3">
          <SearchToolbar
            placeholder="ابحث عن مكانيكا"
            value={search}
            onChange={setSearch}
          />
          <div className="space-y-3">
            {filtered.map((challengeType) => (
              <ChallengeTypeCard
                key={challengeType.id}
                challengeType={challengeType}
                onEdit={() => setEditing(challengeType)}
                onDelete={() => setPendingDelete(challengeType)}
              />
            ))}
          </div>
        </div>
      )}

      <EntityFormDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title="إضافة مكانيكا"
      >
        <ChallengeTypeForm onSuccess={() => setAddOpen(false)} />
      </EntityFormDialog>

      <EntityFormDialog
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
        title="تعديل المكانيكا"
      >
        {editing && (
          <ChallengeTypeForm
            key={editing.id}
            challengeType={editing}
            onSuccess={() => setEditing(null)}
          />
        )}
      </EntityFormDialog>

      <ConfirmationDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
        title="حذف المكانيكا"
        description={`هل تريد حذف "${pendingDelete?.name ?? ""}"؟ لا يمكن حذف مكانيكا مستخدمة في أي عالم أو مرتبطة بمحتوى.`}
        confirmLabel="حذف"
        destructive
        disabled={deleteChallengeType.isPending}
        onConfirm={() => {
          if (!pendingDelete) return;
          deleteChallengeType.mutate(pendingDelete.id, {
            onSuccess: () => setPendingDelete(null),
            onError: (error) => {
              // Name the blocking records when the server named them.
              const blocking = describeBlockingReferences(
                extractBlockingReferences(error),
              );
              showToast({
                type: "error",
                message: [
                  getApiErrorMessage(error, "لا يمكن حذف مكانيكا مستخدمة."),
                  blocking && `المرتبط: ${blocking}`,
                ]
                  .filter(Boolean)
                  .join(" — "),
              });
              setPendingDelete(null);
            },
          });
        }}
      />
    </SectionCard>
  );
}
