"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ImagePlus, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMediaUrl } from "@/lib/api/media-url";
import type { BombItemImage, BombQuestionItem } from "@/types";

function BombItemImagePreview({
  image,
  alt,
}: {
  image: BombItemImage;
  alt: string;
}) {
  const [unavailable, setUnavailable] = useState(false);
  const url = getMediaUrl(image.url);

  return (
    <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg border bg-muted">
      {!url || unavailable ? (
        <p role="status" className="p-4 text-sm text-destructive">
          تعذر عرض الصورة المحفوظة.
        </p>
      ) : (
        // Managed media is served directly by the backend API origin.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          className="h-full w-full object-contain"
          onError={() => setUnavailable(true)}
        />
      )}
    </div>
  );
}

export function BombQuestionEditor({
  items,
  onChange,
  onUpload,
}: {
  items: BombQuestionItem[];
  onChange: (items: BombQuestionItem[]) => void;
  onUpload: (file: File) => Promise<BombItemImage>;
}) {
  const update = (index: number, value: BombQuestionItem) =>
    onChange(items.map((item, itemIndex) => (itemIndex === index ? value : item)));
  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <section className="space-y-4 rounded-lg border p-4" aria-labelledby="bomb-editor-title">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="bomb-editor-title" className="font-semibold">عناصر سؤال القنبلة</h2>
          <p className="text-sm text-muted-foreground">
            أضف من 10 إلى 15 عنصراً. لكل عنصر صورة وإجابة واحدة على الأقل.
          </p>
        </div>
        <Badge variant={items.length >= 10 && items.length <= 15 ? "secondary" : "destructive"}>
          {items.length}/10–15
        </Badge>
      </header>

      <div className="space-y-3">
        {items.map((item, index) => (
          <details key={item.id} className="rounded-lg border bg-card" open={index === 0}>
            <summary className="cursor-pointer px-4 py-3 font-medium">
              العنصر {index + 1}
              {!item.image ? " · الصورة مطلوبة" : ""}
              {!item.acceptedAnswers.some((answer) => answer.trim())
                ? " · الإجابة مطلوبة"
                : ""}
            </summary>
            <div className="space-y-4 border-t p-4">
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" disabled={index === 0} onClick={() => move(index, -1)} aria-label={`تحريك العنصر ${index + 1} لأعلى`}>
                  <ArrowUp className="size-4" aria-hidden />
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={index === items.length - 1} onClick={() => move(index, 1)} aria-label={`تحريك العنصر ${index + 1} لأسفل`}>
                  <ArrowDown className="size-4" aria-hidden />
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))} aria-label={`حذف العنصر ${index + 1}`}>
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>

              {item.image && (
                <BombItemImagePreview
                  key={item.image.storageKey}
                  image={item.image}
                  alt={item.altText || `صورة العنصر ${index + 1}`}
                />
              )}
              <label className="block space-y-2 text-sm font-medium">
                <span className="flex items-center gap-2">
                  <ImagePlus className="size-4" aria-hidden />
                  {item.image ? "استبدال صورة العنصر" : "صورة العنصر مطلوبة"}
                </span>
                <Input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    const image = await onUpload(file);
                    update(index, { ...item, image });
                  }}
                />
              </label>

              <AcceptedAnswersEditor
                answers={item.acceptedAnswers}
                onChange={(acceptedAnswers) => update(index, { ...item, acceptedAnswers })}
              />
              <label className="block space-y-1 text-sm">
                <span>النص البديل (اختياري)</span>
                <Input value={item.altText ?? ""} maxLength={200} onChange={(event) => update(index, { ...item, altText: event.target.value })} />
              </label>
            </div>
          </details>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        disabled={items.length >= 15}
        onClick={() =>
          onChange([
            ...items,
            {
              id: crypto.randomUUID(),
              order: items.length,
              acceptedAnswers: [""],
            },
          ])
        }
      >
        <Plus className="size-4" aria-hidden />
        إضافة عنصر
      </Button>
    </section>
  );
}

function AcceptedAnswersEditor({
  answers,
  onChange,
}: {
  answers: string[];
  onChange: (answers: string[]) => void;
}) {
  const normalized = answers.map((answer) =>
    answer.trim().replace(/\s+/g, " ").toLocaleLowerCase(),
  );
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">الإجابات المقبولة</legend>
      {answers.map((answer, index) => {
        const duplicate =
          Boolean(normalized[index]) &&
          normalized.findIndex((value) => value === normalized[index]) !== index;
        return (
          <div key={index} className="flex gap-2">
            <div className="flex-1">
              <Input
                aria-label={`الإجابة المقبولة ${index + 1}`}
                value={answer}
                maxLength={120}
                aria-invalid={duplicate}
                onChange={(event) =>
                  onChange(
                    answers.map((value, answerIndex) =>
                      answerIndex === index ? event.target.value : value,
                    ),
                  )
                }
              />
              {duplicate && <p role="alert" className="text-xs text-destructive">إجابة مكررة</p>}
            </div>
            <Button type="button" size="icon" variant="ghost" disabled={answers.length === 1} onClick={() => onChange(answers.filter((_, answerIndex) => answerIndex !== index))} aria-label={`حذف الإجابة ${index + 1}`}>
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        );
      })}
      <Button type="button" size="sm" variant="outline" disabled={answers.length >= 10} onClick={() => onChange([...answers, ""])}>
        <Plus className="size-4" aria-hidden />
        إضافة إجابة
      </Button>
    </fieldset>
  );
}
