"use client";

import { Input } from "@/components/ui/input";
import type { RankedListEntry } from "@/types";
import { validateRankedListEntries } from "../models/ranked-list-form";
import { AcceptedAnswersEditor } from "./accepted-answers-editor";

export function RankedListEditor({
  entries,
  onChange,
  rowWarnings,
}: {
  entries: RankedListEntry[];
  onChange: (entries: RankedListEntry[]) => void;
  rowWarnings?: Record<number, string[]>;
}) {
  const total = entries.reduce((sum, entry) => sum + entry.points, 0);
  const issues = validateRankedListEntries(entries);
  const update = (index: number, patch: Partial<RankedListEntry>) =>
    onChange(
      entries.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry,
      ),
    );

  return (
    <section className="space-y-3 rounded-2xl border border-primary/20 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">إجابات توب 10 المرتبة</h3>
        <span
          data-testid="ranked-list-total"
          className={total === 600 ? "text-emerald-400" : "text-destructive"}
        >
          المجموع: {total} / 600
        </span>
      </div>
      <div className="space-y-3">
        {entries.map((entry, index) => (
          <article
            key={entry.id ?? entry.rank}
            data-testid={`ranked-list-row-${index + 1}`}
            data-invalid={rowWarnings?.[index]?.length ? "true" : "false"}
            className={`grid gap-2 rounded-xl border bg-white/5 p-3 ${
              rowWarnings?.[index]?.length
                ? "border-destructive"
                : "border-transparent"
            } md:grid-cols-[3rem_1fr_1fr_2fr_6rem]`}
          >
            <div className="flex items-center justify-center text-xl font-black">
              {entry.rank}
            </div>
            <Input
              aria-label={`الإجابة العربية للمرتبة ${entry.rank}`}
              placeholder="الإجابة العربية"
              value={entry.answer.ar}
              onChange={(event) =>
                update(index, {
                  answer: { ...entry.answer, ar: event.target.value },
                })
              }
            />
            <Input
              aria-label={`الإجابة الإنجليزية للمرتبة ${entry.rank}`}
              placeholder="English answer"
              value={entry.answer.en ?? ""}
              onChange={(event) =>
                update(index, {
                  answer: { ...entry.answer, en: event.target.value },
                })
              }
            />
            <AcceptedAnswersEditor
              compact
              values={entry.aliases}
              onChange={(aliases) => update(index, { aliases })}
              error={rowWarnings?.[index]?.join("، ")}
            />
            <div
              aria-label={`نقاط المرتبة ${entry.rank}`}
              className="flex items-center justify-center rounded-lg bg-black/20 font-black text-primary"
            >
              {entry.points}
            </div>
          </article>
        ))}
      </div>
      {issues.length > 0 && (
        <ul className="space-y-1 text-sm text-destructive">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
