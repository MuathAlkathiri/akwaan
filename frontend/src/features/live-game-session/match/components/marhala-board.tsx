"use client";

import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import {
  MARHALA_BOARD,
  MARHALA_ROW_LENGTH,
  MARHALA_START_POSITION,
  MARHALA_FINISH_POSITION,
  marhalaRoutes,
  type MarhalaTile,
} from "../marhala.presentation";

/** Only what a token needs: identity comes from the team's slot in this list. */
export interface MarhalaBoardTeam {
  id: string;
  name: string;
}

/**
 * "المرحلة" — sixteen squares, one serpentine run, two teams racing it.
 *
 * A board game read from across a room: four rows of four, numbered 1 → 16, the
 * path turning at each row end the way a printed board does. Everything
 * positional comes from the tiles this component is handed — their `row`,
 * `column` and `destination` — so a tile cannot be drawn in one place and walked
 * onto in another, and a route cannot point somewhere the configuration does not.
 *
 * The mechanic is the *route*, not a badge on a square. A boost is a rocket
 * lying across the board with its trail running back to the square it launches
 * from; a trap is a collapsing rail sliding down to the square it drops you on.
 * Both are drawn **over** the tiles, the way a ladder or a snake sits on top of
 * a printed board, each in its own casing so crossings read as one object
 * passing over another rather than as a tangle of lines.
 *
 * Nothing here resolves gameplay: the board draws the positions it is given.
 */

/** One square viewBox, so the board scales to any screen without re-deriving. */
const BOX = 1000;
const MARGIN = 24;
const GAP = 7;
const TILE =
  (BOX - MARGIN * 2 - GAP * (MARHALA_ROW_LENGTH - 1)) / MARHALA_ROW_LENGTH;
const STEP = TILE + GAP;

/** The board's own surface, which every route's casing is cut out of. */
const SURFACE = "hsl(var(--brand-navy) / 0.88)";
/**
 * A deeper cut of the brand gold. The UI gold is deliberately soft, which is
 * right on a chip and invisible on a cream tile from across a room; the launch
 * objects use this and keep the soft gold for their highlights.
 */
const GOLD_DEEP = "hsl(38 60% 46%)";

/** Top-left corner of a tile, from its serpentine row/column. */
function corner(tile: MarhalaTile): { x: number; y: number } {
  return {
    x: MARGIN + (tile.column - 1) * STEP,
    // Row 1 is the bottom row, so rows count upward from the board's foot.
    y: MARGIN + (MARHALA_ROW_LENGTH - tile.row) * STEP,
  };
}
const centreOf = (tile: MarhalaTile) => {
  const { x, y } = corner(tile);
  return { x: x + TILE / 2, y: y + TILE / 2 };
};

interface Point {
  x: number;
  y: number;
}

/** A route as it is actually drawn: its two ends and the control point it bows around. */
interface DrawnRoute {
  from: MarhalaTile;
  to: MarhalaTile;
  kind: "boost" | "trap";
  a: Point;
  b: Point;
  c: Point;
  prominent: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const quadPoint = (a: Point, c: Point, b: Point, t: number): Point => {
  const m = 1 - t;
  return {
    x: m * m * a.x + 2 * m * t * c.x + t * t * b.x,
    y: m * m * a.y + 2 * m * t * c.y + t * t * b.y,
  };
};

const quadTangent = (a: Point, c: Point, b: Point, t: number): Point => ({
  x: 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x),
  y: 2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y),
});

const angleAt = (a: Point, c: Point, b: Point, t: number) => {
  const g = quadTangent(a, c, b, t);
  return (Math.atan2(g.y, g.x) * 180) / Math.PI;
};

/**
 * The outline of a band that follows the curve and changes width along it.
 *
 * A stroked line of constant width reads as a diagram; a band that is broad
 * where a rocket's exhaust spreads and narrow where its nose arrives reads as
 * an object. Sampling the curve is what lets the two ends differ.
 */
function taperedBand(
  a: Point,
  c: Point,
  b: Point,
  t0: number,
  t1: number,
  w0: number,
  w1: number,
): string {
  const steps = 26;
  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const p = i / steps;
    const t = t0 + (t1 - t0) * p;
    const point = quadPoint(a, c, b, t);
    const g = quadTangent(a, c, b, t);
    const len = Math.hypot(g.x, g.y) || 1;
    const half = (w0 + (w1 - w0) * p) / 2;
    const nx = (-g.y / len) * half;
    const ny = (g.x / len) * half;
    left.push({ x: point.x + nx, y: point.y + ny });
    right.push({ x: point.x - nx, y: point.y - ny });
  }
  const path = [...left, ...right.reverse()]
    .map(
      (p, index) =>
        `${index === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
    )
    .join(" ");
  return `${path} Z`;
}

/**
 * The two points a route actually runs between.
 *
 * Four routes land on square 7. Aimed at its centre they arrive as one blob, so
 * each is stepped sideways by its rank — still unmistakably on its own square,
 * but far enough apart that four heads read as four.
 */
function fannedEnds(a: Point, b: Point, rank: number): [Point, Point] {
  if (rank === 0) return [a, b];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const span = Math.hypot(dx, dy) || 1;
  const step = rank * 28;
  const nx = (-dy / span) * step;
  const ny = (dx / span) * step;
  return [
    { x: a.x + nx, y: a.y + ny },
    { x: b.x + nx, y: b.y + ny },
  ];
}

/**
 * Where a route bows, so eleven of them stay eleven separable objects.
 *
 * Rockets arc above their straight line and traps below it, in board terms
 * rather than travel terms — otherwise two routes running opposite ways along
 * the same row would bow into each other. Routes that share a destination fan
 * apart by a fixed step, which is what keeps the four that all land on 7 from
 * arriving as one thick smear.
 */
function controlPoint(
  a: Point,
  b: Point,
  kind: "boost" | "trap",
  rank: number,
): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const span = Math.hypot(dx, dy) || 1;
  let nx = -dy / span;
  let ny = dx / span;
  if (ny > 0.001) {
    // Point the normal up the board, not up the direction of travel.
    nx = -nx;
    ny = -ny;
  } else if (Math.abs(ny) <= 0.001) {
    // A vertical run has a horizontal normal: push it out towards the nearer edge.
    const outward = (a.x + b.x) / 2 < BOX / 2 ? -1 : 1;
    if (Math.sign(nx) !== outward) {
      nx = -nx;
      ny = -ny;
    }
  }
  const lift = Math.min(span * 0.035, 18) + rank * Math.min(span * 0.06, 20);
  const sign = kind === "boost" ? 1 : -1;
  return {
    x: clamp((a.x + b.x) / 2 + nx * lift * sign, 44, BOX - 44),
    y: clamp((a.y + b.y) / 2 + ny * lift * sign, 44, BOX - 44),
  };
}

export function MarhalaBoard({
  teams,
  positions,
  activeTeamId,
  tiles = MARHALA_BOARD,
  effect,
  travellingTeamId,
  centre,
  className,
}: {
  teams: MarhalaBoardTeam[];
  /** Where each token is drawn right now — mid-replay this may trail the server. */
  positions: Record<string, number>;
  activeTeamId: string;
  /** The board being played. Defaults to the configured one; injectable for tests. */
  tiles?: readonly MarhalaTile[];
  /** The tile currently reacting, while a rocket or trap fires. */
  effect?: { position: number; kind: "boost" | "trap" };
  /** The team whose token is mid-move, for a touch of extra emphasis. */
  travellingTeamId?: string;
  /** Shown over the board only while a committed turn is being replayed. */
  centre?: React.ReactNode;
  className?: string;
}) {
  const routes = marhalaRoutes(tiles);
  const byPosition = new Map(tiles.map((tile) => [tile.position, tile]));
  const activeRoute = effect
    ? routes.find((route) => route.from === effect.position)
    : undefined;

  // Rank among the routes that land on the same square, so they fan rather than stack.
  const arrivals = new Map<number, number[]>();
  for (const route of routes) {
    arrivals.set(route.to, [...(arrivals.get(route.to) ?? []), route.from]);
  }

  const drawn: DrawnRoute[] = [];
  for (const route of routes) {
    const from = byPosition.get(route.from);
    const to = byPosition.get(route.to);
    if (!from || !to) continue;
    const siblings = arrivals.get(route.to) ?? [route.from];
    const rank = siblings.indexOf(route.from) - (siblings.length - 1) / 2;
    const [a, b] = fannedEnds(centreOf(from), centreOf(to), rank);
    drawn.push({
      from,
      to,
      kind: route.kind,
      a,
      b,
      c: controlPoint(a, b, route.kind, rank),
      prominent: activeRoute?.from === route.from,
    });
  }
  // Long routes lie down first so the short local ones stay on top and legible,
  // and whichever route is firing is drawn last of all.
  drawn.sort((left, right) => {
    if (left.prominent !== right.prominent) return left.prominent ? 1 : -1;
    return (
      Math.hypot(right.b.x - right.a.x, right.b.y - right.a.y) -
      Math.hypot(left.b.x - left.a.x, left.b.y - left.a.y)
    );
  });

  return (
    <div
      data-testid="marhala-board"
      className={cn(
        "relative mx-auto aspect-square w-full max-w-[min(78vh,920px)]",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${BOX} ${BOX}`}
        className="absolute inset-0 size-full drop-shadow-[0_22px_30px_hsl(var(--brand-navy)/0.3)]"
        role="presentation"
        aria-hidden
      >
        <defs>
          <linearGradient id="marhala-board-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(221 45% 30%)" />
            <stop offset="100%" stopColor="hsl(225 55% 16%)" />
          </linearGradient>
          <linearGradient id="marhala-tile-cream" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(43 66% 96%)" />
            <stop offset="72%" stopColor="hsl(40 55% 88%)" />
            <stop offset="100%" stopColor="hsl(38 44% 80%)" />
          </linearGradient>
          <linearGradient id="marhala-tile-blue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(216 48% 94%)" />
            <stop offset="72%" stopColor="hsl(216 38% 84%)" />
            <stop offset="100%" stopColor="hsl(216 31% 76%)" />
          </linearGradient>
          <linearGradient id="marhala-tile-finish" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(46 93% 76%)" />
            <stop offset="70%" stopColor="hsl(40 85% 60%)" />
            <stop offset="100%" stopColor="hsl(35 72% 48%)" />
          </linearGradient>
          <radialGradient id="marhala-trap-mouth">
            <stop offset="0%" stopColor="hsl(350 72% 13%)" />
            <stop offset="62%" stopColor="hsl(352 68% 22%)" />
            <stop offset="100%" stopColor="hsl(var(--destructive))" />
          </radialGradient>
          <filter
            id="marhala-rocket-glow"
            x="-40%"
            y="-40%"
            width="180%"
            height="180%"
          >
            <feGaussianBlur stdDeviation="7" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {drawn.map((route) => (
            <linearGradient
              key={`grad-${route.from.position}`}
              id={`marhala-trail-${route.from.position}`}
              gradientUnits="userSpaceOnUse"
              x1={route.a.x}
              y1={route.a.y}
              x2={route.b.x}
              y2={route.b.y}
            >
              <stop
                offset="0%"
                stopColor={
                  route.kind === "boost"
                    ? "hsl(var(--brand-gold))"
                    : "hsl(var(--destructive))"
                }
                stopOpacity={route.kind === "boost" ? 0.7 : 0.78}
              />
              <stop
                offset="100%"
                stopColor={
                  route.kind === "boost" ? GOLD_DEEP : "hsl(var(--destructive))"
                }
                stopOpacity={1}
              />
            </linearGradient>
          ))}
        </defs>

        {/* The board itself: one surface with a rim, so sixteen tiles read as
            one object rather than sixteen cards that happen to be adjacent. */}
        <rect
          x={3}
          y={9}
          width={BOX - 6}
          height={BOX - 8}
          rx={46}
          fill="hsl(225 55% 10% / 0.35)"
        />
        <rect
          x={3}
          y={3}
          width={BOX - 6}
          height={BOX - 12}
          rx={46}
          fill="url(#marhala-board-rim)"
        />
        <rect
          x={3}
          y={3}
          width={BOX - 6}
          height={BOX - 6}
          rx={46}
          fill="none"
          stroke="hsl(var(--brand-gold) / 0.55)"
          strokeWidth={6}
        />
        <rect
          x={13}
          y={13}
          width={BOX - 26}
          height={BOX - 32}
          rx={37}
          fill="none"
          stroke="hsl(0 0% 100% / 0.16)"
          strokeWidth={3}
        />

        {/* Faces first — the squares the objects lie on. */}
        {tiles.map((tile) => (
          <TileFace
            key={tile.position}
            tile={tile}
            emphasised={
              effect?.position === tile.position ||
              activeRoute?.to === tile.position
            }
          />
        ))}

        {/* Then the routes: a rocket or a rail lies *on* the board, the way a
            ladder does. Each carries its own casing, so where two cross you see
            one object passing over another instead of two lines meeting. */}
        {drawn.map((route) =>
          route.kind === "boost" ? (
            <RocketRoute
              key={`source-${route.from.position}`}
              route={route}
              sourceOnly={!activeRoute || !route.prominent}
            />
          ) : (
            <TrapRoute
              key={`source-${route.from.position}`}
              route={route}
              sourceOnly={!activeRoute || !route.prominent}
            />
          ),
        )}

        {/* Numerals last, so a square can always be read no matter what crosses
            it. On a printed board the number survives the ladder over it; here
            that means drawing it after, not hoping the routes miss it. */}
        {tiles.map((tile) => (
          <TileSquare
            key={tile.position}
            tile={tile}
            reacting={
              effect?.position === tile.position ? effect.kind : undefined
            }
            destinationOf={
              activeRoute?.to === tile.position ? activeRoute.kind : undefined
            }
          />
        ))}
      </svg>

      {/* Tokens are HTML over the board so they reuse the Match's own team
          identity classes rather than restating team colour in SVG. */}
      {teams.map((team) => {
        const position = positions[team.id];
        const tile =
          position === undefined ? undefined : byPosition.get(position);
        if (!tile) return null;
        const sharing = teams.filter(
          (other) => positions[other.id] === position,
        );
        return (
          <Token
            key={team.id}
            team={team}
            teams={teams}
            tile={tile}
            position={position}
            active={team.id === activeTeamId}
            travelling={team.id === travellingTeamId}
            seat={sharing.findIndex((other) => other.id === team.id)}
            crowded={sharing.length > 1}
          />
        );
      })}

      {/* The movement beat, and only that: the board's calm state stays sixteen
          readable squares, and the turn is already named in the screen header. */}
      {centre && (
        <div
          data-testid="marhala-board-centre"
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <div className="rounded-[var(--radius)] border border-brand-gold/40 bg-background/92 px-8 py-5 text-center shadow-xl backdrop-blur-sm">
            {centre}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * A boost, drawn as the launch it is.
 *
 * The exhaust is widest at the square you leave and tapers to the nose, which
 * sits on the square you arrive at pointing the way it travelled — so the pair
 * of squares is legible from the object alone, with no number to read.
 */
function RocketRoute({
  route,
  sourceOnly,
}: {
  route: DrawnRoute;
  sourceOnly: boolean;
}) {
  const { a, b, c, prominent } = route;
  // Calm rockets stay inside their source tile; replay expands the same object.
  const scale = prominent ? 1.72 : 1.2;
  const band = taperedBand(a, c, b, 0.08, 0.76, 30 * scale, 10 * scale);
  // Keep the vehicle visibly rooted in the launch square. Its nose supplies
  // the direction; the small star at the far end supplies the landing.
  const nose = quadPoint(a, c, b, 0.2);
  const heading = angleAt(a, c, b, 0.2);
  const flame = quadPoint(a, c, b, 0.13);
  const flameHeading = angleAt(a, c, b, 0.13);
  const sparkles = [0.38, 0.53, 0.67].map((t, index) => ({
    ...quadPoint(a, c, b, t),
    size: [8, 5, 7][index],
  }));
  return (
    <g
      data-testid={`marhala-route-${route.from.position}-${route.to.position}`}
      data-route-kind="boost"
      data-route-object="rocket"
      data-route-source={route.from.position}
      data-route-destination={route.to.position}
      data-route-prominent={prominent ? "true" : undefined}
      data-route-silhouette="smooth-launch"
      data-route-scale={scale}
      data-route-full={!sourceOnly ? "true" : undefined}
      className="transition-all duration-slow ease-akwaan"
      opacity={1}
    >
      {!sourceOnly && (
        <path
          d={band}
          fill="hsl(var(--brand-navy) / 0.22)"
          stroke={SURFACE}
          strokeWidth={13}
          strokeLinejoin="round"
          opacity={prominent ? 1 : 0.08}
        />
      )}
      {!sourceOnly && (
        <path
          d={band}
          fill={`url(#marhala-trail-${route.from.position})`}
          stroke="hsl(35 88% 38% / 0.7)"
          strokeWidth={3}
          strokeLinejoin="round"
          opacity={prominent ? 1 : 0.1}
        />
      )}
      {!sourceOnly && (
        <path
          d={`M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`}
          fill="none"
          stroke="hsl(49 100% 78%)"
          strokeWidth={prominent ? 10 : 6}
          strokeLinecap="round"
          opacity={prominent ? 0.9 : 0.06}
          filter="url(#marhala-rocket-glow)"
        />
      )}
      {!sourceOnly &&
        sparkles.map((sparkle, index) => (
          <path
            key={index}
            data-boost-spark={index + 1}
            d={`M ${sparkle.x} ${sparkle.y - sparkle.size} L ${sparkle.x + sparkle.size * 0.32} ${sparkle.y - sparkle.size * 0.32} L ${sparkle.x + sparkle.size} ${sparkle.y} L ${sparkle.x + sparkle.size * 0.32} ${sparkle.y + sparkle.size * 0.32} L ${sparkle.x} ${sparkle.y + sparkle.size} L ${sparkle.x - sparkle.size * 0.32} ${sparkle.y + sparkle.size * 0.32} L ${sparkle.x - sparkle.size} ${sparkle.y} L ${sparkle.x - sparkle.size * 0.32} ${sparkle.y - sparkle.size * 0.32} Z`}
            fill="hsl(48 100% 74%)"
            stroke="white"
            strokeWidth={2}
            opacity={prominent ? 1 : 0.3}
          />
        ))}
      {!sourceOnly && (
        <g
          transform={`translate(${flame.x} ${flame.y}) rotate(${flameHeading}) scale(${scale})`}
          opacity={prominent ? 1 : 0.78}
        >
          <path
            d="M -37 0 Q -17 -18 2 0 Q -17 18 -37 0 Z"
            fill="hsl(38 100% 58%)"
            stroke="hsl(24 92% 50%)"
            strokeWidth={3}
          />
          <path
            d="M -24 0 Q -11 -8 1 0 Q -11 8 -24 0 Z"
            fill="hsl(48 100% 88%)"
          />
        </g>
      )}
      <g
        transform={`translate(${nose.x} ${nose.y}) rotate(${heading}) scale(${scale})`}
        opacity={prominent ? 1 : 0.9}
      >
        <path
          d="M -25 -15 L -38 -31 L -8 -18 Z M -25 15 L -38 31 L -8 18 Z"
          fill="hsl(34 96% 55%)"
          stroke="hsl(var(--brand-navy) / 0.65)"
          strokeWidth={4}
          strokeLinejoin="round"
        />
        <path
          d="M -29 -16 Q -23 -23 -10 -24 L 12 -19 Q 30 -11 42 0 Q 30 11 12 19 L -10 24 Q -23 23 -29 16 Q -21 0 -29 -16 Z"
          fill="hsl(42 70% 97%)"
          stroke="hsl(var(--brand-navy) / 0.82)"
          strokeWidth={4.5}
          strokeLinejoin="round"
        />
        <path d="M 18 -16 Q 33 -9 42 0 Q 33 9 18 16 Z" fill="hsl(39 96% 55%)" />
        <circle
          cx={2}
          cy={0}
          r={10}
          fill="hsl(213 68% 55%)"
          stroke="hsl(var(--brand-navy))"
          strokeWidth={3}
        />
        <circle cx={-1} cy={-3} r={3.5} fill="white" opacity={0.8} />
      </g>
      <g
        data-route-destination-marker="landing-star"
        transform={`translate(${b.x} ${b.y}) scale(${prominent ? 1.18 : 1})`}
        opacity={prominent ? 1 : 0.55}
      >
        <circle r={22} fill="hsl(45 100% 72% / 0.28)" />
        <path
          d="M 0 -16 L 5 -6 L 16 -5 L 8 3 L 10 14 L 0 9 L -10 14 L -8 3 L -16 -5 L -5 -6 Z"
          fill="hsl(43 100% 58%)"
          stroke="hsl(29 88% 45%)"
          strokeWidth={3}
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}

/**
 * A trap, drawn as the rail it drops you down.
 *
 * Broad and railed where you fall in, narrowing and losing its rungs as it
 * collapses, ending in a chevron on the square it puts you back on. Rose rather
 * than red: a setback in the race, not an alarm.
 */
function TrapRoute({
  route,
  sourceOnly,
}: {
  route: DrawnRoute;
  sourceOnly: boolean;
}) {
  const { a, b, c, prominent } = route;
  const scale = prominent ? 1.3 : 1.08;
  const w0 = 35 * scale;
  const w1 = 16 * scale;
  // Separate slabs and open gaps make a falling/collapsing silhouette even
  // without colour. This deliberately shares no continuous body with rockets.
  const fragments = [
    [0.12, 0.27],
    [0.33, 0.47],
    [0.54, 0.67],
    [0.75, 0.86],
  ] as const;
  return (
    <g
      data-testid={`marhala-route-${route.from.position}-${route.to.position}`}
      data-route-kind="trap"
      data-route-object="trap"
      data-route-source={route.from.position}
      data-route-destination={route.to.position}
      data-route-prominent={prominent ? "true" : undefined}
      data-route-silhouette="broken-drop"
      data-route-scale={scale}
      data-route-full={!sourceOnly ? "true" : undefined}
      className="transition-all duration-slow ease-akwaan"
      opacity={1}
    >
      {!sourceOnly &&
        fragments.map(([t0, t1], index) => {
          const widthAt = (t: number) => w0 + (w1 - w0) * t;
          const fragment = taperedBand(
            a,
            c,
            b,
            t0,
            t1,
            widthAt(t0),
            widthAt(t1),
          );
          return (
            <g key={t0} data-trap-fragment={index + 1}>
              <path
                d={fragment}
                fill="hsl(var(--brand-navy) / 0.2)"
                stroke={SURFACE}
                strokeWidth={14}
                strokeLinejoin="bevel"
                opacity={prominent ? 1 : 0.08}
              />
              <path
                d={fragment}
                fill={`url(#marhala-trail-${route.from.position})`}
                stroke="hsl(350 45% 28%)"
                strokeWidth={4}
                strokeLinejoin="bevel"
                opacity={prominent ? 1 : 0.1}
              />
            </g>
          );
        })}
      <ellipse
        data-trap-rim="broken-floor"
        cx={a.x}
        cy={a.y}
        rx={50 * scale}
        ry={34 * scale}
        fill="hsl(222 24% 24%)"
        stroke="hsl(35 25% 46%)"
        strokeWidth={7}
        strokeDasharray={`${18 * scale} ${7 * scale}`}
        opacity={prominent ? 1 : 0.96}
      />
      <ellipse
        cx={a.x}
        cy={a.y + 7}
        rx={42 * scale}
        ry={27 * scale}
        fill="hsl(var(--brand-navy) / 0.28)"
        opacity={prominent ? 1 : 0.72}
      />
      <ellipse
        cx={a.x}
        cy={a.y}
        rx={34 * scale}
        ry={21 * scale}
        fill="url(#marhala-trap-mouth)"
        stroke="hsl(351 65% 39%)"
        strokeWidth={5}
        opacity={prominent ? 1 : 0.96}
      />
      <path
        d={`M ${a.x - 25 * scale} ${a.y - 12 * scale} l ${-13 * scale} ${-11 * scale} M ${a.x + 2 * scale} ${a.y - 18 * scale} l ${5 * scale} ${-17 * scale} M ${a.x + 26 * scale} ${a.y - 9 * scale} l ${14 * scale} ${-8 * scale}`}
        stroke="hsl(351 56% 35%)"
        strokeWidth={6}
        strokeLinecap="round"
        opacity={prominent ? 1 : 0.85}
      />
      <path
        data-trap-warning="setback-cross"
        d={`M ${a.x - 10 * scale} ${a.y - 9 * scale} L ${a.x + 10 * scale} ${a.y + 9 * scale} M ${a.x + 10 * scale} ${a.y - 9 * scale} L ${a.x - 10 * scale} ${a.y + 9 * scale}`}
        stroke="hsl(12 88% 72%)"
        strokeWidth={5}
        strokeLinecap="round"
        opacity={prominent ? 0.95 : 0.72}
      />
      {!sourceOnly && (
        <g
          data-route-destination-marker="impact-crack"
          transform={`translate(${b.x} ${b.y}) scale(${scale})`}
          opacity={prominent ? 1 : 0.78}
        >
          <circle r={17} fill="hsl(350 60% 36% / 0.14)" />
          <path
            d="M 0 -15 L -3 -4 L 7 0 L -4 5 L 1 16 M -3 -4 L -13 -9 M -4 5 L -14 10 M 7 0 L 15 -6"
            fill="none"
            stroke="hsl(350 62% 34%)"
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </g>
  );
}

/**
 * The face of one square: what the routes are drawn on top of.
 *
 * A board tile, not a card — cream face on the darker board surface, with a
 * seated shadow under it. Painted opaque so nothing beneath tints it, then
 * given the faintest wash if it is special: the object lying across the board
 * is what says what the square does, not its fill.
 */
function TileFace({
  tile,
  emphasised,
}: {
  tile: MarhalaTile;
  emphasised: boolean;
}) {
  const { x, y } = corner(tile);
  const finish = tile.kind === "finish";
  const accent = accentOf(tile);
  const alternating = (tile.row + tile.column) % 2 === 0;
  const fill = finish
    ? "url(#marhala-tile-finish)"
    : alternating
      ? "url(#marhala-tile-blue)"
      : "url(#marhala-tile-cream)";
  return (
    <g
      data-tile-face={tile.position}
      aria-hidden
      className="transition-all duration-slow ease-akwaan"
    >
      <rect
        x={x + 2}
        y={y + 10}
        width={TILE}
        height={TILE}
        rx={22}
        fill="hsl(225 55% 9% / 0.42)"
      />
      <rect x={x} y={y} width={TILE} height={TILE} rx={22} fill={fill} />
      <path
        d={`M ${x + 18} ${y + TILE - 10} H ${x + TILE - 18} Q ${x + TILE - 8} ${y + TILE - 10} ${x + TILE - 8} ${y + TILE - 23}`}
        fill="none"
        stroke="hsl(var(--brand-navy) / 0.16)"
        strokeWidth={7}
        strokeLinecap="round"
      />
      <path
        d={`M ${x + 20} ${y + 10} H ${x + TILE - 22}`}
        fill="none"
        stroke="white"
        strokeOpacity={0.5}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <rect
        x={x}
        y={y}
        width={TILE}
        height={TILE}
        rx={22}
        fill="none"
        stroke={accent}
        strokeWidth={finish || emphasised ? 7 : 3}
      />
    </g>
  );
}

/** A square's own colour: gold forward, rose back, quiet navy for the rest. */
function accentOf(tile: MarhalaTile): string {
  if (tile.kind === "finish") return "hsl(var(--brand-gold))";
  if (tile.kind === "boost") return "hsl(var(--brand-gold) / 0.4)";
  if (tile.kind === "trap") return "hsl(var(--brand-navy) / 0.2)";
  return "hsl(var(--brand-navy) / 0.16)";
}

/**
 * Everything on a square that must stay readable: its numeral and role.
 *
 * Drawn after the routes, which is the whole point — the number in the corner
 * survives whatever crosses the square, exactly as it does on a printed board.
 */
function TileSquare({
  tile,
  reacting,
  destinationOf,
}: {
  tile: MarhalaTile;
  reacting?: "boost" | "trap";
  destinationOf?: "boost" | "trap";
}) {
  const { x, y } = corner(tile);
  const finish = tile.kind === "finish";
  const start = tile.position === MARHALA_START_POSITION;
  const accent = accentOf(tile);
  const emphasised = Boolean(reacting || destinationOf);
  return (
    <g
      data-testid={`marhala-tile-${tile.position}`}
      data-tile-kind={tile.kind}
      data-tile-reacting={reacting}
      data-tile-destination={destinationOf}
      role="img"
      aria-label={marhalaTileAria(tile)}
      className="transition-all duration-slow ease-akwaan"
    >
      {/* The square itself, already painted below; kept here without a fill so
          the tile's bounds travel with its label and its accessible name. */}
      <rect x={x} y={y} width={TILE} height={TILE} rx={22} fill="none" />
      {emphasised && (
        <rect
          x={x - 8}
          y={y - 8}
          width={TILE + 16}
          height={TILE + 16}
          rx={30}
          fill="none"
          stroke={accent}
          strokeWidth={3}
          opacity={0.55}
        />
      )}
      {finish && (
        <path
          d={`M ${x + TILE / 2 - 42} ${y + 70} l 20 18 22 -36 22 36 20 -18 -8 56 h -88 Z`}
          fill="hsl(45 95% 64%)"
          stroke="hsl(var(--brand-navy) / 0.45)"
          strokeWidth={4}
          strokeLinejoin="round"
        />
      )}
      {(tile.kind === "boost" || tile.kind === "trap") && (
        <g
          data-testid={`marhala-source-mark-${tile.position}`}
          data-testid-destination-badge={`marhala-destination-badge-${tile.position}`}
          data-source-direction={tile.kind === "boost" ? "forward" : "backward"}
          transform={`translate(${x + TILE - 34} ${y + 34})`}
        >
          <circle
            r={22}
            fill={
              tile.kind === "boost" ? "hsl(43 96% 56%)" : "hsl(350 55% 38%)"
            }
            stroke="hsl(var(--brand-navy) / 0.72)"
            strokeWidth={3}
          />
          <path
            d={
              tile.kind === "boost"
                ? "M 0 12 V -11 M -10 -2 L 0 -12 L 10 -2"
                : "M 0 -12 V 11 M -10 2 L 0 12 L 10 2"
            }
            fill="none"
            stroke="white"
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            data-destination-badge="true"
            x={-52}
            y={-47}
            width={104}
            height={36}
            rx={12}
            fill={
              tile.kind === "boost" ? "hsl(39 90% 47%)" : "hsl(350 62% 39%)"
            }
            stroke={
              tile.kind === "boost" ? "hsl(45 100% 78%)" : "hsl(350 100% 78%)"
            }
            strokeWidth={3}
          />
          <text
            data-destination-badge-text="true"
            x={0}
            y={-21}
            textAnchor="middle"
            fontSize={23}
            fontWeight={900}
            fill="white"
            direction="ltr"
          >
            {`${tile.destination} ${tile.kind === "boost" ? "↑" : "↓"}`}
          </text>
        </g>
      )}
      {/* A cream halo behind the numeral, so it stays crisp even where a route
          runs under it. */}
      <text
        x={x + TILE / 2}
        y={y + TILE / 2 + 27}
        textAnchor="middle"
        className="akwaan-numeral"
        fontSize={78}
        fontWeight={900}
        fill="hsl(var(--brand-navy))"
        stroke="hsl(43 55% 94% / 0.72)"
        strokeWidth={5}
        strokeLinejoin="round"
        paintOrder="stroke"
        opacity={1}
      >
        {tile.position}
      </text>
      {finish && (
        <text
          x={x + TILE / 2}
          y={y + TILE - 23}
          textAnchor="middle"
          fontSize={25}
          fontWeight={900}
          fill="hsl(var(--brand-navy))"
          stroke="hsl(43 85% 70% / 0.75)"
          strokeWidth={6}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          نقطة النهاية
        </text>
      )}
      {start && (
        <text
          x={x + TILE / 2}
          y={y + TILE - 22}
          textAnchor="middle"
          fontSize={23}
          fontWeight={900}
          fill="hsl(var(--muted-foreground))"
          stroke="hsl(var(--card))"
          strokeWidth={5}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          نقطة البداية
        </text>
      )}
    </g>
  );
}

/**
 * A team's piece, standing on its square.
 *
 * A polished playing piece rather than a dot: sized to be read across a room,
 * seated low so it never covers the numeral, and shifted sideways when both
 * teams share a square so neither hides the other.
 */
function Token({
  team,
  teams,
  tile,
  position,
  active,
  travelling,
  seat,
  crowded,
}: {
  team: MarhalaBoardTeam;
  teams: MarhalaBoardTeam[];
  tile: MarhalaTile;
  position: number;
  active: boolean;
  travelling: boolean;
  seat: number;
  crowded: boolean;
}) {
  const identity = teamIdentityOf(team.id, teams);
  const { x, y } = corner(tile);
  const offset = crowded ? (seat === 0 ? -TILE * 0.21 : TILE * 0.21) : 0;
  return (
    <span
      data-testid={`marhala-token-${team.id}`}
      data-token-active={active ? "true" : "false"}
      data-token-travelling={travelling ? "true" : undefined}
      data-token-position={position}
      title={team.name}
      aria-label={`${team.name} — المربّع ${position}${active ? " — دورهم" : ""}`}
      style={{
        left: `${((x + TILE / 2 + offset) / BOX) * 100}%`,
        top: `${((y + TILE * 0.72) / BOX) * 100}%`,
      }}
      className={cn(
        "absolute -translate-x-1/2 -translate-y-1/2 inline-flex items-center justify-center rounded-[42%_42%_48%_48%] border-[3px] border-white/80 font-black leading-none shadow-[0_6px_9px_hsl(var(--brand-navy)/0.38),inset_0_3px_3px_hsl(0_0%_100%/0.5)] ring-1 ring-brand-navy/30 transition-all duration-slow ease-akwaan before:absolute before:-top-[36%] before:left-1/2 before:block before:size-[62%] before:-translate-x-1/2 before:rounded-full before:border-2 before:border-white/70 before:bg-inherit before:shadow-[inset_0_2px_2px_hsl(0_0%_100%/0.55)] after:absolute after:-bottom-[16%] after:left-1/2 after:block after:h-[30%] after:w-[128%] after:-translate-x-1/2 after:rounded-[50%] after:border-2 after:border-white/75 after:bg-inherit after:shadow-[0_4px_5px_hsl(var(--brand-navy)/0.28)]",
        identity.solid,
        crowded
          ? "h-[5.2%] w-[4.9%] text-[0.62rem] sm:text-xs"
          : "h-[6.2%] w-[5.7%] text-xs sm:text-sm",
        active &&
          "ring-[3px] ring-offset-2 ring-offset-background " + identity.ring,
        travelling && "scale-110",
      )}
    >
      <span className="relative z-10 drop-shadow-sm">
        {team.name.trim().slice(0, 1) || identity.slot}
      </span>
    </span>
  );
}

/** What a screen reader hears, so a square's role never depends on its colour. */
function marhalaTileAria(tile: MarhalaTile): string {
  if (tile.kind === "finish") return `المربّع ${tile.position} — نقطة النهاية`;
  if (tile.kind === "boost")
    return `المربّع ${tile.position} — انطلاقة إلى المربّع ${tile.destination}`;
  if (tile.kind === "trap")
    return `المربّع ${tile.position} — فخ يرجعكم إلى المربّع ${tile.destination}`;
  if (tile.position === MARHALA_START_POSITION)
    return `المربّع ${tile.position} — نقطة البداية`;
  return `المربّع ${tile.position}`;
}

export { MARHALA_FINISH_POSITION };
