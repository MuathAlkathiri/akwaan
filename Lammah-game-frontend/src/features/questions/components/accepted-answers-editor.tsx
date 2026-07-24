"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeRankedListAnswer } from "../models/ranked-list-form";

export function mergeAcceptedAnswers(current: string[], generated: string[]) {
  const seen = new Set<string>();
  return [...current, ...generated]
    .map((value) => value.trim().replace(/\s+/g, " "))
    .filter((value) => {
      const normalized = normalizeRankedListAnswer(value);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
}

export function AcceptedAnswersEditor({
  values,
  onChange,
  compact = false,
  error,
}: {
  values: string[];
  onChange: (values: string[]) => void;
  compact?: boolean;
  error?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const next = mergeAcceptedAnswers(values, [draft]);
    if (next.length !== values.length) onChange(next);
    setDraft("");
  };

  return (
    <div
      className={`space-y-2 rounded-xl border p-3 ${
        error ? "border-destructive" : "border-white/10"
      }`}
    >
      <div className="flex flex-wrap gap-2">
        {values.map((value, index) => (
          <span
            key={`${index}-${value}`}
            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-1"
          >
            <Input
              aria-label={`تعديل الاسم المقبول ${index + 1}`}
              value={value}
              onChange={(event) =>
                onChange(
                  values.map((item, itemIndex) =>
                    itemIndex === index ? event.target.value : item,
                  ),
                )
              }
              className="h-6 w-28 border-0 bg-transparent p-0 text-xs shadow-none"
            />
            <button
              type="button"
              aria-label={`حذف ${value}`}
              onClick={() =>
                onChange(values.filter((_, itemIndex) => itemIndex !== index))
              }
              className="text-muted-foreground hover:text-destructive"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={compact ? "أضف اسماً مقبولاً" : "اكتب اسماً مقبولاً"}
          className={compact ? "h-9" : undefined}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={add}
          disabled={!draft.trim()}
        >
          إضافة
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
