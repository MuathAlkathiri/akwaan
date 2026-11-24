"use client";

import { cn } from "@/lib/utils";
import {
  movingXoSymbol,
  type MovingXoBoardView,
} from "../match/moving-xo.presentation";

/**
 * The two marks. Told apart by shape first — a navy cross, a purple ring — so
 * neither depends on its colour, and neither borrows a team's colour: a team is
 * a dot beside its name and nothing else.
 */
export function MovingXoMark({
  symbol,
  className,
  faded = false,
}: {
  symbol: "X" | "O";
  className?: string;
  faded?: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 40 40"
      data-mark={symbol}
      className={cn("size-[56%]", faded && "opacity-35", className)}
    >
      {symbol === "X" ? (
        <path
          d="M9 9 L31 31 M31 9 L9 31"
          stroke="hsl(var(--brand-navy))"
          strokeWidth="7"
          strokeLinecap="round"
        />
      ) : (
        <circle
          cx="20"
          cy="20"
          r="12"
          fill="none"
          stroke="hsl(var(--brand-purple))"
          strokeWidth="7"
        />
      )}
    </svg>
  );
}

/**
 * The 3×3 board, the same on the shared screen and in a hand.
 *
 * Gold marks game state and only game state: a cell that can be played, the
 * cell a thumb has chosen, the winning line. The mark that will move on the
 * team's next move sits faded in a dashed lavender cell labelled «بتنتقل», so
 * both teams can plan around it.
 */
export function MovingXoBoard({
  board,
  teams,
  legalCells = [],
  availableCells = [],
  expiringCell,
  winningLine = [],
  selectedCell,
  selectedSymbol,
  onPlace,
  disabled = false,
  compact = false,
}: {
  board: MovingXoBoardView;
  teams: ReadonlyArray<{ id: string; name: string }>;
  legalCells?: readonly number[];
  /** Cells to outline as playable on a surface that cannot play them. */
  availableCells?: readonly number[];
  expiringCell?: number;
  winningLine?: readonly number[];
  /** The cell a player has chosen and not yet confirmed. */
  selectedCell?: number;
  /** The mark the choosing team would place there. */
  selectedSymbol?: "X" | "O";
  onPlace?: (cell: number) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const interactive = Boolean(onPlace);
  return (
    <div
      role="grid"
      dir="ltr"
      aria-label="لوحة إكس أو"
      data-testid="moving-xo-board"
      className={cn(
        "mx-auto grid w-full grid-cols-3",
        compact
          ? "max-w-[314px] gap-2.5"
          : "max-w-[min(478px,52dvh)] gap-3.5",
      )}
    >
      {board.cells.map((owner, cell) => {
        const team = teams.find((candidate) => candidate.id === owner);
        const symbol = movingXoSymbol(owner, teams);
        const legal = interactive && legalCells.includes(cell) && !disabled;
        const expiring = cell === expiringCell;
        const winning = winningLine.includes(cell);
        const selected = cell === selectedCell;
        const open =
          !owner && !selected && (legal || availableCells.includes(cell));
        const label = selected
          ? `الخانة ${cell + 1}: اختياركم`
          : owner
            ? `الخانة ${cell + 1}: ${team?.name ?? "فريق"}، ${symbol === "X" ? "إكس" : "أو"}${
                expiring ? "، بتنتقل في الحركة الجاية" : ""
              }`
            : legal
              ? `الخانة ${cell + 1}: فاضية ومتاحة`
              : `الخانة ${cell + 1}: فاضية`;
        const cellClass = cn(
          "relative flex aspect-square items-center justify-center border-[3px] p-0 transition-colors duration-fast ease-akwaan",
          compact ? "rounded-2xl" : "rounded-[25px]",
          winning || selected
            ? "border-[hsl(var(--brand-navy))] bg-[hsl(var(--brand-gold))] shadow-[4px_5px_0_hsl(var(--brand-navy))]"
            : expiring
              ? "border-dashed border-brand-plum bg-brand-lavender"
              : open
                ? "border-dashed border-[hsl(var(--brand-gold))] bg-[#FFFBF0]"
                : "border-[hsl(var(--brand-navy))] bg-white",
          legal && "cursor-pointer",
          !legal && interactive && "cursor-default",
        );
        const contents = (
          <>
            {selected && selectedSymbol ? (
              <MovingXoMark symbol={selectedSymbol} />
            ) : (
              symbol && (
                <MovingXoMark
                  symbol={symbol}
                  faded={expiring && !winning}
                  className={cn(
                    "transition-opacity duration-base",
                    // The mark is leaving for the chosen cell: let it go.
                    expiring && selectedCell !== undefined && "opacity-10",
                  )}
                />
              )
            )}
            {expiring && !winning && (
              <span
                className={cn(
                  "absolute inset-x-0 bottom-1.5 text-center font-bold text-brand-plum",
                  compact ? "text-[11px]" : "text-[13px]",
                )}
              >
                بتنتقل
              </span>
            )}
          </>
        );
        const shared = {
          role: "gridcell",
          "aria-label": label,
          "data-testid": `moving-xo-cell-${cell}`,
          "data-owner": owner ?? "empty",
          "data-expiring": expiring ? "true" : "false",
          "data-winning": winning ? "true" : "false",
          "data-selected": selected ? "true" : "false",
          className: cellClass,
        } as const;
        if (interactive) {
          return (
            <button
              key={cell}
              type="button"
              {...shared}
              disabled={!legal}
              aria-pressed={selected}
              onClick={() => legal && onPlace?.(cell)}
              data-legal={legal ? "true" : "false"}
            >
              {contents}
            </button>
          );
        }
        return (
          <div key={cell} {...shared}>
            {contents}
          </div>
        );
      })}
    </div>
  );
}

/** Which team is which mark, each with its team dot. */
export function MovingXoLegend({
  teams,
  dotOf,
  className,
}: {
  teams: ReadonlyArray<{ id: string; name: string }>;
  dotOf: (teamId: string) => string;
  className?: string;
}) {
  return (
    <ul
      data-testid="moving-xo-legend"
      className={cn(
        "flex list-none flex-wrap items-center justify-center gap-x-[22px] gap-y-1 text-base font-bold text-[hsl(var(--brand-navy))]",
        className,
      )}
    >
      {teams.slice(0, 2).map((team) => {
        const symbol = movingXoSymbol(team.id, teams);
        return (
          <li key={team.id} className="inline-flex items-center gap-2">
            {symbol && <MovingXoMark symbol={symbol} className="size-[26px]" />}
            <span
              aria-hidden
              className={cn(
                "size-3.5 flex-none rounded-full border-2 border-[hsl(var(--brand-navy))]",
                dotOf(team.id),
              )}
            />
            {team.name}
          </li>
        );
      })}
    </ul>
  );
}
