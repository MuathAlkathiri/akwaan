import { PhoneFrame, SharedScreenFrame } from "./device-frames";
import { BoardPreview, PhoneScreen, QrGlyph } from "./product-visuals";

/**
 * One product shot per step. Each is `aria-hidden`: the step's own heading and
 * copy already say what the picture says, and a screen reader gains nothing from
 * a described mockup of a device.
 */

/** Step 1 — the shared screen, alone and dominant. */
export function SharedScreenVisual() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-md">
      <SharedScreenFrame>
        <BoardPreview />
      </SharedScreenFrame>
    </div>
  );
}

/**
 * Step 3 — the code on the shared screen, and the phones it carries for the
 * whole Match.
 *
 * The connecting strokes run from the screen down to each phone, which is the
 * whole point of the picture: one scan, then the phone stays joined.
 */
export function ConnectVisual() {
  return (
    <div aria-hidden className="mx-auto w-full max-w-md">
      <SharedScreenFrame stand={false}>
        <div dir="rtl" className="flex items-center gap-3 p-4 sm:gap-4 sm:p-5">
          <span className="grid size-20 shrink-0 place-items-center rounded-xl border border-border bg-white p-1.5 sm:size-24">
            <QrGlyph />
          </span>
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block text-sm font-black text-[hsl(var(--brand-navy))] sm:text-base">
              امسحوا الرمز للانضمام
            </span>
            <span className="block h-1.5 w-4/5 rounded-full bg-[hsl(var(--brand-navy)/.09)]" />
            <span className="block h-1.5 w-3/5 rounded-full bg-[hsl(var(--brand-navy)/.07)]" />
          </span>
        </div>
      </SharedScreenFrame>

      {/* Three strokes fanning out of the screen's base into the phones. */}
      <svg
        viewBox="0 0 320 56"
        fill="none"
        preserveAspectRatio="none"
        className="-mt-px h-12 w-full sm:h-14"
      >
        {[70, 160, 250].map((x) => (
          <path
            key={x}
            d={`M160 0 C160 26, ${x} 26, ${x} 56`}
            stroke="hsl(var(--brand-gold))"
            strokeWidth="1.25"
            opacity=".45"
            strokeLinecap="round"
          />
        ))}
        <circle cx="160" cy="2" r="2.5" fill="hsl(var(--brand-gold))" opacity=".55" />
      </svg>

      <div className="flex items-start justify-center gap-6 sm:gap-10">
        <PhoneFrame className="w-[62px] sm:w-[70px]">
          <PhoneScreen slot="1" />
        </PhoneFrame>
        <PhoneFrame className="w-[62px] sm:w-[70px]">
          <PhoneScreen slot="2" />
        </PhoneFrame>
        <PhoneFrame className="hidden w-[70px] sm:block">
          <PhoneScreen slot="1" />
        </PhoneFrame>
      </div>
    </div>
  );
}
