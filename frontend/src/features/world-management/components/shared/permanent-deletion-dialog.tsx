"use client";

import { useId, useRef, useState } from "react";
import { AlertTriangle, Info, Link2Off } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PendingButtonContent } from "@/components/ui/pending-button-content";
import { Skeleton } from "@/components/ui/skeleton";
import { showToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/utils";

import {
  useDeletionPreview,
  useExecuteDeletion,
} from "../../hooks/use-permanent-deletion";
import { worldContentKeys } from "../../hooks/world-content.keys";
import {
  AVAILABILITY_LABEL,
  DELETION_ENTITY_LABEL,
  DELETION_ERROR_MESSAGE,
  blockerMessage,
  canConfirmDeletion,
  deletionAvailability,
  deletionErrorKind,
  deletionSuccessMessage,
  directImpactRows,
  externalImpactGroups,
  offersHistoryPurge,
  purgeableMatchCount,
} from "../../utils/deletion-preview.presenter";
import type {
  DeletionEntityKind,
  DeletionPreview,
  DeletionResult,
} from "../../types";

export interface DeletionTarget {
  kind: DeletionEntityKind;
  id: string;
  /** Shown until the server's preview names the entity itself. */
  name: string;
}

interface PermanentDeletionDialogProps {
  /** The record to delete, or a board configuration to detach. `null` = closed. */
  target: DeletionTarget | null;
  onClose: () => void;
  onCompleted?: (result: DeletionResult) => void;
}

/** One idempotency key per confirmation; reused when a network retry repeats it. */
function newRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  // Non-secure contexts have no randomUUID; the server only needs 8–100
  // letters, digits or dashes that are unique per confirmation.
  return `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Permanent deletion and detach for every World Content entity (roadmap §19.1).
 *
 * Opening it is read-only: it fetches the server's impact preview. Confirming
 * sends exactly the reviewed plan (its fingerprint); if anything changed in the
 * meantime the server refuses, the preview is re-read, and the operator has to
 * confirm again. Detaching a board slot removes the association only.
 */
export function PermanentDeletionDialog({
  target,
  onClose,
  onCompleted,
}: PermanentDeletionDialogProps) {
  // Mounted per target so every opening starts with a fresh preview, fresh
  // confirmations and a fresh request id — and a closed dialog runs no queries.
  if (!target) return null;
  return (
    <PermanentDeletionDialogBody
      key={`${target.kind}:${target.id}`}
      target={target}
      onClose={onClose}
      onCompleted={onCompleted}
    />
  );
}

function PermanentDeletionDialogBody({
  target,
  onClose,
  onCompleted,
}: {
  target: DeletionTarget;
  onClose: () => void;
  onCompleted?: (result: DeletionResult) => void;
}) {
  const queryClient = useQueryClient();
  const preview = useDeletionPreview(target.kind, target.id);
  const execute = useExecuteDeletion(target.kind, target.id);
  const requestId = useRef<string | null>(null);
  requestId.current ??= newRequestId();
  const [acknowledged, setAcknowledged] = useState(false);
  const [purge, setPurge] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const acknowledgeId = useId();
  const purgeId = useId();

  const data = preview.data;
  const detach =
    (data?.operation ?? (target.kind === "configuration" ? "detach" : "")) ===
    "detach";
  const previewReady = Boolean(data) && !preview.isFetching && !preview.isError;
  const canConfirm =
    previewReady &&
    !execute.isPending &&
    canConfirmDeletion(data as DeletionPreview, { acknowledged, purge });

  const close = () => {
    if (!execute.isPending) onClose();
  };

  const confirm = () => {
    if (!data || !canConfirm || !requestId.current) return;
    setFailure(null);
    execute.mutate(
      {
        previewFingerprint: data.fingerprint,
        requestId: requestId.current,
        ...(purge ? { purgeDisposableHistory: true } : {}),
      },
      {
        onSuccess: (result) => {
          showToast({ message: deletionSuccessMessage(result) });
          onCompleted?.(result);
          onClose();
        },
        onError: (error) => {
          const kind = deletionErrorKind(error);
          if (kind === "other") {
            // Possibly never reached the server: keep the request id, so a
            // retry of this same confirmation is replayed, never repeated.
            setFailure(
              getApiErrorMessage(
                error,
                detach ? "تعذر فصل الميكانيكا عن العالم." : "تعذر تنفيذ الحذف.",
              ),
            );
            return;
          }
          setFailure(DELETION_ERROR_MESSAGE[kind]);
          if (kind === "not_found") {
            void queryClient.invalidateQueries({
              queryKey: worldContentKeys.all,
            });
            return;
          }
          // The server refused before executing anything: the next
          // confirmation is a new request against a re-read impact.
          requestId.current = newRequestId();
          setAcknowledged(false);
          setPurge(false);
          void preview.refetch();
        },
      },
    );
  };

  const entityName = data?.entity.name ?? target.name;
  const entityLabel = DELETION_ENTITY_LABEL[target.kind];

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) close();
      }}
    >
      <DialogContent
        dir="rtl"
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        data-testid="permanent-deletion-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {detach ? "فصل الميكانيكا عن العالم" : `حذف ${entityLabel} نهائيًا`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {detach
              ? "مراجعة أثر فصل الميكانيكا عن العالم قبل التأكيد."
              : "مراجعة أثر الحذف النهائي قبل التأكيد."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-[var(--radius)] border p-3">
            <p className="text-xs text-muted-foreground">{entityLabel}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <p className="font-bold" data-testid="deletion-entity-name">
                {entityName}
              </p>
              {data?.entity.key && (
                <Badge variant="outline" dir="ltr">
                  {data.entity.key}
                </Badge>
              )}
              <Badge
                variant={detach ? "secondary" : "destructive"}
                data-testid="deletion-operation"
              >
                {detach ? "فصل الارتباط فقط" : "حذف نهائي"}
              </Badge>
            </div>
          </div>

          {detach ? (
            <div
              className="flex gap-2 rounded-[var(--radius)] border p-3"
              data-testid="deletion-operation-copy"
            >
              <Link2Off
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <p className="text-sm font-bold">
                سيُزال ارتباط هذه الميكانيكا بهذا العالم فقط. تبقى الميكانيكا
                وجميع أسئلتها محفوظة، ولن يُحذف أي محتوى.
              </p>
            </div>
          ) : (
            <div
              className="flex gap-2 rounded-[var(--radius)] border border-brand-navy bg-destructive-subtle p-3"
              data-testid="deletion-operation-copy"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-foreground"
                aria-hidden
              />
              <p className="text-sm font-bold text-foreground">
                سيُحذف هذا السجل وكل ما يتبعه أدناه نهائيًا. لا يمكن التراجع عن
                هذا الإجراء.
              </p>
            </div>
          )}

          {preview.isError ? (
            <div className="space-y-2" data-testid="deletion-preview-error">
              <p className="text-sm font-bold text-foreground">
                {getApiErrorMessage(preview.error, "تعذر حساب أثر العملية.")}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void preview.refetch()}
              >
                إعادة المحاولة
              </Button>
            </div>
          ) : !data ? (
            <div className="space-y-2" data-testid="deletion-preview-loading">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-3/5" />
            </div>
          ) : (
            <PreviewDetails preview={data} />
          )}

          {data && !preview.isError && data.actorMayExecute === false && (
            <p
              role="note"
              className="rounded-[var(--radius)] border border-warning bg-warning-subtle p-3 text-sm text-foreground"
              data-testid="deletion-not-permitted"
            >
              يمكنك مراجعة أثر الحذف، لكن تنفيذ الحذف النهائي مقصور على
              المشغّلين المخوّلين.
            </p>
          )}

          {data && !preview.isError && offersHistoryPurge(data) && (
            <label
              htmlFor={purgeId}
              className="flex items-start gap-2 rounded-[var(--radius)] border p-3 text-sm"
              data-testid="deletion-purge-option"
            >
              <Checkbox
                id={purgeId}
                className="mt-0.5"
                checked={purge}
                disabled={execute.isPending}
                onCheckedChange={(checked: boolean | "indeterminate") =>
                  setPurge(checked === true)
                }
                data-testid="deletion-purge-checkbox"
              />
              <span>
                <span className="font-bold">
                  إزالة سجل اللعب التجريبي القديم المرتبط (مباريات
                  منتهية/مهجورة)
                </span>
                {purgeableMatchCount(data) > 0 && (
                  <span className="block text-muted-foreground">
                    {`${purgeableMatchCount(data)} مباراة ستُزال مع سجلاتها.`}
                  </span>
                )}
                {data.requiresHistoryPurge && (
                  <span className="block font-bold text-amber-700 dark:text-amber-400">
                    مطلوب للمتابعة.
                  </span>
                )}
              </span>
            </label>
          )}

          {!detach && data && !preview.isError && (
            <label
              htmlFor={acknowledgeId}
              className="flex items-center gap-2 text-sm font-bold"
              data-testid="deletion-acknowledge"
            >
              <Checkbox
                id={acknowledgeId}
                checked={acknowledged}
                disabled={execute.isPending}
                onCheckedChange={(checked: boolean | "indeterminate") =>
                  setAcknowledged(checked === true)
                }
                data-testid="deletion-acknowledge-checkbox"
              />
              أفهم أن هذا الحذف نهائي
            </label>
          )}

          {failure && (
            <p
              role="alert"
              className="rounded-[var(--radius)] border border-brand-navy bg-destructive-subtle p-3 text-sm font-bold text-foreground"
              data-testid="deletion-failure"
            >
              {failure}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={execute.isPending}
            onClick={close}
            data-testid="deletion-cancel"
          >
            إلغاء
          </Button>
          <Button
            type="button"
            variant={detach ? "default" : "destructive"}
            disabled={!canConfirm}
            aria-busy={execute.isPending}
            onClick={confirm}
            data-testid="deletion-confirm"
          >
            <PendingButtonContent
              pending={execute.isPending}
              pendingLabel={detach ? "جاري الفصل..." : "جاري الحذف..."}
            >
              {detach ? "فصل عن العالم" : "حذف نهائي"}
            </PendingButtonContent>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PreviewDetails({ preview }: { preview: DeletionPreview }) {
  const rows = directImpactRows(preview);
  const groups = externalImpactGroups(preview);
  const availability = deletionAvailability(preview);
  const shared = preview.impact.content.sharedPreserved;
  const incomplete = preview.impact.worldsBecomingIncomplete ?? [];

  return (
    <div className="space-y-4" data-testid="deletion-preview">
      <section className="space-y-2">
        <p className="text-sm font-semibold">
          {preview.operation === "detach" ? "ما سيتغيّر" : "ما سيُحذف أيضًا"}
        </p>
        {rows.length ? (
          <dl className="grid gap-2 sm:grid-cols-2">
            {rows.map((row) => (
              <div
                key={row.key}
                className="rounded-[var(--radius)] border p-2.5"
                data-testid={`deletion-impact-${row.key}`}
              >
                <dt className="text-xs text-muted-foreground">{row.label}</dt>
                <dd className="akwaan-numeral text-xl font-black">
                  {row.value}
                </dd>
                {row.detail && (
                  <dd className="text-xs font-bold text-muted-foreground">
                    {row.detail}
                  </dd>
                )}
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">
            لا توجد سجلات تابعة أخرى.
          </p>
        )}
        {shared > 0 && (
          <p
            className="flex items-start gap-1.5 text-sm"
            data-testid="deletion-shared-preserved"
          >
            <Info
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden
            />
            {`سيُحتفظ بـ ${shared} سؤال مشترك مع آليات أخرى`}
          </p>
        )}
      </section>

      {groups.map((group) => (
        <section
          key={group.source}
          className="space-y-1.5"
          data-testid={`deletion-external-${group.source}`}
        >
          <p className="text-sm font-semibold">{group.title}</p>
          <ul className="space-y-1 text-sm">
            {group.rows.map((row) => (
              <li key={row.key} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{row.label}</span>
                <span className="akwaan-numeral font-bold">{row.value}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {incomplete.length > 0 && (
        <div
          className="flex gap-2 rounded-[var(--radius)] border p-3 text-amber-700 dark:text-amber-400"
          data-testid="deletion-worlds-incomplete"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="text-sm">
            <p className="font-bold">
              ستصبح لوحة هذه العوالم ناقصة، ولن تكون متاحة للاختيار في المباريات
              حتى تُستكمل:
            </p>
            <p>{incomplete.map((world) => world.name).join("، ")}</p>
          </div>
        </div>
      )}

      {preview.blockers.length > 0 && (
        <section className="space-y-2" data-testid="deletion-blockers">
          <p className="text-sm font-semibold">عوائق التنفيذ</p>
          <ul className="space-y-2">
            {preview.blockers.map((blocker, index) => (
              <li
                key={`${blocker.code}-${index}`}
                className="rounded-[var(--radius)] border p-2.5 text-sm"
                data-testid={`deletion-blocker-${blocker.code}`}
              >
                <p
                  className={
                    blocker.clearedByHistoryPurge
                      ? "font-bold text-amber-700 dark:text-amber-400"
                      : "font-bold text-foreground"
                  }
                >
                  {blockerMessage(blocker)}
                </p>
                {blocker.clearedByHistoryPurge && (
                  <p className="text-xs text-muted-foreground">
                    يزول هذا العائق بإزالة سجل اللعب التجريبي القديم.
                  </p>
                )}
                {blocker.sample?.length ? (
                  <p className="mt-1 text-xs text-muted-foreground" dir="auto">
                    {`أمثلة: ${blocker.sample
                      .slice(0, 3)
                      .map((entry) => entry.label)
                      .join("، ")}`}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p
        className={
          availability === "safe"
            ? "text-sm font-bold text-green-700 dark:text-green-500"
            : availability === "requires_purge"
              ? "text-sm font-bold text-amber-700 dark:text-amber-400"
              : "text-sm font-bold text-foreground"
        }
        data-testid="deletion-availability"
      >
        {AVAILABILITY_LABEL[availability]}
      </p>
    </div>
  );
}
