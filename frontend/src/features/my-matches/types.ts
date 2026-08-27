export type MatchResumeState =
  "resumable" | "session_expired" | "session_terminal";

export interface MyMatchSummary {
  matchId: string;
  liveSessionId: string;
  status: string;
  stage: string;
  resumeState: MatchResumeState;
  resumable: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  teams: Array<{
    id: string;
    name: string;
    signedScore: number;
    displayScore: number;
  }>;
  occurrences: Array<{
    occurrenceIndex: number;
    worldId: string;
    selectedScopeIds: string[];
  }>;
  progress: { completedChallenges: number; totalChallenges: number };
  result?: { winnerTeamId: string | null; tie: boolean };
}

export interface MyMatchesPage {
  active: MyMatchSummary[];
  completed: MyMatchSummary[];
  pagination: {
    page: number;
    limit: number;
    completedTotal: number;
    hasMore: boolean;
  };
}
