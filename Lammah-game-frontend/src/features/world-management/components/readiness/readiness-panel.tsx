import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

import { ReadinessBadge } from "../shared";
import type { ReadinessReport } from "../../types";
import { localizeReadinessIssue } from "../../utils/readiness.util";

interface ReadinessPanelProps {
  report?: ReadinessReport;
  title?: string;
  readyMessage?: string;
}

/**
 * Renders the server's readiness verdict verbatim. The rules live in the backend
 * domain policies; this only shows what they decided.
 */
export function ReadinessPanel({
  report,
  title = "الجاهزية",
  readyMessage = "كل الشروط مكتملة.",
}: ReadinessPanelProps) {
  if (!report) return null;
  const { blockers, warnings } = report;

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <div className="flex items-center gap-2">
        <p className="text-sm font-semibold">{title}</p>
        <ReadinessBadge readiness={report.readiness} />
      </div>

      {!blockers.length && !warnings.length && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCircle2 className="size-4 text-green-600" />
          {readyMessage}
        </p>
      )}

      {blockers.map((issue) => (
        <p
          key={`${issue.code}-${issue.message}`}
          className="flex items-start gap-1.5 text-sm text-destructive"
        >
          <XCircle className="mt-0.5 size-4 shrink-0" />
          <span>{localizeReadinessIssue(issue)}</span>
        </p>
      ))}

      {warnings.map((issue) => (
        <p
          key={`${issue.code}-${issue.message}`}
          className="flex items-start gap-1.5 text-sm text-amber-700 dark:text-amber-400"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{localizeReadinessIssue(issue)}</span>
        </p>
      ))}
    </div>
  );
}
