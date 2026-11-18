"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState, SectionCard } from "@/components/shared";

import { useChallengeTypes } from "../../hooks/use-world-content";
import {
  EntityFormDialog,
  PermanentDeletionDialog,
  RowSkeleton,
  SearchToolbar,
} from "../shared";
import { ChallengeTypeCard } from "./challenge-type-card";
import { ChallengeTypeForm } from "./challenge-type-form";
import type { ChallengeType } from "../../types";

const EMPTY_CHALLENGE_TYPES: ChallengeType[] = [];

/**
 * Global mechanic definitions, deliberately outside any World. Assigning one to a
 * World happens in the World's board tab.
 */
export function ChallengeTypeCatalog() {
  const challengeTypesQuery = useChallengeTypes();
  const challengeTypes = challengeTypesQuery.data ?? EMPTY_CHALLENGE_TYPES;
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<ChallengeType | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ChallengeType | null>(null);

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
      {challengeTypesQuery.isLoading ? (
        <RowSkeleton rows={3} />
      ) : challengeTypesQuery.isError ? (
        <div className="space-y-4">
          <EmptyState
            title="تعذر تحميل الميكانيكا"
            description="لم نتمكن من جلب بيانات الميكانيكا. تحقق من تسجيل الدخول والاتصال ثم حاول مرة أخرى."
          />
          <div className="flex justify-center">
            <Button
              variant="outline"
              disabled={challengeTypesQuery.isFetching}
              onClick={() => void challengeTypesQuery.refetch()}
            >
              {challengeTypesQuery.isFetching
                ? "جاري المحاولة..."
                : "إعادة المحاولة"}
            </Button>
          </div>
        </div>
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

      {/* Blocked deletions (live Matches, running engine jobs, …) are explained
          by the dialog's server-side blockers, not decided here. */}
      <PermanentDeletionDialog
        target={
          pendingDelete
            ? {
                kind: "challengeType",
                id: pendingDelete.id,
                name: pendingDelete.name,
              }
            : null
        }
        onClose={() => setPendingDelete(null)}
      />
    </SectionCard>
  );
}
