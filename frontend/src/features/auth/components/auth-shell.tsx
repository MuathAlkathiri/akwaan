import Image from "next/image";
import Link from "next/link";

/** A deliberately quiet shell for focused authentication tasks. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative isolate flex min-h-screen w-full overflow-hidden bg-white px-4 py-6 sm:px-6 sm:py-8">
      <div
        className="pointer-events-none absolute -left-28 top-[14%] -z-10 h-40 w-64 opacity-60 sm:-left-20 sm:h-52 sm:w-80"
        aria-hidden
      >
        <svg viewBox="0 0 320 210" className="h-full w-full fill-none">
          <ellipse
            cx="122"
            cy="106"
            rx="116"
            ry="42"
            transform="rotate(-18 122 106)"
            stroke="hsl(var(--brand-gold))"
            strokeOpacity=".22"
            strokeWidth="1"
          />
          <circle
            cx="104"
            cy="108"
            r="27"
            fill="hsl(var(--brand-navy))"
            fillOpacity=".055"
          />
        </svg>
      </div>

      <div
        className="pointer-events-none absolute -right-12 bottom-[10%] -z-10 h-32 w-48 opacity-50 sm:-right-6 sm:h-40 sm:w-60"
        aria-hidden
      >
        <svg viewBox="0 0 240 160" className="h-full w-full fill-none">
          <ellipse
            cx="150"
            cy="82"
            rx="84"
            ry="26"
            transform="rotate(16 150 82)"
            stroke="hsl(var(--brand-gold))"
            strokeOpacity=".18"
            strokeWidth="1"
          />
          <circle
            cx="155"
            cy="81"
            r="18"
            fill="hsl(var(--brand-navy))"
            fillOpacity=".045"
          />
        </svg>
      </div>

      <span
        className="pointer-events-none absolute right-[12%] top-[18%] -z-10 text-lg text-[hsl(var(--brand-gold)/.32)]"
        aria-hidden
      >
        ✦
      </span>

      <div className="mx-auto flex w-full max-w-[520px] -translate-y-5 flex-col items-center justify-center gap-5 sm:-translate-y-7 sm:gap-6">
        <Link
          href="/"
          aria-label="أكوان - الرئيسية"
          className="relative block h-14 w-32 shrink-0 sm:h-16 sm:w-36"
        >
          <Image
            src="/brand/akwaan-logo.png"
            alt="أكوان"
            fill
            priority
            sizes="144px"
            className="object-contain"
          />
        </Link>
        {children}
      </div>
    </section>
  );
}
