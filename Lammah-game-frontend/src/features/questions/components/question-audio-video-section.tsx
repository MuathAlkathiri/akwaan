"use client";

import type {
  FieldErrors,
  UseFormRegister,
  UseFormSetValue,
} from "react-hook-form";

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

  onRetryResearch: () => void;
  onRetryProcessing: () => void;
  onPreview: () => void;
  onApprove: () => void;
  onReject: () => void;
  onRemove: () => void;
  onUpload: (file: File) => void;
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
  onRetryResearch,
  onRetryProcessing,
  onPreview,
  onApprove,
  onReject,
  onRemove,
  onUpload,
  onSelectCandidate,
}: QuestionAudioVideoSectionProps) {
  return (
    <Card
      data-testid={isVideo ? "video-section" : "audio-section"}
    >
      <CardHeader>
        <CardTitle>
          إعدادات {isVideo ? "الفيديو" : "الصوت"}
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

        <div className="grid gap-3 md:grid-cols-2">
          <Input
            placeholder="الاسم المستهدف"
            {...register("targetName")}
          />

          <Input
            placeholder="المصدر أو السياق"
            {...register("sourceTitle")}
          />
        </div>

        <Input
          placeholder="عبارة البحث"
          {...register("searchQuery")}
        />

        {errors.searchQuery && (
          <p className="text-sm text-destructive">
            {errors.searchQuery.message}
          </p>
        )}

        <div className="grid gap-3 md:grid-cols-3">
          <Input
            placeholder="اللغة"
            {...register("audioLanguage")}
          />

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

        {question?.audioAsset?.url &&
          (isVideo ? (
            <video
              controls
              preload="metadata"
              playsInline
              className="max-h-80 w-full rounded-xl object-contain"
              src={question.audioAsset.url}
            />
          ) : (
            <audio
              controls
              className="w-full"
              src={question.audioAsset.url}
            />
          ))}

        {question?.status === "approved" &&
          !question.mediaAvailable && (
            <p className="text-sm text-amber-300">
              السؤال معتمد، لكن الوسائط لن تظهر حتى تصبح جاهزة.
            </p>
          )}

        {question && questionId && (
          <section className="space-y-4 rounded-xl border border-white/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  مراجعة {isVideo ? "الفيديو" : "الصوت"}
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
                  اعتماد {isVideo ? "الفيديو" : "الصوت"}
                </Button>

                <Button
                  type="button"
                  variant="destructive"
                  disabled={actionsPending}
                  onClick={onReject}
                >
                  رفض {isVideo ? "الفيديو" : "الصوت"}
                </Button>

                {question.audioAsset && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={actionsPending}
                    onClick={onRemove}
                  >
                    إزالة {isVideo ? "الفيديو" : "الصوت"}
                  </Button>
                )}
              </div>
            </div>

            <label className="block cursor-pointer rounded-lg border border-dashed border-white/20 p-3 text-center text-sm">
              رفع ملف {isVideo ? "فيديو" : "صوت"} بديل

              <input
                className="sr-only"
                type="file"
                disabled={actionsPending}
                accept={
                  isVideo
                    ? "video/mp4"
                    : "audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm"
                }
                onChange={(event) => {
                  const file = event.target.files?.[0];

                  if (file) {
                    onUpload(file);
                  }

                  event.target.value = "";
                }}
              />
            </label>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">
                المرشحون
              </h4>

              {candidatesLoading && (
                <p className="text-sm text-muted-foreground">
                  جاري تحميل المرشحين...
                </p>
              )}

              {candidates.map((candidate) => (
                <div
                  key={candidate.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white/5 p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {candidate.title}
                    </p>

                    <p className="text-xs text-muted-foreground">
                      {candidate.provider} · {candidate.status}

                      {candidate.durationSeconds
                        ? ` · ${candidate.durationSeconds} ثانية`
                        : ""}
                    </p>
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
              ))}

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
