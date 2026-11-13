"use client";

import Image from "next/image";
import { getMediaUrl } from "@/lib/api/media-url";

/**
 * The World's question backdrop (roadmap §30.22 Track A).
 *
 * Decorative artwork behind a challenge in progress, so a question is set in its
 * World rather than floating on a bare surface. Three rules shape it:
 *
 * - It is a **backdrop**. It sits at the lowest layer, behind the opaque question
 *   and gameplay cards, so it can never crop, cover or compete with required
 *   gameplay media — which keeps its own native aspect ratio inside those cards.
 *   16:9 and `object-cover` apply here and nowhere else.
 * - It is **calm**. The artwork is held at low opacity under a scrim, because the
 *   thing a living room reads is the question, not the wallpaper.
 * - It is **not content**. `aria-hidden` and an empty alt: nothing here is part of
 *   the question, and no assistive technology should announce it.
 *
 * The server decides whether there is one at all — a World with no artwork simply
 * sends none and the stage renders exactly as before.
 */
export function QuestionBackdrop({ url }: { url: string }) {
  const source = getMediaUrl(url);
  if (!source) return null;

  return (
    <div
      aria-hidden
      data-testid="question-backdrop"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[var(--radius)]"
    >
      {/* Served directly, like every other uploaded asset: Next's optimizer runs
          server-side, where the browser-facing backend origin is not reachable. */}
      <Image
        src={source}
        alt=""
        fill
        unoptimized
        sizes="100vw"
        className="object-cover opacity-[0.22]"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background/90" />
    </div>
  );
}
