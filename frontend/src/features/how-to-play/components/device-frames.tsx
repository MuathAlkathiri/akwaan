import { cn } from "@/lib/utils";

/**
 * The two device shells the walkthrough draws its product shots inside.
 *
 * They are presentation only — a bezel, a screen area and a stand — so the thing
 * a reader actually looks at is the Akwaan UI placed in the slot, not the frame
 * around it. Nothing here knows what a Match is, and neither frame is exported
 * beyond this page: a device mockup is a marketing device, and promoting it to a
 * shared primitive would invite gameplay surfaces to start rendering fake TVs.
 */

/** The shared screen every group plays around: a TV or a laptop on the table. */
export function SharedScreenFrame({
  children,
  className,
  stand = true,
}: {
  children: React.ReactNode;
  className?: string;
  /** The little foot under the screen. Dropped when space is tight. */
  stand?: boolean;
}) {
  return (
    <div className={cn("flex w-full flex-col items-center", className)}>
      <div className="w-full rounded-[1.6rem] border border-[hsl(var(--brand-navy)/.14)] bg-[hsl(var(--brand-navy))] p-2 shadow-[0_28px_60px_-32px_hsl(var(--brand-navy)/.75)] sm:rounded-[1.9rem] sm:p-2.5">
        <div className="overflow-hidden rounded-[1.15rem] bg-white sm:rounded-[1.4rem]">
          {children}
        </div>
      </div>
      {stand && (
        <>
          <span
            aria-hidden
            className="h-3 w-16 bg-[hsl(var(--brand-navy)/.16)] sm:h-4 sm:w-20"
          />
          <span
            aria-hidden
            className="h-1.5 w-28 rounded-full bg-[hsl(var(--brand-navy)/.22)] sm:w-36"
          />
        </>
      )}
    </div>
  );
}

/**
 * A player's own phone, held at arm's length beside the shared screen.
 *
 * Width comes from `className` rather than a prop so a caller can size it per
 * breakpoint; an inline width would silently win over those classes.
 */
export function PhoneFrame({
  children,
  className,
  style,
}: {
  children?: React.ReactNode;
  className?: string;
  /** Reserved for per-instance animation delay in the hero cluster. */
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={cn(
        "shrink-0 rounded-[1.1rem] border border-[hsl(var(--brand-navy)/.14)] bg-[hsl(var(--brand-navy))] p-[3px] shadow-[0_16px_34px_-18px_hsl(var(--brand-navy)/.7)]",
        className,
      )}
    >
      <div className="relative aspect-[9/18] overflow-hidden rounded-[0.9rem] bg-white">
        {/* The earpiece bar, which is what makes the shape read as a phone. */}
        <span
          aria-hidden
          className="absolute left-1/2 top-1.5 h-1 w-8 -translate-x-1/2 rounded-full bg-[hsl(var(--brand-navy)/.16)]"
        />
        <div className="flex h-full flex-col items-center justify-center gap-1.5 px-2 pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}
