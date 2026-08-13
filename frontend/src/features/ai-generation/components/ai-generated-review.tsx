"use client";

import { useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useDeleteQuestion,
  usePatchQuestion,
  useUpdateQuestionStatus,
} from "@/features/questions";
import {
  useAiBulkAction,
  useAiGenerated,
  useRetryQuestionAsset,
} from "../hooks/use-ai-generation";
import { getMediaUrl } from "@/lib/api/media-url";
import { getEntityId } from "@/lib/utils";
import { Question } from "@/types";

const wordingIssueLabels: Record<string, string> = {
  QUESTION_TOO_LONG: "السؤال طويل",
  QUESTION_MULTIPLE_IDEAS: "أكثر من فكرة",
  QUESTION_ACADEMIC_STYLE: "صياغة أكاديمية",
  QUESTION_CONTAINS_EXPLANATION: "شرح داخل السؤال",
  QUESTION_CONTAINS_PARENTHESES: "تفاصيل بين قوسين",
  QUESTION_VAGUE: "السؤال مبهم",
  QUESTION_ANSWER_LEAKAGE: "قد يكشف الإجابة",
};

const voiceAssetFailureLabels: Record<string, string> = {
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
  const code = Object.keys(voiceAssetFailureLabels).find((candidate) =>
    serialized.includes(candidate),
  );
  return (code && voiceAssetFailureLabels[code]) || fallback;
};

export function AiGeneratedReview() {
  const [filters, setFilters] = useState<Record<string, string>>({
    status: "draft",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data = [], isLoading } = useAiGenerated(filters);
  const statusMutation = useUpdateQuestionStatus();
  const patch = usePatchQuestion();
  const remove = useDeleteQuestion();
  const retry = useRetryQuestionAsset();
  const bulk = useAiBulkAction();
  const setFilter = (key: string, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const runBulk = (action: "approve" | "reject" | "delete") => {
    if (
      !selected.size ||
      (action === "delete" && !confirm("حذف الأسئلة المحددة نهائيًا؟"))
    )
      return;
    bulk.mutate(
      { ids: [...selected], action },
      { onSuccess: () => setSelected(new Set()) },
    );
  };
  const edit = (question: Question) => {
    const text = prompt("نص السؤال", question.question);
    if (!text) return;
    const answer = prompt(
      "الإجابة الصحيحة",
      question.correctAnswer || question.answer,
    );
    if (!answer) return;
    const wrongAnswers = prompt(
      "الإجابات الخاطئة، مفصولة بفاصلة",
      (question.wrongAnswers || []).join(", "),
    )
      ?.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const explanation =
      prompt("الشرح", question.explanation || "") ?? question.explanation;
    const difficulty = prompt(
      "الصعوبة: easy / medium / hard",
      question.difficulty,
    ) as Question["difficulty"] | null;
    const points = Number(
      prompt("النقاط: 200 / 400 / 600", String(question.points)),
    );
    const gameMode = prompt("Game mode", question.gameMode || "trivia") as
      Question["gameMode"] | null;
    patch.mutate({
      id: getEntityId(question),
      data: {
        question: text,
        answer,
        correctAnswer: answer,
        wrongAnswers,
        explanation,
        ...(difficulty ? { difficulty } : {}),
        ...([200, 400, 600].includes(points) ? { points, score: points } : {}),
        ...(gameMode ? { gameMode } : {}),
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">
          الأسئلة المولدة بالذكاء الاصطناعي
        </h1>
        <p className="text-muted-foreground">
          مراجعة المسودات المحفوظة قبل النشر.
        </p>
      </div>
      <Card>
        <CardContent className="grid gap-3 pt-6 md:grid-cols-4">
          <input
            className="rounded-xl bg-background p-3"
            placeholder="بحث"
            onChange={(e) => setFilter("search", e.target.value)}
          />
          {[
            ["status", "draft,approved,rejected,published,archived"],
            ["difficulty", "easy,medium,hard"],
            [
              "gameMode",
              "trivia,identifyCharacter,identifyVoice,identifyImage,completeQuote,timeline,emojiPuzzle,identifySong,identifySinger,identifyMusicIntro",
            ],
            ["assetStatus", "READY,FAILED,NOT_REQUIRED"],
          ].map(([key, values]) => (
            <select
              key={key}
              className="rounded-xl bg-background p-3"
              value={filters[key] || ""}
              onChange={(e) => setFilter(key, e.target.value)}
            >
              <option value="">{key}</option>
              {values.split(",").map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          ))}
          <input
            className="rounded-xl bg-background p-3"
            placeholder="Category ID"
            onChange={(e) => setFilter("category", e.target.value)}
          />
          <input
            className="rounded-xl bg-background p-3"
            placeholder="Catalog ID"
            onChange={(e) => setFilter("catalog", e.target.value)}
          />
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => runBulk("approve")}>اعتماد المحدد</Button>
        <Button variant="secondary" onClick={() => runBulk("reject")}>
          رفض المحدد
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            data
              .filter((question) => selected.has(getEntityId(question)))
              .forEach((question) => {
                const id = getEntityId(question);
                if (question.assetStatus === "FAILED")
                  retry.mutate({ id, target: "primary" });
                if (question.coverImageStatus === "FAILED")
                  retry.mutate({ id, target: "cover" });
              })
          }
        >
          إعادة الملفات الفاشلة
        </Button>
        <Button variant="destructive" onClick={() => runBulk("delete")}>
          حذف المحدد
        </Button>
      </div>
      {isLoading ? (
        <p>جاري التحميل...</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {data.map((question) => {
            const id = getEntityId(question);
            const cover = question.coverImage?.url;
            const primary = question.primaryAsset?.url || question.mediaUrl;
            const wordingIssues = (question.issues ?? []).filter(
              (issue) => wordingIssueLabels[issue],
            );
            const wordingRepaired = (question.issues ?? []).includes(
              "QUESTION_WORDING_REPAIRED",
            );
            const verification =
              question.aiMetadata &&
              typeof question.aiMetadata.verificationDiagnostics === "object"
                ? (question.aiMetadata.verificationDiagnostics as Record<
                    string,
                    unknown
                  >)
                : undefined;
            return (
              <Card key={id} className="overflow-hidden">
                {cover ? (
                  <Image
                    src={getMediaUrl(cover)}
                    alt="غلاف السؤال"
                    width={960}
                    height={352}
                    unoptimized
                    className="h-44 w-full object-cover"
                  />
                ) : (
                  <div className="flex h-44 items-center justify-center bg-muted text-muted-foreground">
                    لا توجد صورة غلاف
                  </div>
                )}
                <CardHeader>
                  <label className="flex gap-2">
                    <input
                      type="checkbox"
                      checked={selected.has(id)}
                      onChange={(e) =>
                        setSelected((current) => {
                          const next = new Set(current);
                          e.target.checked ? next.add(id) : next.delete(id);
                          return next;
                        })
                      }
                    />{" "}
                    تحديد
                  </label>
                  <CardTitle>{question.question}</CardTitle>
                  <p>الإجابة: {question.correctAnswer || question.answer}</p>
                  {question.primaryAssetRequest?.artist && (
                    <p>الفنان: {question.primaryAssetRequest.artist}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Badge>{question.status}</Badge>
                    <Badge variant="outline">{question.difficulty}</Badge>
                    <Badge variant="outline">{question.gameMode}</Badge>
                    <Badge variant="outline">
                      Primary {question.assetStatus}
                    </Badge>
                    <Badge variant="outline">
                      Cover {question.coverImageStatus}
                    </Badge>
                    <Badge variant="secondary">
                      Quality {question.qualityScore ?? "-"}
                    </Badge>
                    {wordingIssues.length > 0 && (
                      <Badge variant="destructive">مراجعة الصياغة</Badge>
                    )}
                    {wordingRepaired && (
                      <Badge variant="secondary">تم اختصار السؤال</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {verification && (
                    <details className="rounded-lg border p-3 text-sm">
                      <summary className="cursor-pointer font-semibold">
                        تحقق Wigolo:{" "}
                        {String(verification.verificationStatus ?? "-")}
                      </summary>
                      <div className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
                        <p>
                          الكيان: {String(verification.canonicalEntity ?? "-")}
                        </p>
                        <p>
                          الإجابة: {String(verification.canonicalAnswer ?? "-")}
                        </p>
                        <p>
                          الثقة:{" "}
                          {Math.round(
                            Number(verification.overallConfidence ?? 0) * 100,
                          )}
                          %
                        </p>
                        <p>
                          المصادر:{" "}
                          {String(verification.evidenceSourceCount ?? 0)}
                        </p>
                        <p>
                          الذاكرة:{" "}
                          {verification.verificationCacheHit
                            ? "نتيجة محفوظة"
                            : "بحث جديد"}
                        </p>
                        {verification.canonicalArtist ? (
                          <p>الفنان: {String(verification.canonicalArtist)}</p>
                        ) : null}
                        {verification.canonicalSongTitle ? (
                          <p>
                            الأغنية: {String(verification.canonicalSongTitle)}
                          </p>
                        ) : null}
                        {verification.verifiedFranchise ? (
                          <p>العمل: {String(verification.verifiedFranchise)}</p>
                        ) : null}
                      </div>
                    </details>
                  )}
                  {wordingIssues.length > 0 && (
                    <p className="text-sm text-destructive">
                      {wordingIssues
                        .map((issue) => wordingIssueLabels[issue])
                        .join("، ")}
                    </p>
                  )}
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">
                      تفاصيل طول السؤال
                    </summary>
                    <p className="mt-2">
                      {
                        question.question.trim().split(/\s+/).filter(Boolean)
                          .length
                      }{" "}
                      كلمة، {question.question.length} حرفًا
                    </p>
                  </details>
                  {primary &&
                    (question.type === "audio" ? (
                      <audio
                        controls
                        className="w-full"
                        src={getMediaUrl(primary)}
                      />
                    ) : question.type === "video" ? (
                      <video
                        controls
                        preload="metadata"
                        className="max-h-64 w-full object-contain"
                        src={getMediaUrl(primary)}
                      />
                    ) : (
                      <Image
                        src={getMediaUrl(primary)}
                        alt="الملف الأساسي"
                        width={960}
                        height={540}
                        unoptimized
                        className="max-h-64 w-full object-contain"
                      />
                    ))}
                  {question.issues?.length ? (
                    <p className="text-sm text-destructive">
                      {question.issues.join("، ")}
                    </p>
                  ) : null}
                  {question.assetFailureReason && (
                    <p className="text-sm text-destructive">
                      {localizedAssetFailure(
                        question.assetFailureDiagnostics,
                        question.assetFailureReason,
                      )}
                    </p>
                  )}
                  {question.assetFailureDiagnostics && (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">
                        التفاصيل التقنية للملف
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-2">
                        {JSON.stringify(
                          question.assetFailureDiagnostics,
                          null,
                          2,
                        )}
                      </pre>
                    </details>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => edit(question)}
                    >
                      عرض / تعديل
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        statusMutation.mutate({ id, status: "approved" })
                      }
                    >
                      اعتماد
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        statusMutation.mutate({ id, status: "rejected" })
                      }
                    >
                      رفض
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => retry.mutate({ id, target: "primary" })}
                    >
                      إعادة الملف الأساسي
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => retry.mutate({ id, target: "cover" })}
                    >
                      إعادة الغلاف
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        confirm("حذف السؤال؟") && remove.mutate(id)
                      }
                    >
                      حذف
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
