"use client";

import { useRef } from "react";

import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import { PlayerCharacterIcon } from "../../components/player-characters";
import {
  MARHALA_BOARD,
  MARHALA_FINISH_POSITION,
  MARHALA_START_POSITION,
  marhalaRoutes,
  type MarhalaTile,
} from "../marhala.presentation";

/** Only what a token needs: identity comes from the team's slot in this list. */
export interface MarhalaBoardTeam {
  id: string;
  name: string;
  /**
   * The character this team's player picked in the lobby, drawn as the pawn.
   * Optional: a board handed no character falls back to a plain face, so a
   * session from before characters existed still draws.
   */
  avatarKey?: string;
}

/**
 * "المرحلة" — sixteen stations on one winding road, two teams racing it.
 *
 * The approved board (design canvas, `TVMarhala`): rounded-square stations on a
 * lavender road with a navy outline, four rows that wind back and forth, and
 * small chevrons on the road saying which way the race runs. A boost is a
 * **ladder** (purple, white rungs) and a trap is a **slide** (dark tube, dotted
 * centre line, an arrowhead at its foot): they differ by shape and by light and
 * dark, never by hue alone, and red is not used — red means a wrong answer and
 * nothing else in this product. Every connection carries a white pill saying
 * where it leads.
 *
 * Everything positional comes from the tiles this component is handed — their
 * `row`, `column` and `destination` — so a station cannot be drawn in one place
 * and walked onto in another, and a connection cannot point somewhere the
 * configuration does not.
 *
 * Nothing here resolves gameplay: the board draws the positions it is given.
 */

/** The artboard's own coordinates, so every number below can be read off it. */
const W = 1010;
const H = 590;
/** Station 1 sits on the right: the race starts where an Arabic line starts. */
const COLUMN_X = [880, 630, 380, 130] as const;
const ROW_Y = [515, 372, 229, 86] as const;
const TILE = 84;
const TILE_FINISH = 96;

const NAVY = "hsl(var(--brand-navy))";
const GOLD = "hsl(var(--brand-gold))";
const PURPLE = "hsl(var(--brand-purple))";
/** The slide's own dark, a step lighter than the outline so the outline reads. */
const SLIDE = "#2E2860";
const ROAD = "#E3DAF6";

interface Point {
  x: number;
  y: number;
}

function centreOf(tile: MarhalaTile): Point {
  return {
    x: COLUMN_X[(tile.column - 1) % COLUMN_X.length] ?? COLUMN_X[0],
    y: ROW_Y[(tile.row - 1) % ROW_Y.length] ?? ROW_Y[0],
  };
}

const unit = (a: Point, b: Point): Point => {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
};
const along = (p: Point, u: Point, by: number): Point => ({
  x: p.x + u.x * by,
  y: p.y + u.y * by,
});
/** The perpendicular that points up the board, so a bow never dips into a row. */
const upward = (u: Point): Point =>
  u.x >= 0 ? { x: u.y, y: -u.x } : { x: -u.y, y: u.x };
const round = (value: number) => Math.round(value * 10) / 10;
const pt = (p: Point) => `${round(p.x)} ${round(p.y)}`;

/** What kind of station this is, as the room should read it. */
type StationRole =
  "start" | "finish" | "boost" | "trap" | "checkpoint" | "plain";

const ROLE_LABEL: Partial<Record<StationRole, string>> = {
  start: "البداية",
  finish: "النهاية",
  boost: "قفزة",
  trap: "فخ",
  checkpoint: "نقطة حفظ",
};

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
  /** The station currently reacting, while a ladder or slide fires. */
  effect?: { position: number; kind: "boost" | "trap" };
  /** The team whose token is mid-move, for a touch of extra emphasis. */
  travellingTeamId?: string;
  /** Shown over the board only while a committed turn is being replayed. */
  centre?: React.ReactNode;
  className?: string;
}) {
  const routes = marhalaRoutes(tiles);
  const byPosition = new Map(tiles.map((tile) => [tile.position, tile]));
  // A slide drops a team on a checkpoint, so the checkpoints are whatever the
  // slides of *this* board point at — never a second list to keep in step.
  const checkpoints = new Set(
    routes.filter((route) => route.kind === "trap").map((route) => route.to),
  );
  const roleOf = (tile: MarhalaTile): StationRole => {
    if (tile.kind === "finish") return "finish";
    if (tile.kind === "boost") return "boost";
    if (tile.kind === "trap") return "trap";
    if (checkpoints.has(tile.position)) return "checkpoint";
    if (tile.position === MARHALA_START_POSITION) return "start";
    return "plain";
  };

  const ordered = [...tiles].sort((a, b) => a.position - b.position);
  const road = ordered
    .map((tile, index) => `${index === 0 ? "M" : "L"}${pt(centreOf(tile))}`)
    .join(" ");
  const rows = [...new Set(tiles.map((tile) => tile.row))].sort();

  const connections = routes.flatMap((route) => {
    const from = byPosition.get(route.from);
    const to = byPosition.get(route.to);
    if (!from || !to) return [];
    const a = centreOf(from);
    const b = centreOf(to);
    const u = unit(a, b);
    const n = upward(u);
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    // The pill sits beside the connection, a little toward the station it
    // starts from: above a ladder, below a slide, so the two never read alike.
    const pill = along(
      along(middle, u, -44),
      n,
      route.kind === "boost" ? 49 : -52,
    );
    return [{ ...route, a, b, u, n, pill }];
  });

  return (
    <div
      data-testid="marhala-board"
      dir="ltr"
      className={cn("relative mx-auto w-full", className)}
      style={{ aspectRatio: `${W} / ${H}` }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 size-full"
        role="group"
        aria-label="لوحة المرحلة"
      >
        {/* A faint band under each row, so four rows read as four rows. */}
        {rows.map((row) => (
          <rect
            key={row}
            x={20}
            y={(ROW_Y[row - 1] ?? 0) - 62}
            width={W - 40}
            height={124}
            rx={30}
            fill={row % 2 === 1 ? "#F6F3FC" : "#FBFAFE"}
            stroke="#D9D2F0"
            strokeWidth={2}
            strokeDasharray="3 9"
            aria-hidden
          />
        ))}

        {/* The road, 1 → 16, with the direction of travel printed on it. */}
        <g aria-hidden>
          <path
            d={road}
            fill="none"
            stroke={NAVY}
            strokeWidth={30}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d={road}
            fill="none"
            stroke={ROAD}
            strokeWidth={22}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {ordered.slice(0, -1).map((tile, index) => {
            const next = ordered[index + 1];
            if (!next) return null;
            const a = centreOf(tile);
            const b = centreOf(next);
            const u = unit(a, b);
            const n = { x: -u.y, y: u.x };
            const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const tip = along(middle, u, 9);
            const base = along(middle, u, -6);
            return (
              <polygon
                key={tile.position}
                points={`${pt(tip)} ${pt(along(base, n, 8))} ${pt(along(base, n, -8))}`}
                fill={NAVY}
              />
            );
          })}
        </g>

        {connections.map((route) =>
          route.kind === "boost" ? (
            <Ladder
              key={`${route.from}-${route.to}`}
              route={route}
              active={effect?.position === route.from}
            />
          ) : (
            <Slide
              key={`${route.from}-${route.to}`}
              route={route}
              active={effect?.position === route.from}
            />
          ),
        )}

        {tiles.map((tile) => (
          <Station
            key={tile.position}
            tile={tile}
            role={roleOf(tile)}
            reacting={
              effect?.position === tile.position ? effect.kind : undefined
            }
          />
        ))}
      </svg>

      {/* Where each connection leads, in words. HTML, so the pill sizes itself
          to its sentence instead of to a guess at the sentence's width. */}
      {connections.map((route) => (
        <span
          key={`pill-${route.from}`}
          dir="rtl"
          data-testid={`marhala-route-label-${route.from}`}
          style={{
            left: `${(route.pill.x / W) * 100}%`,
            top: `${(route.pill.y / H) * 100}%`,
          }}
          className="pointer-events-none absolute inline-flex min-h-[26px] -translate-x-1/2 -translate-y-1/2 items-center whitespace-nowrap rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white px-2.5 text-[11px] font-extrabold text-[hsl(var(--brand-navy))] lg:text-[13px]"
        >
          {route.kind === "boost" ? "يطلّعك لـ " : "ينزّلك لـ "}
          <span className="akwaan-numeral ms-1">{route.to}</span>
        </span>
      ))}

      {teams.map((team) => {
        const position = positions[team.id];
        const tile =
          position === undefined ? undefined : byPosition.get(position);
        if (!tile || position === undefined) return null;
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
          />
        );
      })}

      {/* The movement beat, and only that: the calm board stays sixteen
          readable stations, and the turn is already named beside it. */}
      {centre && (
        <div
          data-testid="marhala-board-centre"
          dir="rtl"
          className="pointer-events-none absolute inset-0 grid place-items-center"
        >
          <div className="rounded-[22px] border-[3px] border-[hsl(var(--brand-navy))] bg-white px-8 py-5 text-center shadow-[5px_6px_0_hsl(var(--brand-navy))]">
            {centre}
          </div>
        </div>
      )}
    </div>
  );
}

interface DrawnRoute {
  from: number;
  to: number;
  kind: "boost" | "trap";
  a: Point;
  b: Point;
  u: Point;
  n: Point;
}

function routeProps(
  route: DrawnRoute,
  object: "ladder" | "slide",
  active: boolean,
) {
  return {
    "data-testid": `marhala-route-${route.from}-${route.to}`,
    "data-route-kind": route.kind,
    "data-route-object": object,
    "data-route-source": route.from,
    "data-route-destination": route.to,
    "data-route-active": active ? "true" : "false",
    "aria-hidden": true,
  } as const;
}

/**
 * A boost, drawn as the ladder it is: a purple strip with white rungs, running
 * straight between the two stations it joins.
 */
function Ladder({ route, active }: { route: DrawnRoute; active: boolean }) {
  const start = along(route.a, route.u, 50);
  const end = along(route.b, route.u, -50);
  const length = Math.hypot(end.x - start.x, end.y - start.y);
  const across = { x: -route.u.y, y: route.u.x };
  const rungs: Point[] = [];
  for (let at = 20; at <= length - 12; at += 18.8) {
    rungs.push(along(start, route.u, at));
  }
  return (
    <g {...routeProps(route, "ladder", active)}>
      {active && (
        <line
          x1={start.x}
          y1={start.y}
          x2={end.x}
          y2={end.y}
          stroke={GOLD}
          strokeWidth={54}
          strokeLinecap="round"
        />
      )}
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={NAVY}
        strokeWidth={40}
        strokeLinecap="round"
      />
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke={PURPLE}
        strokeWidth={32}
        strokeLinecap="round"
      />
      {rungs.map((rung, index) => {
        const p = along(rung, across, 10);
        const q = along(rung, across, -10);
        return (
          <line
            key={index}
            data-ladder-rung
            x1={round(p.x)}
            y1={round(p.y)}
            x2={round(q.x)}
            y2={round(q.y)}
            stroke="#FFFFFF"
            strokeWidth={5}
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

/**
 * A trap, drawn as the slide it is: a dark tube that bows between its two
 * stations, a dotted line down its middle and an arrowhead at its foot.
 */
function Slide({ route, active }: { route: DrawnRoute; active: boolean }) {
  const start = along(route.a, route.u, 54);
  const end = along(route.b, route.u, -54);
  const control = along(
    { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
    route.n,
    15.6,
  );
  const d = `M${pt(start)} Q${pt(control)} ${pt(end)}`;
  const across = { x: -route.u.y, y: route.u.x };
  const tip = along(end, route.u, 26);
  return (
    <g {...routeProps(route, "slide", active)}>
      {active && (
        <path
          d={d}
          fill="none"
          stroke={GOLD}
          strokeWidth={52}
          strokeLinecap="round"
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={NAVY}
        strokeWidth={38}
        strokeLinecap="round"
      />
      <path
        d={d}
        fill="none"
        stroke={SLIDE}
        strokeWidth={30}
        strokeLinecap="round"
      />
      <path
        d={d}
        fill="none"
        stroke="#B9B2D9"
        strokeWidth={5}
        strokeDasharray="2 16"
        strokeLinecap="round"
      />
      <polygon
        data-slide-arrow
        points={`${pt(tip)} ${pt(along(end, across, 20))} ${pt(along(end, across, -20))}`}
        fill={SLIDE}
        stroke={NAVY}
        strokeWidth={4}
        strokeLinejoin="round"
      />
    </g>
  );
}

const STATION_FILL: Record<StationRole, { fill: string; ink: string }> = {
  plain: { fill: "#FFFFFF", ink: NAVY },
  start: { fill: "#FFFFFF", ink: NAVY },
  checkpoint: { fill: GOLD, ink: NAVY },
  finish: { fill: GOLD, ink: NAVY },
  boost: { fill: PURPLE, ink: "#FFFFFF" },
  trap: { fill: SLIDE, ink: "#FFFFFF" },
};

/** One station: a rounded square with its number, and its role in a word. */
function Station({
  tile,
  role,
  reacting,
}: {
  tile: MarhalaTile;
  role: StationRole;
  reacting?: "boost" | "trap";
}) {
  const { x, y } = centreOf(tile);
  const size = role === "finish" ? TILE_FINISH : TILE;
  const half = size / 2;
  const { fill, ink } = STATION_FILL[role];
  const label = ROLE_LABEL[role];
  // The stations that hold something stand off the board on a hard shadow.
  const raised = role === "start" || role === "checkpoint" || role === "finish";
  return (
    <g
      data-testid={`marhala-tile-${tile.position}`}
      data-tile-kind={tile.kind}
      data-tile-role={role}
      data-tile-reacting={reacting}
      aria-label={marhalaTileAria(tile, role)}
    >
      <title>{marhalaTileAria(tile, role)}</title>
      {reacting && (
        <rect
          x={x - half - 9}
          y={y - half - 9}
          width={size + 18}
          height={size + 18}
          rx={31}
          fill="none"
          stroke={GOLD}
          strokeWidth={6}
          className="animate-pulse motion-reduce:animate-none"
        />
      )}
      {raised && (
        <rect
          x={x - half + 4}
          y={y - half + 5}
          width={size}
          height={size}
          rx={24}
          fill={NAVY}
        />
      )}
      <rect
        x={x - half}
        y={y - half}
        width={size}
        height={size}
        rx={24}
        fill={fill}
        stroke={NAVY}
        strokeWidth={3}
      />
      {role === "finish" ? (
        <path
          transform={`translate(${x} ${y - 9}) scale(1.67)`}
          d="M0 -10 Q1.8 -1.8 10 0 Q1.8 1.8 0 10 Q-1.8 1.8 -10 0 Q-1.8 -1.8 0 -10Z"
          fill={NAVY}
        />
      ) : (
        <text
          x={x}
          y={label ? y - 7 : y + 1}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={label ? 24 : 30}
          fontWeight={700}
          fill={ink}
          className="akwaan-numeral"
        >
          {tile.position}
        </text>
      )}
      {label && (
        <text
          x={x}
          y={role === "finish" ? y + 30 : y + 18}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fontWeight={800}
          fill={ink}
        >
          {label}
        </text>
      )}
    </g>
  );
}

/**
 * A team's piece: its player's character, with a small tag naming the team.
 *
 * It stands at the station's shoulder rather than on its face, so the number
 * under it is never covered, and the second team takes the other shoulder when
 * both share a station. The team colour is the dot in the tag and nothing else.
 */
function Token({
  team,
  teams,
  tile,
  position,
  active,
  travelling,
  seat,
}: {
  team: MarhalaBoardTeam;
  teams: MarhalaBoardTeam[];
  tile: MarhalaTile;
  position: number;
  active: boolean;
  travelling: boolean;
  seat: number;
}) {
  const identity = teamIdentityOf(team.id, teams);
  const { x, y } = centreOf(tile);
  // A walk moves one station at a time; a ladder or a slide covers several in
  // one move, and gets the longer travel so the eye can follow it.
  // Decided once per move and then held: a re-render halfway through a slide
  // must not swap the long travel for the short one.
  const move = useRef({ position, leap: false });
  if (move.current.position !== position) {
    move.current = {
      position,
      leap: Math.abs(position - move.current.position) > 1,
    };
  }
  const leap = move.current.leap;
  const shortName = team.name.replace(/^الفريق\s+/, "") || team.name;
  return (
    <div
      data-testid={`marhala-token-${team.id}`}
      data-token-active={active ? "true" : "false"}
      data-token-travelling={travelling ? "true" : undefined}
      data-token-position={position}
      dir="rtl"
      title={team.name}
      aria-label={`${team.name} في المحطة ${position}${active ? " — دورهم" : ""}`}
      style={{
        left: `${((x + (seat === 0 ? 43 : -43)) / W) * 100}%`,
        top: `${((y - 74) / H) * 100}%`,
        transitionDuration: leap ? "650ms" : "220ms",
      }}
      className={cn(
        "absolute flex w-[5%] -translate-x-1/2 flex-col items-center gap-0.5 transition-[left,top] ease-out motion-reduce:transition-none",
        travelling ? "z-20" : active ? "z-10" : "z-0",
      )}
    >
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border-2 border-[hsl(var(--brand-navy))] bg-white px-2 py-px text-[10px] font-extrabold text-[hsl(var(--brand-navy))] lg:text-[11px]">
        <span
          aria-hidden
          className={cn(
            "size-2.5 shrink-0 rounded-full border-2 border-[hsl(var(--brand-navy))]",
            identity.dot,
          )}
        />
        {shortName}
      </span>
      {/* Re-keyed per station so every step is its own small hop: the room
          counts the stations out loud with it. */}
      <span
        key={position}
        aria-hidden
        className={cn(
          "block aspect-square w-full [&>svg]:size-full",
          travelling &&
            !leap &&
            "animate-[marhala-hop_220ms_ease-out] motion-reduce:animate-none",
        )}
      >
        {team.avatarKey ? (
          <PlayerCharacterIcon characterKey={team.avatarKey} size={50} />
        ) : (
          <svg
            viewBox="0 0 40 40"
            className="drop-shadow-[3px_4px_0_hsl(var(--brand-navy))]"
          >
            <circle
              cx="20"
              cy="20"
              r="16"
              fill="#F6F3FC"
              stroke={NAVY}
              strokeWidth="3.5"
            />
            <ellipse cx="15" cy="18.5" rx="2.3" ry="3.4" fill={NAVY} />
            <ellipse cx="25" cy="18.5" rx="2.3" ry="3.4" fill={NAVY} />
            <path
              d="M16 25.5 Q20 28.5 24 25.5"
              fill="none"
              stroke={NAVY}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        )}
      </span>
    </div>
  );
}

/** The three things on the board that need a word, under the board. */
export function MarhalaBoardLegend({ className }: { className?: string }) {
  return (
    <ul
      data-testid="marhala-board-legend"
      className={cn(
        "flex list-none flex-wrap items-center justify-center gap-x-6 gap-y-1.5 text-[13px] font-semibold text-[hsl(var(--brand-navy))] lg:text-sm",
        className,
      )}
    >
      <li className="inline-flex items-center gap-2">
        <svg aria-hidden viewBox="0 0 40 60" width="24" height="36">
          <line
            x1="20"
            y1="8"
            x2="20"
            y2="52"
            stroke={NAVY}
            strokeWidth="30"
            strokeLinecap="round"
          />
          <line
            x1="20"
            y1="8"
            x2="20"
            y2="52"
            stroke={PURPLE}
            strokeWidth="24"
            strokeLinecap="round"
          />
          <line x1="12" y1="18" x2="28" y2="18" stroke="#fff" strokeWidth="4" />
          <line x1="12" y1="30" x2="28" y2="30" stroke="#fff" strokeWidth="4" />
          <line x1="12" y1="42" x2="28" y2="42" stroke="#fff" strokeWidth="4" />
        </svg>
        <span>
          <strong className="font-extrabold">السلم</strong> يطلّعك قدام
        </span>
      </li>
      <li className="inline-flex items-center gap-2">
        <svg aria-hidden viewBox="0 0 60 40" width="40" height="27">
          <path
            d="M8 10 Q30 40 46 26"
            fill="none"
            stroke={NAVY}
            strokeWidth="16"
            strokeLinecap="round"
          />
          <path
            d="M8 10 Q30 40 46 26"
            fill="none"
            stroke={SLIDE}
            strokeWidth="10"
            strokeLinecap="round"
          />
          <polygon
            points="58,22 44,16 46,34"
            fill={SLIDE}
            stroke={NAVY}
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </svg>
        <span>
          <strong className="font-extrabold">الزحليقة</strong> تنزّلك لآخر نقطة
          حفظ
        </span>
      </li>
      <li className="inline-flex items-center gap-2">
        <span
          aria-hidden
          className="size-6 rounded-[7px] border-2 border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))]"
        />
        <span>
          <strong className="font-extrabold">نقطة حفظ</strong> ما تنزل تحتها
        </span>
      </li>
    </ul>
  );
}

/** What a screen reader hears, so a station's role never depends on its colour. */
function marhalaTileAria(tile: MarhalaTile, role: StationRole): string {
  const station = `المحطة ${tile.position}`;
  if (role === "finish") return `${station} — النهاية`;
  if (role === "boost")
    return `${station} — قفزة تطلّعكم للمحطة ${tile.destination}`;
  if (role === "trap")
    return `${station} — فخ ينزّلكم للمحطة ${tile.destination}`;
  if (role === "checkpoint") return `${station} — نقطة حفظ`;
  if (role === "start") return `${station} — البداية`;
  return station;
}

export { MARHALA_FINISH_POSITION };
