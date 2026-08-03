import { Badge } from "@/components/ui/badge";
import { STATUS_LABEL } from "../../utils/world-content.labels";
import type { WorldContentStatus } from "../../types";

const VARIANT: Record<WorldContentStatus, "default" | "secondary" | "outline"> = {
  active: "default",
  draft: "secondary",
  archived: "outline",
};

export function EntityStatusBadge({ status }: { status: WorldContentStatus }) {
  return <Badge variant={VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
