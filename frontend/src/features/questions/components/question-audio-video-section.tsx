"use client";

import { useEffect, useRef, useState } from "react";
import type {
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/utils";
import type {
  AudioQuestionKind,
  Question,
} from "@/types";

import type { QuestionFormData } from "@/features/questions/models/question-form-schema";

const audioKinds = [
  ["identify_song", "التعرّف على الأغنية"],
  ["identify_artist", "التعرّف على الفنان"],
  ["identify_character", "التعرّف على الشخصية"],
  ["identify_voice", "التعرّف على الصوت"],
  ["identify_game", "التعرّف على اللعبة"],
  ["identify_movie", "التعرّف على الفيلم"],
  ["identify_dialogue_source", "مصدر الحوار"],
  ["identify_sound_effect", "المؤثر الصوتي"],
  ["custom", "مخصص"],
] as const;

const VIDEO_ACCEPT = "video/mp4";
const AUDIO_ACCEPT = "audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm";

type AudioCandidate =
  NonNullable<Question["audioCandidates"]>[number];

interface QuestionAudioVideoSectionProps {
  question?: Question;
  questionId: string;

  values: QuestionFormData;
  register: UseFormRegister<QuestionFormData>;
  errors: FieldErrors<QuestionFormData>;
  setValue: UseFormSetValue<QuestionFormData>;

  isAudio: boolean;
  isVideo: boolean;
  audioDisabled: boolean;

  candidates: AudioCandidate[];
  candidatesLoading: boolean;
  actionsPending: boolean;

  storedMediaUrl?: string;
  isUploading: boolean;
  isRemoving: boolean;

  onRetryResearch: () => void;
  onRetryProcessing: () => void;
  onPreview: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRemove: () => void;
  onUpload: (file: File) => Promise<Question>;
  onSelectCandidate: (candidateId: string) => void;
}

export function QuestionAudioVideoSection({
  question,
  questionId,
  values,
  register,
  errors,
  setValue,
  isAudio,
  isVideo,
  audioDisabled,
  candidates,
  candidatesLoading,
  actionsPending,
  storedMediaUrl,
  isUploading,
  isRemoving,
  onRetryResearch,
  onRetryProcessing,
  onPreview,
  onApprove,
  onReject,
  onRemove,
  onUpload,
  onSelectCandidate,
}: QuestionAudioVideoSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  // Auto-expand when an existing question already has values in the
  // advanced fields, so nothing already saved stays hidden by default.
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(
    Boolean(values.targetName || values.sourceTitle || values.provider),
  );

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedFile]);

  useEffect(() => {
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [questionId]);

  const clearSelectedFile = () => {
    setSelectedFile(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (!questionId || !selectedFile || isUploading) return;

    try {
      await onUpload(selectedFile);
      clearSelectedFile();
      showToast({
        type: "success",
        message: isVideo ? "تم رفع الفيديو بنجاح." : "تم رفع الصوت بنجاح.",
      });
    } catch (error) {
      showToast({
        type: "error",
        message: getApiErrorMessage(
          error,
          isVideo ? "تعذر رفع الفيديو، حاول مرة أخرى." : "تعذر رفع الصوت، حاول مرة أخرى.",
        ),
      });
    }
  };

  const mediaLabel = isVideo ? "الفيديو" : "الصوت";

  return (
    <Card
      data-testid={isVideo ? "video-section" : "audio-section"}
    >
      <CardHeader>
        <CardTitle>
          إعدادات {mediaLabel}
        </CardTitle>

        <p className="text-sm text-muted-foreground">
          الوسائط اختيارية. إذا لم تكن جاهزة سيظهر السؤال نصيًا فقط.
        </p>
      </CardHeader>

      <CardContent className="space-y-3">
        {isAudio && audioDisabled && (
          <p className="text-sm text-destructive">
            الصوت معطل لهذه الفئة.
          </p>
        )}

        <Select
          value={values.audioKind}
          onValueChange={(value: string) =>
            setValue(
              "audioKind",
              value as AudioQuestionKind,
              {
                shouldDirty: true,
              },
            )
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="نوع السؤال الصوتي" />
          </SelectTrigger>

          <SelectContent>
            {audioKinds.map(([value, label]) => (
              <SelectItem
                key={value}
                value={value}
              >
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium" htmlFor="audio-search-query">
            عبارة البحث
          </label>
          <Input
            id="audio-search-query"
            placeholder="مثال: مقطع صوتي لضحكة أوروتشيمارو المميزة"
            {...register("searchQuery")}
          />
          <p className="text-xs text-muted-foreground">
            صف المقطع المطلوب في جملة واحدة، وسيتم البحث عنه تلقائيًا. لا حاجة
            لتعبئة أي حقول أخرى.
          </p>
        </div>

        {errors.searchQuery && (
          <p className="text-sm text-destructive">
            {errors.searchQuery.message}
          </p>
        )}

        <div>
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2"
            onClick={() => setShowAdvancedSearch((value) => !value)}
          >
            {showAdvancedSearch ? "إخفاء خيارات البحث المتقدمة" : "خيارات بحث متقدمة"}
          </button>

          {showAdvancedSearch && (
            <div className="mt-3 space-y-3 rounded-xl border border-dashed p-3">
              <p className="text-xs text-muted-foreground">
                استخدم هذه الحقول فقط إذا لم تكفِ عبارة البحث للعثور على مقطع دقيق.
              </p>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="block text-sm font-medium" htmlFor="audio-target-name">
                    الاسم المستهدف
                  </label>
                  <Input
                    id="audio-target-name"
                    placeholder="مثال: أوروتشيمارو"
                    {...register("targetName")}
                  />
                  <p className="text-xs text-muted-foreground">
                    اسم الشخصية أو الأغنية أو الفنان المطلوب التعرّف عليه.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-sm font-medium" htmlFor="audio-source-title">
                    المصدر أو السياق
                  </label>
                  <Input
                    id="audio-source-title"
                    placeholder="مثال: أنمي ناروتو"
                    {...register("sourceTitle")}
                  />
                  <p className="text-xs text-muted-foreground">
                    العمل الذي ينتمي إليه الاسم المستهدف (مسلسل، فيلم، لعبة...).
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium" htmlFor="audio-provider">
                  المزوّد المفضّل
                </label>
                <Input
                  id="audio-provider"
                  dir="ltr"
                  placeholder="مثال: YouTube"
                  {...register("provider")}
                />
                <p className="text-xs text-muted-foreground">
                  اختياري. حدّد مزوّد البحث المفضل بدلاً من كتابته في الاسم المستهدف.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium" htmlFor="audio-language">
              اللغة
            </label>
            <Input
              id="audio-language"
              placeholder="اللغة"
              {...register("audioLanguage")}
            />
          </div>

          <div className="space-y-2">
            <label
              className="block text-sm font-medium"
              htmlFor="clip-start-time"
            >
              وقت بداية المقطع
            </label>

            <Input
              id="clip-start-time"
              dir="ltr"
              inputMode="numeric"
              placeholder="مثال: 01:14"
              {...register("clipStartTime")}
            />

            <p className="text-xs text-muted-foreground">
              أدخل الدقيقة والثانية التي يبدأ منها المقطع
            </p>

            {errors.clipStartTime && (
              <p className="text-sm text-destructive">
                {errors.clipStartTime.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              className="block text-sm font-medium"
              htmlFor="clip-duration-time"
            >
              مدة المقطع
            </label>

            <Input
              id="clip-duration-time"
              dir="ltr"
              inputMode="numeric"
              placeholder="مثال: 00:12"
              {...register("clipDurationTime")}
            />

            <p className="text-xs text-muted-foreground">
              أدخل مدة المقطع بالدقائق والثواني
            </p>

            {errors.clipDurationTime && (
              <p className="text-sm text-destructive">
                {errors.clipDurationTime.message}
              </p>
            )}
          </div>
        </div>

        {storedMediaUrl && (
          <div>
            <p className="mb-2 text-sm font-medium">الملف الحالي</p>
            {isVideo ? (
              <video
                controls
                preload="metadata"
                playsInline
                className="max-h-80 w-full rounded-xl object-contain"
                src={storedMediaUrl}
              />
            ) : (
              <audio controls className="w-full" src={storedMediaUrl} />
            )}
          </div>
        )}

        {question?.status === "approved" &&
          !question.mediaAvailable && (
            <p className="text-sm text-amber-300">
              السؤال معتمد، لكن الوسائط لن تظهر حتى تصبح جاهزة.
            </p>
          )}

        {questionId && (
          <div className="space-y-3 rounded-xl border border-dashed p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {storedMediaUrl
                    ? `استبدال ${mediaLabel} الحالي`
                    : `رفع ${mediaLabel} يدويًا`}
                </p>
                <p className="text-xs text-muted-foreground">
                  {isVideo
                    ? "الصيغة المدعومة: MP4."
                    : "الصيغ المدعومة: MP3، M4A، WAV، OGG، WEBM."}
                </p>
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isUploading || isRemoving}
                onClick={() => inputRef.current?.click()}
              >
                {storedMediaUrl ? "اختيار ملف بديل" : "اختيار ملف"}
              </Button>
            </div>

            <input
              ref={inputRef}
              className="sr-only"
              type="file"
              disabled={isUploading || isRemoving}
              accept={isVideo ? VIDEO_ACCEPT : AUDIO_ACCEPT}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) setSelectedFile(file);
              }}
            />

            {previewUrl && (
              <div className="space-y-2">
                <p className="text-sm text-amber-300">
                  معاينة قبل الرفع، لم يتم رفعها بعد.
                </p>
                {isVideo ? (
                  <video
                    controls
                    preload="metadata"
                    playsInline
                    className="max-h-80 w-full rounded-xl object-contain"
                    src={previewUrl}
                  />
                ) : (
                  <audio controls className="w-full" src={previewUrl} />
                )}
                {selectedFile && (
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    {selectedFile.name} ·{" "}
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleUpload}
                    disabled={isUploading}
                  >
                    {isUploading ? `جاري رفع ${mediaLabel}...` : `رفع ${mediaLabel}`}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isUploading}
                    onClick={clearSelectedFile}
                  >
                    إلغاء الاختيار
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {question && questionId && (
          <section className="space-y-4 rounded-xl border border-white/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  مراجعة {mediaLabel}
                </h3>

                <p className="text-sm text-muted-foreground">
                  حالة المعالجة:{" "}
                  {question.audioStatus ?? "pending"} · المراجعة:{" "}
                  {question.audioReviewStatus ?? "pending"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={actionsPending}
                  onClick={onRetryResearch}
                >
                  إعادة البحث
                </Button>

                {question.audioRequest?.selectedCandidateId && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={actionsPending}
                      onClick={onPreview}
                    >
                      معاينة المقطع
                    </Button>

                    <Button
                      type="button"
                      variant="outline"
                      disabled={actionsPending}
                      onClick={onRetryProcessing}
                    >
                      إعادة المعالجة
                    </Button>
                  </>
                )}

                <Button
                  type="button"
                  variant="outline"
                  disabled={actionsPending}
                  onClick={onApprove}
                >
                  اعتماد {mediaLabel}
                </Button>

                <Button
                  type="button"
                  variant="destructive"
                  disabled={actionsPending}
                  onClick={onReject}
                >
                  رفض {mediaLabel}
                </Button>

                {question.audioAsset && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={actionsPending || isRemoving}
                    onClick={onRemove}
                  >
                    {isRemoving ? `جاري إزالة ${mediaLabel}...` : `إزالة ${mediaLabel}`}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">
                المرشحون
              </h4>

              {candidatesLoading && (
                <p className="text-sm text-muted-foreground">
                  جاري تحميل المرشحين...
                </p>
              )}

              {candidates.map((candidate) => {
                const isYoutube = candidate.provider === "youtube";
                return (
                <div
                  key={candidate.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/5 p-3"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium">
                        {candidate.title}
                      </p>
                      <Badge variant={isYoutube ? "default" : "outline"}>
                        {isYoutube ? "YouTube" : "نتيجة بحث ويب"}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      {candidate.status}

                      {candidate.durationSeconds
                        ? ` · ${candidate.durationSeconds} ثانية`
                        : ""}
                    </p>

                    {!isYoutube && (
                      <p className="text-xs text-amber-300">
                        هذه النتيجة ليست من يوتيوب، وقد لا يمكن تحميلها تلقائيًا عند اختيارها.
                      </p>
                    )}
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={
                      actionsPending ||
                      candidate.status === "selected"
                    }
                    onClick={() =>
                      onSelectCandidate(candidate.id)
                    }
                  >
                    {candidate.status === "selected"
                      ? "محدد"
                      : "اختيار ومعالجة"}
                  </Button>
                </div>
                );
              })}

              {!candidatesLoading && candidates.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  لا توجد مرشحات حاليًا. احفظ إعدادات الطلب أو أعد البحث.
                </p>
              )}
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
