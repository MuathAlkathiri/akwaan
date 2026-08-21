import { GameplayModeState } from '../../live-game-sessions/domain/gameplay-mode.plugin';
import { BOMB_GAMEPLAY_PLUGIN } from '../../live-game-sessions/domain/bomb-gameplay.plugin';
import { COMBO_GAMEPLAY_PLUGIN } from '../../live-game-sessions/domain/combo-gameplay.plugin';
import { RYO_GAMEPLAY_PLUGIN } from '../../live-game-sessions/domain/ryo-gameplay.plugin';
import { CLOSEST_GAMEPLAY_PLUGIN } from '../../live-game-sessions/domain/closest-gameplay.plugin';
import { ONE_CLUE_GAMEPLAY_PLUGIN } from '../../live-game-sessions/domain/one-clue-gameplay.plugin';
import { TOP5_KEEP_OR_GIVE_PLUGIN } from '../../live-game-sessions/domain/top5-keep-or-give.plugin';
import { DISTRIBUTED_INFORMATION_PLUGIN } from '../../live-game-sessions/domain/distributed-information.plugin';

/**
 * What each mechanic considers *presented*.
 *
 * The rule under test is that a plan is not a presentation. Both mechanics draw
 * more content than a team may reach, and only what was reached may be spent —
 * otherwise a run that ended early would silently burn questions nobody saw.
 */
describe('presented content, per mechanic', () => {
  describe('القنبلة', () => {
    const ORDERED = ['b1', 'b2', 'b3', 'b4', 'b5'];

    const presented = (itemIndex: number) =>
      BOMB_GAMEPLAY_PLUGIN.presentedContentItemIds!({
        runtimeState: {},
        roundState: { itemIndex },
        orderedContentItemIds: ORDERED,
      });

    it('counts the item on screen as presented', () => {
      expect(presented(0)).toEqual(['b1']);
    });

    it('accumulates as the bomb passes down the selection', () => {
      expect(presented(2)).toEqual(['b1', 'b2', 'b3']);
    });

    it('leaves the items a spent clock never reached', () => {
      // The clock died on item 3; items 4 and 5 were selected but never shown and
      // must stay eligible for a future Match.
      expect(presented(2)).not.toContain('b4');
      expect(presented(2)).not.toContain('b5');
    });

    it('clamps when the run is exhausted', () => {
      // `itemIndex` is set to `itemCount` once every item has been played.
      expect(presented(ORDERED.length)).toEqual(ORDERED);
    });

    it('presents nothing before the run has an item', () => {
      expect(presented(-1)).toEqual([]);
      expect(
        BOMB_GAMEPLAY_PLUGIN.presentedContentItemIds!({
          runtimeState: {},
          roundState: {},
          orderedContentItemIds: ORDERED,
        }),
      ).toEqual([]);
    });
  });

  describe('الكومبو', () => {
    const question = (id: string, stage: number) => ({
      contentItemId: id,
      scopeId: 'scope-1',
      stage,
      prompt: { ar: id },
      acceptedAnswers: [id],
    });
    /** Two runs of four, exactly as the launcher plans them. */
    const PLAN = [
      [1, 2, 3, 4].map((stage) => question(`a${stage}`, stage)),
      [1, 2, 3, 4].map((stage) => question(`b${stage}`, stage)),
    ];

    const presented = (state: Record<string, unknown>) =>
      COMBO_GAMEPLAY_PLUGIN.presentedContentItemIds!({
        runtimeState: {
          questionPlanJson: JSON.stringify(PLAN),
          runIndex: 0,
          questionIndex: 0,
          runResultsJson: JSON.stringify([]),
          ...state,
        },
        roundState: {},
        orderedContentItemIds: PLAN.flat().map((q) => q.contentItemId),
      });

    it('presents only the question that is open', () => {
      expect(presented({ runIndex: 0, questionIndex: 0 })).toEqual(['a1']);
    });

    it('leaves the other six planned questions unspent', () => {
      // The eight-item plan exists at launch; seven of them are still unseen.
      const shown = presented({ runIndex: 0, questionIndex: 0 });
      expect(shown).toHaveLength(1);
      for (const id of ['a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4']) {
        expect(shown).not.toContain(id);
      }
    });

    it('accumulates within the run in stage order', () => {
      expect(presented({ runIndex: 0, questionIndex: 2 })).toEqual([
        'a1',
        'a2',
        'a3',
      ]);
    });

    it('keeps a finished run at the question it ended on', () => {
      // Team A cashed out after Q2, so a3 and a4 were never shown even though the
      // plan held them.
      const shown = presented({
        runIndex: 1,
        questionIndex: 0,
        runResultsJson: JSON.stringify([
          {
            teamId: 'team-a',
            runIndex: 0,
            bankedPoints: 2,
            questionsAnswered: 2,
            endedBy: 'cash-out',
            brokenByTeamId: null,
            endedAt: '2026-08-20T10:00:00.000Z',
          },
        ]),
      });
      expect(shown).toEqual(['a1', 'a2', 'b1']);
      expect(shown).not.toContain('a3');
      expect(shown).not.toContain('a4');
    });

    it('presents all eight only when both runs went the distance', () => {
      const full = presented({
        runIndex: 1,
        questionIndex: 3,
        runResultsJson: JSON.stringify([
          {
            teamId: 'team-a',
            runIndex: 0,
            bankedPoints: 4,
            questionsAnswered: 4,
            endedBy: 'final-question',
            brokenByTeamId: null,
            endedAt: '2026-08-20T10:00:00.000Z',
          },
        ]),
      });
      expect(full).toHaveLength(8);
    });

    it('presents nothing before a plan exists', () => {
      expect(
        COMBO_GAMEPLAY_PLUGIN.presentedContentItemIds!({
          runtimeState: {},
          roundState: {},
          orderedContentItemIds: [],
        }),
      ).toEqual([]);
    });
  });

  describe('اقرأ خصمك', () => {
    const ITEMS = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }];
    const presented = (roundState: GameplayModeState) =>
      RYO_GAMEPLAY_PLUGIN.presentedContentItemIds!({
        runtimeState: { itemsJson: JSON.stringify(ITEMS), currentItemIndex: 0 },
        roundState,
        orderedContentItemIds: ITEMS.map((i) => i.id),
      });

    it('burns the prompt on screen, not the two still queued', () => {
      expect(presented({ itemIndex: 0 })).toEqual(['r1']);
    });

    it('burns at presentation rather than waiting for the reveal', () => {
      // The prompt has been read; the item is spent whatever the decision is.
      expect(presented({ itemIndex: 0, phase: 'collecting' })).toEqual(['r1']);
    });

    it('does not burn the next item while between items', () => {
      // The *runtime* counter has already moved to 1 here, which is exactly why
      // the round's index is the one that decides.
      const between = RYO_GAMEPLAY_PLUGIN.presentedContentItemIds!({
        runtimeState: {
          itemsJson: JSON.stringify(ITEMS),
          currentItemIndex: 1,
        },
        roundState: { itemIndex: 0, phase: 'resolved' },
        orderedContentItemIds: ITEMS.map((i) => i.id),
      });
      expect(between).toEqual(['r1']);
      expect(between).not.toContain('r2');
    });

    it('accumulates as the challenge walks its three items', () => {
      expect(presented({ itemIndex: 2 })).toEqual(['r1', 'r2', 'r3']);
    });

    it('burns nothing before a round exists', () => {
      expect(presented({})).toEqual([]);
    });
  });

  describe.each([
    ['مين اقرب', CLOSEST_GAMEPLAY_PLUGIN],
    ['بدليل واحد', ONE_CLUE_GAMEPLAY_PLUGIN],
  ])('%s', (_label, plugin) => {
    const ITEMS = [
      { contentItemId: 'c1' },
      { contentItemId: 'c2' },
      { contentItemId: 'c3' },
    ];
    const presented = (currentItemIndex: number | null) =>
      plugin.presentedContentItemIds!({
        runtimeState: {
          itemsJson: JSON.stringify(ITEMS),
          ...(currentItemIndex === null ? {} : { currentItemIndex }),
        },
        roundState: {},
        orderedContentItemIds: ITEMS.map((i) => i.contentItemId),
      });

    it('burns the active item only', () => {
      expect(presented(0)).toEqual(['c1']);
    });

    it('leaves the items a challenge abandoned early never reached', () => {
      const shown = presented(1);
      expect(shown).toEqual(['c1', 'c2']);
      expect(shown).not.toContain('c3');
    });

    it('burns nothing when the index is absent or nonsense', () => {
      expect(presented(null)).toEqual([]);
      expect(presented(-1)).toEqual([]);
    });
  });

  describe('أفضل 5', () => {
    it('exposes its single ContentItem once', () => {
      // The ranked list is one authored item; its cards are entries inside it,
      // not separate ContentItems.
      expect(
        TOP5_KEEP_OR_GIVE_PLUGIN.presentedContentItemIds!({
          runtimeState: { contentItemId: 't1' },
          roundState: { turnIndex: 0 },
          orderedContentItemIds: ['t1'],
        }),
      ).toEqual(['t1']);
    });

    it('stays one exposure however far the turns advance', () => {
      expect(
        TOP5_KEEP_OR_GIVE_PLUGIN.presentedContentItemIds!({
          runtimeState: { contentItemId: 't1' },
          roundState: { turnIndex: 9 },
          orderedContentItemIds: ['t1'],
        }),
      ).toEqual(['t1']);
    });

    it('burns nothing without a bound item', () => {
      expect(
        TOP5_KEEP_OR_GIVE_PLUGIN.presentedContentItemIds!({
          runtimeState: {},
          roundState: {},
          orderedContentItemIds: [],
        }),
      ).toEqual([]);
    });
  });

  describe('ركّبها', () => {
    const PUZZLES = [
      { contentItemId: 'd1' },
      { contentItemId: 'd2' },
      { contentItemId: 'd3' },
    ];
    /** Each team races the same three puzzles in its own order. */
    const state = (
      progress: Array<{ teamId: string; solved: number }>,
      orders: Record<string, number[]> = {
        'team-a': [0, 1, 2],
        'team-b': [2, 1, 0],
      },
    ) => ({
      puzzlesJson: JSON.stringify(PUZZLES),
      plansJson: JSON.stringify(
        Object.entries(orders).map(([teamId, order]) => ({
          teamId,
          order,
          answererIds: order.map(() => 'p1'),
          distributions: order.map(() => ({})),
        })),
      ),
      progressJson: JSON.stringify(
        progress.map((entry) => ({
          ...entry,
          wrongAttempts: 0,
          lockedUntil: null,
        })),
      ),
    });

    const presented = (
      progress: Array<{ teamId: string; solved: number }>,
      orders?: Record<string, number[]>,
    ) =>
      DISTRIBUTED_INFORMATION_PLUGIN.presentedContentItemIds!({
        runtimeState: state(progress, orders),
        roundState: {},
        orderedContentItemIds: PUZZLES.map((p) => p.contentItemId),
      }).sort();

    it('counts one exposure per ContentItem, not per private projection', () => {
      // The mechanic hands each teammate a different segment of the same item.
      // That is one item the account has seen.
      expect(
        presented([
          { teamId: 'team-a', solved: 0 },
          { teamId: 'team-b', solved: 0 },
        ]),
      ).toEqual(['d1', 'd3']);
    });

    it('presents the puzzle a team is working on, not the ones queued behind it', () => {
      const shown = presented([
        { teamId: 'team-a', solved: 0 },
        { teamId: 'team-b', solved: 0 },
      ]);
      // team-a is on d1, team-b is on d3; nobody has reached d2.
      expect(shown).not.toContain('d2');
    });

    it('unions what either team reached, without duplicating the overlap', () => {
      // Both teams have now reached d2 from opposite ends.
      const shown = presented([
        { teamId: 'team-a', solved: 1 },
        { teamId: 'team-b', solved: 1 },
      ]);
      expect(shown).toEqual(['d1', 'd2', 'd3']);
      expect(new Set(shown).size).toBe(shown.length);
    });

    it('burns only one team progress when the other has not started', () => {
      expect(
        presented(
          [
            { teamId: 'team-a', solved: 1 },
            { teamId: 'team-b', solved: 0 },
          ],
          { 'team-a': [0, 1, 2], 'team-b': [0, 1, 2] },
        ),
      ).toEqual(['d1', 'd2']);
    });

    it('burns nothing on malformed state instead of throwing', () => {
      // A throw here would be swallowed by the observer and silently skip
      // exposure, which is the one failure that loses content quietly.
      expect(
        DISTRIBUTED_INFORMATION_PLUGIN.presentedContentItemIds!({
          runtimeState: {},
          roundState: {},
          orderedContentItemIds: [],
        }),
      ).toEqual([]);
    });
  });
});
