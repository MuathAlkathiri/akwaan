"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  useCreateWorld,
  useUpdateWorld,
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
  const [name, setName] = useState(world?.name ?? "");
  const [description, setDescription] = useState(world?.description ?? "");
  const [status, setStatus] = useState<WorldContentStatus>(
    world?.status ?? "draft",
  );
  const [soundPack, setSoundPack] = useState(world?.soundPack ?? "");
  const [timerProfile, setTimerProfile] = useState(world?.timerProfile ?? "");
  const [toneProfile, setToneProfile] = useState(world?.toneProfile ?? "");
  const slugField = useAutoSlug(world?.slug, "world");

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
