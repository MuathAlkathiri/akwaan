"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImageIcon, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { showToast } from "@/components/ui/toast";
import { getMediaUrl } from "@/lib/api/media-url";

const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

interface UploadFieldProps {
  label: string;
  existingUrl?: string;
  value: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  shape?: "square" | "wide";
}

export function UploadField({
  label,
  existingUrl,
  value,
  onChange,
  disabled = false,
  shape = "square",
}: UploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();

  useEffect(() => {
    if (!value) {
      setPreviewUrl(undefined);
      return;
    }
    const objectUrl = URL.createObjectURL(value);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [value]);

  const validate = (file: File) => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      showToast({
        type: "error",
        message: "الصيغ المدعومة فقط: JPG، PNG، WEBP.",
      });
      return false;
    }
    if (file.size > MAX_SIZE_BYTES) {
      showToast({ type: "error", message: "الحد الأقصى لحجم الصورة 5 ميجابايت." });
      return false;
    }
    return true;
  };

  const displayUrl = previewUrl ?? (existingUrl ? getMediaUrl(existingUrl) : undefined);
  const isWide = shape === "wide";
  const frameClass = isWide ? "h-28 w-full sm:h-32" : "size-20 shrink-0";

  const frame = displayUrl ? (
    <div className={`relative overflow-hidden rounded-xl border bg-muted ${frameClass}`}>
      <Image src={displayUrl} alt="" fill unoptimized className="object-cover" />
    </div>
  ) : (
    <div
      className={`grid place-items-center rounded-xl border border-dashed bg-muted/40 text-muted-foreground ${frameClass}`}
    >
      <ImageIcon className="size-5" aria-hidden />
    </div>
  );

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="me-1.5 size-3.5" aria-hidden />
        {displayUrl ? "استبدال" : "رفع صورة"}
      </Button>
      {value && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => {
            onChange(null);
            if (inputRef.current) inputRef.current.value = "";
          }}
        >
          <X className="me-1.5 size-3.5" aria-hidden />
          إلغاء
        </Button>
      )}
    </div>
  );

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept={ACCEPTED_TYPES.join(",")}
      className="sr-only"
      disabled={disabled}
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        if (!validate(file)) {
          event.target.value = "";
          return;
        }
        onChange(file);
      }}
    />
  );

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">{label}</label>
      {isWide ? (
        <div className="space-y-3">
          {frame}
          {actions}
          {input}
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {frame}
          {actions}
          {input}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        الصيغ المدعومة: JPG، PNG، WEBP. الحد الأقصى 5 ميجابايت.
      </p>
    </div>
  );
}
