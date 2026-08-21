"use client";

import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiErrorMessage } from "@/lib/utils";
import { SLOT_KEY_LABEL } from "../../utils/world-content.labels";
import { useWorldSlotRemovalPreview } from "../../hooks/use-world-content";
import type { WorldChallengeConfiguration } from "../../types";

/**
 * Confirming the removal of one mechanic from one World board position.
 *
 * The counts are the server's, fetched when the dialog opens — the browser cannot
 * see other Worlds' content and must not be trusted to scope the number. Opening
 * this dialog is read-only; nothing is destroyed until the operator confirms, and
 * confirming sends **one** request that does both halves atomically.
 */
export function SlotRemovalDialog({
  configuration,
  open,
  onOpenChange,
  onConfirm,
  pending,
}: {
  configuration: WorldChallengeConfiguration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (configuration: WorldChallengeConfiguration) => void;
  pending: boolean;
}) {
  const { data, isLoading, error } = useWorldSlotRemovalPreview(
    open && configuration ? configuration.id : undefined,
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" data-testid="slot-removal-dialog">
        <DialogHeader>
          <DialogTitle>إزالة الميكانيكا من العالم</DialogTitle>
        </DialogHeader>

        {isLoading || (!data && !error) ? (
          <div className="space-y-2" data-testid="slot-removal-loading">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : error ? (
          <p
            className="text-sm font-bold text-destructive"
            data-testid="slot-removal-preview-error"
          >
            {getApiErrorMessage(error, "تعذر حساب أثر الإزالة.")}
          </p>
        ) : data ? (
          <div className="space-y-4">
            <dl className="space-y-1.5 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">الميكانيكا:</dt>
                <dd className="font-bold" data-testid="slot-removal-mechanic">
                  {data.challengeTypeName}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">العالم:</dt>
                <dd className="font-bold" data-testid="slot-removal-world">
                  {data.worldName}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">الخانة:</dt>
                <dd className="font-bold">{SLOT_KEY_LABEL[data.slotKey]}</dd>
              </div>
            </dl>

            <div className="rounded-[var(--radius)] border p-3">
              <p className="text-sm text-muted-foreground">
                عدد الأسئلة المرتبطة بهذه الميكانيكا داخل هذا العالم:
              </p>
              <p
                className="akwaan-numeral text-3xl font-black"
                data-testid="slot-removal-total"
              >
                {data.content.total}
              </p>
              {data.content.total > 0 && (
                <p className="text-sm font-bold text-muted-foreground">
                  <span data-testid="slot-removal-ready">
                    الجاهزة: {data.content.ready}
                  </span>
                  {" · "}
                  الإجمالي: {data.content.total}
                </p>
              )}
              {/* Only surfaced when it is actually true, so it never implies that
                  removing a mechanic normally spares content. */}
              {data.content.shared > 0 && (
                <p
                  className="mt-1.5 text-sm font-bold"
                  data-testid="slot-removal-shared"
                >
                  {`${data.content.shared} سؤال مشترك مع ميكانيكا أخرى — سيبقى ولن يُحذف.`}
                </p>
              )}
            </div>

            <div
              className="flex gap-2 rounded-[var(--radius)] border border-destructive bg-destructive/10 p-3"
              data-testid="slot-removal-warning"
            >
              <AlertTriangle
                className="mt-0.5 size-4 shrink-0 text-destructive"
                aria-hidden
              />
              <p className="text-sm font-bold text-destructive">
                {`سيتم حذف أسئلة هذه الميكانيكا من عالم ${data.worldName} وإفراغ هذه الخانة. لن يكون العالم جاهزًا للعب حتى يتم تعيين ميكانيكا جديدة لهذه الخانة.`}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="slot-removal-cancel"
          >
            إلغاء
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending || !data}
            onClick={() => configuration && onConfirm(configuration)}
            data-testid="slot-removal-confirm"
          >
            حذف الميكانيكا والأسئلة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
