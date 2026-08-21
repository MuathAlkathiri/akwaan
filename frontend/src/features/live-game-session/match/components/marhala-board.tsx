"use client";

import { Flag, Rocket, ShieldCheck, Zap } from "lucide-react";

import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import {
  MARHALA_FINISH_POSITION,
  marhalaBoardRows,
  type MarhalaTile,
  type MarhalaTileKind,
} from "../marhala.presentation";

/** Only what a token needs: identity comes from the team's slot in this list. */
export interface MarhalaBoardTeam {
  id: string;
  name: string;
}

/**
 * The race board: sixteen tiles, one continuous path, two tokens on it.
 *
 * This is the hero of the shared screen, not decoration around a trivia card —
 * the decision the mechanic is built on ("which band is the smartest risk from
 * *here*") can only be made by reading the board. So the tiles are large, the
 * numbers are legible from across a room, and the reward and hazard tiles say what
 * they do in words as well as in colour and shape.
 *
 * Geometry comes from `MARHALA_BOARD` and nowhere else, so the tile the token walks
 * onto is the tile drawn in that place. The grid is laid out in a fixed direction
 * rather than inheriting the page's RTL, because the serpentine has a direction of
 * its own: reversing it per locale would turn a continuous path into a jumble.
 */

const TILE_ICON: Record<MarhalaTileKind, typeof Zap> = {
  boost: Rocket,
  trap: Zap,
  finish: Flag,
  normal: ShieldCheck,
};

const TILE_LABEL: Record<MarhalaTileKind, string> = {
  boost: "قفزة",
  trap: "عطل",
  finish: "النهاية",
  normal: "",
};

export function MarhalaBoard({
  teams,
  positions,
  activeTeamId,
  highlight = [],
  effect,
  travellingTeamId,
  className,
}: {
  teams: MarhalaBoardTeam[];
  /** Where each token is drawn right now — mid-replay this may trail the server. */
  positions: Record<string, number>;
  activeTeamId: string;
  /** Tiles a chosen or considered band could reach. */
  highlight?: number[];
  /** The tile currently reacting, while a boost or trap fires. */
  effect?: { position: number; kind: "boost" | "trap" };
  /** The team whose token is mid-move, for a touch of extra emphasis. */
  travellingTeamId?: string;
  className?: string;
}) {
  const rows = marhalaBoardRows();
  return (
    <div
      data-testid="marhala-board"
      className={cn("space-y-2.5", className)}
      // The path's own direction. Tiles carry numerals and short labels, each of
      // which sets its own direction where it matters.
      dir="ltr"
    >
      <div className="grid grid-rows-4 gap-1.5 sm:gap-2">
        {rows.map((row) => (
          <div
            key={row[0]?.row}
            className="grid grid-cols-4 gap-1.5 sm:gap-2"
            data-marhala-row={row[0]?.row}
          >
            {row.map((tile) => (
              <Tile
                key={tile.position}
                tile={tile}
                teams={teams}
                activeTeamId={activeTeamId}
                occupants={teams.filter(
                  (team) => positions[team.id] === tile.position,
                )}
                highlighted={highlight.includes(tile.position)}
                reacting={
                  effect?.position === tile.position ? effect.kind : undefined
                }
                travellingTeamId={travellingTeamId}
              />
            ))}
          </div>
        ))}
      </div>
      <BoardLegend />
    </div>
  );
}

function Tile({
  tile,
  teams,
  activeTeamId,
  occupants,
  highlighted,
  reacting,
  travellingTeamId,
}: {
  tile: MarhalaTile;
  teams: MarhalaBoardTeam[];
  activeTeamId: string;
  occupants: MarhalaBoardTeam[];
  highlighted: boolean;
  reacting?: "boost" | "trap";
  travellingTeamId?: string;
}) {
  const Icon = TILE_ICON[tile.kind];
  const label = TILE_LABEL[tile.kind];
  return (
    <div
      data-testid={`marhala-tile-${tile.position}`}
      data-tile-kind={tile.kind}
      data-tile-highlighted={highlighted ? "true" : undefined}
      data-tile-reacting={reacting}
      aria-label={marhalaTileAria(tile)}
      className={cn(
        "relative flex aspect-square flex-col justify-between overflow-hidden rounded-[var(--radius)] border p-1.5 transition-all duration-fast ease-akwaan sm:p-2",
        tile.kind === "normal" && "border-border bg-card",
        // Reward and hazard are separated by shape and label as well as tone: a
        // room that cannot tell gold from red still reads "قفزة" and "عطل".
        tile.kind === "boost" &&
          "border-brand-gold/60 bg-brand-gold/12 shadow-[inset_0_-2px_0_0_hsl(var(--brand-gold)/0.5)]",
        tile.kind === "trap" &&
          "border-destructive/55 bg-destructive/10 [background-image:repeating-linear-gradient(135deg,transparent_0_5px,hsl(var(--destructive)/0.10)_5px_10px)]",
        tile.kind === "finish" &&
          "border-brand-gold bg-brand-gold/25 ring-1 ring-brand-gold/40",
        highlighted &&
          "ring-2 ring-primary ring-offset-1 ring-offset-background",
        reacting === "boost" && "scale-[1.04] ring-2 ring-brand-gold",
        reacting === "trap" && "scale-[0.97] ring-2 ring-destructive",
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="akwaan-numeral text-sm font-black leading-none text-foreground sm:text-lg">
          {tile.position}
        </span>
        {tile.kind !== "normal" && (
          <Icon
            className={cn(
              "size-3.5 shrink-0 sm:size-4",
              tile.kind === "trap" ? "text-destructive" : "text-brand-gold",
            )}
            aria-hidden
          />
        )}
      </div>

      {tile.kind !== "normal" && (
        <p
          dir="rtl"
          className={cn(
            "truncate text-[0.6rem] font-black leading-none sm:text-[0.7rem]",
            tile.kind === "trap" ? "text-destructive" : "text-brand-gold",
          )}
        >
          {label}
          {tile.kind !== "finish" && (
            <span className="akwaan-numeral font-bold">
              {" "}
              ← {tile.destination}
            </span>
          )}
        </p>
      )}

      {occupants.length > 0 && (
        <div className="flex flex-wrap items-center gap-1" dir="rtl">
          {occupants.map((team) => (
            <Token
              key={team.id}
              team={team}
              teams={teams}
              active={team.id === activeTeamId}
              travelling={team.id === travellingTeamId}
              crowded={occupants.length > 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A team's physical presence on the board.
 *
 * Both teams are always drawn, including when they share a tile — the token shrinks
 * rather than stacking, because a hidden token reads as a team that is not in the
 * race. Identity is the Match's own team slot, so a team is the same colour here as
 * on the board, the scoreboard and its own phone, and the initial is carried inside
 * the token so colour is never the only difference.
 */
function Token({
  team,
  teams,
  active,
  travelling,
  crowded,
}: {
  team: MarhalaBoardTeam;
  teams: MarhalaBoardTeam[];
  active: boolean;
  travelling: boolean;
  crowded: boolean;
}) {
  const identity = teamIdentityOf(team.id, teams);
  return (
    <span
      data-testid={`marhala-token-${team.id}`}
      data-token-active={active ? "true" : "false"}
      data-token-travelling={travelling ? "true" : undefined}
      title={team.name}
      aria-label={`${team.name}${active ? " — دورهم" : ""}`}
      className={cn(
        "inline-flex items-center justify-center rounded-full border-2 border-background font-black leading-none shadow-sm transition-transform duration-fast ease-akwaan",
        identity.solid,
        crowded
          ? "size-4 text-[0.55rem] sm:size-5 sm:text-[0.6rem]"
          : "size-5 text-[0.6rem] sm:size-7 sm:text-xs",
        active &&
          "ring-2 ring-offset-1 ring-offset-background " + identity.ring,
        travelling && "scale-110",
      )}
    >
      {team.name.trim().slice(0, 1) || identity.slot}
    </span>
  );
}

function BoardLegend() {
  return (
    <ul
      dir="rtl"
      data-testid="marhala-board-legend"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[0.65rem] font-bold text-muted-foreground sm:text-xs"
    >
      <li className="inline-flex items-center gap-1">
        <Rocket className="size-3.5 text-brand-gold" aria-hidden />
        قفزة — تقدّم إضافي
      </li>
      <li className="inline-flex items-center gap-1">
        <Zap className="size-3.5 text-destructive" aria-hidden />
        عطل — رجوع للخلف
      </li>
      <li className="inline-flex items-center gap-1">
        <Flag className="size-3.5 text-brand-gold" aria-hidden />
        المربّع {MARHALA_FINISH_POSITION} — النهاية
      </li>
    </ul>
  );
}

/** What a screen reader hears, so a tile's role never depends on its colour. */
function marhalaTileAria(tile: MarhalaTile): string {
  if (tile.kind === "finish") return `المربّع ${tile.position} — النهاية`;
  if (tile.kind === "boost")
    return `المربّع ${tile.position} — قفزة إلى ${tile.destination}`;
  if (tile.kind === "trap")
    return `المربّع ${tile.position} — عطل يرجعك إلى ${tile.destination}`;
  return `المربّع ${tile.position}`;
}
