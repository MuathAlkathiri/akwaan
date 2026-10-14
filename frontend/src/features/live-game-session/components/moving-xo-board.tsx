"use client";

import { Circle, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { teamIdentityOf } from "@/lib/team-identity";
import {
  movingXoSymbol,
  type MovingXoBoardView,
} from "../match/moving-xo.presentation";

export function MovingXoBoard({
  board,
  teams,
  legalCells = [],
  expiringCell,
  winningLine = [],
  onPlace,
  disabled = false,
  compact = false,
}: {
  board: MovingXoBoardView;
  teams: ReadonlyArray<{ id: string; name: string }>;
  legalCells?: readonly number[];
  expiringCell?: number;
  winningLine?: readonly number[];
  onPlace?: (cell: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const interactive = Boolean(onPlace);
  return (
    <div
      role="grid"
      aria-label="لوحة X و O"
      data-testid="moving-xo-board"
      className={cn(
        "mx-auto grid aspect-square w-full grid-cols-3 gap-2 rounded-[calc(var(--radius)+0.35rem)] border border-border/70 bg-muted/35 p-2 shadow-sm",
        compact ? "max-w-[22rem]" : "max-w-[min(34rem,58dvh)] gap-3 p-3",
      )}
    >
      {board.cells.map((owner, cell) => {
        const team = teams.find((candidate) => candidate.id === owner);
        const symbol = movingXoSymbol(owner, teams);
        const identity = owner ? teamIdentityOf(owner, teams) : undefined;
        const legal = interactive && legalCells.includes(cell) && !disabled;
        const expiring = cell === expiringCell;
        const winning = winningLine.includes(cell);
        const label = owner
          ? `${team?.name ?? "فريق"}، ${symbol ?? "علامة"}${
              expiring ? "، العلامة الأقدم ويمكن تجديدها" : ""
            }`
          : legal
            ? `خانة فارغة ${cell + 1}، متاحة للاختيار`
            : `خانة فارغة ${cell + 1}`;
        const cellClass = cn(
          "relative grid aspect-square min-h-[3.5rem] place-items-center overflow-hidden rounded-[var(--radius)] border-2 bg-card transition duration-fast ease-akwaan",
          identity?.surface,
          identity?.border,
          legal &&
            "cursor-pointer border-brand-gold/80 bg-brand-gold/10 shadow-[0_0_0_3px_hsl(var(--brand-gold)/0.12)] hover:-translate-y-0.5 hover:bg-brand-gold/15 active:translate-y-0",
          !legal && interactive && "cursor-default",
          expiring &&
            "opacity-50 ring-2 ring-brand-gold ring-offset-2 ring-offset-background motion-safe:animate-pulse",
          winning && "ring-4 ring-success ring-offset-2 ring-offset-background",
        );
        const contents = (
          <>
            {symbol === "X" && (
              <X
                strokeWidth={3.3}
                className={cn(
                  compact ? "size-12" : "size-16 sm:size-20",
                  identity?.text,
                )}
                aria-hidden
              />
            )}
            {symbol === "O" && (
              <Circle
                strokeWidth={3.3}
                className={cn(
                  compact ? "size-11" : "size-14 sm:size-[4.5rem]",
                  identity?.text,
                )}
                aria-hidden
              />
            )}
            {expiring && (
              <span className="absolute inset-x-1 bottom-1 rounded-full bg-background/90 px-1 py-0.5 text-[0.6rem] font-black text-foreground shadow-sm">
                {legal ? "الأقدم · جدّدها" : "الأقدم"}
              </span>
            )}
            {legal && !owner && (
              <span
                aria-hidden
                className="size-2.5 rounded-full bg-brand-gold/70"
              />
            )}
          </>
        );
        if (interactive) {
          return (
            <button
              key={cell}
              type="button"
              role="gridcell"
              aria-label={label}
              disabled={!legal}
              onClick={() => legal && onPlace?.(cell)}
              data-testid={`moving-xo-cell-${cell}`}
              data-owner={owner ?? "empty"}
              data-legal={legal ? "true" : "false"}
              data-expiring={expiring ? "true" : "false"}
              data-winning={winning ? "true" : "false"}
              className={cellClass}
            >
              {contents}
            </button>
          );
        }
        return (
          <div
            key={cell}
            role="gridcell"
            aria-label={label}
            data-testid={`moving-xo-cell-${cell}`}
            data-owner={owner ?? "empty"}
            data-expiring={expiring ? "true" : "false"}
            data-winning={winning ? "true" : "false"}
            className={cellClass}
          >
            {contents}
          </div>
        );
      })}
    </div>
  );
}
