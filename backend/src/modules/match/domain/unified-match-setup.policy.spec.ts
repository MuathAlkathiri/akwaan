import { ConfiguredWorldOccurrence } from './configured-world-occurrence';
import {
  MATCH_WORLD_REPETITION_POLICY,
  UnifiedMatchSetupPolicy,
} from './unified-match-setup.policy';

const ANIME_POOL = ['naruto', 'bleach', 'one-piece', 'attack-on-titan'];
const FOOTBALL_POOL = ['world-cup', 'premier-league', 'saudi-league', 'ucl'];

const occurrence = (
  occurrenceIndex: number,
  worldId: string,
  selectedScopeIds: string[],
): ConfiguredWorldOccurrence => ({
  occurrenceIndex,
  worldId,
  selectedScopeIds: [...selectedScopeIds],
});

const valid = (): ConfiguredWorldOccurrence[] => [
  occurrence(0, 'anime', ANIME_POOL),
  occurrence(1, 'football', FOOTBALL_POOL),
  occurrence(2, 'anime', ANIME_POOL),
];

const policy = new UnifiedMatchSetupPolicy();

const reject = (
  occurrences: ConfiguredWorldOccurrence[],
  code: string,
  candidate = policy,
) =>
  expect(() => candidate.assertConfiguration(occurrences)).toThrow(
    expect.objectContaining({ response: expect.objectContaining({ code }) }),
  );

describe('UnifiedMatchSetupPolicy', () => {
  it('accepts three occurrences with exactly four Scopes each', () => {
    const configured = policy.assertConfiguration(valid());
    expect(configured.map((entry) => entry.occurrenceIndex)).toEqual([0, 1, 2]);
    expect(
      configured.every((entry) => entry.selectedScopeIds.length === 4),
    ).toBe(true);
  });

  it('returns the occurrences in index order whatever order they arrived in', () => {
    const shuffled = [valid()[2], valid()[0], valid()[1]];
    expect(
      policy
        .assertConfiguration(shuffled)
        .map((entry) => entry.occurrenceIndex),
    ).toEqual([0, 1, 2]);
  });

  it('copies the pool so a later mutation cannot reach the Match', () => {
    const input = valid();
    const configured = policy.assertConfiguration(input);
    input[0].selectedScopeIds.push('smuggled');
    expect(configured[0].selectedScopeIds).toHaveLength(4);
  });

  it('requires exactly three occurrences', () => {
    reject(valid().slice(0, 2), 'UNIFIED_OCCURRENCE_COUNT_INVALID');
    reject(
      [...valid(), occurrence(3, 'anime', ANIME_POOL)],
      'UNIFIED_OCCURRENCE_COUNT_INVALID',
    );
  });

  it('requires the indexes to be exactly 0, 1 and 2', () => {
    reject(
      [
        occurrence(1, 'anime', ANIME_POOL),
        occurrence(2, 'football', FOOTBALL_POOL),
        occurrence(3, 'anime', ANIME_POOL),
      ],
      'UNIFIED_OCCURRENCE_INDEX_INVALID',
    );
  });

  it('refuses a duplicated occurrence index', () => {
    reject(
      [
        occurrence(0, 'anime', ANIME_POOL),
        occurrence(0, 'football', FOOTBALL_POOL),
        occurrence(2, 'anime', ANIME_POOL),
      ],
      'UNIFIED_OCCURRENCE_INDEX_DUPLICATED',
    );
  });

  it('requires a World at every occurrence', () => {
    const occurrences = valid();
    occurrences[1].worldId = '';
    reject(occurrences, 'UNIFIED_OCCURRENCE_WORLD_REQUIRED');
  });

  it('requires exactly four Scopes, never three and never five', () => {
    const tooFew = valid();
    tooFew[0].selectedScopeIds = ANIME_POOL.slice(0, 3);
    reject(tooFew, 'SCOPE_SELECTION_COUNT_INVALID');

    const tooMany = valid();
    tooMany[0].selectedScopeIds = [...ANIME_POOL, 'death-note'];
    reject(tooMany, 'SCOPE_SELECTION_COUNT_INVALID');
  });

  it('refuses the same Scope twice inside one occurrence', () => {
    const occurrences = valid();
    occurrences[1].selectedScopeIds = [
      'world-cup',
      'world-cup',
      'premier-league',
      'ucl',
    ];
    reject(occurrences, 'SCOPE_SELECTION_DUPLICATED');
  });

  describe('World repetition', () => {
    it('is allowed by the shipped policy', () => {
      expect(MATCH_WORLD_REPETITION_POLICY.allowRepeatedWorlds).toBe(true);
      const configured = policy.assertConfiguration(valid());
      expect(configured.map((entry) => entry.worldId)).toEqual([
        'anime',
        'football',
        'anime',
      ]);
    });

    it('allows two occurrences of one World to share a Scope pool', () => {
      const configured = policy.assertConfiguration(valid());
      expect(configured[0].selectedScopeIds).toEqual(
        configured[2].selectedScopeIds,
      );
    });

    it('allows two occurrences of one World to use different pools', () => {
      const occurrences = valid();
      occurrences[2].selectedScopeIds = [
        'death-note',
        'jujutsu-kaisen',
        'demon-slayer',
        'hunter-x-hunter',
      ];
      const configured = policy.assertConfiguration(occurrences);
      expect(configured[0].selectedScopeIds).not.toEqual(
        configured[2].selectedScopeIds,
      );
    });

    // Turning the rule off is a one-line change to the policy: nothing else in
    // the codebase restates it, so this test is the whole cost of the switch.
    it('rejects a repeat when the policy disables it', () => {
      const strict = new UnifiedMatchSetupPolicy({
        allowRepeatedWorlds: false,
      });
      reject(valid(), 'UNIFIED_WORLD_REPEATED', strict);
      expect(() =>
        strict.assertConfiguration([
          occurrence(0, 'anime', ANIME_POOL),
          occurrence(1, 'football', FOOTBALL_POOL),
          occurrence(2, 'video-games', ANIME_POOL),
        ]),
      ).not.toThrow();
    });
  });
});
