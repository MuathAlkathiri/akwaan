import Image from "next/image";

const COSMIC_ASSET_ROOT = "/brand/cosmic";

/** One sparse Akwaan environment inherited by standard player pages. */
export function AkwaanBackground() {
  return (
    <div
      aria-hidden
      data-testid="akwaan-background"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-white"
    >
      {/* The approved planets stay small, muted, and cropped into the viewport
          edges. Their separate vector orbits remain legible at low opacity. */}
      <span className="absolute -bottom-48 -left-52 size-[28rem] rounded-full bg-[radial-gradient(circle_at_62%_38%,hsl(var(--brand-navy)/.035),hsl(var(--brand-navy)/.014)_38%,transparent_70%)] blur-2xl max-sm:-bottom-24 max-sm:-left-28 max-sm:size-56" />
      <span className="absolute -right-20 top-[32%] size-36 rounded-full bg-[radial-gradient(circle,hsl(var(--brand-navy)/.028),transparent_70%)] blur-xl max-sm:hidden" />

      <Image
        src={`${COSMIC_ASSET_ROOT}/luxurious_ringed_planet_illustration.webp`}
        alt=""
        width={512}
        height={512}
        className="absolute -left-10 top-[17%] size-[92px] object-contain opacity-[.19] saturate-[.7] max-sm:-left-7 max-sm:top-[14%] max-sm:size-16 max-sm:opacity-[.15]"
      />

      <svg
        data-orbit="upper-left"
        viewBox="0 0 620 280"
        fill="none"
        className="absolute -left-[29rem] top-[11%] h-[280px] w-[620px] max-sm:-left-[17rem] max-sm:top-[12%] max-sm:h-36 max-sm:w-[360px]"
      >
        <ellipse cx="302" cy="143" rx="286" ry="78" transform="rotate(-18 302 143)" stroke="hsl(var(--brand-gold))" strokeWidth="1" opacity=".13" />
        <ellipse cx="306" cy="140" rx="302" ry="103" transform="rotate(-24 306 140)" stroke="hsl(var(--brand-navy))" strokeWidth=".75" strokeDasharray="3 7" opacity=".055" />
      </svg>

      <svg data-orbit="mid-right" viewBox="0 0 260 140" fill="none" className="absolute -right-28 top-[34%] h-[140px] w-[260px] max-sm:hidden">
        <ellipse cx="132" cy="70" rx="122" ry="35" transform="rotate(-24 132 70)" stroke="hsl(var(--brand-gold))" strokeWidth=".9" opacity=".1" />
      </svg>

      <Image
        src={`${COSMIC_ASSET_ROOT}/elegant_golden_ringed_blue_planet.webp`}
        alt=""
        width={512}
        height={512}
        className="absolute -right-7 top-[36%] size-[76px] object-contain opacity-[.14] saturate-[.65] max-sm:hidden"
      />

      <svg data-orbit="lower-right" viewBox="0 0 720 340" fill="none" className="absolute -bottom-32 -right-[31rem] h-[340px] w-[720px] max-sm:-bottom-14 max-sm:-right-[15rem] max-sm:h-40 max-sm:w-[380px]">
        <ellipse cx="354" cy="172" rx="332" ry="91" transform="rotate(-19 354 172)" stroke="hsl(var(--brand-gold))" strokeWidth="1.1" opacity=".12" />
        <ellipse cx="360" cy="168" rx="346" ry="125" transform="rotate(-27 360 168)" stroke="hsl(var(--brand-navy))" strokeWidth=".75" strokeDasharray="4 8" opacity=".05" />
      </svg>

      <Image
        src={`${COSMIC_ASSET_ROOT}/glossy_planet_with_golden_orbit.webp`}
        alt=""
        width={512}
        height={512}
        className="absolute -bottom-10 -right-8 size-[96px] object-contain opacity-[.16] saturate-[.65] max-sm:-bottom-7 max-sm:-right-6 max-sm:size-[72px] max-sm:opacity-[.13]"
      />

      <span className="absolute left-[11%] top-[18%] size-1 rotate-45 bg-[hsl(var(--brand-gold)/.15)]" />
      <span className="absolute right-[7%] top-[24%] size-1 rounded-full bg-[hsl(var(--brand-navy)/.07)] max-sm:hidden" />
      <span className="absolute bottom-[13%] right-[13%] size-1 rotate-45 bg-[hsl(var(--brand-gold)/.13)] max-sm:right-[9%]" />
    </div>
  );
}
