"use client";

import {
  ChallengeWinnerBanner,
  ResultRoundCard,
} from "./challenge-result-banner";
import { hueColour } from "../../closest-colour";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";

interface ClosestRecapItem {
  itemIndex: number;
  correctValue: number;
  /** Present only for «تذكّر اللون»: the values are hues, drawn as colours. */
  sliderMode?: "colour-hue";
  answers: Record<string, number | null>;
  distances: Record<string, number | null>;
  winnerTeamId: string | null;
  tie: boolean;
}

function isColour(item: ClosestRecapItem) {
  return item.sliderMode === "colour-hue";
}

/** «تذكّر اللون» answers are hues: they are shown as colours, never numbers. */
function renderValue(
  item: ClosestRecapItem,
  value: number | null | undefined,
  label: string,
  testId?: string,
) {
  if (value === null || value === undefined) return "—";
  if (isColour(item)) {
    return (
      <span
        role="img"
        aria-label={label}
        data-testid={testId}
        className="inline-block size-7 rounded-full border-2 border-brand-navy align-middle"
        style={{ background: hueColour(value) }}
      />
    );
  }
  return <span className="akwaan-numeral">{value}</span>;
}

export function ClosestResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const items = Array.isArray(result.details.items)
    ? (result.details.items as unknown as ClosestRecapItem[])
    : [];
  const totals =
    result.details.mechanicTotals && typeof result.details.mechanicTotals === "object"
      ? (result.details.mechanicTotals as Record<string, number>)
      : {};
  const teams = snapshot.teams.filter((team) => team.active);
  return (
    <div className="space-y-5" data-testid="closest-challenge-result">
      <ol className="grid list-none gap-5 sm:grid-cols-3">
        {items.map((item) => (
          <ResultRoundCard
            key={item.itemIndex}
            round={item.itemIndex + 1}
            snapshot={snapshot}
            facts={[
              ...teams.map((team) => ({
                label: `تقدير ${team.name}`,
                value: renderValue(
                  item,
                  item.answers[team.id],
                  `لون ${team.name}`,
                ),
              })),
              {
                label: isColour(item) ? "اللون الصحيح" : "الرقم الصحيح",
                value: renderValue(
                  item,
                  item.correctValue,
                  "اللون الصحيح",
                  `closest-recap-colour-${item.itemIndex}`,
                ),
              },
            ]}
            // Closest to the number takes the round; a tie gives it to nobody.
            points={
              item.winnerTeamId ? [{ teamId: item.winnerTeamId, points: 1 }] : []
            }
          >
            {item.tie && (
              <p className="rounded-full border-2 border-dashed border-brand-dash bg-white px-3 py-1.5 text-center text-[15px] font-bold text-brand-plum">
                تعادل في هالجولة
              </p>
            )}
          </ResultRoundCard>
        ))}
      </ol>
      <ChallengeWinnerBanner
        result={result}
        snapshot={snapshot}
        totals={Object.fromEntries(
          teams.map((team) => [team.id, totals[team.id] ?? 0]),
        )}
      />
    </div>
  );
}
