"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getMediaUrl } from "@/lib/api/media-url";
import * as api from "./api";
import type { MediaLibraryEntry } from "./types";

/**
 * The Admin's own pictures, by subject. A picture uploaded here once is used
 * for every later question about that subject, with no search — which is what
 * makes club crests, that no licensed source carries, usable at all.
 */

const ACCEPTED_IMAGE_TYPES = "image/jpeg,image/png,image/webp";
const LIBRARY_KEY = ["content-engine-media-library"];

const KIND_LABELS: Record<string, string> = {
  "club-or-brand-mark": "شعار نادي أو علامة",
  person: "شخص",
  place: "مكان أو ملعب",
  vehicle: "مركبة",
  object: "غرض (كأس، طقم…)",
  "work-or-scene": "عمل أو مشهد",
  other: "غير ذلك",
};

function errorMessage(err: unknown): string {
  const data = (err as { response?: { data?: { code?: string; message?: string } } })?.response
    ?.data;
  if (data?.code === "MEDIA_LIBRARY_SUBJECT_EXISTS") {
    return "هذا الاسم موجود في المكتبة لنفس النوع. احذف القديم أول لو تبغى تبدل صورته.";
  }
  if (data?.code === "MEDIA_LIBRARY_NAME_REQUIRED") return "اكتب اسم واضح للموضوع.";
  return data?.message ?? "ما قدرنا نحفظ الصورة. جرّب مرة ثانية.";
}

export function MediaLibraryPanel() {
  const client = useQueryClient();
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [aliases, setAliases] = useState("");
  const [kind, setKind] = useState("club-or-brand-mark");
  const [file, setFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const library = useQuery({ queryKey: LIBRARY_KEY, queryFn: api.listMediaLibrary });

  const add = useMutation({
    mutationFn: () => api.addMediaLibraryEntry({ name, nameAr, aliases, kind }, file as File),
    onSuccess: () => {
      setError(null);
      setName("");
      setNameAr("");
      setAliases("");
      setFile(null);
      // Remounting is the only way to clear a file input.
      setFileInputKey((value) => value + 1);
      void client.invalidateQueries({ queryKey: LIBRARY_KEY });
    },
    onError: (err) => setError(errorMessage(err)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.removeMediaLibraryEntry(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: LIBRARY_KEY }),
    onError: (err) => setError(errorMessage(err)),
  });

  const entries = library.data ?? [];

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-4" data-testid="media-library-panel">
      <header>
        <h2 className="text-lg font-bold">مكتبة الصور</h2>
        <p className="text-sm text-muted-foreground">
          ارفع صورة الموضوع مرة وحدة، والمحرك يستخدمها تلقائيًا في أي سؤال عنه بدون بحث. مناسبة
          لشعارات الأندية خصوصًا. يفضّل الشعار اللي ما فيه اسم النادي مكتوب.
        </p>
      </header>

      <form
        className="grid gap-3 rounded-xl border bg-background p-3 md:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && file && !add.isPending) add.mutate();
        }}
      >
        <label className="space-y-1 text-sm">
          <span>الاسم بالإنجليزي (مثل ما يكتبه المحرك)</span>
          <Input
            dir="ltr"
            placeholder="Leicester City F.C."
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>الاسم بالعربي</span>
          <Input
            placeholder="ليستر سيتي"
            value={nameAr}
            onChange={(event) => setNameAr(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>أسماء ثانية (اختياري، بينها فاصلة)</span>
          <Input
            dir="ltr"
            placeholder="Leicester, Leicester City"
            value={aliases}
            onChange={(event) => setAliases(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span>النوع</span>
          <select
            className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={kind}
            onChange={(event) => setKind(event.target.value)}
          >
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm md:col-span-2">
          <span>الصورة</span>
          <Input
            key={fileInputKey}
            type="file"
            accept={ACCEPTED_IMAGE_TYPES}
            aria-label="ملف صورة للمكتبة"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="submit" disabled={!name.trim() || !file || add.isPending}>
            {add.isPending ? "جارٍ الحفظ…" : "أضف للمكتبة"}
          </Button>
          {error && (
            <p className="text-sm text-red-700" role="alert" data-testid="media-library-error">
              {error}
            </p>
          )}
        </div>
      </form>

      {library.isLoading ? (
        <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="media-library-empty">
          المكتبة فاضية. أول صورة ترفعها بتظهر هنا.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {entries.map((entry: MediaLibraryEntry) => (
            <li
              key={entry.id}
              className="space-y-1 rounded-xl border bg-background p-2 text-center"
              data-testid="media-library-entry"
            >
              {/* Backend-hosted upload; next/image cannot optimize arbitrary origins. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getMediaUrl(entry.asset.url)}
                alt={entry.nameAr ?? entry.name}
                className="mx-auto h-24 w-24 object-contain"
              />
              <p className="truncate text-sm font-semibold" title={entry.name}>
                {entry.nameAr ?? entry.name}
              </p>
              <p className="truncate text-xs text-muted-foreground" dir="ltr" title={entry.name}>
                {entry.name}
              </p>
              <p className="text-xs text-muted-foreground">{KIND_LABELS[entry.kind] ?? entry.kind}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm(`تحذف «${entry.nameAr ?? entry.name}» من المكتبة؟`)) {
                    remove.mutate(entry.id);
                  }
                }}
              >
                حذف
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
