import {
  GameplayModeState,
  GameplayPluginContext,
} from './gameplay-mode.plugin';
import {
  TOP5_DECISION_ACTION,
  TOP5_KEEP_OR_GIVE_PLUGIN,
  Top5Ownership,
  Top5Result,
  top5Result,
} from './top5-keep-or-give.plugin';
import {
  assignNextTeamAction,
  buildTeamRotations,
  createTeamActionAssignmentState,
  EligibleParticipant,
  parseTeamActionAssignments,
  serializeTeamActionAssignments,
} from './team-action-assignment';

const NOW = new Date('2026-08-07T10:00:00.000Z');
const TEAMS = ['team-a', 'team-b'];

const PARTICIPANTS: EligibleParticipant[] = [
  { participantId: 'a1', teamId: 'team-a', connected: true },
  { participantId: 'a2', teamId: 'team-a', connected: true },
  { participantId: 'b1', teamId: 'team-b', connected: true },
  { participantId: 'b2', teamId: 'team-b', connected: true },
];

/** Five ranked 1..5, five traps. Ids are stable so a test can name a card. */
const ENTRIES = [
  ...[1, 2, 3, 4, 5].map((rank) => ({
    id: `real-${rank}`,
    label: `حقيقي ${rank}`,
    rank,
  })),
  ...[1, 2, 3, 4, 5].map((index) => ({
    id: `trap-${index}`,
    label: `فخ ${index}`,
    rank: null,
  })),
];
const ALL_IDS = ENTRIES.map((entry) => entry.id);

function initialState(
  overrides: Partial<GameplayModeState> = {},
  participants = PARTICIPANTS,
): GameplayModeState {
  const opened = assignNextTeamAction(
    createTeamActionAssignmentState(
      buildTeamRotations({
        teams: TEAMS,
        participants,
        randomIndex: () => 0,
      }),
    ),
    {
      teamId: 'team-a',
      action: TOP5_DECISION_ACTION,
      participants,
    },
  );
  return {
    variant: 'keep-or-give',
    contentItemId: 'item-1',
    worldId: 'world-1',
    title: 'أفضل 5',
    instruction: 'احتفظ بها أو دسّها للخصم',
    rankingBasis: 'الترتيب الرسمي',
    sourceLabel: 'المصدر',
    asOfDate: '2026-08-01',
    entriesJson: JSON.stringify(ENTRIES),
    // Deck and reveal order are two independent server decisions; pinned here so
    // the test can assert on named cards.
    deckJson: JSON.stringify(ALL_IDS),
    revealOrderJson: JSON.stringify([...ALL_IDS].reverse()),
    teamIdsJson: JSON.stringify(TEAMS),
    ownershipJson: '[]',
    teamActionJson: serializeTeamActionAssignments(opened.state),
    startingTeamId: 'team-a',
    phase: 'deciding',
    ...overrides,
  };
}

function context(
  runtimeState: GameplayModeState,
  submitterParticipantId?: string,
  participants = PARTICIPANTS,
): GameplayPluginContext {
  return {
    sessionId: 'session-1',
    runtimeId: 'runtime-1',
    roundId: 'round-1',
    runtimeState,
    eligibleParticipants: participants,
    now: NOW,
    ...(submitterParticipantId ? { submitterParticipantId } : {}),
  };
}

/** Who the server currently says may decide. */
function assigned(runtimeState: GameplayModeState): {
  teamId: string;
  participantId: string;
  sequence: number;
} {
  const assignment = parseTeamActionAssignments(
    runtimeState.teamActionJson,
  ).assignments.find((entry) => entry.action === TOP5_DECISION_ACTION)!;
  return assignment;
}

/** Plays the whole deck with a fixed keep/give script. */
function playDeck(actions: Array<'keep' | 'give'>) {
  let runtimeState = initialState();
  let roundState = TOP5_KEEP_OR_GIVE_PLUGIN.createInitialRoundState(
    context(runtimeState),
  );
  const decidedBy: string[] = [];
  for (const action of actions) {
    const holder = assigned(runtimeState);
    decidedBy.push(holder.participantId);
    const handled = TOP5_KEEP_OR_GIVE_PLUGIN.handleCommand(
      context(runtimeState, holder.participantId),
      {
        type: 'decide-card',
        payload: { action, assignmentSequence: holder.sequence },
        runtimeState,
        roundState,
      },
    );
    runtimeState = handled.runtimeState;
    roundState = handled.roundState;
  }
  return { runtimeState, roundState, decidedBy };
}

describe('Top 5 keep-or-give plugin', () => {
  describe('content invariants', () => {
    it('accepts exactly ten entries with ranks 1..5 and five traps', () => {
      expect(() =>
        TOP5_KEEP_OR_GIVE_PLUGIN.validateRuntimeState(initialState()),
      ).not.toThrow();
    });

    it('refuses a deck that is not every entry exactly once', () => {
      expect(() =>
        TOP5_KEEP_OR_GIVE_PLUGIN.validateRuntimeState(
          initialState({ deckJson: JSON.stringify(ALL_IDS.slice(0, 9)) }),
        ),
      ).toThrow('every entry exactly once');
      expect(() =>
        TOP5_KEEP_OR_GIVE_PLUGIN.validateRuntimeState(
          initialState({
            deckJson: JSON.stringify([...ALL_IDS.slice(0, 9), 'real-1']),
          }),
        ),
      ).toThrow('every entry exactly once');
    });

    it('refuses a rank set that is not exactly 1..5', () => {
      expect(() =>
        TOP5_KEEP_OR_GIVE_PLUGIN.validateRuntimeState(
          initialState({
            entriesJson: JSON.stringify(
              ENTRIES.map((entry) =>
                entry.id === 'real-5' ? { ...entry, rank: 6 } : entry,
              ),
            ),
          }),
        ),
      ).toThrow('5 ranked');
    });

    it('refuses duplicate labels', () => {
      expect(() =>
        TOP5_KEEP_OR_GIVE_PLUGIN.validateRuntimeState(
          initialState({
            entriesJson: JSON.stringify(
              ENTRIES.map((entry) =>
                entry.id === 'trap-1' ? { ...entry, label: 'حقيقي 1' } : entry,
              ),
            ),
          }),
        ),
      ).toThrow('unique');
    });
  });

  describe('correctness never leaks before the result', () => {
    it('keeps ranks, the deck, and the reveal order out of every projection', () => {
      const runtimeState = initialState();
      const projected =
        TOP5_KEEP_OR_GIVE_PLUGIN.projectRuntimeState(runtimeState);
      const serialised = JSON.stringify(projected);
      expect(projected.entriesJson).toBeUndefined();
      expect(projected.deckJson).toBeUndefined();
      expect(projected.revealOrderJson).toBeUndefined();
      expect(projected.resultJson).toBeUndefined();
      // `rankingBasis` is authored prose the players are meant to read; what
      // must never appear is a per-entry rank or a trap's identity.
      expect(serialised).not.toContain('"rank"');
      expect(serialised).not.toContain('trap-');
      expect(serialised).not.toContain('real-');
    });

    it('shows the current card without its rank', () => {
      const roundState = TOP5_KEEP_OR_GIVE_PLUGIN.createInitialRoundState(
        context(initialState()),
      );
      const card = JSON.parse(
        String(
          TOP5_KEEP_OR_GIVE_PLUGIN.projectRoundState(roundState)
            .currentCardJson,
        ),
      ) as Record<string, unknown>;
      expect(card).toEqual({ id: 'real-1', label: 'حقيقي 1' });
      expect(card.rank).toBeUndefined();
    });

    it('publishes the result only once every card is decided', () => {
      const ninth = playDeck(Array<'keep'>(9).fill('keep'));
      expect(
        TOP5_KEEP_OR_GIVE_PLUGIN.projectRuntimeState(ninth.runtimeState)
          .resultJson,
      ).toBeUndefined();
      const tenth = playDeck(Array<'keep'>(10).fill('keep'));
      expect(
        TOP5_KEEP_OR_GIVE_PLUGIN.projectRuntimeState(tenth.runtimeState)
          .resultJson,
      ).toBeDefined();
    });
  });

  describe('gameplay', () => {
    it('alternates the acting team A, B, A, B and rotates each team internally', () => {
      const { decidedBy } = playDeck(Array<'keep'>(10).fill('keep'));
      // Two players per team, so each team's two players take turns.
      expect(decidedBy).toEqual([
        'a1',
        'b1',
        'a2',
        'b2',
        'a1',
        'b1',
        'a2',
        'b2',
        'a1',
        'b1',
      ]);
    });

    it('gives ownership to the acting team on keep and the opponent on give', () => {
      const { runtimeState } = playDeck(['keep', 'give']);
      const ownership = JSON.parse(
        String(runtimeState.ownershipJson),
      ) as Top5Ownership[];
      expect(ownership[0]).toMatchObject({
        entryId: 'real-1',
        actingTeamId: 'team-a',
        ownerTeamId: 'team-a',
        action: 'keep',
        decidedByParticipantId: 'a1',
      });
      expect(ownership[1]).toMatchObject({
        entryId: 'real-2',
        actingTeamId: 'team-b',
        ownerTeamId: 'team-a',
        action: 'give',
        decidedByParticipantId: 'b1',
      });
    });

    it('ends with all ten entries owned exactly once', () => {
      const { runtimeState } = playDeck([
        'keep',
        'give',
        'keep',
        'give',
        'keep',
        'give',
        'keep',
        'give',
        'keep',
        'give',
      ]);
      const result = JSON.parse(String(runtimeState.resultJson)) as Top5Result;
      expect(result.ownership).toHaveLength(10);
      expect(
        new Set(result.ownership.map((record) => record.entryId)).size,
      ).toBe(10);
      expect(new Set(ALL_IDS)).toEqual(
        new Set(result.ownership.map((record) => record.entryId)),
      );
    });

    it('refuses an eleventh decision', () => {
      const played = playDeck(Array<'keep'>(10).fill('keep'));
      expect(() =>
        TOP5_KEEP_OR_GIVE_PLUGIN.handleCommand(
          context(played.runtimeState, 'a1'),
          {
            type: 'decide-card',
            payload: { action: 'keep' },
            runtimeState: played.runtimeState,
            roundState: played.roundState,
          },
        ),
      ).toThrow('already been decided');
    });
  });

  describe('scoring', () => {
    it('splits exactly five scoring entries and cannot tie', () => {
      const { runtimeState } = playDeck([
        'keep',
        'keep',
        'keep',
        'keep',
        'keep',
        'keep',
        'keep',
        'keep',
        'keep',
        'keep',
      ]);
      const result = top5Result(runtimeState);
      expect(result.top5Counts['team-a'] + result.top5Counts['team-b']).toBe(5);
      expect(result.top5Counts['team-a']).not.toBe(result.top5Counts['team-b']);
      expect(result.winnerTeamId).toBe(
        result.top5Counts['team-a'] > result.top5Counts['team-b']
          ? 'team-a'
          : 'team-b',
      );
    });

    it('counts traps as ownership but never as points', () => {
      // Deck order is real-1..real-5 then trap-1..trap-5, alternating teams, so
      // team A takes the odd cards and team B the even ones on all-keep.
      const { runtimeState } = playDeck(Array<'keep'>(10).fill('keep'));
      const result = top5Result(runtimeState);
      expect(result.top5Counts).toEqual({ 'team-a': 3, 'team-b': 2 });
      expect(result.trapCounts).toEqual({ 'team-a': 2, 'team-b': 3 });
      expect(result.trapCounts['team-a'] + result.trapCounts['team-b']).toBe(5);
      expect(result.winnerTeamId).toBe('team-a');
    });

    it('refuses to produce a result before every card is owned', () => {
      const { runtimeState } = playDeck(['keep', 'keep']);
      expect(() => top5Result(runtimeState)).toThrow('before the result');
    });
  });

  describe('reveal order', () => {
    it('carries every entry exactly once and does not disturb the factual order', () => {
      const { runtimeState } = playDeck(Array<'keep'>(10).fill('keep'));
      const result = top5Result(runtimeState);
      expect(result.revealOrder).toHaveLength(10);
      expect(new Set(result.revealOrder)).toEqual(new Set(ALL_IDS));
      // The ranked list is still 1..5 in order; only the colour reveal is shuffled.
      expect(
        result.entries
          .filter((entry) => entry.rank !== null)
          .map((e) => e.rank),
      ).toEqual([1, 2, 3, 4, 5]);
      expect(result.entries.map((entry) => entry.id)).toEqual(ALL_IDS);
    });

    it('survives a reload unchanged', () => {
      const { runtimeState } = playDeck(Array<'keep'>(10).fill('keep'));
      const restored =
        TOP5_KEEP_OR_GIVE_PLUGIN.validateRuntimeState(runtimeState);
      expect(top5Result(restored).revealOrder).toEqual(
        top5Result(runtimeState).revealOrder,
      );
    });
  });

  describe('authority', () => {
    const runtimeState = initialState();
    const roundState = TOP5_KEEP_OR_GIVE_PLUGIN.createInitialRoundState(
      context(runtimeState),
    );
    const decide = (participantId?: string, sequence?: number) =>
      TOP5_KEEP_OR_GIVE_PLUGIN.handleCommand(
        context(runtimeState, participantId),
        {
          type: 'decide-card',
          payload: {
            action: 'keep',
            ...(sequence !== undefined ? { assignmentSequence: sequence } : {}),
          },
          runtimeState,
          roundState,
        },
      );

    it('authorises the decision as active-participant, not active-team-player', () => {
      // A teammate of the decision-maker is on the active team; the mechanic
      // must still refuse them, so team-level authorisation is not enough.
      expect(
        TOP5_KEEP_OR_GIVE_PLUGIN.command('decide-card')?.authorization,
      ).toBe('active-participant');
    });

    it('accepts the assigned participant', () => {
      expect(decide('a1').eventType).toBe('top5-card-decided');
    });

    it('refuses a teammate, the opposing team, and an anonymous caller', () => {
      expect(() => decide('a2')).toThrow('assigned player');
      expect(() => decide('b1')).toThrow('assigned player');
      expect(() => decide(undefined)).toThrow('assigned player');
    });

    it('refuses a decision made against a superseded assignment', () => {
      expect(() => decide('a1', 99)).toThrow('moved past');
    });

    it('publishes who decides so teammates can be told, and names the next one', () => {
      const projected = TOP5_KEEP_OR_GIVE_PLUGIN.projectRoundState(roundState);
      expect(projected.activeTeamId).toBe('team-a');
      expect(projected.activeParticipantId).toBe('a1');
      const handled = decide('a1');
      expect(handled.assignment).toEqual({
        teamId: 'team-b',
        participantId: 'b1',
      });
      expect(
        TOP5_KEEP_OR_GIVE_PLUGIN.projectRoundState(handled.roundState)
          .activeParticipantId,
      ).toBe('b1');
    });
  });

  describe('disconnect', () => {
    it('hands the next card to a connected player when the rotation turn holder is gone', () => {
      const runtimeState = initialState();
      const roundState = TOP5_KEEP_OR_GIVE_PLUGIN.createInitialRoundState(
        context(runtimeState),
      );
      // b1 has dropped out. Team B's card must still be decidable.
      const withoutB1 = PARTICIPANTS.map((participant) =>
        participant.participantId === 'b1'
          ? { ...participant, connected: false }
          : participant,
      );
      const handled = TOP5_KEEP_OR_GIVE_PLUGIN.handleCommand(
        context(runtimeState, 'a1', withoutB1),
        {
          type: 'decide-card',
          payload: { action: 'keep' },
          runtimeState,
          roundState,
        },
      );
      expect(handled.assignment).toEqual({
        teamId: 'team-b',
        participantId: 'b2',
      });
    });
  });

  describe('host escape hatch', () => {
    it('resolves a stuck card as a keep without a participant', () => {
      const runtimeState = initialState();
      const roundState = TOP5_KEEP_OR_GIVE_PLUGIN.createInitialRoundState(
        context(runtimeState),
      );
      expect(TOP5_KEEP_OR_GIVE_PLUGIN.command('skip-card')?.authorization).toBe(
        'controller',
      );
      const handled = TOP5_KEEP_OR_GIVE_PLUGIN.handleCommand(
        context(runtimeState),
        {
          type: 'skip-card',
          payload: {},
          runtimeState,
          roundState,
        },
      );
      const ownership = JSON.parse(
        String(handled.runtimeState.ownershipJson),
      ) as Top5Ownership[];
      expect(ownership[0]).toMatchObject({
        ownerTeamId: 'team-a',
        action: 'keep',
        decidedByParticipantId: null,
        resolutionReason: 'host-skipped',
      });
    });
  });

  describe('refresh', () => {
    it('preserves card order, ownership, rotation, current card, and assignment', () => {
      const played = playDeck(['keep', 'give', 'keep']);
      const restored = TOP5_KEEP_OR_GIVE_PLUGIN.validateRuntimeState(
        JSON.parse(JSON.stringify(played.runtimeState)) as GameplayModeState,
      );
      const restoredRound = TOP5_KEEP_OR_GIVE_PLUGIN.validateRoundState(
        JSON.parse(JSON.stringify(played.roundState)) as GameplayModeState,
      );
      expect(restored.deckJson).toBe(played.runtimeState.deckJson);
      expect(restored.revealOrderJson).toBe(
        played.runtimeState.revealOrderJson,
      );
      expect(restored.ownershipJson).toBe(played.runtimeState.ownershipJson);
      expect(parseTeamActionAssignments(restored.teamActionJson)).toEqual(
        parseTeamActionAssignments(played.runtimeState.teamActionJson),
      );
      expect(restoredRound.turnIndex).toBe(3);
      expect(restoredRound.currentCardJson).toBe(
        played.roundState.currentCardJson,
      );
      expect(restoredRound.activeParticipantId).toBe(
        played.roundState.activeParticipantId,
      );
    });
  });
});
