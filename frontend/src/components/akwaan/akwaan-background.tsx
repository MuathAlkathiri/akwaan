/**
 * What sits behind every player-facing page.
 *
 * The old identity put three rendered planets back here — glossy spheres with
 * golden rings, each its own image file. They came from a different look, and
 * against the new one they read as leftovers: nothing else on the page has a
 * highlight, a gradient or a soft edge.
 *
 * What replaces them is drawn, not rendered: dotted orbits that cross the page
 * far wider than the content, a few flat discs, and the logo's spark. All of
 * it in the identity's own palette, all of it thin enough to read as paper
 * texture rather than as objects competing with the content.
 *
 * Positions are percentages of the viewport rather than the mockup's pixel
 * offsets. The canvas was drawn at 1440×2000; pinning decorations to those
 * numbers would stack them in the first screenful of a phone and leave the
 * rest of a tall page bare.
 */

/** Big dotted ellipses, deliberately running off both edges. */
const ORBITS = [
  { w: 900, h: 520, top: "3%", left: "-15%", tilt: -18, stroke: "#DDD6F3" },
  { w: 820, h: 460, top: "30%", right: "-18%", tilt: 14, stroke: "#EBDDBB" },
  { w: 700, h: 400, top: "62%", left: "-12%", tilt: -10, stroke: "#DDD6F3" },
] as const;

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
      {ORBITS.map((orbit, index) => (
        <svg
          key={`orbit-${index}`}
          viewBox={`0 0 ${orbit.w} ${orbit.h}`}
          width={orbit.w}
          height={orbit.h}
          className="absolute max-w-none"
          style={{
            top: orbit.top,
            left: "left" in orbit ? orbit.left : undefined,
            right: "right" in orbit ? orbit.right : undefined,
          }}
        >
          <ellipse
            cx={orbit.w / 2}
            cy={orbit.h / 2}
            rx={orbit.w / 2 - 4}
            ry={orbit.h / 2 - 4}
            fill="none"
            stroke={orbit.stroke}
            strokeWidth="2"
            strokeDasharray="2 10"
            strokeLinecap="round"
            transform={`rotate(${orbit.tilt} ${orbit.w / 2} ${orbit.h / 2})`}
          />
        </svg>
      ))}

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
