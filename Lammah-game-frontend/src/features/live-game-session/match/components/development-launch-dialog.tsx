"use client";

import { useEffect, useMemo, useState } from "react";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLiveSession } from "../../hooks/live-session-context";
import { contentCardinality, slotLabels } from "../presentation";
import { useMatchController } from "../hooks/use-match-controller";
import type { MatchBoardSlot } from "../types";

export function DevelopmentLaunchDialog({
  slot,
  open,
  onOpenChange,
}: {
  slot?: MatchBoardSlot;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { snapshot } = useLiveSession();
  const controller = useMatchController();
  const required = contentCardinality(slot?.challengeKey);
  const [values, setValues] = useState<string[]>([]);
  const [startingTeamId, setStartingTeamId] = useState<string>();
  const normalized = useMemo(
    () => values.map((value) => value.trim()).filter(Boolean),
    [values],
  );
  const distinct = new Set(normalized).size === normalized.length;
  const valid = Boolean(required && normalized.length === required && distinct);

  useEffect(() => {
    if (!open) {
      setValues([]);
      setStartingTeamId(undefined);
      controller.resetError();
    }
    // The mutation reset function is stable in React Query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!snapshot?.match?.currentOccurrence || !slot) return null;
  const launch = async () => {
    if (!valid) return;
    try {
      await controller.runAsync({
        type: "launch-challenge",
        occurrenceIndex: snapshot.match!.currentOccurrence!.index,
        slotKey: slot.slotKey,
        contentItemIds: normalized,
        startingTeamId,
      });
      onOpenChange(false);
    } catch {
      // The localized mutation error remains visible in this dialog.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-lg">
        <DialogHeader>
          <p className="flex items-center gap-2 text-xs font-bold text-amber-700">
            <FlaskConical className="size-4" aria-hidden />
            أدوات التطوير
          </p>
          <DialogTitle>تشغيل {slotLabels[slot.slotKey]}</DialogTitle>
          <DialogDescription>
            اختيار المحتوى مؤقت لهذه المرحلة، ولا يظهر للاعبين أو الشاشة
            المشتركة.
          </DialogDescription>
        </DialogHeader>
        {required ? (
          <div className="space-y-4">
            <div className="space-y-3">
              {Array.from({ length: required }).map((_, index) => (
                <label key={index} className="block space-y-1 text-sm">
                  <span>معرّف عنصر المحتوى {index + 1}</span>
                  <Input
                    dir="ltr"
                    value={values[index] ?? ""}
                    placeholder="ContentItem ID"
                    onChange={(event) =>
                      setValues((current) => {
                        const next = [...current];
                        next[index] = event.target.value;
                        return next;
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <label className="block space-y-1 text-sm">
              <span>الفريق الذي يبدأ (اختياري)</span>
              <Select value={startingTeamId} onValueChange={setStartingTeamId}>
                <SelectTrigger>
                  <SelectValue placeholder="يحدده الخادم تلقائيًا" />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.teams.map((team) => (
                    <SelectItem key={team.id} value={team.id}>
                      {team.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {!distinct && (
              <p role="alert" className="text-sm text-red-700">
                استخدم عناصر محتوى مختلفة.
              </p>
            )}
          </div>
        ) : (
          <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
            لا توجد قاعدة تشغيل مدعومة لهذا التحدي.
          </p>
        )}
        {controller.error && (
          <div role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
            <p>{controller.error.message}</p>
            <details className="mt-2 text-xs text-red-700/70">
              <summary>تفاصيل للمطوّر</summary>
              {controller.error.code}: {controller.error.rawMessage}
            </details>
          </div>
        )}
        <DialogFooter>
          <Button
            onClick={launch}
            disabled={!valid || controller.pending || !controller.connected}
          >
            {controller.pending ? "جارٍ التشغيل…" : "تشغيل التحدي"}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

