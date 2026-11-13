"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  useCreateWorld,
  useUpdateWorld,
  useWorldQuestionFallback,
} from "../../hooks/use-world-content";
import { useAutoSlug } from "../../hooks/use-auto-slug";
import { useEntityFormSubmit } from "../../hooks/use-entity-form-submit";
import { buildWorldPayload } from "../../services/world-content-forms";
import {
  AdvancedSlugField,
  FormIssueList,
  StatusSelect,
  UploadField,
} from "../shared";
import type { World, WorldContentStatus } from "../../types";

interface WorldFormProps {
  world?: World;
  onSuccess: () => void;
}

export function WorldForm({ world, onSuccess }: WorldFormProps) {
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [fallbackFile, setFallbackFile] = useState<File | null>(null);
  const [name, setName] = useState(world?.name ?? "");
  const [description, setDescription] = useState(world?.description ?? "");
  const [status, setStatus] = useState<WorldContentStatus>(
    world?.status ?? "draft",
  );
  const [soundPack, setSoundPack] = useState(world?.soundPack ?? "");
  const [timerProfile, setTimerProfile] = useState(world?.timerProfile ?? "");
  const [toneProfile, setToneProfile] = useState(world?.toneProfile ?? "");
  const slugField = useAutoSlug(world?.slug, "world");
  // The backdrop has its own endpoint, so it saves on its own rather than
  // riding the World write — which already carries the banner image.
  const fallback = useWorldQuestionFallback();

  const formSubmit = useEntityFormSubmit<World>({
    entityId: world?.id,
    createMutation: useCreateWorld(),
    updateMutation: useUpdateWorld(),
    successMessage: "تم حفظ العالم.",
    errorMessage: "تعذر حفظ العالم.",
  });

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = buildWorldPayload({
      name,
      slug: slugField.slug,
      description,
      status,
      soundPack,
      timerProfile,
      toneProfile,
    });
    const ok = await formSubmit.submit(payload, assetFile ?? undefined);
    if (ok) onSuccess();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="mb-2 block text-sm font-medium">اسم العالم</label>
        <Input
          value={name}
          placeholder="مثال: كرة القدم"
          onChange={(event) => {
            setName(event.target.value);
            slugField.onNameChange(event.target.value);
          }}
        />
      </div>

      <div>
        <label className="mb-2 block text-sm font-medium">الوصف</label>
        <Textarea
          value={description}
          placeholder="وصف مختصر للعالم (اختياري)"
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <UploadField
        label="صورة العالم"
        existingUrl={world?.banner?.url}
        value={assetFile}
        onChange={setAssetFile}
        disabled={formSubmit.isPending}
        shape="wide"
      />

      {world && (
        <section className="space-y-2 rounded-[var(--radius)] border border-border p-3">
          <UploadField
            label="خلفية السؤال (16:9)"
            existingUrl={world.questionFallback?.url}
            value={fallbackFile}
            onChange={setFallbackFile}
            disabled={fallback.isPending}
            shape="wide"
          />
          <p className="text-xs text-muted-foreground">
            خلفية زخرفية هادئة تظهر وراء السؤال في هذا العالم. لا تُستخدم بديلاً
            عن صورة أو صوت يحتاجه التحدي نفسه، ويظل العالم قابلاً للعب بدونها.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!fallbackFile || fallback.isPending}
              onClick={async () => {
                if (!fallbackFile) return;
                await fallback.mutateAsync({ id: world.id, file: fallbackFile });
                setFallbackFile(null);
              }}
            >
              {fallback.isPending ? "جاري الحفظ..." : "حفظ الخلفية"}
            </Button>
            {world.questionFallback?.url && (
              <Button
                type="button"
                variant="outline"
                disabled={fallback.isPending}
                onClick={() => fallback.mutateAsync({ id: world.id, file: null })}
              >
                إزالة الخلفية
              </Button>
            )}
          </div>
        </section>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1.5 block text-sm font-medium">حزمة الصوت</label>
          <Input
            value={soundPack}
            placeholder="football-stadium"
            onChange={(event) => setSoundPack(event.target.value)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">نمط المؤقت</label>
          <Input
            value={timerProfile}
            placeholder="standard"
            onChange={(event) => setTimerProfile(event.target.value)}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium">نمط النبرة</label>
          <Input
            value={toneProfile}
            placeholder="energetic"
            onChange={(event) => setToneProfile(event.target.value)}
          />
        </div>
      </div>

      <StatusSelect
        value={status}
        onChange={setStatus}
        hint="التنشيط يتطلب أربع خانات مكتملة بأربع مكانيكا مختلفة ونطاقاً نشطاً."
      />

      <AdvancedSlugField slugField={slugField} />

      <FormIssueList error={formSubmit.error} issues={formSubmit.issues} />

      <Button type="submit" disabled={formSubmit.isPending} className="w-full">
        {formSubmit.isPending ? "جاري الحفظ..." : world ? "حفظ العالم" : "إضافة عالم"}
      </Button>
    </form>
  );
}
