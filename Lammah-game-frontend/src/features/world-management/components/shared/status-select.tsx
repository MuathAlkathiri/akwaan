"use client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABEL } from "../../utils/world-content.labels";
import type { WorldContentStatus } from "../../types";

const STATUSES: WorldContentStatus[] = ["draft", "active", "archived"];

interface StatusSelectProps {
  value: WorldContentStatus;
  onChange: (status: WorldContentStatus) => void;
  label?: string;
  hint?: string;
}

export function StatusSelect({
  value,
  onChange,
  label = "الحالة",
  hint,
}: StatusSelectProps) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium">{label}</label>
      <Select
        value={value}
        onValueChange={(next: string) => onChange(next as WorldContentStatus)}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUSES.map((status) => (
            <SelectItem key={status} value={status}>
              {STATUS_LABEL[status]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
