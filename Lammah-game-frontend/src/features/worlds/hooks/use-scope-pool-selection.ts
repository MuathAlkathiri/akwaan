"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { getLiveSession } from "@/features/live-game-session/api/live-session-api";
import {
  listMatchScopes,
  selectMatchScopes,
} from "@/features/live-game-session/match/api/match-api";
import { getApiErrorMessage } from "@/lib/utils";
import type { PlayableWorld } from "../types";
import { SCOPES_PER_OCCURRENCE } from "../components/scope-selection";

/**
 * The four Scopes of the current World occurrence.
 *
 * The in-progress ticks are local, because a half-made choice is not worth a
 * round trip. The confirmed pool is not: it is sent to the Match against the
 * authoritative revision, and the Match alone decides whether the occurrence may
 * open its board. Nothing here treats the local list as authority.
 */
export function useScopePoolSelection(sessionId?: string) {
  const router = useRouter();
  const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([]);
  const [error, setError] = useState<string | undefined>();

  const toggle = useCallback((scopeId: string) => {
    setError(undefined);
    setSelectedScopeIds((current) => {
      if (current.includes(scopeId)) {
        return current.filter((id) => id !== scopeId);
      }
      // A fifth pick is refused; one must be released first.
      return current.length >= SCOPES_PER_OCCURRENCE
        ? current
        : [...current, scopeId];
    });
  }, []);

  const confirm = useCallback(
    async (world: PlayableWorld) => {
      if (selectedScopeIds.length !== SCOPES_PER_OCCURRENCE) return;
      if (!sessionId) return;

      try {
        const session = await getLiveSession(sessionId);
        const match = session.match;
        if (!match) {
          setError("لا توجد مباراة مفتوحة في هذه الجلسة.");
          return;
        }
        if (match.currentOccurrence?.worldId !== world.id) {
          setError("هذا العالم ليس الدور الحالي في المباراة.");
          return;
        }
        const offered = new Set(
          (await listMatchScopes(sessionId)).map((scope) => scope.scopeId),
        );
        if (selectedScopeIds.some((id) => !offered.has(id))) {
          setError("أحد النطاقات المختارة لم يعد متاحاً. اختر بديلاً.");
          return;
        }
        await selectMatchScopes({
          sessionId,
          revision: match.revision,
          occurrenceIndex: match.currentOccurrence.index,
          scopeIds: selectedScopeIds,
        });
        router.push(
          `/worlds/${world.id}/board?sessionId=${encodeURIComponent(sessionId)}`,
        );
      } catch (cause) {
        setError(getApiErrorMessage(cause, "تعذر تأكيد النطاقات."));
      }
    },
    [router, selectedScopeIds, sessionId],
  );

  return { selectedScopeIds, toggle, confirm, error };
}
