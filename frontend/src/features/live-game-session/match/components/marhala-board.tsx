"use client";

import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { PlayerCharacterIcon } from "../../components/player-characters";
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
  /**
   * The character this team's player picked in the lobby, drawn as the pawn.
   * Optional: a board handed no character falls back to the team's initial, so
   * a session from before characters existed still draws.
   */
  avatarKey?: string;
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

/** Station discs sit inside their cell: the gap is where the run shows. */
const DISC = 77;
const DISC_FINISH = 86;

/** Fixed dust, so a re-render never reshuffles the sky behind the board. */
const DUST = Array.from({ length: 46 }, (_unused, i) => {
  const noise = (salt: number) =>
    Math.abs((Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453) % 1);
  return {
    x: Math.round(noise(1) * 978 + 11),
    y: Math.round(noise(7) * 978 + 11),
    r: Number((1.6 + noise(3) * 2.4).toFixed(1)),
    o: Number((0.25 + noise(5) * 0.5).toFixed(2)),
  };
});

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
  // The printed run, in the order a team walks it.
  const track = tiles
    .map((tile) => centreOf(tile))
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");

  // Squares a token is standing on: their route is the one the players need to
  // see right now, so it is the one that gets drawn.
  const occupied = new Set(Object.values(positions));

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
        className="absolute inset-0 size-full"
        role="presentation"
        aria-hidden
      >
        <defs>
          <linearGradient id="marhala-board-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(43 60% 98%)" />
            <stop offset="100%" stopColor="hsl(41 45% 93%)" />
          </linearGradient>
          <linearGradient id="marhala-tile-cream" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(43 66% 99%)" />
            <stop offset="72%" stopColor="hsl(42 50% 96%)" />
            <stop offset="100%" stopColor="hsl(40 42% 93%)" />
          </linearGradient>
          <linearGradient id="marhala-tile-finish" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(46 93% 76%)" />
            <stop offset="70%" stopColor="hsl(40 85% 60%)" />
            <stop offset="100%" stopColor="hsl(35 72% 48%)" />
          </linearGradient>
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
                stopOpacity={1}
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
          fill="hsl(var(--brand-navy))"
        />
        <rect
          x={3}
          y={3}
          width={BOX - 6}
          height={BOX - 12}
          rx={46}
          fill="url(#marhala-board-rim)"
        />

        {/* Orbital rings and dust: a place, quietly, under everything. */}
        <circle
          cx={BOX / 2}
          cy={BOX / 2}
          r={436}
          fill="none"
          stroke="hsl(43 32% 82%)"
          strokeWidth={3}
        />
        <circle
          cx={BOX / 2}
          cy={BOX / 2}
          r={293}
          fill="none"
          stroke="hsl(43 32% 82%)"
          strokeWidth={3}
          strokeDasharray="13 20"
        />
        {DUST.map((speck, index) => (
          <circle
            key={index}
            cx={speck.x}
            cy={speck.y}
            r={speck.r}
            fill="hsl(43 26% 78%)"
            opacity={speck.o}
          />
        ))}

        {/* Tactical grid. */}
        <g
          stroke="hsl(var(--brand-navy))"
          strokeWidth={2}
          opacity={0.055}
          fill="none"
        >
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <path
              key={n}
              d={`M 0 ${n * 125} H ${BOX} M ${n * 125} 0 V ${BOX}`}
            />
          ))}
        </g>

        {/* Corner brackets: the frame of a heads-up display. */}
        <g
          stroke="hsl(var(--brand-navy))"
          strokeWidth={6}
          fill="none"
          opacity={0.3}
          strokeLinecap="round"
        >
          <path d="M 31 89 V 44 a 13 13 0 0 1 13 -13 h 45" />
          <path d={`M ${BOX - 89} 31 h 45 a 13 13 0 0 1 13 13 v 45`} />
          <path
            d={`M ${BOX - 31} ${BOX - 89} v 45 a 13 13 0 0 1 -13 13 h -45`}
          />
          <path d={`M 89 ${BOX - 31} H 44 a 13 13 0 0 1 -13 -13 v -45`} />
        </g>

        {/* The run itself, 1 → 16, laid down before anything stands on it: the
            printed track a board game turns at the end of every row. */}
        <path
          d={track}
          fill="none"
          stroke="hsl(var(--brand-navy))"
          strokeWidth={77}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.055}
        />
        <path
          d={track}
          fill="none"
          stroke="hsl(var(--brand-navy))"
          strokeWidth={4.5}
          strokeDasharray="7 23"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.3}
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

        {/* Then the routes: every tube and band is on the board at rest, the
            way a ladder is, so the shape of the race reads at a glance. Each
            carries its own casing, so where two cross you see one object
            passing over another instead of two lines meeting. */}
        {drawn.map((route) =>
          route.kind === "boost" ? (
            <RocketRoute
              key={`source-${route.from.position}`}
              route={route}
              sourceOnly={!route.prominent && !occupied.has(route.from.position)}
            />
          ) : (
            <TrapRoute
              key={`source-${route.from.position}`}
              route={route}
              sourceOnly={!route.prominent && !occupied.has(route.from.position)}
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
 * A boost, drawn as the tube it carries you through.
 *
 * One continuous gold pipe from the station you leave to the station you land
 * on, cased in brand navy like every other object on this board. The head at
 * the far end says which way it runs, so the pair of stations reads without a
 * number.
 */
function RocketRoute({
  route,
  sourceOnly,
}: {
  route: DrawnRoute;
  sourceOnly: boolean;
}) {
  const { a, b, c, prominent } = route;
  const scale = prominent ? 1.72 : 1.2;
  const band = taperedBand(a, c, b, 0.05, 0.9, 30 * scale, 23 * scale);
  const spine = `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;
  const head = quadPoint(a, c, b, 0.9);
  const heading = angleAt(a, c, b, 0.9);
  const sparkles = [0.3, 0.5, 0.7].map((t, index) => ({
    ...quadPoint(a, c, b, t),
    size: [7, 5, 6][index],
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
      opacity={sourceOnly ? 0 : 1}
      aria-hidden={sourceOnly || undefined}
    >
      {(
        <path
          d={band}
          fill="hsl(var(--brand-navy) / 0.22)"
          stroke={SURFACE}
          strokeWidth={13}
          strokeLinejoin="round"
          opacity={prominent ? 0.4 : 0.3}
        />
      )}
      {(
        <path
          d={band}
          fill={`url(#marhala-trail-${route.from.position})`}
          stroke="hsl(var(--brand-navy))"
          strokeWidth={6}
          strokeLinejoin="round"
          opacity={prominent ? 1 : 0.62}
        />
      )}
      {(
        <>
          <path
            d={spine}
            fill="none"
            stroke="hsl(var(--brand-navy))"
            strokeWidth={49}
            strokeLinecap="round"
          />
          <path
            d={spine}
            fill="none"
            stroke="hsl(40 70% 72%)"
            strokeWidth={29}
            strokeLinecap="round"
          />
          <path
            d={spine}
            fill="none"
            stroke="hsl(43 100% 93%)"
            strokeWidth={8}
            strokeLinecap="round"
            opacity={0.8}
          />
        </>
      )}
      {sparkles.map((sparkle, index) => (
          <path
            key={index}
            data-boost-spark={index + 1}
            d={`M ${sparkle.x} ${sparkle.y - sparkle.size} L ${sparkle.x + sparkle.size * 0.34} ${sparkle.y - sparkle.size * 0.34} L ${sparkle.x + sparkle.size} ${sparkle.y} L ${sparkle.x + sparkle.size * 0.34} ${sparkle.y + sparkle.size * 0.34} L ${sparkle.x} ${sparkle.y + sparkle.size} L ${sparkle.x - sparkle.size * 0.34} ${sparkle.y + sparkle.size * 0.34} L ${sparkle.x - sparkle.size} ${sparkle.y} L ${sparkle.x - sparkle.size * 0.34} ${sparkle.y - sparkle.size * 0.34} Z`}
            fill="hsl(45 86% 92%)"
            stroke="hsl(var(--brand-navy))"
            strokeWidth={2.5}
            opacity={prominent ? 1 : 0.6}
          />
        ))}
      <g
        transform={`translate(${head.x} ${head.y}) rotate(${heading}) scale(${scale})`}
        opacity={prominent ? 1 : 0.85}
      >
        <path
          d="M -14 -20 L 20 0 L -14 20 L -7 0 Z"
          fill="hsl(40 62% 66%)"
          stroke="hsl(var(--brand-navy))"
          strokeWidth={4.5}
          strokeLinejoin="round"
        />
      </g>
      <g
        data-route-destination-marker="landing-star"
        transform={`translate(${b.x} ${b.y}) scale(${prominent ? 1.18 : 1})`}
        opacity={prominent ? 1 : 0.7}
      >
        <path
          d="M 0 -16 L 5 -6 L 16 -5 L 8 3 L 10 14 L 0 9 L -10 14 L -8 3 L -16 -5 L -5 -6 Z"
          fill="hsl(40 62% 66%)"
          stroke="hsl(var(--brand-navy))"
          strokeWidth={3.5}
          strokeLinejoin="round"
        />
      </g>
    </g>
  );
}

/**
 * A trap, drawn as the arrow it drags you back along.
 *
 * The same cased band as a boost but in the red half of the team palette, cut
 * into separate slabs so it still reads as a fall rather than a ride when the
 * colour is gone, and pointed at the station it puts you back on.
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
  const w0 = 30 * scale;
  const w1 = 22 * scale;
  const spine = `M ${a.x} ${a.y} Q ${c.x} ${c.y} ${b.x} ${b.y}`;
  const head = quadPoint(a, c, b, 0.88);
  const heading = angleAt(a, c, b, 0.88);
  const fragments = [
    [0.1, 0.27],
    [0.32, 0.48],
    [0.53, 0.68],
    [0.73, 0.86],
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
      opacity={sourceOnly ? 0 : 1}
      aria-hidden={sourceOnly || undefined}
    >
      {fragments.map(([t0, t1], index) => {
          const widthAt = (t: number) => w0 + (w1 - w0) * t;
          const fragment = taperedBand(a, c, b, t0, t1, widthAt(t0), widthAt(t1));
          return (
            <g key={t0} data-trap-fragment={index + 1}>
              <path
                d={fragment}
                fill="hsl(var(--brand-navy) / 0.2)"
                stroke={SURFACE}
                strokeWidth={13}
                strokeLinejoin="round"
                opacity={prominent ? 1 : 0.5}
              />
              <path
                d={fragment}
                fill={`url(#marhala-trail-${route.from.position})`}
                stroke="hsl(var(--brand-navy))"
                strokeWidth={6}
                strokeLinejoin="round"
                opacity={prominent ? 1 : 0.62}
              />
            </g>
          );
        })}
      <path
        d={spine}
        fill="none"
        stroke="hsl(var(--brand-navy))"
        strokeWidth={40}
        strokeLinecap="round"
      />
      <path
        d={spine}
        fill="none"
        stroke="hsl(358 71% 58%)"
        strokeWidth={22}
        strokeLinecap="round"
      />
      <g
        transform={`translate(${head.x} ${head.y}) rotate(${heading}) scale(${scale})`}
        opacity={prominent ? 1 : 0.85}
      >
        <path
          d="M -14 -20 L 20 0 L -14 20 L -7 0 Z"
          fill="hsl(358 66% 60%)"
          stroke="hsl(var(--brand-navy))"
          strokeWidth={4.5}
          strokeLinejoin="round"
        />
      </g>
      <g opacity={prominent ? 1 : 0.9}>
        <circle
          data-trap-rim="broken-floor"
          cx={a.x}
          cy={a.y}
          r={30 * scale}
          fill="hsl(356 60% 89%)"
          stroke="hsl(var(--brand-navy))"
          strokeWidth={6}
          strokeDasharray={`${17 * scale} ${8 * scale}`}
        />
        <path
          data-trap-warning="setback-cross"
          d={`M ${a.x - 11 * scale} ${a.y - 11 * scale} L ${a.x + 11 * scale} ${a.y + 11 * scale} M ${a.x + 11 * scale} ${a.y - 11 * scale} L ${a.x - 11 * scale} ${a.y + 11 * scale}`}
          stroke="hsl(358 66% 52%)"
          strokeWidth={7}
          strokeLinecap="round"
        />
      </g>
      {(
        <g
          data-route-destination-marker="impact-crack"
          transform={`translate(${b.x} ${b.y}) scale(${scale})`}
          opacity={prominent ? 1 : 0.78}
        >
          <path
            d="M 0 -15 L -3 -4 L 7 0 L -4 5 L 1 16 M -3 -4 L -13 -9 M -4 5 L -14 10 M 7 0 L 15 -6"
            fill="none"
            stroke="hsl(358 66% 52%)"
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
  // One cream for every ordinary square. The alternating blue made a chequer
  // of a board whose real signal is which squares are special; a square now
  // carries colour only when it does something.
  const fill = finish
    ? "hsl(40 55% 63%)"
    : tile.kind === "boost"
      ? "hsl(43 76% 78%)"
      : tile.kind === "trap"
        ? "hsl(358 80% 84%)"
        : tile.safe
          ? "hsl(156 55% 83%)"
        : "url(#marhala-tile-cream)";
  return (
    <g
      data-tile-face={tile.position}
      aria-hidden
      className="transition-all duration-slow ease-akwaan"
    >
      {/* A hard, unblurred shadow: the «ملصق» treatment the team colours use,
          which is what makes a square read as a piece set on the board rather
          than a shape printed into it. */}
      <circle
        cx={x + TILE / 2}
        cy={y + TILE / 2 + 11}
        r={finish ? DISC_FINISH : DISC}
        fill="hsl(var(--brand-navy))"
      />
      <circle
        cx={x + TILE / 2}
        cy={y + TILE / 2}
        r={finish ? DISC_FINISH : DISC}
        fill={fill}
      />
      {/* One navy outline for every square, special or not: the colour inside
          it is what says what the square does. Same rule as the team colours. */}
      <circle
        cx={x + TILE / 2}
        cy={y + TILE / 2}
        r={finish ? DISC_FINISH : DISC}
        fill="none"
        stroke={emphasised ? accent : "hsl(var(--brand-navy))"}
        strokeWidth={finish || emphasised ? 8 : 5}
      />
      {tile.safe && !finish && (
        <path
          data-tile-checkpoint="flag"
          d={`M ${x + TILE / 2 - 13} ${y + TILE / 2 + DISC - 2} v -38 h 40 l -9 14 9 14 h -40`}
          fill="hsl(156 62% 28%)"
          stroke="hsl(var(--brand-navy))"
          strokeWidth={4}
          strokeLinejoin="round"
        />
      )}
    </g>
  );
}

/** A square's own colour: gold forward, rose back, quiet navy for the rest. */
function accentOf(tile: MarhalaTile): string {
  if (tile.kind === "finish") return "hsl(var(--brand-gold))";
  if (tile.kind === "boost") return "hsl(38 70% 45%)";
  if (tile.kind === "trap") return "hsl(354 60% 45%)";
  return "hsl(var(--brand-navy) / 0.3)";
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
      <circle
        cx={x + TILE / 2}
        cy={y + TILE / 2}
        r={DISC}
        fill="none"
      />
      {emphasised && (
        <circle
          cx={x + TILE / 2}
          cy={y + TILE / 2}
          r={DISC + 12}
          fill="none"
          stroke={accent}
          strokeWidth={4}
          opacity={0.6}
        />
      )}
      {finish && (
        <path
          d={`M ${x + TILE / 2 - 42} ${y + TILE / 2 - 26} l 20 18 22 -36 22 36 20 -18 -8 56 h -88 Z`}
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
          transform={`translate(${x + TILE / 2 + 54} ${y + TILE / 2 - 54})`}
        >
          <circle
            r={22}
            fill={
              tile.kind === "boost" ? "hsl(43 80% 66%)" : "hsl(356 68% 72%)"
            }
            stroke="hsl(var(--brand-navy))"
            strokeWidth={4}
          />
          <path
            d={
              tile.kind === "boost"
                ? "M 0 12 V -11 M -10 -2 L 0 -12 L 10 -2"
                : "M 0 -12 V 11 M -10 2 L 0 12 L 10 2"
            }
            fill="none"
            stroke="hsl(var(--brand-navy))"
            strokeWidth={6}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <rect
            data-destination-badge="true"
            x={-44}
            y={-44}
            width={88}
            height={31}
            rx={11}
            fill={
              tile.kind === "boost" ? "hsl(43 80% 80%)" : "hsl(356 68% 85%)"
            }
            stroke="hsl(var(--brand-navy))"
            strokeWidth={3.5}
          />
          <text
            data-destination-badge-text="true"
            x={0}
            y={-21}
            textAnchor="middle"
            fontSize={21}
            fontWeight={900}
            fill="hsl(var(--brand-navy))"
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
        y={y + TILE / 2 + 15}
        textAnchor="middle"
        className="akwaan-numeral"
        fontSize={40}
        fontWeight={900}
        fill="hsl(var(--brand-navy) / 0.75)"
        stroke="hsl(43 55% 96% / 0.8)"
        strokeWidth={4}
        strokeLinejoin="round"
        paintOrder="stroke"
        opacity={1}
      >
        {tile.position}
      </text>
      {finish && (
        <text
          x={x + TILE / 2}
          y={y + TILE - 46}
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
          y={y + TILE - 45}
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
        {team.avatarKey ? (
<PlayerCharacterIcon characterKey={team.avatarKey} size={30} />
        ) : (
          team.name.trim().slice(0, 1) || identity.slot
        )}
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
