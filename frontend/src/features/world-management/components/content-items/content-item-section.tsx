"use client";

import { useMemo, useState } from "react";
import { ArrowDownUp, Plus } from "lucide-react";

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
import { EntityFormDialog, RowSkeleton, CountBadge } from "../shared";
import {
  difficultyCoverage,
  difficultyDimensionsOf,
  filterByDifficulty,
  sortByDifficulty,
} from "../../services/mechanic-difficulty.presentation";
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
  /**
   * Independent dimensions, composed rather than conflated.
   *
   * Scope narrows the query server-side. Difficulty is a mechanic's own metadata
   * on the returned items — الكومبو's stage, المرحلة's band — so each mechanic that
   * authors one gets its own filter, all of them compose with the Scope selection
   * and with each other, and none of them implies anything about another.
   */
  const [difficultyFilters, setDifficultyFilters] = useState<
    Record<string, string | number>
  >({});
  const [sortedBy, setSortedBy] = useState<string | null>(null);

  // Only the mechanics actually represented in this list get controls.
  const dimensions = useMemo(() => difficultyDimensionsOf(items), [items]);
  const visible = useMemo(() => {
    const filtered = dimensions.reduce(
      (rows, dimension) =>
        filterByDifficulty(
          dimension,
          rows,
          difficultyFilters[dimension.key] ?? "all",
        ),
      items,
    );
    const sortDimension = dimensions.find(
      (dimension) => dimension.key === sortedBy,
    );
    return sortDimension
      ? sortByDifficulty(sortDimension, filtered)
      : [...filtered];
  }, [items, dimensions, difficultyFilters, sortedBy]);
  // Counted across the Scope selection but *not* the difficulty filters: narrowing
  // to صعب would otherwise zero the others and hide the shortage this is for.
  const coverage = useMemo(
    () =>
      dimensions.map((dimension) => ({
        dimension,
        entries: difficultyCoverage(dimension, items),
      })),
    [dimensions, items],
  );
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

      {coverage.map(({ dimension, entries }) => {
        const active = difficultyFilters[dimension.key] ?? "all";
        return (
          <div
            key={dimension.key}
            className="space-y-2"
            data-testid={`${dimension.key}-difficulty-controls`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">
                الصعوبة — {dimension.mechanicName}
              </span>
              <Button
                size="sm"
                variant={active === "all" ? "default" : "outline"}
                onClick={() =>
                  setDifficultyFilters((current) => {
                    const next = { ...current };
                    delete next[dimension.key];
                    return next;
                  })
                }
              >
                الكل
              </Button>
              {dimension.values.map((entry) => (
                <Button
                  key={entry.value}
                  size="sm"
                  variant={active === entry.value ? "default" : "outline"}
                  onClick={() =>
                    setDifficultyFilters((current) => ({
                      ...current,
                      [dimension.key]: entry.value,
                    }))
                  }
                >
                  {entry.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant={sortedBy === dimension.key ? "default" : "outline"}
                aria-pressed={sortedBy === dimension.key}
                onClick={() =>
                  setSortedBy((current) =>
                    current === dimension.key ? null : dimension.key,
                  )
                }
                data-testid={`${dimension.key}-difficulty-sort`}
              >
                <ArrowDownUp className="me-1.5 size-4" />
                ترتيب حسب الصعوبة
              </Button>
            </div>
            {/* Authoring information, not a rule: the counts need not match, and a
                Scope need not cover every difficulty. There is no approved
                threshold, so nothing here calls a difficulty complete — it exists
                so a shortage is visible before a launch trips over it. The first
                number is what a game could draw today; drafts are named apart. */}
            <div
              className="flex flex-wrap items-center gap-2"
              data-testid={`${dimension.key}-difficulty-coverage`}
            >
              {entries.map((entry) => (
                <CountBadge
                  key={entry.value}
                  count={entry.ready}
                  label={
                    entry.count === entry.ready
                      ? `${entry.label} جاهز`
                      : `${entry.label} جاهز من ${entry.count}`
                  }
                />
              ))}
            </div>
          </div>
        );
      })}

      {isLoading ? (
        <RowSkeleton rows={3} />
      ) : !visible.length ? (
        <EmptyState
          title={
            items.length ? "لا يوجد محتوى بهذه الصعوبة" : "لا يوجد محتوى بعد"
          }
          description={
            items.length
              ? "جرّب صعوبة أخرى أو اختر الكل."
              : scopes.length
                ? "أضف أول عنصر محتوى لهذا العالم."
                : "أضف نطاقاً أولاً قبل إضافة المحتوى."
          }
        />
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
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
