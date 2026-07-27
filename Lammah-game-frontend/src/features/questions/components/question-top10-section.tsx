"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { RankedListEntry } from "@/types";

import { RankedListEditor } from "./ranked-list-editor";

interface QuestionTop10SectionProps {
  entries: RankedListEntry[];
  rowWarnings: Record<number, string[]>;
  isGeneratingAliases: boolean;

  onEntriesChange: (entries: RankedListEntry[]) => void;
  onGenerateAliases: () => void;
}

export function QuestionTop10Section({
  entries,
  rowWarnings,
  isGeneratingAliases,
  onEntriesChange,
  onGenerateAliases,
}: QuestionTop10SectionProps) {
  const hasMissingAnswers = entries.some(
    (entry) => !entry.answer.ar.trim(),
  );

  return (
    <Card data-testid="top10-section">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>إجابات Top 10</CardTitle>

            <p className="mt-2 text-sm text-muted-foreground">
              أدخل الإجابات من الأسهل إلى الأصعب. الترتيب والنقاط يملكهما
              النظام ولا يمكن تعديلهما.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={onGenerateAliases}
            disabled={isGeneratingAliases || hasMissingAnswers}
          >
            {isGeneratingAliases
              ? "جاري التوليد..."
              : "توليد الإجابات المقبولة للجميع"}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <RankedListEditor
          entries={entries}
          onChange={onEntriesChange}
          rowWarnings={rowWarnings}
        />
      </CardContent>
    </Card>
  );
}