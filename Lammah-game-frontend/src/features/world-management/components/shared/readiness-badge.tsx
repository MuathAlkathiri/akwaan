import { StatusBadge } from "@/components/shared";
import { getReadinessLabel, getReadinessTone } from "../../utils/readiness.util";
import type { ContentReadiness } from "../../types";

export function ReadinessBadge({
  readiness = "not_ready",
}: {
  readiness?: ContentReadiness;
}) {
  return (
    <StatusBadge tone={getReadinessTone(readiness)}>
      {getReadinessLabel(readiness)}
    </StatusBadge>
  );
}
