"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  useDeleteQuestion,
  usePatchQuestion,
  useQuestions,
  useUpdateQuestionStatus,
} from "../hooks/use-questions";
import {
  getStatusLabel,
  getDifficultyLabel,
  getEntityId,
  getQuestionTypeLabel,
} from "@/lib/utils";
import type { Question } from "@/types";
import {
  DeleteDialog,
  EmptyState,
  LoadingState,
  StatusBadge,
} from "@/components/shared";

interface QuestionsListProps {
  canPreview?: boolean;
  categoryId?: string;
  worldId?: string;
  contentCategoryId?: string;
  challengeTypeId?: string;
  emptyMessage?: string;
}

export function getAudioStateLabel(
  question: Pick<
    Question,
    "requiresAudio" | "audioStatus" | "audioReviewStatus"
  >,
) {
  if (!question.requiresAudio) return "لا يحتاج صوتاً";
  if (
    question.audioStatus === "ready" &&
    question.audioReviewStatus === "approved"
  )
    return "الصوت معتمد";
  const labels = {
    pending: "بانتظار البدء",
    searching: "جاري البحث",
    processing: "جاري المعالجة",
    ready: "جاهز للمراجعة",
    failed: "فشل التجهيز",
    rejected: "مرفوض",
    not_required: "لا يحتاج صوتاً",
  } as const;
  return labels[question.audioStatus ?? "pending"];
}

export function getCurrentQuestionMediaUrl(
  question: Pick<
    Question,
    "type" | "audioRequestStale" | "audioAsset" | "mediaUrl" | "asset"
  >,
) {
  if (["audio", "video"].includes(question.type) && question.audioRequestStale)
    return undefined;
  return question.audioAsset?.url || question.mediaUrl || question.asset?.url;
}

export function getAudioRetryModes(
  question: Pick<Question, "audioRequest">,
): Array<"research" | "retryProcessing"> {
  return question.audioRequest?.selectedCandidateId
    ? ["research", "retryProcessing"]
    : ["research"];
}

function getQuestionCategoryId(question: Question) {
  if (question.category && typeof question.category === "object")
    return getEntityId(question.category);
  if (typeof question.category === "string") return question.category;
  return question.categoryId;
}

export function QuestionsList({
  canPreview = false,
  categoryId,
  worldId,
  contentCategoryId,
  challengeTypeId,
  emptyMessage = "لا توجد أسئلة",
}: QuestionsListProps) {
  const { data, isLoading, error } = useQuestions();
  const updateQuestionStatus = useUpdateQuestionStatus();
  const patchQuestion = usePatchQuestion();
  const deleteQuestion = useDeleteQuestion();
  const questions = (data || []).filter((question) => {
    if (categoryId && getQuestionCategoryId(question) !== categoryId)
      return false;
    if (worldId && question.worldId !== worldId) return false;
    if (contentCategoryId && question.contentCategoryId !== contentCategoryId)
      return false;
    if (challengeTypeId && question.challengeTypeId !== challengeTypeId)
      return false;
    return true;
  });

  if (isLoading) return <LoadingState count={4} />;
  if (error) return <EmptyState title="تعذر تحميل الأسئلة" />;
  if (!questions.length) return <EmptyState title={emptyMessage} />;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {questions.map((question) => {
        const id = getEntityId(question);
        return (
          <Card key={id}>
            <CardHeader className="pb-3">
              <div className="flex flex-col gap-4">
                <div className="flex-1">
                  <CardTitle className="text-xl font-black leading-snug">
                    {question.question}
                  </CardTitle>
                  {question.questionType === "standard" && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      الإجابة:{" "}
                      <span className="font-semibold">{question.answer}</span>
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {question.points !== undefined && (
                    <Badge variant="secondary">{question.points}</Badge>
                  )}
                  {(question.questionType === "ranked_list" ||
                    question.difficulty !== undefined) && (
                    <Badge variant="outline">
                      {question.questionType === "ranked_list"
                        ? "Top 10"
                        : getDifficultyLabel(question.difficulty!)}
                    </Badge>
                  )}
                  {question.questionType === "bomb_sequence" && (
                    <Badge>
                      Bomb · {question.bombContent?.items.length ?? 0} عناصر
                    </Badge>
                  )}
                  <Badge variant="outline">
                    {getQuestionTypeLabel(question.type)}
                  </Badge>
                  <Badge variant="outline">
                    {question.source === "ai" ? "AI" : "يدوي"}
                  </Badge>
                  {question.isFreeGameQuestion && <Badge>لعبة مجانية</Badge>}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {canPreview && (
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/admin/questions/${id}/edit`}>
                      تحرير السؤال
                    </Link>
                  </Button>
                )}
                {question.status === "draft" && (
                  <>
                    <Button
                      size="sm"
                      onClick={() =>
                        updateQuestionStatus.mutate({
                          id,
                          status: "approved",
                        })
                      }
                      disabled={updateQuestionStatus.isPending}
                    >
                      موافق عليه
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        updateQuestionStatus.mutate({
                          id,
                          status: "rejected",
                        })
                      }
                      disabled={updateQuestionStatus.isPending}
                    >
                      مرفوض
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    patchQuestion.mutate({
                      id,
                      data: {
                        isFreeGameQuestion: !question.isFreeGameQuestion,
                      },
                    })
                  }
                  disabled={patchQuestion.isPending}
                >
                  {question.isFreeGameQuestion
                    ? "إلغاء المجانية"
                    : "اجعله مجاني"}
                </Button>
                <DeleteDialog
                  itemName="السؤال"
                  disabled={deleteQuestion.isPending}
                  onDelete={() => deleteQuestion.mutate(id)}
                  trigger={
                    <Button size="sm" variant="destructive">
                      حذف
                    </Button>
                  }
                />
                <StatusBadge>{getStatusLabel(question.status)}</StatusBadge>
                {question.requiresAudio && (
                  <Badge variant="outline">
                    {getAudioStateLabel(question)}
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
