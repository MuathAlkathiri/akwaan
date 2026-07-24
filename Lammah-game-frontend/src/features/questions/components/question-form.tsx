"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useCategories } from "@/features/categories";
import {
  useCreateQuestion,
  useGenerateAcceptedAnswers,
  useGenerateRankedAcceptedAnswers,
  usePatchQuestion,
  useQuestionImageActions,
  useQuestionAudioActions,
  useQuestionAudioCandidates,
} from "../hooks/use-questions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { showToast } from "@/components/ui/toast";
import { getApiErrorMessage, getEntityId } from "@/lib/utils";
import type { AudioQuestionKind, Question, RankedListEntry } from "@/types";
import { RankedListEditor } from "./ranked-list-editor";
import {
  createDefaultRankedListEntries,
  getRankedListConflictRows,
  validateRankedListEntries,
} from "../models/ranked-list-form";
import {
  AcceptedAnswersEditor,
  mergeAcceptedAnswers,
} from "./accepted-answers-editor";
import {
  confirmUnsavedChanges,
  useUnsavedChangesWarning,
} from "../hooks/use-unsaved-changes-warning";
import {
  mediaTimingDefaults,
  mediaTimingPayload,
  parseTimeToSeconds,
} from "../models/media-time";

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

const schema = z
  .object({
    authoringType: z.enum(["text", "image", "audio", "video", "top10"]),
    categoryId: z.string().min(1, "الفئة مطلوبة"),
    question: z.string().min(1, "السؤال مطلوب"),
    questionEn: z.string().optional(),
    answer: z.string().optional(),
    explanation: z.string().optional(),
    difficulty: z.enum(["easy", "medium", "hard"]),
    points: z.enum(["200", "400", "600"]),
    status: z.enum(["draft", "approved", "rejected"]),
    isFreeGameQuestion: z.boolean(),
    audioKind: z.enum([
      "identify_song",
      "identify_artist",
      "identify_character",
      "identify_voice",
      "identify_game",
      "identify_movie",
      "identify_dialogue_source",
      "identify_sound_effect",
      "custom",
    ]),
    searchQuery: z.string().optional(),
    targetName: z.string().optional(),
    sourceTitle: z.string().optional(),
    audioLanguage: z.string().optional(),
    clipDurationTime: z.string().optional(),
    clipStartTime: z.string().optional(),
  })
  .superRefine((value, context) => {
    if (value.authoringType !== "top10" && !value.answer?.trim())
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answer"],
        message: "الإجابة مطلوبة",
      });
    if (["audio", "video"].includes(value.authoringType)) {
      for (const [field, input] of [
        ["clipStartTime", value.clipStartTime],
        ["clipDurationTime", value.clipDurationTime],
      ] as const) {
        if (!input?.trim()) continue;
        try {
          parseTimeToSeconds(input);
        } catch {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: "استخدم التنسيق MM:SS وثوانٍ بين 00 و59",
          });
        }
      }
      if (value.clipDurationTime?.trim()) {
        try {
          const duration = parseTimeToSeconds(value.clipDurationTime);
          const [minimum, maximum] =
            value.authoringType === "video" ? [5, 15] : [3, 20];
          if (duration < minimum || duration > maximum)
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["clipDurationTime"],
              message: `المدة يجب أن تكون بين ${minimum} و${maximum} ثانية`,
            });
        } catch {
          // The format issue above is sufficient.
        }
      }
    }
  });

type FormData = z.infer<typeof schema>;

const questionAuthoringType = (
  question?: Question,
): FormData["authoringType"] => {
  if (question?.questionType === "ranked_list") return "top10";
  if (question?.type === "video") return "video";
  if (question?.type === "audio" || question?.requiresAudio) return "audio";
  if (question?.type === "image") return "image";
  return "text";
};

export const mediaRequestFingerprint = (
  request?: Pick<
    NonNullable<Question["audioRequest"]>,
    | "kind"
    | "searchQuery"
    | "targetName"
    | "sourceTitle"
    | "language"
    | "preferredDurationSeconds"
    | "preferredStartSeconds"
    | "provider"
  > | null,
) =>
  JSON.stringify([
    request?.kind,
    request?.searchQuery.trim().replace(/\s+/g, " "),
    request?.targetName?.trim().replace(/\s+/g, " ") || null,
    request?.sourceTitle?.trim().replace(/\s+/g, " ") || null,
    request?.language?.trim().toLowerCase() || null,
    request?.preferredDurationSeconds ?? null,
    request?.preferredStartSeconds ?? null,
    request?.provider?.trim().toLowerCase() || null,
  ]);

const getCanonicalImageUrl = (question?: Question) =>
  question?.primaryAsset?.type === "image"
    ? question.primaryAsset.url
    : question?.effectivePresentationType === "image"
      ? question.resolvedMedia?.url
      : undefined;

export function QuestionForm({
  question,
  onSuccess,
  onCancel,
}: {
  question?: Question;
  onSuccess?: (question: Question) => void;
  onCancel?: () => void;
}) {
  const { data: categories = [] } = useCategories();
  const createQuestion = useCreateQuestion();
  const patchQuestion = usePatchQuestion();
  const imageActions = useQuestionImageActions();
  const audioActions = useQuestionAudioActions();
  const questionId = question ? getEntityId(question) : "";
  const questionImageUrl = getCanonicalImageUrl(question);
  const audioCandidatesQuery = useQuestionAudioCandidates(
    questionId,
    Boolean(
      questionId &&
      ["audio", "video"].includes(questionAuthoringType(question)),
    ),
    question?.audioStatus,
  );
  const generateOne = useGenerateAcceptedAnswers();
  const generateAll = useGenerateRankedAcceptedAnswers();
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>();
  const [storedImageUrl, setStoredImageUrl] = useState<string | undefined>(
    questionImageUrl,
  );
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [acceptedAnswers, setAcceptedAnswers] = useState<string[]>(
    question?.acceptedAnswers ?? [],
  );
  const [rankedEntries, setRankedEntries] = useState<RankedListEntry[]>(
    question?.rankedList?.entries ?? createDefaultRankedListEntries(),
  );
  const [rowWarnings, setRowWarnings] = useState<Record<number, string[]>>({});
  const [generationWarning, setGenerationWarning] = useState<string>();
  const [localDirty, setLocalDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const timingDefaults = mediaTimingDefaults(
    question?.audioRequest ?? undefined,
  );
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      authoringType: questionAuthoringType(question),
      categoryId:
        typeof question?.category === "string"
          ? question.category
          : question?.category
            ? getEntityId(question.category)
            : question?.categoryId,
      question: question?.question ?? "",
      questionEn: question?.text?.en ?? "",
      answer: question?.answer ?? "",
      explanation: question?.explanation ?? "",
      difficulty: question?.difficulty ?? "easy",
      points: String(question?.points ?? 200) as FormData["points"],
      status:
        question?.status === "approved" || question?.status === "rejected"
          ? question.status
          : "draft",
      isFreeGameQuestion: question?.isFreeGameQuestion ?? false,
      audioKind:
        question?.audioRequest?.kind ?? question?.audioKind ?? "custom",
      searchQuery: question?.audioRequest?.searchQuery ?? "",
      targetName: question?.audioRequest?.targetName ?? "",
      sourceTitle: question?.audioRequest?.sourceTitle ?? "",
      audioLanguage: question?.audioRequest?.language ?? "ar",
      clipDurationTime: timingDefaults.clipDurationTime,
      clipStartTime: timingDefaults.clipStartTime,
    },
  });
  const values = watch();
  const isTop10 = values.authoringType === "top10";
  const isAudio = values.authoringType === "audio";
  const isVideo = values.authoringType === "video";
  const isMedia = isAudio || isVideo;
  const isImage = values.authoringType === "image";
  const selectedCategory = useMemo(
    () =>
      categories.find(
        (category) => getEntityId(category) === values.categoryId,
      ),
    [categories, values.categoryId],
  );
  const rankedListIssues = useMemo(
    () => validateRankedListEntries(rankedEntries),
    [rankedEntries],
  );
  const dirty = !saved && (isDirty || localDirty || Boolean(imageFile));
  useUnsavedChangesWarning(dirty);

  useEffect(() => {
    if (isTop10) setValue("points", "600");
  }, [isTop10, setValue]);

  useEffect(() => {
    if (!imageFile) return setImagePreviewUrl(undefined);
    const url = URL.createObjectURL(imageFile);
    setImagePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    setStoredImageUrl(questionImageUrl);
    setImageFile(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  }, [questionId, questionImageUrl]);

  const uploadSelectedImage = async () => {
    if (!questionId || !imageFile) return;
    try {
      const updated = await imageActions.upload({
        id: questionId,
        file: imageFile,
      });
      setStoredImageUrl(getCanonicalImageUrl(updated));
      setImageFile(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      showToast({ type: "success", message: "تم رفع الصورة بنجاح" });
    } catch (error) {
      showToast({
        type: "error",
        message: getApiErrorMessage(error, "تعذر رفع الصورة، حاول مرة أخرى."),
      });
    }
  };

  const removeStoredImage = async () => {
    if (
      !questionId ||
      !storedImageUrl ||
      !window.confirm("هل تريد إزالة الصورة الحالية من السؤال؟")
    )
      return;
    try {
      await imageActions.remove(questionId);
      setStoredImageUrl(undefined);
      setImageFile(null);
      if (imageInputRef.current) imageInputRef.current.value = "";
      showToast({ type: "success", message: "تمت إزالة الصورة" });
    } catch (error) {
      showToast({
        type: "error",
        message: getApiErrorMessage(error, "تعذر إزالة الصورة. حاول مرة أخرى."),
      });
    }
  };

  const updateRankedEntries = (entries: RankedListEntry[]) => {
    setRankedEntries(entries);
    setRowWarnings(getRankedListConflictRows(entries));
    setLocalDirty(true);
  };
  const updateAcceptedAnswers = (aliases: string[]) => {
    setAcceptedAnswers(aliases);
    setLocalDirty(true);
  };

  const generateStandardAliases = async () => {
    if (!values.answer?.trim() || !values.question.trim()) return;
    setGenerationWarning(undefined);
    try {
      const response = await generateOne.mutateAsync({
        data: {
          questionText: values.question,
          canonicalAnswerAr: values.answer,
          categoryId: values.categoryId || undefined,
          locale: "mixed",
        },
      });
      updateAcceptedAnswers(
        mergeAcceptedAnswers(
          acceptedAnswers,
          response.aliases.map((alias) => alias.value),
        ),
      );
      if (response.warnings.length)
        setGenerationWarning(response.warnings.join("، "));
    } catch (error) {
      setGenerationWarning(
        getApiErrorMessage(
          error,
          "تعذر توليد الأسماء المقبولة. يمكنك إضافتها يدوياً.",
        ),
      );
    }
  };

  const generateRankedAliases = async () => {
    if (
      !values.question.trim() ||
      rankedEntries.some((entry) => !entry.answer.ar.trim())
    )
      return;
    setGenerationWarning(undefined);
    try {
      const response = await generateAll.mutateAsync({
        data: {
          questionText: values.question,
          categoryId: values.categoryId || undefined,
          locale: "mixed",
          entries: rankedEntries.map((entry, index) => ({
            clientId: entry.id ?? `row-${index}`,
            canonicalAnswerAr: entry.answer.ar,
            canonicalAnswerEn: entry.answer.en || undefined,
          })),
        },
      });
      const byId = new Map(
        response.entries.map((entry) => [entry.clientId, entry]),
      );
      const next = rankedEntries.map((entry, index) => {
        const generated = byId.get(entry.id ?? `row-${index}`);
        return {
          ...entry,
          aliases: mergeAcceptedAnswers(
            entry.aliases,
            generated?.aliases.map((alias) => alias.value) ?? [],
          ),
        };
      });
      updateRankedEntries(next);
      const warnings: Record<number, string[]> = {};
      rankedEntries.forEach((entry, index) => {
        const generated = byId.get(entry.id ?? `row-${index}`);
        if (generated?.warnings.length) warnings[index] = generated.warnings;
      });
      setRowWarnings({
        ...getRankedListConflictRows(next),
        ...warnings,
      });
      if (response.warnings.length)
        setGenerationWarning(response.warnings.join("، "));
    } catch (error) {
      setGenerationWarning(
        getApiErrorMessage(error, "تعذر توليد الأسماء لكل الصفوف."),
      );
    }
  };

  const submit = async (data: FormData, forcedStatus?: "draft") => {
    try {
      const conflicts = getRankedListConflictRows(rankedEntries);
      setRowWarnings(conflicts);
      if (isTop10 && rankedListIssues.length) {
        showToast({ type: "error", message: rankedListIssues[0] });
        return;
      }
      const timing = mediaTimingPayload(data);
      const audioRequest =
        isMedia && data.searchQuery?.trim()
          ? {
              kind: data.audioKind as AudioQuestionKind,
              searchQuery: data.searchQuery.trim(),
              targetName: data.targetName?.trim() || undefined,
              sourceTitle: data.sourceTitle?.trim() || undefined,
              language: data.audioLanguage?.trim() || undefined,
              preferredDurationSeconds: timing.preferredDurationSeconds,
              preferredStartSeconds: timing.preferredStartSeconds,
            }
          : undefined;
      const payload: Partial<Question> = {
        categoryId: data.categoryId,
        question: data.question.trim(),
        questionType: isTop10 ? "ranked_list" : "standard",
        text: isTop10
          ? {
              ar: data.question.trim(),
              en: data.questionEn?.trim() || undefined,
            }
          : undefined,
        answer: isTop10 ? undefined : data.answer?.trim(),
        acceptedAnswers: isTop10 ? undefined : acceptedAnswers,
        explanation: data.explanation?.trim() || undefined,
        difficulty: data.difficulty,
        points: isTop10 ? 600 : Number(data.points),
        maxPoints: isTop10 ? 600 : undefined,
        turnDurationSeconds: isTop10 ? 15 : undefined,
        maxStrikesPerTeam: isTop10 ? 3 : undefined,
        rankedList: isTop10
          ? {
              displayName: question?.rankedList?.displayName ?? {
                ar: "توب 10",
                en: "Top 10",
              },
              entries: rankedEntries.map((entry, index) => ({
                ...entry,
                clientId: entry.clientId ?? entry.id ?? `row-${index}`,
              })),
            }
          : undefined,
        type: isVideo
          ? "video"
          : isAudio
            ? "audio"
            : isImage
              ? "image"
              : "text",
        status: forcedStatus ?? data.status,
        source: question?.source ?? "manual",
        isFreeGameQuestion: data.isFreeGameQuestion,
        requiresAudio: Boolean(audioRequest),
        audioKind: audioRequest?.kind,
        audioRequest,
      };
      const updated = question
        ? await patchQuestion.mutateAsync({
            id: getEntityId(question),
            data: payload,
          })
        : await createQuestion.mutateAsync(payload);
      if (
        question &&
        isMedia &&
        audioRequest &&
        mediaRequestFingerprint(audioRequest) !==
          mediaRequestFingerprint(question.audioRequest)
      )
        await audioActions.updateRequest({
          id: getEntityId(question),
          data: { audioRequest },
        });
      setSaved(true);
      showToast({
        type: "success",
        message: question ? "تم تحديث السؤال." : "تم إنشاء السؤال.",
      });
      onSuccess?.(updated);
    } catch (error) {
      const response = (
        error as {
          response?: {
            data?: {
              conflicts?: Array<{
                entryIndex?: number;
                conflictingEntryIndex?: number;
                conflictingValue?: string;
              }>;
            };
          };
        }
      ).response?.data;
      if (response?.conflicts) {
        const warnings: Record<number, string[]> = {};
        response.conflicts.forEach((conflict) => {
          if (conflict.entryIndex === undefined) return;
          const message = `تعارض في "${
            conflict.conflictingValue ?? "القيمة"
          }" مع المرتبة ${(conflict.conflictingEntryIndex ?? 0) + 1}.`;
          for (const index of [
            conflict.entryIndex,
            conflict.conflictingEntryIndex,
          ]) {
            if (index === undefined) continue;
            warnings[index] = [...(warnings[index] ?? []), message];
          }
        });
        setRowWarnings(warnings);
      }
      showToast({
        type: "error",
        message: getApiErrorMessage(error, "تعذر حفظ السؤال."),
      });
    }
  };

  const previewCurrentClip = async () => {
    if (!questionId) return;
    try {
      const timing = mediaTimingPayload(values);
      await audioActions.preview({
        id: questionId,
        data: {
          startTimeSeconds: timing.preferredStartSeconds,
          durationSeconds: timing.preferredDurationSeconds,
        },
      });
      showToast({
        type: "success",
        message: "يتم الآن إنشاء معاينة بالتوقيت الحالي.",
      });
    } catch (error) {
      showToast({
        type: "error",
        message: getApiErrorMessage(error, "تعذر إنشاء معاينة المقطع."),
      });
    }
  };

  const pending =
    createQuestion.isPending ||
    patchQuestion.isPending ||
    audioActions.isPending ||
    imageActions.isUploading ||
    imageActions.isRemoving;

  return (
    <form
      className="space-y-6"
      onSubmit={handleSubmit((data: FormData) => submit(data))}
    >
      <div className="sticky top-16 z-30 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-background/90 p-3 backdrop-blur-xl">
        <p className="text-sm text-muted-foreground">
          {dirty ? "توجد تغييرات غير محفوظة" : "جميع التغييرات محفوظة"}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (confirmUnsavedChanges(dirty)) onCancel?.();
            }}
          >
            إلغاء
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={handleSubmit((data: FormData) => submit(data, "draft"))}
          >
            حفظ كمسودة
          </Button>
          <Button type="submit" disabled={pending}>
            {pending
              ? "جاري الحفظ..."
              : question
                ? "تحديث السؤال"
                : "حفظ السؤال"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>نوع السؤال والتصنيف</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium">
              نوع التأليف
            </label>
            <Select
              value={values.authoringType}
              onValueChange={(value) =>
                setValue("authoringType", value as FormData["authoringType"], {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger aria-label="نوع التأليف">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">نص</SelectItem>
                <SelectItem value="image">صورة</SelectItem>
                <SelectItem value="audio">صوت</SelectItem>
                <SelectItem value="video">فيديو</SelectItem>
                <SelectItem value="top10">Top 10</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium">الفئة</label>
            <Select
              value={values.categoryId}
              onValueChange={(value) =>
                setValue("categoryId", value, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر فئة" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem
                    key={getEntityId(category)}
                    value={getEntityId(category)}
                  >
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.categoryId && (
              <p className="text-sm text-destructive">
                {errors.categoryId.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>محتوى السؤال</CardTitle>
        </CardHeader>
        <CardContent
          className="space-y-4"
          data-testid="standard-answer-section"
        >
          <div>
            <label className="mb-2 block text-sm font-medium">السؤال</label>
            <Textarea {...register("question")} />
            {errors.question && (
              <p className="text-sm text-destructive">
                {errors.question.message}
              </p>
            )}
          </div>
          {isTop10 && (
            <div>
              <label className="mb-2 block text-sm font-medium">
                السؤال بالإنجليزية (اختياري)
              </label>
              <Input dir="ltr" {...register("questionEn")} />
            </div>
          )}
          {!isTop10 && (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  الإجابة الأساسية
                </label>
                <Input {...register("answer")} />
                {errors.answer && (
                  <p className="text-sm text-destructive">
                    {errors.answer.message}
                  </p>
                )}
              </div>
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-medium">الإجابات المقبولة</label>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={generateStandardAliases}
                    disabled={
                      generateOne.isPending ||
                      !values.answer?.trim() ||
                      !values.question.trim()
                    }
                  >
                    {generateOne.isPending
                      ? "جاري التوليد..."
                      : "توليد الإجابات المقبولة"}
                  </Button>
                </div>
                <AcceptedAnswersEditor
                  values={acceptedAnswers}
                  onChange={updateAcceptedAnswers}
                />
              </section>
            </>
          )}
          <div>
            <label className="mb-2 block text-sm font-medium">الشرح</label>
            <Textarea {...register("explanation")} />
          </div>
        </CardContent>
      </Card>

      {isTop10 && (
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
                onClick={generateRankedAliases}
                disabled={
                  generateAll.isPending ||
                  rankedEntries.some((entry) => !entry.answer.ar.trim())
                }
              >
                {generateAll.isPending
                  ? "جاري التوليد..."
                  : "توليد الإجابات المقبولة للجميع"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <RankedListEditor
              entries={rankedEntries}
              onChange={updateRankedEntries}
              rowWarnings={rowWarnings}
            />
          </CardContent>
        </Card>
      )}

      {isImage && (
        <Card data-testid="image-section">
          <CardHeader>
            <CardTitle>صورة السؤال</CardTitle>
            <p className="text-sm text-muted-foreground">
              الوسائط اختيارية. إذا لم تكن جاهزة سيظهر السؤال نصيًا فقط.
            </p>
          </CardHeader>
          <CardContent>
            <Input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="اختيار صورة السؤال"
              className={storedImageUrl ? "sr-only" : undefined}
              disabled={imageActions.isUploading || imageActions.isRemoving}
              onChange={(event) => {
                setImageFile(event.target.files?.[0] ?? null);
              }}
            />
            {!questionId && (
              <p className="mt-2 text-sm text-muted-foreground">
                احفظ السؤال أولاً قبل رفع الصورة.
              </p>
            )}
            {storedImageUrl && (
              <div className="mt-4">
                <p className="mb-2 text-sm font-medium">الصورة الحالية</p>
                <Image
                  src={storedImageUrl}
                  alt="الصورة الحالية"
                  width={960}
                  height={540}
                  unoptimized
                  className="max-h-80 w-full rounded-xl object-contain"
                />
              </div>
            )}
            {imagePreviewUrl && (
              <div className="mt-4">
                <p className="mb-1 text-sm font-medium">معاينة قبل الرفع</p>
                <p className="mb-2 text-sm text-amber-300">
                  لم يتم رفع الصورة بعد
                </p>
              <Image
                src={imagePreviewUrl}
                alt="معاينة"
                width={960}
                height={540}
                unoptimized
                onError={(event) => {
                  event.currentTarget.style.display = "none";
                }}
                className="max-h-80 w-full rounded-xl object-contain"
              />
                {imageFile && (
                  <p className="mt-2 text-xs text-muted-foreground" dir="ltr">
                    {imageFile.name} · {(imageFile.size / 1024).toFixed(1)} KB
                  </p>
                )}
              </div>
            )}
            {imageFile && (
              <p className="mt-3 text-sm text-amber-300">
                لديك صورة مختارة لم يتم رفعها بعد. حفظ بيانات السؤال لن يرفعها.
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={uploadSelectedImage}
                disabled={
                  !questionId ||
                  !imageFile ||
                  imageActions.isUploading ||
                  imageActions.isRemoving
                }
              >
                {imageActions.isUploading ? "جاري الرفع..." : "رفع الصورة"}
              </Button>
              {storedImageUrl && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={
                      imageActions.isUploading || imageActions.isRemoving
                    }
                  >
                    تغيير الصورة
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={removeStoredImage}
                    disabled={
                      imageActions.isUploading || imageActions.isRemoving
                    }
                  >
                    {imageActions.isRemoving
                      ? "جاري الحذف..."
                      : "حذف الصورة"}
                  </Button>
                </>
              )}
            </div>
            {question?.status === "approved" && !question.mediaAvailable && (
              <p className="mt-3 text-sm text-amber-300">
                السؤال معتمد، لكن الوسائط لن تظهر حتى تصبح جاهزة.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {isMedia && (
        <Card data-testid={isVideo ? "video-section" : "audio-section"}>
          <CardHeader>
            <CardTitle>إعدادات {isVideo ? "الفيديو" : "الصوت"}</CardTitle>
            <p className="text-sm text-muted-foreground">
              الوسائط اختيارية. إذا لم تكن جاهزة سيظهر السؤال نصيًا فقط.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {isAudio && selectedCategory?.audioPolicy === "disabled" && (
              <p className="text-sm text-destructive">الصوت معطل لهذه الفئة.</p>
            )}
            <Select
              value={values.audioKind}
              onValueChange={(value) =>
                setValue("audioKind", value as AudioQuestionKind, {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="نوع السؤال الصوتي" />
              </SelectTrigger>
              <SelectContent>
                {audioKinds.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="grid gap-3 md:grid-cols-2">
              <Input placeholder="الاسم المستهدف" {...register("targetName")} />
              <Input
                placeholder="المصدر أو السياق"
                {...register("sourceTitle")}
              />
            </div>
            <Input placeholder="عبارة البحث" {...register("searchQuery")} />
            {errors.searchQuery && (
              <p className="text-sm text-destructive">
                {errors.searchQuery.message}
              </p>
            )}
            <div className="grid gap-3 md:grid-cols-3">
              <Input placeholder="اللغة" {...register("audioLanguage")} />
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
                  className="max-h-80 w-full rounded-xl object-contain"
                  src={question.audioAsset.url}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <audio
                  controls
                  className="w-full"
                  src={question.audioAsset.url}
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ))}
            {question?.status === "approved" && !question.mediaAvailable && (
              <p className="text-sm text-amber-300">
                السؤال معتمد، لكن الوسائط لن تظهر حتى تصبح جاهزة.
              </p>
            )}
            {question && (
              <section className="space-y-4 rounded-xl border border-white/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">
                      مراجعة {isVideo ? "الفيديو" : "الصوت"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      حالة المعالجة: {question.audioStatus ?? "pending"} ·
                      المراجعة: {question.audioReviewStatus ?? "pending"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={audioActions.isPending}
                      onClick={() => audioActions.retry(questionId, "research")}
                    >
                      إعادة البحث
                    </Button>
                    {question.audioRequest?.selectedCandidateId && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={audioActions.isPending}
                          onClick={previewCurrentClip}
                        >
                          معاينة المقطع
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={audioActions.isPending}
                          onClick={() =>
                            audioActions.retry(questionId, "retryProcessing")
                          }
                        >
                          إعادة المعالجة
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      disabled={audioActions.isPending}
                      onClick={() => audioActions.approve(questionId)}
                    >
                      اعتماد {isVideo ? "الفيديو" : "الصوت"}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={audioActions.isPending}
                      onClick={() => audioActions.reject(questionId)}
                    >
                      رفض {isVideo ? "الفيديو" : "الصوت"}
                    </Button>
                    {question.audioAsset && (
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={audioActions.isPending}
                        onClick={() => audioActions.remove(questionId)}
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
                    accept={
                      isVideo
                        ? "video/mp4"
                        : "audio/mpeg,audio/mp4,audio/wav,audio/ogg,audio/webm"
                    }
                    onChange={(event) => {
                      const audio = event.target.files?.[0];
                      if (audio) audioActions.upload(questionId, audio);
                      event.target.value = "";
                    }}
                  />
                </label>
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">المرشحون</h4>
                  {audioCandidatesQuery.isLoading && (
                    <p className="text-sm text-muted-foreground">
                      جاري تحميل المرشحين...
                    </p>
                  )}
                  {(
                    audioCandidatesQuery.data ??
                    question.audioCandidates ??
                    []
                  ).map((candidate) => (
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
                          audioActions.isPending ||
                          candidate.status === "selected"
                        }
                        onClick={() =>
                          audioActions.selectCandidate(questionId, candidate.id)
                        }
                      >
                        {candidate.status === "selected"
                          ? "محدد"
                          : "اختيار ومعالجة"}
                      </Button>
                    </div>
                  ))}
                  {!audioCandidatesQuery.isLoading &&
                    (
                      audioCandidatesQuery.data ??
                      question.audioCandidates ??
                      []
                    ).length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        لا توجد مرشحات حالياً. احفظ إعدادات الطلب أو أعد البحث.
                      </p>
                    )}
                </div>
              </section>
            )}
          </CardContent>
        </Card>
      )}

      {!isTop10 && (
        <Card>
          <CardHeader>
            <CardTitle>الإعدادات</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <Select
              value={values.difficulty}
              onValueChange={(value) =>
                setValue("difficulty", value as FormData["difficulty"], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger aria-label="الصعوبة">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">سهل</SelectItem>
                <SelectItem value="medium">متوسط</SelectItem>
                <SelectItem value="hard">صعب</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={values.points}
              onValueChange={(value) =>
                setValue("points", value as FormData["points"], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger aria-label="النقاط">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="400">400</SelectItem>
                <SelectItem value="600">600</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={values.status}
              onValueChange={(value) =>
                setValue("status", value as FormData["status"], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger aria-label="الحالة">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="approved">معتمد</SelectItem>
                <SelectItem value="rejected">مرفوض</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      {isTop10 && (
        <Card>
          <CardHeader>
            <CardTitle>حالة السؤال</CardTitle>
          </CardHeader>
          <CardContent className="max-w-sm">
            <Select
              value={values.status}
              onValueChange={(value) =>
                setValue("status", value as FormData["status"], {
                  shouldDirty: true,
                })
              }
            >
              <SelectTrigger aria-label="الحالة">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="approved">معتمد</SelectItem>
                <SelectItem value="rejected">مرفوض</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      )}

      <label className="flex items-center gap-2">
        <input type="checkbox" {...register("isFreeGameQuestion")} />
        سؤال للعبة المجانية
      </label>
      <p className="text-xs text-muted-foreground">
        تتم مطابقة الإجابات المقبولة بعد التطبيع. يجب مراجعة اقتراحات الذكاء
        الاصطناعي قبل الحفظ.
      </p>
      {generationWarning && (
        <p role="alert" className="text-sm text-amber-300">
          {generationWarning}
        </p>
      )}
    </form>
  );
}
