"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCategories } from "@/features/categories";
import {
  useGenerateReviewedQuestions,
  useSaveReviewedDrafts,
} from "../hooks/use-ai-generation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ReviewedQuestionDraft } from "../types/ai-generation.types";
import { getEntityId } from "@/lib/utils";
import { getMediaUrl } from "@/lib/api/media-url";
import { Input } from "@/components/ui/input";
import {
  AI_GENERATION_DEFAULTS,
  AI_GENERATION_DIFFICULTIES,
  AI_GENERATION_MAX_COUNT,
  aiGenerationFormSchema,
  type AIGenerationFormValues,
} from "../models/ai-generation-form";

const WORDING_ISSUE_LABELS: Record<string, string> = {
  QUESTION_TOO_LONG: "السؤال أطول من المناسب للعب",
  QUESTION_MULTIPLE_IDEAS: "السؤال يحتوي أكثر من فكرة",
  QUESTION_ACADEMIC_STYLE: "صياغة أكاديمية",
  QUESTION_CONTAINS_EXPLANATION: "يتضمن شرحًا داخل السؤال",
  QUESTION_CONTAINS_PARENTHESES: "يتضمن تفاصيل بين قوسين",
  QUESTION_VAGUE: "السؤال مختصر أو مبهم",
  QUESTION_ANSWER_LEAKAGE: "قد يكشف الإجابة",
};

const VOICE_ASSET_FAILURE_LABELS: Record<string, string> = {
  VOICE_NO_SPEECH_WINDOW:
    "تم العثور على فيديو مرتبط بالشخصية، لكن لم يتم العثور على جزء صوتي واضح.",
  VOICE_MUSIC_DOMINANT_WINDOWS:
    "تم رفض النتائج لأنها تحتوي موسيقى أو مونتاج بدل حوار.",
  VOICE_ALL_WINDOWS_SILENT: "تم تجربة عدة مقاطع ولم يتم العثور على كلام مناسب.",
  VOICE_CLIP_EXTRACTION_FAILED: "فشل استخراج المقطع الصوتي.",
  VOICE_NO_VALID_VIDEO_AFTER_SEARCH:
    "لم يظهر مقطع صوتي واضح ومرتبط بالشخصية في نتائج البحث.",
  VOICE_VIDEO_MUSIC_METADATA:
    "تم رفض النتائج لأنها تحتوي موسيقى أو مونتاج بدل حوار.",
  VOICE_ENTITY_EVIDENCE_MISSING: "لم يظهر اسم الشخصية بوضوح في نتائج البحث.",
  MUSIC_TITLE_REQUIRED: "عنوان الأغنية مطلوب.",
  MUSIC_ARTIST_REQUIRED: "اسم الفنان مطلوب للتحقق من الأغنية.",
  MUSIC_SONG_NOT_VERIFIED: "الأغنية غير موجودة في مصدر المعرفة الموثوق.",
  MUSIC_NO_VALID_YOUTUBE_ASSET:
    "لم يتم العثور على مقطع يطابق عنوان الأغنية والفنان.",
  MUSIC_TITLE_ARTIST_MISMATCH: "تم رفض نتيجة لا تطابق الأغنية والفنان معًا.",
  MUSIC_NO_VALID_WINDOW: "لم يتم العثور على جزء موسيقي واضح داخل المقطع.",
};

const localizedAssetFailure = (diagnostics: unknown, fallback?: string) => {
  const serialized = JSON.stringify(diagnostics ?? {});
  const code = Object.keys(VOICE_ASSET_FAILURE_LABELS).find((candidate) =>
    serialized.includes(candidate),
  );
  return (code && VOICE_ASSET_FAILURE_LABELS[code]) || fallback;
};

const countQuestionWords = (value: string) =>
  value.trim().match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu)?.length ?? 0;

export function AIGenerator() {
  const { data: categoriesData, isLoading: categoriesLoading } =
    useCategories();
  const generateQuestions = useGenerateReviewedQuestions();
  const saveDrafts = useSaveReviewedDrafts();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [settings, setSettings] = useState<AIGenerationFormValues>(
    AI_GENERATION_DEFAULTS,
  );
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [generatedQuestions, setGeneratedQuestions] = useState<
    ReviewedQuestionDraft[]
  >([]);
  const categories = categoriesData || [];
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const generationBackendMessage =
    generateQuestions.error?.response?.data.message;
  const generationErrorPayload = generateQuestions.error?.response?.data;
  const generationErrorMessage = generateQuestions.error
    ? generateQuestions.error.code === "ECONNABORTED"
      ? "انتهت مهلة التوليد. تأكد من تشغيل LM Studio وتحميل النموذج، أو جرّب عددًا أقل."
      : Array.isArray(generationBackendMessage)
        ? generationBackendMessage.join("، ")
        : generationBackendMessage ||
          "تعذر توليد الأسئلة. تأكد من توفر مزود الذكاء الاصطناعي ثم حاول مجددًا."
    : null;
  const saveBackendMessage = saveDrafts.error?.response?.data.message;
  const saveErrorMessage = saveDrafts.error
    ? Array.isArray(saveBackendMessage)
      ? saveBackendMessage.join("، ")
      : saveBackendMessage || "تعذر حفظ المسودات. حاول مجددًا."
    : null;
  const settingsValid = aiGenerationFormSchema.safeParse(settings).success;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (generatedQuestions.length > saved.size) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [generatedQuestions.length, saved.size]);

  const handleGenerate = async () => {
    if (!selectedCategory) return;
    const parsedSettings = aiGenerationFormSchema.safeParse(settings);
    if (!parsedSettings.success) {
      setSettingsError(
        parsedSettings.error.issues[0]?.message ?? "تحقق من إعدادات التوليد",
      );
      return;
    }
    setSettingsError(null);

    try {
      const result = await generateQuestions.mutateAsync({
        categoryId: selectedCategory,
        ...parsedSettings.data,
      });
      setGeneratedQuestions(result.data.questions || []);
      setSelected(
        new Set((result.data.questions || []).map((_, index) => index)),
      );
      setSaved(new Set());
    } catch (error) {
      console.error("Failed to generate reviewed questions:", error);
    }
  };

  const handleSave = async (indices: number[]) => {
    const unsaved = indices.filter((index) => !saved.has(index));
    if (!selectedCategory || !unsaved.length) return;
    const result = await saveDrafts.mutateAsync({
      drafts: unsaved.map((index) => generatedQuestions[index]),
      categoryId: selectedCategory,
    });
    const failed = new Set(
      (result.failures || []).map(
        (failure: { index: number }) => unsaved[failure.index],
      ),
    );
    setSaved(
      new Set([...saved, ...unsaved.filter((index) => !failed.has(index))]),
    );
  };

  const renderAsset = (question: ReviewedQuestionDraft) => {
    if (question.assetStatus === "NOT_REQUIRED") {
      return null;
    }

    if (question.assetStatus === "PENDING") {
      return (
        <div className="rounded-2xl border border-dashed border-primary/25 bg-primary/10 p-4 text-sm">
          جاري تجهيز الملف...
        </div>
      );
    }

    if (question.assetStatus === "FAILED") {
      return (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">فشل تجهيز الملف</p>
          {question.assetFailureStep && (
            <p className="mt-1">الخطوة: {question.assetFailureStep}</p>
          )}
          <p className="mt-1 break-words">
            {localizedAssetFailure(
              question.assetFailureDiagnostics,
              question.assetFailureReason || "لم يتم إرجاع سبب الفشل.",
            )}
          </p>
          {question.assetFailureDiagnostics && (
            <details className="mt-2 text-xs text-foreground">
              <summary className="cursor-pointer">التفاصيل التقنية</summary>
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-background/60 p-2">
                {JSON.stringify(question.assetFailureDiagnostics, null, 2)}
              </pre>
            </details>
          )}
        </div>
      );
    }

    if (!question.asset?.url) {
      return (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          الملف جاهز حسب الحالة، لكن رابط الملف غير موجود.
        </div>
      );
    }

    const assetUrl = getMediaUrl(question.asset.url);

    if (question.type === "audio") {
      return (
        <audio controls className="w-full">
          <source src={assetUrl} />
        </audio>
      );
    }

    if (question.type === "video") {
      return (
        <video
          controls
          preload="metadata"
          className="max-h-72 w-full rounded-2xl object-contain"
          src={assetUrl}
        />
      );
    }

    if (question.type === "image") {
      return (
        <Image
          src={assetUrl}
          alt="Question asset"
          width={960}
          height={540}
          unoptimized
          className="max-h-72 w-full rounded-2xl object-contain"
        />
      );
    }

    return (
      <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4 text-sm">
        الملف جاهز:{" "}
        <a className="underline" href={assetUrl} target="_blank">
          فتح الملف
        </a>
      </div>
    );
  };

  const renderVerification = (question: ReviewedQuestionDraft) => {
    const verification =
      question.verificationDiagnostics ??
      (question.aiMetadata?.verificationDiagnostics as
        Record<string, unknown> | undefined);
    if (!verification) return null;
    return (
      <details className="rounded-2xl border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">
          تحقق Wigolo: {String(verification.verificationStatus ?? "-")}
        </summary>
        <div className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
          <p>الكيان: {String(verification.canonicalEntity ?? "-")}</p>
          <p>الإجابة: {String(verification.canonicalAnswer ?? "-")}</p>
          <p>
            الثقة:{" "}
            {Math.round(Number(verification.overallConfidence ?? 0) * 100)}%
          </p>
          <p>المصادر: {String(verification.evidenceSourceCount ?? 0)}</p>
          <p>
            الذاكرة:{" "}
            {verification.verificationCacheHit ? "نتيجة محفوظة" : "بحث جديد"}
          </p>
          {verification.canonicalArtist ? (
            <p>الفنان: {String(verification.canonicalArtist)}</p>
          ) : null}
          {verification.canonicalSongTitle ? (
            <p>الأغنية: {String(verification.canonicalSongTitle)}</p>
          ) : null}
          {verification.verifiedFranchise ? (
            <p>العمل: {String(verification.verifiedFranchise)}</p>
          ) : null}
        </div>
      </details>
    );
  };

  const renderSourceProvenance = (question: ReviewedQuestionDraft) => {
    if (question.aiMetadata?.strategy !== "SOURCE_CURATED") return null;
    const source = question.aiMetadata.source as
      Record<string, unknown> | undefined;
    const curation = question.aiMetadata.curation as
      Record<string, unknown> | undefined;
    return (
      <details className="rounded-2xl border p-3 text-sm">
        <summary className="cursor-pointer font-semibold">
          مصدر السؤال والتحرير
        </summary>
        <div className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
          <p>المصدر: {String(source?.sourceId ?? "-")}</p>
          <p>معرّف السؤال: {String(source?.sourceQuestionId ?? "-")}</p>
          <p>فئة المصدر: {String(source?.sourceCategory ?? "-")}</p>
          <p>صعوبة المصدر: {String(source?.originalDifficulty ?? "-")}</p>
          <p>بصمة المصدر: {String(source?.fingerprint ?? "-")}</p>
          <p className="sm:col-span-2">
            السؤال الأصلي: {String(source?.originalQuestion ?? "-")}
          </p>
          <p>الإجابة الأصلية: {String(source?.originalCorrectAnswer ?? "-")}</p>
          <p>الإجابة المحررة: {question.correctAnswer}</p>
          <p>تطابق المعنى: {curation?.sameMeaning ? "نعم" : "لا"}</p>
          <p>ثبات الإجابة: {curation?.sameCorrectAnswer ? "نعم" : "لا"}</p>
        </div>
      </details>
    );
  };

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden bg-gradient-to-br from-primary/10 via-white/[0.06] to-destructive/10">
        <CardHeader>
          <CardTitle className="text-3xl font-black">
            مصنع الأسئلة الذكي
          </CardTitle>
          <CardDescription>
            قم بتحديد فئة وسيقوم الذكاء الاصطناعي بإنشاء مسودات قابلة للمراجعة
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium">اختر فئة</label>
            <Select
              value={selectedCategory}
              onValueChange={setSelectedCategory}
              disabled={categoriesLoading}
            >
              <SelectTrigger aria-label="الفئة">
                <SelectValue
                  placeholder={
                    categoriesLoading ? "جاري تحميل الفئات..." : "اختر فئة"
                  }
                />
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
          </div>

          <fieldset className="rounded-2xl border border-primary/20 bg-background/40 p-4">
            <legend className="px-2 text-sm font-bold">إعدادات التوليد</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="ai-question-count"
                  className="mb-2 block text-sm font-medium"
                >
                  عدد الأسئلة
                </label>
                <Input
                  id="ai-question-count"
                  type="number"
                  min={1}
                  max={AI_GENERATION_MAX_COUNT}
                  step={1}
                  required
                  value={settings.count}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      count: event.target.valueAsNumber,
                    }))
                  }
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  يحدد عدد المسودات التي سينشئها الذكاء الاصطناعي.
                </p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">
                  الصعوبة
                </label>
                <Select
                  value={settings.difficulty}
                  onValueChange={(difficulty) =>
                    setSettings((current) => ({
                      ...current,
                      difficulty:
                        difficulty as AIGenerationFormValues["difficulty"],
                    }))
                  }
                >
                  <SelectTrigger aria-label="الصعوبة">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_GENERATION_DIFFICULTIES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {settingsError && (
              <p className="mt-3 text-sm text-destructive">{settingsError}</p>
            )}
          </fieldset>

          <Button
            size="lg"
            onClick={handleGenerate}
            disabled={
              !selectedCategory || !settingsValid || generateQuestions.isPending
            }
            className="w-full"
          >
            {generateQuestions.isPending
              ? "جاري التوليد..."
              : `توليد ${settingsValid ? settings.count : ""} أسئلة`}
          </Button>

          {generationErrorMessage && (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {generationErrorMessage}
            </p>
          )}
          {generationErrorPayload?.candidateDiagnostics?.length ? (
            <details className="rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <summary className="cursor-pointer font-semibold text-destructive">
                تشخيصات المرشحين المرفوضين
              </summary>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                {JSON.stringify(
                  {
                    issueCodes: generationErrorPayload.issueCodes,
                    sourceSummary: generationErrorPayload.sourceSummary,
                    sourceDiagnostics: generationErrorPayload.sourceDiagnostics,
                    candidateDiagnostics:
                      generationErrorPayload.candidateDiagnostics,
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
          ) : null}

          {saveErrorMessage && (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {saveErrorMessage}
            </p>
          )}

          {generatedQuestions.length > 0 && (
            <div className="mt-4 rounded-3xl border border-primary/20 bg-primary/10 p-4">
              <p className="text-sm text-muted-foreground">
                تم توليد {generatedQuestions.length} مسودات. لم يتم حفظها في
                قاعدة البيانات بعد.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() =>
                    handleSave(generatedQuestions.map((_, index) => index))
                  }
                  disabled={
                    saveDrafts.isPending ||
                    saved.size === generatedQuestions.length
                  }
                >
                  حفظ كل المسودات
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => handleSave([...selected])}
                  disabled={saveDrafts.isPending}
                >
                  حفظ المحدد
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setGeneratedQuestions([]);
                    setSelected(new Set());
                    setSaved(new Set());
                  }}
                >
                  تجاهل غير المحفوظ
                </Button>
                {saved.size > 0 && (
                  <Button asChild variant="outline">
                    <Link href="/admin/ai-generated">عرض الأسئلة المحفوظة</Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {generatedQuestions.length > 0 && (
        <div>
          <h2 className="mb-4 text-3xl font-black">المسودات المُولدة</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {generatedQuestions.map((question, index) => (
              <Card
                key={index}
                data-testid={`ai-draft-${index}`}
                className="overflow-hidden"
              >
                {question.coverImageStatus === "READY" &&
                question.coverImage?.url ? (
                  <Image
                    src={getMediaUrl(question.coverImage.url)}
                    alt="صورة غلاف السؤال"
                    width={960}
                    height={384}
                    unoptimized
                    className="h-48 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-48 items-center justify-center bg-muted text-sm text-muted-foreground">
                    تعذر تجهيز صورة الغلاف
                  </div>
                )}
                <CardHeader>
                  <label className="mb-2 flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.has(index)}
                      disabled={saved.has(index)}
                      onChange={(event) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          event.target.checked
                            ? next.add(index)
                            : next.delete(index);
                          return next;
                        })
                      }
                    />{" "}
                    {saved.has(index) ? "تم الحفظ" : "تحديد للحفظ"}
                  </label>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <CardTitle className="text-xl font-black leading-snug">
                        {question.question}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        الإجابة:{" "}
                        <span className="font-semibold">
                          {question.correctAnswer}
                        </span>
                      </p>
                      {question.musicMetadata && (
                        <p className="text-sm text-muted-foreground">
                          الفنان: {question.musicMetadata.artist}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{question.gameMode}</Badge>
                        <Badge variant="secondary">{question.type}</Badge>
                        <Badge
                          data-testid="primary-asset-status"
                          variant={
                            question.assetStatus === "FAILED"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          Primary{" "}
                          {question.primaryAssetStatus ?? question.assetStatus}
                        </Badge>
                        <Badge
                          data-testid="cover-asset-status"
                          variant={
                            question.coverImageStatus === "FAILED"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          Cover {question.coverImageStatus}
                        </Badge>
                        {question.assetFailureStep && (
                          <Badge variant="destructive">
                            {question.assetFailureStep}
                          </Badge>
                        )}
                        {question.wasGameplayAutoFixed && (
                          <Badge variant="secondary">
                            تم تعديل النوع تلقائيًا
                          </Badge>
                        )}
                        {question.issues.some(
                          (issue) =>
                            issue.startsWith("QUESTION_") &&
                            issue !== "QUESTION_WORDING_REPAIRED",
                        ) &&
                          !question.issues.includes(
                            "QUESTION_WORDING_REPAIRED",
                          ) && (
                            <Badge variant="destructive">
                              مراجعة صياغة السؤال
                            </Badge>
                          )}
                        {question.issues.includes(
                          "QUESTION_WORDING_REPAIRED",
                        ) && (
                          <Badge variant="secondary">تم اختصار السؤال</Badge>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline">مسودة</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 pt-0">
                  {renderVerification(question)}
                  {renderSourceProvenance(question)}
                  {renderAsset(question)}
                  {question.coverImageFailureReason && (
                    <p className="text-xs text-muted-foreground">
                      سبب فشل الغلاف: لم يتم العثور على صورة مناسبة بعد تجربة
                      البدائل المتاحة.
                    </p>
                  )}
                  {question.assetRequest && (
                    <details className="rounded-2xl bg-black/20 p-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer font-medium">
                        تفاصيل طلب الملف
                      </summary>
                      <pre className="mt-2 overflow-auto whitespace-pre-wrap">
                        {JSON.stringify(question.assetRequest, null, 2)}
                      </pre>
                    </details>
                  )}
                  {question.gameplayFixReason && (
                    <div className="rounded-2xl bg-primary/10 p-3 text-sm text-muted-foreground">
                      {question.gameplayFixReason}
                    </div>
                  )}
                  {question.explanation && (
                    <p className="text-sm text-muted-foreground">
                      الشرح: {question.explanation}
                    </p>
                  )}
                  {question.issues.length > 0 && (
                    <div className="rounded-2xl bg-destructive/10 p-3 text-sm text-destructive">
                      {question.issues
                        .map((issue) => WORDING_ISSUE_LABELS[issue] ?? issue)
                        .join("، ")}
                    </div>
                  )}
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      تفاصيل طول السؤال
                    </summary>
                    <p className="mt-2">
                      {countQuestionWords(question.question)} كلمة،{" "}
                      {question.question.length} حرفًا
                    </p>
                  </details>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
