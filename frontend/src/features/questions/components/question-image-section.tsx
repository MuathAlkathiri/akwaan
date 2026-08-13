"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { showToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/utils";
import type { Question } from "@/types";

interface QuestionImageSectionProps {
  questionId?: string;
  question?: Question;
  storedImageUrl?: string;
  isUploading: boolean;
  isRemoving: boolean;
  onUpload: (file: File) => Promise<Question>;
  onRemove: () => Promise<void>;
  onStoredImageChange?: (url?: string) => void;
}

const getCanonicalImageUrl = (question?: Question): string | undefined => {
  if (question?.primaryAsset?.type === "image") {
    return question.primaryAsset.url;
  }

  if (question?.effectivePresentationType === "image") {
    return question.resolvedMedia?.url;
  }

  return undefined;
};

export function QuestionImageSection({
  questionId,
  question,
  storedImageUrl: initialStoredImageUrl,
  isUploading,
  isRemoving,
  onUpload,
  onRemove,
  onStoredImageChange,
}: QuestionImageSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [storedImageUrl, setStoredImageUrl] = useState<string | undefined>(
    initialStoredImageUrl,
  );

  useEffect(() => {
    setStoredImageUrl(initialStoredImageUrl);
    setSelectedFile(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }, [questionId, initialStoredImageUrl]);

  useEffect(() => {
    if (!selectedFile) {
      setPreviewUrl(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(selectedFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedFile]);

  const clearSelectedFile = () => {
    setSelectedFile(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleUpload = async () => {
    if (!questionId || !selectedFile || isUploading) {
      return;
    }

    try {
      const updatedQuestion = await onUpload(selectedFile);
      const nextImageUrl = getCanonicalImageUrl(updatedQuestion);

      setStoredImageUrl(nextImageUrl);
      onStoredImageChange?.(nextImageUrl);
      clearSelectedFile();

      showToast({
        type: "success",
        message: "تم رفع الصورة بنجاح.",
      });
    } catch (error) {
      showToast({
        type: "error",
        message: getApiErrorMessage(
          error,
          "تعذر رفع الصورة، حاول مرة أخرى.",
        ),
      });
    }
  };

  const handleRemove = async () => {
    if (
      !questionId ||
      !storedImageUrl ||
      isRemoving ||
      !window.confirm("هل تريد إزالة الصورة الحالية من السؤال؟")
    ) {
      return;
    }

    try {
      await onRemove();

      setStoredImageUrl(undefined);
      onStoredImageChange?.(undefined);
      clearSelectedFile();

      showToast({
        type: "success",
        message: "تمت إزالة الصورة.",
      });
    } catch (error) {
      showToast({
        type: "error",
        message: getApiErrorMessage(
          error,
          "تعذر إزالة الصورة، حاول مرة أخرى.",
        ),
      });
    }
  };

  const pending = isUploading || isRemoving;

  return (
    <Card data-testid="image-section">
      <CardHeader>
        <CardTitle>صورة السؤال</CardTitle>

        <p className="text-sm text-muted-foreground">
          الوسائط اختيارية. إذا لم تكن جاهزة سيظهر السؤال نصيًا فقط.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <Input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="اختيار صورة السؤال"
          className={storedImageUrl ? "sr-only" : undefined}
          disabled={pending}
          onChange={(event) => {
            setSelectedFile(event.target.files?.[0] ?? null);
          }}
        />

        {!questionId && (
          <p className="text-sm text-muted-foreground">
            احفظ السؤال أولًا قبل رفع الصورة.
          </p>
        )}

        {storedImageUrl && (
          <div>
            <p className="mb-2 text-sm font-medium">الصورة الحالية</p>

            <Image
              src={storedImageUrl}
              alt="الصورة الحالية للسؤال"
              width={960}
              height={540}
              unoptimized
              className="max-h-80 w-full rounded-xl object-contain"
            />
          </div>
        )}

        {previewUrl && (
          <div>
            <p className="mb-1 text-sm font-medium">معاينة قبل الرفع</p>

            <p className="mb-2 text-sm text-amber-300">
              لم يتم رفع الصورة بعد.
            </p>

            <Image
              src={previewUrl}
              alt="معاينة الصورة المختارة"
              width={960}
              height={540}
              unoptimized
              className="max-h-80 w-full rounded-xl object-contain"
            />

            {selectedFile && (
              <p className="mt-2 text-xs text-muted-foreground" dir="ltr">
                {selectedFile.name} ·{" "}
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            )}
          </div>
        )}

        {selectedFile && (
          <p className="text-sm text-amber-300">
            لديك صورة مختارة لم يتم رفعها بعد. حفظ بيانات السؤال لن يرفعها.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            onClick={handleUpload}
            disabled={
              !questionId ||
              !selectedFile ||
              isUploading ||
              isRemoving
            }
          >
            {isUploading ? "جاري رفع الصورة..." : "رفع الصورة"}
          </Button>

          {storedImageUrl && (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => inputRef.current?.click()}
              >
                تغيير الصورة
              </Button>

              <Button
                type="button"
                variant="destructive"
                disabled={pending}
                onClick={handleRemove}
              >
                {isRemoving ? "جاري حذف الصورة..." : "حذف الصورة"}
              </Button>
            </>
          )}

          {selectedFile && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={clearSelectedFile}
            >
              إلغاء الاختيار
            </Button>
          )}
        </div>

        {question?.status === "approved" && !question.mediaAvailable && (
          <p className="text-sm text-amber-300">
            السؤال معتمد، لكن الصورة لن تظهر في اللعبة حتى يتم رفعها بنجاح.
          </p>
        )}
      </CardContent>
    </Card>
  );
}