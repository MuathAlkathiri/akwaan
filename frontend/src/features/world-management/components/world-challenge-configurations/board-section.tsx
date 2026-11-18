"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, SectionCard } from "@/components/shared";

import {
  useWorldBoard,
  useWorldContentMetadata,
} from "../../hooks/use-world-content";
import {
  EntityFormDialog,
  PermanentDeletionDialog,
  RowSkeleton,
} from "../shared";
import { ReadinessPanel } from "../readiness";
import { SLOT_KEY_LABEL } from "../../utils/world-content.labels";
import { ConfigurationCard } from "./configuration-card";
import { ConfigurationForm } from "./configuration-form";
import type {
  WorldChallengeConfiguration,
  WorldChallengeSlotKey,
} from "../../types";

/**
 * The four board positions always exist as positions.
 *
 * Detaching a mechanic unbinds a slot; it does not remove the slot. Rendering the
 * fixed four means an empty position stays visible and directly assignable rather
 * than silently vanishing from the board.
 */
const BOARD_SLOT_KEYS: WorldChallengeSlotKey[] = [
  "slot_1",
  "slot_2",
  "slot_3",
  "slot_4",
];

export function BoardSection({ worldId }: { worldId: string }) {
  const { data, isLoading } = useWorldBoard(worldId);
  const { data: metadata } = useWorldContentMetadata();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<WorldChallengeConfiguration | null>(
    null,
  );
  const [pendingDetach, setPendingDetach] =
    useState<WorldChallengeConfiguration | null>(null);
  const [assigningSlot, setAssigningSlot] =
    useState<WorldChallengeSlotKey | null>(null);

  const configurations = data?.configurations ?? [];
  const enabledCount = configurations.filter(
    (configuration) => configuration.isEnabled,
  ).length;
  const bySlot = new Map(
    configurations.map((configuration) => [
      configuration.slotKey,
      configuration,
    ]),
  );

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
          description="املأ الخانات الأربع بأربع مكانيكا مختلفة."
        />
      ) : (
        <div className="space-y-3">
          {BOARD_SLOT_KEYS.map((slotKey) => {
            const configuration = bySlot.get(slotKey);
            if (configuration) {
              return (
                <ConfigurationCard
                  key={slotKey}
                  configuration={configuration}
                  onEdit={() => setEditing(configuration)}
                  onDetach={() => setPendingDetach(configuration)}
                />
              );
            }
            return (
              <div
                key={slotKey}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-3"
                data-testid={`empty-slot-${slotKey}`}
              >
                <div>
                  <p className="font-medium">{SLOT_KEY_LABEL[slotKey]}</p>
                  <p className="text-sm text-muted-foreground">
                    لا توجد ميكانيكا
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAssigningSlot(slotKey)}
                  data-testid={`assign-slot-${slotKey}`}
                >
                  <Plus className="me-1.5 size-4" />
                  تعيين ميكانيكا
                </Button>
              </div>
            );
          })}
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
          readyMessage="الخانات الأربع مكتملة، وكل خانة تحتوي مكانيكا مختلفة."
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

      <EntityFormDialog
        open={Boolean(assigningSlot)}
        onOpenChange={(open) => {
          if (!open) setAssigningSlot(null);
        }}
        title="تعيين ميكانيكا للخانة"
      >
        {assigningSlot && (
          <ConfigurationForm
            key={assigningSlot}
            worldId={worldId}
            defaultSlotKey={assigningSlot}
            onSuccess={() => setAssigningSlot(null)}
          />
        )}
      </EntityFormDialog>

      {/* Detach removes the board binding only: the mechanic and every one of
          its questions are kept (roadmap §19.1). */}
      <PermanentDeletionDialog
        target={
          pendingDetach
            ? {
                kind: "configuration",
                id: pendingDetach.id,
                name: pendingDetach.effectiveName,
              }
            : null
        }
        onClose={() => setPendingDetach(null)}
      />
    </SectionCard>
  );
}
