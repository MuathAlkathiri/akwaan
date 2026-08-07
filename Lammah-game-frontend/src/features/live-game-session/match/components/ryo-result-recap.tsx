"use client";

import { teamName } from "../presentation";
import type { LiveSessionSnapshot } from "../../model";
import type { MatchChallengeResult } from "../types";

/**
 * One RYO item, as the server recorded it.
 *
 * All three interactions are here — the answer, whether it was right, and the
 * opposing team's blind Trust/Steal — plus the two participants who were
 * authoritative for them. That last part is new: "team B stole" is much less
 * interesting than "Khaled stole".
 */
export interface RyoResultItem {
  itemIndex?: number;
  prompt?: string;
  answeringTeamId?: string;
  answererParticipantId?: string;
  selectedAnswer?: string | number | null;
  correctAnswer?: string | number | null;
  correct?: boolean;
  opposingTeamId?: string;
  deciderParticipantId?: string;
  decision?: "trust" | "steal" | string;
  points?: Array<{ teamId: string; points: number }>;
}

export interface RyoResultDetails {
  itemsPlayed?: number;
  items?: RyoResultItem[];
}

const DECISION_LABEL: Record<string, string> = {
  trust: "وثق",
  steal: "سرق",
};

/**
 * The three-item recap.
 *
 * Read-only and entirely server-sourced: the winner comes from the record, and
 * the per-item points come from the events the challenge already minted.
 */
export function RyoResultRecap({
  result,
  snapshot,
}: {
  result: MatchChallengeResult;
  snapshot: LiveSessionSnapshot;
}) {
  const details = result.details as RyoResultDetails | undefined;
  const items = details?.items ?? [];
  const person = (participantId?: string) =>
    snapshot.participants.find((candidate) => candidate.id === participantId)
      ?.displayName;

  return (
    <div className="space-y-5" data-testid="ryo-result-recap">
      <ol className="space-y-3">
        {items.map((item, index) => (
          <li
            key={item.itemIndex ?? index}
            data-testid={`ryo-result-item-${index}`}
            className="space-y-1 rounded-xl border border-black/[0.06] bg-slate-50 p-4 text-sm"
          >
            <p className="font-black text-slate-900">
              السؤال {index + 1}
              {item.prompt ? ` · ${item.prompt}` : ""}
            </p>
            <p>
              <span className="font-bold">
                {teamName(snapshot, item.answeringTeamId)}
              </span>
              {person(item.answererParticipantId)
                ? ` (${person(item.answererParticipantId)})`
                : ""}
              {" أجاب: "}
              <span dir="auto">{String(item.selectedAnswer ?? "—")}</span>{" "}
              <span
                className={
                  item.correct ? "font-black text-emerald-700" : "font-black text-rose-700"
                }
              >
                {item.correct ? "صحيح ✓" : "خطأ ✗"}
              </span>
            </p>
            {!item.correct && item.correctAnswer != null && (
              <p className="text-slate-600">
                الإجابة الصحيحة: <span dir="auto">{String(item.correctAnswer)}</span>
              </p>
            )}
            <p>
              <span className="font-bold">
                {teamName(snapshot, item.opposingTeamId)}
              </span>
              {person(item.deciderParticipantId)
                ? ` (${person(item.deciderParticipantId)})`
                : ""}
              {": "}
              {DECISION_LABEL[String(item.decision)] ?? String(item.decision ?? "—")}
            </p>
            {(item.points ?? [])
              .filter((entry) => entry.points !== 0)
              .map((entry) => (
                <p key={entry.teamId} className="font-bold text-slate-700">
                  {teamName(snapshot, entry.teamId)}:{" "}
                  {entry.points > 0 ? `+${entry.points}` : entry.points}
                </p>
              ))}
          </li>
        ))}
      </ol>

      <section
        className="space-y-1 rounded-2xl bg-slate-900 p-6 text-center text-white"
        data-testid="ryo-result-winner"
      >
        <p className="text-2xl font-black">
          {result.winnerTeamId
            ? `🏆 فوز ${teamName(snapshot, result.winnerTeamId)}`
            : "تعادل في هذا التحدي"}
        </p>
        <p className="text-sm text-slate-200">
          {result.teamPoints
            .map(
              (entry) =>
                `${teamName(snapshot, entry.teamId)} ${entry.points > 0 ? "+" : ""}${entry.points}`,
            )
            .join(" · ")}
        </p>
      </section>
    </div>
  );
}
