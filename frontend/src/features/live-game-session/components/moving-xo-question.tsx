"use client";

import { BidiText } from "@/components/akwaan/bidi-text";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";
import { authoredText } from "../authored-text";
import type { MovingXoQuestionView } from "../match/moving-xo.presentation";
import { MarhalaQuestionAudio, MarhalaQuestionImage } from "./marhala-screen";

export function MovingXoQuestion({
  question,
  compact = false,
  showOptions = true,
}: {
  question: MovingXoQuestionView;
  compact?: boolean;
  showOptions?: boolean;
}) {
  const asset = question.media?.assets[0];
  return (
    <section
      data-testid="moving-xo-question"
      className={cn("space-y-3", compact ? "text-base" : "text-lg")}
    >
      {asset && question.media?.type === "image" && (
        <MarhalaQuestionImage
          url={asset.url}
          altText={asset.altText ?? "صورة اللغز"}
        />
      )}
      {asset && question.media?.type === "audio" && (
        <MarhalaQuestionAudio url={asset.url} />
      )}
      {asset && question.media?.type === "video" && (
        <video
          controls
          playsInline
          src={getMediaUrl(asset.url)}
          className="mx-auto max-h-[36dvh] w-full max-w-xl rounded-[var(--radius)] border border-border bg-black"
          data-testid="moving-xo-question-video"
        />
      )}
      <h2
        className={cn(
          "font-display font-extrabold text-[hsl(var(--brand-navy))] [text-wrap:pretty]",
          compact
            ? "text-center text-xl leading-relaxed"
            : "text-3xl leading-relaxed lg:text-[42px] lg:leading-[1.6]",
        )}
        data-testid="moving-xo-prompt"
      >
        <BidiText>{authoredText(question.prompt, "اللغز جاهز")}</BidiText>
      </h2>
      {showOptions && question.answerMode === "multiple_choice" && (
        <ol
          data-testid="moving-xo-public-options"
          className="grid list-none grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {question.options.map((option) => (
            <li
              key={option.id}
              className="rounded-2xl border-[3px] border-[hsl(var(--brand-navy))] bg-white px-4 py-3 text-center text-xl font-bold text-[hsl(var(--brand-navy))]"
            >
              <BidiText>{authoredText(option.label)}</BidiText>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
