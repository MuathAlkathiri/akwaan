"use client";

import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Info,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { ReviewCandidate } from "./types";
import {
  summarizeDeduplication,
  type DeduplicationSummary,
  type OverlapRequirement,
  type ParsedDeduplicationMatch,
} from "./deduplication-findings";

interface DeduplicationPanelProps {
  candidate: ReviewCandidate;
  onRescreen: () => Promise<void>;
  isRescreening: boolean;
  /** Overlap evidence the reviewer must acknowledge before approval. */
  overlapRequirements?: OverlapRequirement[];
  acknowledgedFingerprints?: ReadonlySet<string>;
  onToggleAcknowledgment?: (fingerprint: string, acknowledged: boolean) => void;
  acknowledgmentDisabled?: boolean;
  /** True when the requirements came from a server conflict, not saved findings. */
  overlapEvidenceRefreshed?: boolean;
}

const shortHash = (value?: string) =>
  value ? `${value.replace(/^ovl1:/, "").slice(0, 12)}…` : "—";

export function DeduplicationPanel({
  candidate,
  onRescreen,
  isRescreening,
  overlapRequirements = [],
  acknowledgedFingerprints,
  onToggleAcknowledgment,
  acknowledgmentDisabled = false,
  overlapEvidenceRefreshed = false,
}: DeduplicationPanelProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const summary: DeduplicationSummary = summarizeDeduplication(candidate.findings);

  const getStatusIcon = () => {
    switch (summary.category) {
      case "proven_duplicate":
        return <ShieldAlert className="size-5 shrink-0 text-rose-600" />;
      case "incomplete_verification":
        return <AlertTriangle className="size-5 shrink-0 text-orange-600" />;
      case "potential_overlap":
        return <AlertTriangle className="size-5 shrink-0 text-amber-600" />;
      case "clean":
      default:
        return <ShieldCheck className="size-5 shrink-0 text-emerald-600" />;
    }
  };

  const getCardBorderClass = () => {
    switch (summary.category) {
      case "proven_duplicate":
        return "border-rose-300 bg-rose-50/50";
      case "incomplete_verification":
        return "border-orange-300 bg-orange-50/50";
      case "potential_overlap":
        return "border-amber-300 bg-amber-50/50";
      case "clean":
      default:
        return "border-emerald-200 bg-emerald-50/40";
    }
  };

  return (
    <div
      data-testid="deduplication-panel"
      className={`rounded-xl border p-4 text-xs shadow-sm transition-colors ${getCardBorderClass()}`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          {getStatusIcon()}
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold text-foreground">
                فحص الهوية والتكرار
              </span>
              <span
                data-testid="deduplication-status-badge"
                className={`rounded-full border px-2.5 py-0.5 text-[11px] ${summary.badgeClass}`}
              >
                {summary.statusLabelAr}
              </span>
            </div>
            <p
              data-testid="deduplication-description"
              className="text-muted-foreground leading-relaxed text-xs"
            >
              {summary.statusDescriptionAr}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="button-rescreen-candidate"
            disabled={isRescreening || Boolean(candidate.publishedContentItemId)}
            onClick={() => onRescreen()}
            className="h-8 gap-1.5 px-3 text-xs bg-white/90 hover:bg-white"
          >
            <RefreshCw
              className={`size-3.5 ${isRescreening ? "animate-spin text-amber-600" : ""}`}
            />
            {isRescreening ? "جارٍ الفحص..." : "إعادة فحص التكرار"}
          </Button>

          {(summary.matches.length > 0 || summary.incompleteFindings.length > 0) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-testid="button-toggle-match-evidence"
              onClick={() => setDetailsOpen(!detailsOpen)}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {detailsOpen ? (
                <>
                  <span>إخفاء الأدلة</span>
                  <ChevronUp className="size-3.5 ms-1" />
                </>
              ) : (
                <>
                  <span>عرض الأدلة ({summary.matches.length || summary.incompleteFindings.length})</span>
                  <ChevronDown className="size-3.5 ms-1" />
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {overlapRequirements.length > 0 && !candidate.publishedContentItemId && (
        <OverlapAcknowledgmentList
          candidateId={candidate.candidateId}
          requirements={overlapRequirements}
          acknowledged={acknowledgedFingerprints ?? new Set()}
          onToggle={onToggleAcknowledgment}
          disabled={acknowledgmentDisabled || !onToggleAcknowledgment}
          refreshed={overlapEvidenceRefreshed}
        />
      )}

      {/* Progressive Disclosure of Evidence / Incomplete diagnostics */}
      {detailsOpen && (
        <div
          data-testid="deduplication-evidence-container"
          className="mt-3 pt-3 border-t border-border/60 space-y-2.5"
        >
          {summary.incompleteFindings.length > 0 && (
            <div className="rounded-lg border border-orange-200 bg-orange-100/60 p-2.5 space-y-1">
              <span className="font-semibold text-orange-950 block">
                ملاحظات التحقق التاريخي غير المكتمل:
              </span>
              {summary.incompleteFindings.map((finding) => (
                <div
                  key={finding.code}
                  data-testid={`incomplete-finding-${finding.code}`}
                  className="text-orange-900 text-[11px] leading-relaxed"
                >
                  <span className="font-mono font-bold me-1.5">[{finding.code}]</span>
                  <span>{finding.message}</span>
                </div>
              ))}
            </div>
          )}

          {summary.matches.length > 0 && (
            <div className="space-y-2">
              <span className="font-semibold text-foreground block">
                سجل التطابق والشبهات المرصودة:
              </span>
              {summary.matches.map((match: ParsedDeduplicationMatch, idx: number) => (
                <div
                  key={`${match.code}-${idx}`}
                  data-testid={`match-evidence-item-${idx}`}
                  className="rounded-lg border bg-white/95 p-3 space-y-1.5 shadow-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[11px] font-semibold">
                        {match.code}
                      </span>
                      <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700">
                        {match.sourceLabelAr}
                      </span>
                    </div>
                    {match.referenceId && (
                      <span
                        data-testid={`match-ref-${match.referenceId}`}
                        className="font-mono text-muted-foreground text-[11px]"
                      >
                        معرّف المرجع: {match.referenceId}
                      </span>
                    )}
                  </div>

                  {match.scopeKey && (
                    <div className="text-[11px] text-muted-foreground">
                      <span className="font-medium">النطاق الخارجي: </span>
                      <span className="font-mono">{match.scopeKey}</span>
                    </div>
                  )}

                  <div className="text-xs text-foreground leading-relaxed">
                    <span className="font-semibold text-slate-800 me-1">السبب:</span>
                    <span>{match.reasonAr}</span>
                  </div>

                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-1 border-t border-border/40">
                    <Info className="size-3 shrink-0" />
                    <span>
                      تفاصيل السؤال والخيارات الكاملة للعنصر المرجعي غير محملة في هذا العرض لعدم استهلاك النطاق الترددي.
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function OverlapAcknowledgmentList({
  candidateId,
  requirements,
  acknowledged,
  onToggle,
  disabled,
  refreshed,
}: {
  candidateId: string;
  requirements: OverlapRequirement[];
  acknowledged: ReadonlySet<string>;
  onToggle?: (fingerprint: string, acknowledged: boolean) => void;
  disabled: boolean;
  refreshed: boolean;
}) {
  const done = requirements.filter((r) => acknowledged.has(r.fingerprint)).length;
  return (
    <section
      data-testid="overlap-acknowledgment-list"
      aria-labelledby="overlap-acknowledgment-heading"
      className="mt-3 space-y-2.5 border-t border-amber-200/80 pt-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-1.5">
        <h4
          id="overlap-acknowledgment-heading"
          className="text-xs font-bold text-amber-950"
        >
          إقرار المراجع بشبهات التقاطع (Overlap acknowledgment)
        </h4>
        <span
          data-testid="overlap-acknowledgment-progress"
          className="text-[11px] font-medium text-amber-900"
        >
          {done} / {requirements.length} مُقَرّ
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-amber-900">
        راجع كل تقاطع أدناه وأقرّ به منفرداً. لا يُفعَّل الاعتماد إلا بعد الإقرار بجميع التحذيرات الحالية،
        وأي دليل جديد أو متغيّر يتطلب إقراراً جديداً.
      </p>
      {refreshed && (
        <p
          role="status"
          data-testid="overlap-evidence-refreshed"
          className="rounded-md border border-amber-300 bg-amber-100 px-2.5 py-1.5 text-[11px] font-medium text-amber-950"
        >
          تغيّرت أدلة التقاطع على الخادم منذ آخر عرض. القائمة أدناه هي الأدلة الحالية كما أعادها الخادم؛
          أُلغي الإقرار بكل ما لم يعد مطابقاً.
        </p>
      )}
      <ul className="space-y-2">
        {requirements.map((requirement) => {
          const checked = acknowledged.has(requirement.fingerprint);
          const inputId = `overlap-ack-${requirement.fingerprint.slice(5, 21)}`;
          return (
            <li
              key={requirement.fingerprint}
              data-testid={`overlap-requirement-${requirement.referenceId}`}
              className={`rounded-lg border p-3 shadow-xs ${
                checked ? "border-emerald-300 bg-emerald-50/70" : "border-amber-300 bg-white/95"
              }`}
            >
              <dl className="grid gap-x-3 gap-y-1 text-[11px] sm:grid-cols-[auto_1fr]">
                <dt className="font-semibold text-slate-700">المرشح الحالي</dt>
                <dd className="break-all font-mono">{candidateId}</dd>
                <dt className="font-semibold text-slate-700">العنصر المرجعي</dt>
                <dd className="min-w-0">
                  <span className="me-1.5">{requirement.sourceLabelAr}</span>
                  <span className="break-all font-mono text-muted-foreground">
                    {requirement.referenceId}
                  </span>
                </dd>
                <dt className="font-semibold text-slate-700">سبب التقاطع</dt>
                <dd className="min-w-0">
                  {requirement.reasonAr ? (
                    <span className="me-1.5">{requirement.reasonAr}</span>
                  ) : null}
                  <span className="font-mono text-muted-foreground">
                    {requirement.reasonCode ?? requirement.code}
                  </span>
                </dd>
                <dt className="font-semibold text-slate-700">أدلة المقارنة</dt>
                <dd className="font-mono text-[10px] text-muted-foreground">
                  نسخة المرجع {shortHash(requirement.referenceContentHash)} · بصمة{" "}
                  {shortHash(requirement.fingerprint)}
                </dd>
              </dl>
              <div className="mt-2 flex items-start gap-2 border-t border-border/50 pt-2">
                <Checkbox
                  id={inputId}
                  data-testid={`overlap-ack-checkbox-${requirement.referenceId}`}
                  checked={checked}
                  disabled={disabled}
                  onCheckedChange={(value) =>
                    onToggle?.(requirement.fingerprint, value === true)
                  }
                  className="mt-0.5"
                />
                <label
                  htmlFor={inputId}
                  className="cursor-pointer text-xs font-medium leading-relaxed text-foreground"
                >
                  أقرّ بأنني راجعت هذا التقاطع وأن المرشح يقدّم تحدياً مختلفاً بما يكفي
                  (I acknowledge this overlap)
                </label>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
