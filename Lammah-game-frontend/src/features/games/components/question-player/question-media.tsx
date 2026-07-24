"use client";

import { useState } from "react";
import Image from "next/image";
import { getMediaUrl } from "@/lib/api/media-url";

type Presentation = {
  type: "text" | "image" | "audio" | "video";
  mediaAvailable: boolean;
  mediaUrl?: string;
  mediaDuration?: number;
};

export function QuestionMedia({
  presentation,
}: {
  presentation?: Presentation;
}) {
  const [failed, setFailed] = useState(false);
  const source = presentation?.mediaUrl?.trim();
  if (
    failed ||
    !presentation?.mediaAvailable ||
    presentation.type === "text" ||
    !source
  )
    return null;

  const src = getMediaUrl(source);
  return (
    <div
      className="mx-auto w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-black/20 p-3 md:p-5"
      data-testid={`question-media-${presentation.type}`}
    >
      {presentation.type === "image" && (
        <Image
          src={src}
          alt="وسائط داعمة للسؤال"
          width={1600}
          height={900}
          unoptimized
          priority
          onError={() => setFailed(true)}
          className="mx-auto max-h-[48dvh] w-full object-contain"
        />
      )}
      {presentation.type === "video" && (
        <video
          controls
          playsInline
          preload="metadata"
          onError={() => setFailed(true)}
          className="mx-auto max-h-[48dvh] w-full object-contain"
        >
          <source src={src} type="video/mp4" />
          تعذر تشغيل الفيديو في هذا المتصفح.
        </video>
      )}
      {presentation.type === "audio" && (
        <audio
          controls
          preload="metadata"
          src={src}
          onError={() => setFailed(true)}
          className="w-full"
        >
          تعذر تشغيل الصوت في هذا المتصفح.
        </audio>
      )}
    </div>
  );
}

/** Compatibility export for existing focused media tests and callers. */
export function OptionalQuestionMedia({
  type,
  src,
  durationSeconds,
}: {
  type: "image" | "audio" | "video";
  src: string;
  durationSeconds?: number;
}) {
  return (
    <QuestionMedia
      presentation={{
        type,
        mediaAvailable: Boolean(src.trim()),
        mediaUrl: src,
        mediaDuration: durationSeconds,
      }}
    />
  );
}
