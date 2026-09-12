"use client";

import { useCallback, useRef, useState } from "react";
import { getMediaUrl } from "@/lib/api/media-url";
import { cn } from "@/lib/utils";
import type { EkshifniFormState } from "../../services/content-item-form.service";
import { EKSHIFNI_ROLE_LABEL } from "../../services/content-item-form.service";

/**
 * Placing the six windows on the picture, by dragging them.
 *
 * Six sets of four decimals are checkable but not authorable: a producer needs
 * to see that window 1 is actually on the eyes before publishing, and the only
 * honest way to know that is to look at the photograph while moving the box.
 *
 * Geometry stays fractional throughout. Pointer positions are divided by the
 * rendered frame the moment they arrive, so nothing here ever holds a pixel —
 * which is what keeps an authored box landing on the same eye on a television
 * and on a phone. The numeric fields remain the source of truth's text form and
 * stay editable for precision; this is the primary way in, not a second one.
 */

type Region = EkshifniFormState["regions"][number];
type Handle = "nw" | "ne" | "sw" | "se";

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);
const num = (raw: string) => {
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? clamp01(parsed) : 0;
};
/** Four decimals is finer than any screen can show and keeps payloads tidy. */
const round = (value: number) => Math.round(value * 10_000) / 10_000;
/** Small enough to be precise, large enough to stay grabbable. */
const MIN_SIZE = 0.02;

const boxOf = (region: Region) => ({
  x: num(region.x),
  y: num(region.y),
  width: num(region.width),
  height: num(region.height),
});

export function EkshifniRegionEditor({
  regions,
  imageUrl,
  activeIndex,
  onSelect,
  onChange,
}: {
  regions: Region[];
  imageUrl?: string;
  activeIndex: number;
  onSelect: (index: number) => void;
  /** Fractional geometry for one region, already clamped into the image. */
  onChange: (
    index: number,
    box: { x: number; y: number; width: number; height: number },
  ) => void;
}) {
  const frame = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<
    | { index: number; mode: "move" | Handle; originX: number; originY: number; start: ReturnType<typeof boxOf> }
    | undefined
  >();
  const src = getMediaUrl(imageUrl) || "";

  /** Pointer position as a fraction of the rendered picture. */
  const fractionOf = useCallback((event: { clientX: number; clientY: number }) => {
    const rect = frame.current?.getBoundingClientRect();
    if (!rect || !rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    };
  }, []);

  const begin =
    (index: number, mode: "move" | Handle) =>
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      onSelect(index);
      const at = fractionOf(event);
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setDragging({
        index,
        mode,
        originX: at.x,
        originY: at.y,
        start: boxOf(regions[index]),
      });
    };

  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const at = fractionOf(event);
    const dx = at.x - dragging.originX;
    const dy = at.y - dragging.originY;
    const { x, y, width, height } = dragging.start;
    let next = { x, y, width, height };

    if (dragging.mode === "move") {
      // A box may be moved to the edge but never off the picture, so authored
      // geometry that validates today keeps validating after a drag.
      next = {
        x: clamp01(Math.min(x + dx, 1 - width)),
        y: clamp01(Math.min(y + dy, 1 - height)),
        width,
        height,
      };
    } else {
      const west = dragging.mode === "nw" || dragging.mode === "sw";
      const north = dragging.mode === "nw" || dragging.mode === "ne";
      // Resizing moves one corner and pins the opposite one.
      const left = west ? clamp01(Math.min(x + dx, x + width - MIN_SIZE)) : x;
      const top = north ? clamp01(Math.min(y + dy, y + height - MIN_SIZE)) : y;
      const right = west
        ? x + width
        : clamp01(Math.max(x + width + dx, x + MIN_SIZE));
      const bottom = north
        ? y + height
        : clamp01(Math.max(y + height + dy, y + MIN_SIZE));
      next = { x: left, y: top, width: right - left, height: bottom - top };
    }
    onChange(dragging.index, {
      x: round(next.x),
      y: round(next.y),
      width: round(next.width),
      height: round(next.height),
    });
  };

  const end = () => setDragging(undefined);

  if (!src) {
    return (
      <p
        className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground"
        data-testid="ekshifni-preview-empty"
      >
        أضف صورة المشهور أولاً لتحديد مواضع الأجزاء عليها.
      </p>
    );
  }

  return (
    <div className="flex justify-center">
      <div
        ref={frame}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        onPointerCancel={end}
        className="relative inline-block max-w-full touch-none select-none overflow-hidden rounded-lg border"
        data-testid="ekshifni-region-editor"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="صورة المشهور"
          draggable={false}
          className="block max-h-96 w-auto max-w-full"
        />
        {regions.map((region, index) => {
          const box = boxOf(region);
          const active = index === activeIndex;
          return (
            <div
              key={index}
              role="button"
              tabIndex={0}
              aria-label={`الجزء ${index + 1} — ${
                EKSHIFNI_ROLE_LABEL[region.role] ?? region.role
              }`}
              data-testid={`ekshifni-preview-region-${index + 1}`}
              data-active={String(active)}
              onPointerDown={begin(index, "move")}
              // Pointer-down already selects while dragging; click and keyboard
              // are here so selecting a window does not require a drag.
              onClick={() => onSelect(index)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(index);
                }
              }}
              onFocus={() => onSelect(index)}
              className={cn(
                "absolute cursor-move rounded border-2",
                active
                  ? "z-10 border-brand-gold bg-brand-gold/25"
                  : "border-primary/70 bg-primary/20",
              )}
              style={{
                left: `${box.x * 100}%`,
                top: `${box.y * 100}%`,
                width: `${box.width * 100}%`,
                height: `${box.height * 100}%`,
              }}
            >
              <span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-lg font-black text-foreground drop-shadow">
                {index + 1}
              </span>
              {active && (
                <span className="pointer-events-none absolute -top-6 right-0 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[11px] font-bold text-background">
                  {EKSHIFNI_ROLE_LABEL[region.role] ?? region.role}
                </span>
              )}
              {active &&
                (["nw", "ne", "sw", "se"] as const).map((handle) => (
                  <span
                    key={handle}
                    role="button"
                    tabIndex={-1}
                    aria-label={`تغيير حجم الجزء ${index + 1} (${handle})`}
                    data-testid={`ekshifni-handle-${index + 1}-${handle}`}
                    onPointerDown={begin(index, handle)}
                    className={cn(
                      "absolute size-3 rounded-sm border border-background bg-brand-gold",
                      handle === "nw" && "-left-1.5 -top-1.5 cursor-nwse-resize",
                      handle === "ne" && "-right-1.5 -top-1.5 cursor-nesw-resize",
                      handle === "sw" &&
                        "-bottom-1.5 -left-1.5 cursor-nesw-resize",
                      handle === "se" &&
                        "-bottom-1.5 -right-1.5 cursor-nwse-resize",
                    )}
                  />
                ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
