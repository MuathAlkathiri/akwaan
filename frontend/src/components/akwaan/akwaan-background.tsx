import Image from "next/image";

const COSMIC_ASSET_ROOT = "/brand/cosmic";

/**
 * One sparse Akwaan environment inherited by standard player pages.
 *
 * The planets and their orbits are one system, not three drawings:
 *
 * - **One celestial plane.** Every orbit shares `TILT` and `FLATTENING`, so the
 *   rings read as the same sky seen from one angle. Five slightly different
 *   tilts is what made the old background feel scattered.
 * - **A planet sits on its orbit.** Each station's planet is placed at a
 *   parameter on its own ellipse and its position is *derived* from that
 *   ellipse, never eyeballed. A planet floating beside a ring is the single
 *   loudest sign of a background nobody arranged.
 * - **One ladder.** Sizes fall 96 → 80 → 64 and opacity follows size, so the
 *   bigger planet also reads as the nearer one.
 *
 * Stations are anchored in percentages, so the same geometry holds from a phone
 * to a living-room screen with no per-breakpoint tuning.
 */
const TILT = -21;
const FLATTENING = 0.34;
/** The frame each station is drawn in; its centre is the orbit's centre. */
const FRAME = { width: 720, height: 340 };

interface Station {
  key: string;
  file: string;
  /** Semi-major axis of the planet's own orbit. */
  radius: number;
  /** Where on that orbit the planet sits, in degrees. */
  angle: number;
  size: number;
  opacity: number;
  /** Where the planet lands in the viewport, as percentages. */
  at: { x: number; y: number };
}

const STATIONS: Station[] = [
  {
    key: "ringed",
    file: "luxurious_ringed_planet_illustration.webp",
    radius: 262,
    angle: 45,
    size: 80,
    opacity: 0.175,
    at: { x: 8.2, y: 17 },
  },
  {
    key: "blue",
    file: "elegant_golden_ringed_blue_planet.webp",
    radius: 204,
    angle: 138,
    size: 64,
    opacity: 0.14,
    at: { x: 95.3, y: 37.3 },
  },
  {
    key: "glossy",
    file: "glossy_planet_with_golden_orbit.webp",
    radius: 300,
    angle: 186,
    size: 96,
    opacity: 0.165,
    at: { x: 91.4, y: 90.2 },
  },
];

/** The point at `angle` on a station's orbit, in the frame's own coordinates. */
function pointOnOrbit(station: Station) {
  const cx = FRAME.width / 2;
  const cy = FRAME.height / 2;
  const ry = station.radius * FLATTENING;
  const t = (station.angle * Math.PI) / 180;
  const tilt = (TILT * Math.PI) / 180;
  return {
    x:
      cx +
      station.radius * Math.cos(t) * Math.cos(tilt) -
      ry * Math.sin(t) * Math.sin(tilt),
    y:
      cy +
      station.radius * Math.cos(t) * Math.sin(tilt) +
      ry * Math.sin(t) * Math.cos(tilt),
  };
}

/** Three sparks stepping along the same plane, evenly, rather than at random. */
const SPARKS = [
  { left: "18%", top: "62%", tone: "gold", round: false },
  { left: "43.2%", top: "44.8%", tone: "navy", round: true },
  { left: "68.4%", top: "27.6%", tone: "gold", round: false },
] as const;

export function AkwaanBackground() {
  return (
    <div
      aria-hidden
      data-testid="akwaan-background"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-white"
    >
      <span className="absolute -bottom-48 -left-52 size-[28rem] rounded-full bg-[radial-gradient(circle_at_62%_38%,hsl(var(--brand-navy)/.035),hsl(var(--brand-navy)/.014)_38%,transparent_70%)] blur-2xl max-sm:-bottom-24 max-sm:-left-28 max-sm:size-56" />
      <span className="absolute -right-20 top-[34%] size-36 rounded-full bg-[radial-gradient(circle,hsl(var(--brand-navy)/.028),transparent_70%)] blur-xl max-sm:hidden" />

      {STATIONS.map((station) => {
        const point = pointOnOrbit(station);
        const ry = station.radius * FLATTENING;
        const inner = station.radius * 0.82;
        const rotate = `rotate(${TILT} ${FRAME.width / 2} ${FRAME.height / 2})`;
        return (
          <div
            key={station.key}
            data-station={station.key}
            className="absolute"
            style={{
              width: FRAME.width,
              height: FRAME.height,
              left: `calc(${station.at.x}% - ${point.x.toFixed(0)}px)`,
              top: `calc(${station.at.y}% - ${point.y.toFixed(0)}px)`,
            }}
          >
            <svg
              viewBox={`0 0 ${FRAME.width} ${FRAME.height}`}
              fill="none"
              className="absolute inset-0 overflow-visible"
              width={FRAME.width}
              height={FRAME.height}
            >
              <ellipse
                cx={FRAME.width / 2}
                cy={FRAME.height / 2}
                rx={station.radius}
                ry={ry}
                transform={rotate}
                stroke="hsl(var(--brand-gold))"
                strokeWidth="1"
                opacity=".13"
              />
              <ellipse
                cx={FRAME.width / 2}
                cy={FRAME.height / 2}
                rx={inner}
                ry={inner * FLATTENING}
                transform={rotate}
                stroke="hsl(var(--brand-navy))"
                strokeWidth=".75"
                strokeDasharray="3 7"
                opacity=".055"
              />
            </svg>
            <Image
              src={`${COSMIC_ASSET_ROOT}/${station.file}`}
              alt=""
              width={512}
              height={512}
              className="absolute object-contain saturate-[.68]"
              style={{
                width: station.size,
                height: station.size,
                // Written out at a fixed precision rather than handed over as a
                // raw float: the server and the browser serialise 203.0999…
                // differently and React calls the difference a hydration
                // mismatch on every load of a page that shows this background.
                left: `${(point.x - station.size / 2).toFixed(2)}px`,
                top: `${(point.y - station.size / 2).toFixed(2)}px`,
                opacity: station.opacity,
              }}
            />
          </div>
        );
      })}

      {SPARKS.map((spark) => (
        <span
          key={spark.left}
          className={
            spark.round
              ? "absolute size-1 rounded-full bg-[hsl(var(--brand-navy)/.07)]"
              : "absolute size-1 rotate-45 bg-[hsl(var(--brand-gold)/.14)]"
          }
          style={{ left: spark.left, top: spark.top }}
        />
      ))}
    </div>
  );
}
