"use client";

import { useState } from "react";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";

/**
 * The اكشفني board: one obscured photograph with authored clear windows.
 *
 * The whole picture is on screen from the first second, blurred past the point
 * where a face can be named. Each authored region is a *window*: revealing it
 * makes exactly that rectangle clear while everything around it stays obscured,
 * so the room buys sharpness in pieces and the windows accumulate.
 *
 * One media asset, never six. The clear windows are the same source image drawn
 * again and clipped — the crop is done with geometry, not with content — so a
 * ContentItem still carries a single picture and nothing is pre-rendered.
 *
 * Region boxes are fractions of the source image, and the box the component
 * draws into *is* the image at its natural aspect. That is what keeps a window
 * on the same eye at 1920×1080 and at 390 wide: no fixed pixels, no crop, and
 * therefore no drift.
 *
 * Shared deliberately. The player runtime and the Admin region editor render
 * through this one component, so an author is looking at the thing the room will
 * look at rather than at a second interpretation of the same numbers.
 */

/**
 * How hard the picture is to read before anything is revealed.
 *
 * The single tuning knob for difficulty — raise it if playtests find the face
 * too readable at three reveals, lower it if the first window never helps. It is
 * a presentation value, so it lives with the presentation rather than in the
 * mechanic's runtime contract, and nothing about scoring or reveal counts moves
 * with it.
 *
 * Two units on purpose. `relative` scales the blur with the rendered width, so a
 * television and a phone obscure the *same amount of face* rather than the same
 * number of pixels. `fallbackClassName` is a static blur that applies wherever
 * container units are not supported: an invalid inline `filter` is dropped at
 * parse time and the class below it wins, so the failure mode is still an
 * obscured picture.
 */
export const EKSHIFNI_OBSCURATION = {
  relative: "blur(2.4cqw)",
  fallbackClassName: "blur-2xl",
} as const;

export interface EkshifniBoardRegion {
  id: string;
  /** The neutral player-facing identity, 1..6. */
  number: number;
  revealed: boolean;
  /** Fractions of the source image. Absent means the client was not told. */
  shape?: { x: number; y: number; width: number; height: number };
}

/**
 * A fraction as a CSS percentage, without the floating-point tail.
 *
 * `0.55 * 100` is `55.00000000000001`, which is correct and unreadable. Four
 * decimals of a percentage is far finer than a pixel at any size this renders
 * at, so nothing moves and the markup stays legible.
 */
const percent = (value: number) =>
  `${Math.round(value * 1_000_000) / 10_000}%`;

/**
 * One clear window: the same picture, drawn again and clipped to this rectangle.
 *
 * The inner image is sized to the whole board and shifted so that exactly this
 * region's slice lands in the frame. Pure geometry against the same natural
 * aspect, so it cannot drift from the blurred base underneath it.
 */
function ClearWindow({
  src,
  region,
  isNewest,
}: {
  src: string;
  region: EkshifniBoardRegion & {
    shape: NonNullable<EkshifniBoardRegion["shape"]>;
  };
  isNewest: boolean;
}) {
  const { x, y, width, height } = region.shape;
  return (
    <div
      data-testid={`ekshifni-window-${region.number}`}
      className={cn(
        "absolute overflow-hidden rounded-md",
        // The one that just opened, so the room registers the change without a
        // line of copy. Drawn from committed state, not a timer, so a screen
        // that rejoins mid-image sees the same board rather than a replay.
        isNewest && "ring-2 ring-brand-gold",
      )}
      style={{
        left: percent(x),
        top: percent(y),
        width: percent(width),
        height: percent(height),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        aria-hidden
        className="absolute max-w-none"
        style={{
          width: `${100 / width}%`,
          height: `${100 / height}%`,
          left: `${(-x / width) * 100}%`,
          top: `${(-y / height) * 100}%`,
        }}
      />
    </div>
  );
}

export function EkshifniBoard({
  url,
  altText,
  regions,
  unmasked = false,
  newestRegionId,
  imageClassName = "max-h-[58vh]",
  showNumbers = true,
}: {
  url: string;
  altText: string;
  regions: EkshifniBoardRegion[];
  /** Terminal resolution: the whole picture, clear, through the canonical flow. */
  unmasked?: boolean;
  newestRegionId?: string;
  /** How tall the picture may get. Never changes its aspect. */
  imageClassName?: string;
  showNumbers?: boolean;
}) {
  const src = getMediaUrl(url) || url;
  const [broken, setBroken] = useState(false);
  /**
   * A projection that lost geometry is a projection to distrust.
   *
   * Under the clear-window model a missing box fails safe on its own — a window
   * that cannot be placed simply does not open — but a payload arriving without
   * the geometry it is supposed to carry means something upstream is wrong, and
   * the conservative answer for a board whose whole job is withholding a face is
   * to show nothing and be reported.
   */
  const undrawable = !unmasked && regions.some((region) => !region.shape);
  const withheld = undrawable || broken;
  const obscured = !unmasked && !withheld;
  const drawable = regions.filter(
    (
      region,
    ): region is EkshifniBoardRegion & {
      shape: NonNullable<EkshifniBoardRegion["shape"]>;
    } => Boolean(region.shape),
  );

  return (
    <div className="flex justify-center">
      <div
        className="relative inline-block min-h-40 max-w-full overflow-hidden rounded-[var(--radius)] border border-border/70 bg-muted shadow-sm"
        data-testid="ekshifni-board"
        data-unmasked={String(unmasked)}
        data-withheld={String(withheld)}
        data-obscured={String(obscured)}
      >
        {/* The box *is* the picture: natural aspect, no crop. Height is capped so
            a television shows the face large without a letterbox, width so a
            phone never overflows — neither changes the aspect, so neither moves
            a window. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={altText}
          onError={() => setBroken(true)}
          data-testid="ekshifni-board-base"
          className={cn(
            "block w-auto max-w-full",
            imageClassName,
            // While masked this only sets the box; the obscured copy below is
            // what the room sees. At terminal resolution it *is* the picture.
            (withheld || (!unmasked && obscured)) && "invisible",
          )}
        />
        {obscured && (
          // The containment lives here, on a layer that fills the box, so the
          // blur can be expressed relative to the rendered width without taking
          // shrink-to-fit away from the box itself — which is what the authored
          // fractions are measured against.
          <div
            aria-hidden
            data-testid="ekshifni-obscured-layer"
            style={{ containerType: "inline-size" }}
            className="absolute inset-0 overflow-hidden"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className={cn(
                "absolute inset-0 h-full w-full",
                // Scaled a little so the blur's own soft edge falls outside the
                // frame instead of showing as a translucent border. Separate
                // layer, so this cannot move a window.
                "scale-105",
                EKSHIFNI_OBSCURATION.fallbackClassName,
              )}
              style={{ filter: EKSHIFNI_OBSCURATION.relative }}
            />
          </div>
        )}
        {withheld && (
          <div
            className="absolute inset-0 grid place-items-center bg-muted p-6 text-center"
            role="status"
          >
            <p className="text-base font-black text-muted-foreground">
              تعذّر عرض الصورة الآن
            </p>
          </div>
        )}
        {!withheld &&
          !unmasked &&
          drawable
            .filter((region) => region.revealed)
            .map((region) => (
              <ClearWindow
                key={region.id}
                src={src}
                region={region}
                isNewest={region.id === newestRegionId}
              />
            ))}
        {/* Still shut, and numbered — the whole player-facing vocabulary of
            this mechanic is «اكشفوا 3», so the number has to sit on the part of
            the picture it will open rather than in a list beside it. */}
        {!withheld &&
          !unmasked &&
          showNumbers &&
          drawable
            .filter((region) => !region.revealed)
            .map((region) => (
              <div
                key={region.id}
                data-testid={`ekshifni-marker-${region.number}`}
                className="absolute grid place-items-center rounded-md border-2 border-primary-foreground/50 bg-primary/25 ring-1 ring-inset ring-primary/40"
                style={{
                  left: percent(region.shape.x),
                  top: percent(region.shape.y),
                  width: percent(region.shape.width),
                  height: percent(region.shape.height),
                }}
              >
                <span className="akwaan-numeral text-2xl font-black text-primary-foreground drop-shadow sm:text-3xl">
                  {region.number}
                </span>
              </div>
            ))}
      </div>
    </div>
  );
}
