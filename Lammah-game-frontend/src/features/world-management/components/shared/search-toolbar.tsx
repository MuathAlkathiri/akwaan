"use client";
import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface SearchToolbarProps {
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  action?: ReactNode;
  className?: string;
}

export function SearchToolbar({
  placeholder,
  value,
  onChange,
  action,
  className,
}: SearchToolbarProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={placeholder}
          className="pe-9"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {action}
    </div>
  );
}
