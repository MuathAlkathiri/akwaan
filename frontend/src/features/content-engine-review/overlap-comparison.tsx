"use client";

import { useEffect, useState } from "react";
import type { ContentAnswerPayload } from "@/features/world-management/types";
import * as api from "./api";
import type { OverlapRequirement } from "./deduplication-findings";
import type { ReviewCandidate } from "./types";

type ComparisonContent = {
  prompt?: { ar?: string; en?: string };
  answerPayload?: ContentAnswerPayload;
  mechanic?: string;
  scope?: string;
  status?: string;
};

function answerText(answer?: ContentAnswerPayload): string {
  if (!answer) return "الإجابة غير متاحة";
  if (answer.mode === "vote") return "تصويت: لا توجد إجابة صحيحة محددة";
  if (answer.correctOptionId) {
    const option = answer.options?.find(
      (item) => item.id === answer.correctOptionId,
    );
    return (
      option?.label?.ar ?? option?.label?.en ?? "الإجابة الصحيحة غير متاحة"
    );
  }
  if (answer.correctValue != null) return String(answer.correctValue);
  if (answer.acceptedAnswers?.length) return answer.acceptedAnswers.join("، ");
  return "تعذر عرض الإجابة هنا؛ راجع المحتوى الأصلي";
}

function candidateContent(candidate: ReviewCandidate): ComparisonContent {
  return {
    prompt: candidate.draft?.prompt,
    answerPayload: candidate.draft?.answerPayload,
    mechanic:
      candidate.canonicalTarget?.challengeTypeName ??
      candidate.job?.mechanicKey,
    scope: candidate.canonicalTarget?.scopeName ?? candidate.job?.scopeKey,
    status: candidate.reviewStatus,
  };
}

async function loadReference(
  referenceKind: string,
  referenceId: string,
): Promise<ComparisonContent> {
  if (
    referenceKind === "BATCH_CANDIDATE" ||
    referenceKind === "APPROVED_CANDIDATE"
  ) {
    return candidateContent(await api.getCandidate(referenceId));
  }
  if (
    referenceKind !== "CANONICAL_READY" &&
    referenceKind !== "CANONICAL_DRAFT"
  ) {
    throw new Error("Unsupported reference");
  }
  const item = await api.getOverlapContentItem(referenceId);
  const [scope, ...mechanics] = await Promise.allSettled([
    api.getOverlapScope(item.scopeId),
    ...item.compatibleChallengeTypeIds.map(api.getOverlapMechanic),
  ]);
  return {
    prompt: item.prompt,
    answerPayload: item.answerPayload,
    scope: scope.status === "fulfilled" ? scope.value.name : undefined,
    mechanic:
      mechanics
        .flatMap((entry) =>
          entry.status === "fulfilled" ? [entry.value.name] : [],
        )
        .join("، ") || undefined,
    status: item.status,
  };
}

const statusLabel = (status?: string) =>
  ({
    ready: "جاهز",
    draft: "مسودة",
    archived: "مؤرشف",
    pending: "بانتظار المراجعة",
    approved: "معتمد",
    rejected: "مرفوض",
  })[status?.toLowerCase() ?? ""] ?? "غير متاحة";

function ContentColumn({
  title,
  content,
}: {
  title: string;
  content: ComparisonContent;
}) {
  return (
    <section
      className="min-w-0 space-y-2 rounded-md bg-slate-50 p-3"
      aria-label={title}
    >
      <h5 className="text-sm font-bold text-foreground">{title}</h5>
      <dl className="space-y-2 text-xs leading-relaxed">
        <div>
          <dt className="font-semibold">السؤال</dt>
          <dd className="whitespace-pre-wrap break-words">
            {content.prompt?.ar ?? content.prompt?.en ?? "السؤال غير متاح"}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">الإجابة</dt>
          <dd className="break-words">{answerText(content.answerPayload)}</dd>
        </div>
        {content.answerPayload?.options?.length ? (
          <div>
            <dt className="font-semibold">الخيارات</dt>
            <dd>
              <ul className="list-inside list-disc">
                {content.answerPayload.options.map((option, index) => (
                  <li key={option.id ?? index}>
                    {option.label?.ar ?? option.label?.en ?? "خيار غير متاح"}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}
        <div>
          <dt className="font-semibold">آلية اللعب</dt>
          <dd>{content.mechanic || "غير متاحة"}</dd>
        </div>
        <div>
          <dt className="font-semibold">النطاق</dt>
          <dd>{content.scope || "غير متاح"}</dd>
        </div>
        <div>
          <dt className="font-semibold">الحالة</dt>
          <dd>{statusLabel(content.status)}</dd>
        </div>
      </dl>
    </section>
  );
}

export function OverlapComparison({
  candidate,
  requirement,
  proven = false,
}: {
  candidate: ReviewCandidate;
  requirement: OverlapRequirement;
  proven?: boolean;
}) {
  const [reference, setReference] = useState<
    ComparisonContent | null | undefined
  >(undefined);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setReference(undefined);
    loadReference(requirement.referenceKind, requirement.referenceId).then(
      (value) => {
        if (active) setReference(value);
      },
      () => {
        if (active) setReference(null);
      },
    );
    return () => {
      active = false;
    };
  }, [requirement.referenceId, requirement.referenceKind, attempt]);

  return (
    <>
      <p className="mb-3 text-xs leading-relaxed text-amber-950">
        {proven
          ? "رصد النظام تطابقاً مؤكداً؛ هذا التكرار يمنع الاعتماد."
          : requirement.reasonCode === "UNSUPPORTED_MECHANIC_COMPARISON"
            ? "المقارنة الآلية غير حاسمة لهذه الآلية؛ لم يثبت وجود تكرار. قارن المحتوى يدوياً."
            : requirement.reasonAr &&
                /[\u0600-\u06ff]/.test(requirement.reasonAr)
              ? requirement.reasonAr
              : "رصد النظام احتمال تقاطع يحتاج إلى مراجعة بشرية؛ ليس تكراراً مؤكداً."}
      </p>
      {!proven &&
        requirement.reasonCode !== "UNSUPPORTED_MECHANIC_COMPARISON" && (
          <p className="mb-3 text-xs text-amber-950">
            هذا تحذير يتطلب مراجعة بشرية، وليس تكراراً مؤكداً.
          </p>
        )}
      <div
        className="grid gap-3 md:grid-cols-2"
        data-testid="overlap-comparison"
      >
        <ContentColumn
          title="المرشح الجديد"
          content={candidateContent(candidate)}
        />
        {reference ? (
          <ContentColumn title="المحتوى المرجعي" content={reference} />
        ) : (
          <section
            className="rounded-md bg-slate-50 p-3 text-xs"
            aria-label="المحتوى المرجعي"
            role="status"
          >
            <h5 className="mb-2 text-sm font-bold">المحتوى المرجعي</h5>
            {reference === undefined ? (
              "جارٍ تحميل المحتوى المرجعي..."
            ) : (
              <>
                <p>
                  تعذر تحميل المحتوى المرجعي. تحقق من الصلاحية قبل اتخاذ القرار.
                </p>
                <button
                  type="button"
                  className="mt-2 underline focus-visible:outline focus-visible:outline-2"
                  onClick={() => setAttempt((value) => value + 1)}
                >
                  إعادة محاولة تحميل المرجع
                </button>
              </>
            )}
          </section>
        )}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        تُعرض النسخة الحالية من المرجع؛ يعيد الخادم التحقق من الأدلة عند
        الاعتماد أو إنشاء المسودة.
      </p>
    </>
  );
}
