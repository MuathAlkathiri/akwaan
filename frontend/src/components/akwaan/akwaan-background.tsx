/**
 * What sits behind every player-facing page.
 *
 * The old identity put three rendered planets back here — glossy spheres with
 * golden rings, each its own image file. They came from a different look, and
 * against the new one they read as leftovers: nothing else on the page has a
 * highlight, a gradient or a soft edge.
 *
 * What replaces them is a few flat discs and the logo's spark, in the
 * identity's own palette.
 *
 * The design also drew long dotted ellipses across the page. In the mockup
 * they are one still image; on a real page that scrolls they cut across the
 * reading column at an angle and the eye follows the line instead of the
 * sentence. Removed on the owner's call — the orbits that survive are the
 * short ones drawn around a World's disc and around one face in the hero,
 * where they belong to an object rather than to the page.
 *
 * Positions are percentages of the viewport rather than the mockup's pixel
 * offsets. The canvas was drawn at 1440×2000; pinning decorations to those
 * numbers would stack them in the first screenful of a phone and leave the
 * rest of a tall page bare.
 */

/** Flat discs. No gradient, no ring, no shine — the point of the change. */
const DISCS = [
  { size: 14, top: "7%", left: "46%", fill: "#E3DCF6" },
  { size: 26, top: "34%", right: "5%", fill: "#EFE3C6" },
  { size: 20, top: "53%", left: "4%", fill: "#E3DCF6" },
  { size: 16, top: "76%", right: "9%", fill: "#E3DCF6" },
] as const;

const STARS = [
  { size: 16, top: "6%", right: "44%", fill: "#D9B168" },
  { size: 20, top: "32%", left: "7%", fill: "#D9B168" },
  { size: 14, top: "41%", right: "3%", fill: "#CFC4F0" },
  { size: 18, top: "67%", right: "6%", fill: "#D9B168" },
  { size: 14, top: "84%", left: "12%", fill: "#CFC4F0" },
] as const;

export function AkwaanBackground() {
  return (
    <div
      aria-hidden
      data-testid="akwaan-background"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-white"
    >
      {DISCS.map((disc, index) => (
        <span
          key={`disc-${index}`}
          className="absolute rounded-full"
          style={{
            width: disc.size,
            height: disc.size,
            background: disc.fill,
            top: disc.top,
            left: "left" in disc ? disc.left : undefined,
            right: "right" in disc ? disc.right : undefined,
          }}
        />
      ))}

      {STARS.map((star, index) => (
        <svg
          key={`star-${index}`}
          viewBox="-10 -10 20 20"
          width={star.size}
          height={star.size}
          className="absolute"
          style={{
            top: star.top,
            left: "left" in star ? star.left : undefined,
            right: "right" in star ? star.right : undefined,
          }}
        >
          <path
            d="M0 -10 Q1.8 -1.8 10 0 Q1.8 1.8 0 10 Q-1.8 1.8 -10 0 Q-1.8 -1.8 0 -10Z"
            fill={star.fill}
          />
        </svg>
      ))}
    </div>
  );
}
