"use client";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import type { useAutoSlug } from "../../hooks/use-auto-slug";

interface AdvancedSlugFieldProps {
  slugField: ReturnType<typeof useAutoSlug>;
  disabled?: boolean;
}

// Collapsible "advanced" disclosure so the slug is never presented as a
// primary field — it's auto-generated from the name and only editable here.
export function AdvancedSlugField({ slugField, disabled = false }: AdvancedSlugFieldProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        className="text-xs text-muted-foreground underline underline-offset-2"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "إخفاء الخيارات المتقدمة" : "خيارات متقدمة"}
      </button>
      {expanded && (
        <div className="mt-2">
          <label className="mb-2 block text-sm font-medium">
            الاسم المختصر (slug)
          </label>
          <Input
            dir="ltr"
            value={slugField.slug}
            disabled={disabled}
            onChange={(event) => {
              slugField.enableManualEditing();
              slugField.onManualSlugChange(event.target.value);
            }}
          />
        </div>
      )}
    </div>
  );
}
