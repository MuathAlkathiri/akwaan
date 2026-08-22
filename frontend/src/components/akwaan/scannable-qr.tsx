"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * A join QR that a player can enlarge to scan from across the room.
 *
 * The inline code is small on purpose — it shares a strip with the join code and
 * the copy button — but a phone photographing a phone needs a bigger target and a
 * clear quiet zone. Tapping the inline code opens the *same* payload, blown up,
 * with nothing layered over it.
 *
 * One QR value drives both renders: the enlarged dialog is handed the identical
 * `value`, so the two can never encode different URLs. This component only changes
 * how the join URL is *displayed*; it never builds or alters the URL.
 *
 * The trigger is a real button (keyboard-openable, focus-visible), and the dialog
 * is the app's canonical `Dialog` — so Escape, the close button and outside-click
 * all work without this component reimplementing any of it.
 */
export function ScannableQr({
  value,
  size = 88,
  enlargedTitle = "كبّر رمز QR للانضمام",
  hint = "اضغط على الكود عشان تكبّره",
  level = "M",
  className,
}: {
  /** The join URL. Rendered as-is, inline and enlarged, never transformed. */
  value: string;
  /** Inline pixel size. The enlarged size is viewport-responsive, not this. */
  size?: number;
  enlargedTitle?: string;
  hint?: string;
  level?: "L" | "M" | "Q" | "H";
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="qr-enlarge-trigger"
        aria-label={enlargedTitle}
        title={hint}
        className={cn(
          "group relative inline-flex cursor-pointer rounded-xl border border-border bg-white p-1.5 transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          className,
        )}
      >
        <QRCodeSVG value={value} size={size} level={level} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Square, and bounded by the viewport so it never overflows on a phone:
            the QR is min(large, most of the smaller screen edge). White padding is
            a real quiet zone the scanner needs, not decoration. */}
        <DialogContent
          data-testid="qr-enlarged-dialog"
          className="sm:max-w-[min(90vw,90vh,32rem)]"
        >
          <DialogHeader>
            <DialogTitle className="text-center text-base font-black">
              {enlargedTitle}
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center px-2 pb-2">
            <div className="w-full max-w-[min(80vw,80vh,26rem)] rounded-2xl bg-white p-4 sm:p-6">
              <QRCodeSVG
                value={value}
                level={level}
                data-testid="qr-enlarged-image"
                // Fills its square container; the container is what the viewport
                // clamps, so the vector scales up without blur.
                className="h-auto w-full"
                style={{ width: "100%", height: "auto" }}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
