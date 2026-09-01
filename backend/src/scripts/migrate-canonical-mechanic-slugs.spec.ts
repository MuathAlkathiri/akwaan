import {
  CANONICAL_MECHANICS,
  ChallengeTypeRecord,
  decideRename,
} from './migrate-canonical-mechanic-slugs';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
} from '../modules/world-content/domain/world-content.constants';
import { BOMB_MODE_KEY } from '../modules/live-game-sessions/domain/bomb-gameplay.plugin';
import { RYO_MODE_KEY } from '../modules/live-game-sessions/domain/ryo-gameplay.plugin';
import { RAKKIBHA_MODE_KEY } from '../modules/live-game-sessions/domain/rakkibha.plugin';
import { TOP5_MODE_KEY } from '../modules/live-game-sessions/domain/top5-keep-or-give.plugin';
import { COMBO_MODE_KEY } from '../modules/live-game-sessions/domain/combo-gameplay.plugin';
import { CLOSEST_MODE_KEY } from '../modules/live-game-sessions/domain/closest-gameplay.plugin';
import { ONE_CLUE_MODE_KEY } from '../modules/live-game-sessions/domain/one-clue-gameplay.plugin';
import { MARHALA_MODE_KEY } from '../modules/live-game-sessions/domain/marhala-board';
import { ODD_PIECE_MODE_KEY } from '../modules/live-game-sessions/domain/odd-piece-gameplay.plugin';

/**
 * Deciding which ChallengeType is a canonical mechanic wearing the wrong slug.
 *
 * The decision is structural on purpose. A display name is the one field an
 * author is free to change and free to reuse, so a migration that matched on it
 * would repoint a board at whatever happened to be called the same thing.
 */

const ryo = (
  overrides: Partial<ChallengeTypeRecord> = {},
): ChallengeTypeRecord => ({
  _id: 'ryo-1',
  slug: 'mechanic-1785785091373',
  name: 'اقرأ خصمك',
  family: ChallengeFamily.RYO,
  itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
  answerMode: ChallengeAnswerMode.RYO,
  ...overrides,
});

/** The other mechanics that live alongside it and must never be touched. */
const bystanders: ChallengeTypeRecord[] = [
  {
    _id: 'top5',
    slug: 'top-5',
    name: 'أفضل 10',
    family: ChallengeFamily.SIGNATURE,
    itemStructure: ChallengeItemStructure.CONTINUOUS,
    answerMode: ChallengeAnswerMode.TOP_5,
  },
  {
    _id: 'split',
    slug: 'mechanic-1785789172264',
    name: 'معلومات مقسّمة',
    family: ChallengeFamily.SIGNATURE,
    itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
    answerMode: ChallengeAnswerMode.SPLIT,
  },
  {
    _id: 'closest',
    slug: 'mechanic-1785872196157',
    name: 'مين اقرب',
    family: ChallengeFamily.COOP,
    itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
    answerMode: ChallengeAnswerMode.CLOSEST,
  },
  {
    _id: 'vote',
    slug: 'mechanic-1785872224173',
    name: 'مين فينا',
    family: ChallengeFamily.RELATIONAL,
    itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
    answerMode: ChallengeAnswerMode.VOTE,
  },
  {
    _id: 'distributed',
    slug: RAKKIBHA_MODE_KEY,
    name: 'ركّبها',
    family: ChallengeFamily.COOP,
    itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
    answerMode: ChallengeAnswerMode.RAKKIBHA,
  },
];

const mechanic = CANONICAL_MECHANICS.find(
  (entry) => entry.slug === RYO_MODE_KEY,
)!;

describe('canonical mechanic slug migration', () => {
  it('only claims mechanics whose launcher key it can name', () => {
    // Every entry must correspond to a real launcher, or the migration would
    // rename a ChallengeType to a slug nothing resolves.
    const launcherKeys = [
      BOMB_MODE_KEY,
      RYO_MODE_KEY,
      TOP5_MODE_KEY,
      RAKKIBHA_MODE_KEY,
      CLOSEST_MODE_KEY,
      ONE_CLUE_MODE_KEY,
      COMBO_MODE_KEY,
      MARHALA_MODE_KEY,
      ODD_PIECE_MODE_KEY,
    ];
    for (const entry of CANONICAL_MECHANICS) {
      expect(launcherKeys).toContain(entry.slug);
    }
  });

  it('renames the one structurally matching mechanic', () => {
    const decision = decideRename(mechanic, [ryo(), ...bystanders]);

    expect(decision).toEqual({
      kind: 'rename',
      from: expect.objectContaining({ _id: 'ryo-1' }),
      to: RYO_MODE_KEY,
    });
  });

  it('is idempotent once the slug is canonical', () => {
    const decision = decideRename(mechanic, [
      ryo({ slug: RYO_MODE_KEY }),
      ...bystanders,
    ]);

    expect(decision).toEqual({
      kind: 'already-canonical',
      slug: RYO_MODE_KEY,
    });
  });

  it('never matches on the display name alone', () => {
    // Same Arabic name, different mechanic. Renaming this would point the RYO
    // launcher at a voting mechanic.
    const impostor = ryo({
      _id: 'impostor',
      family: ChallengeFamily.RELATIONAL,
      answerMode: ChallengeAnswerMode.VOTE,
    });

    expect(decideRename(mechanic, [impostor, ...bystanders])).toEqual({
      kind: 'absent',
      slug: RYO_MODE_KEY,
    });
  });

  it('refuses to choose when two documents share the structure', () => {
    const decision = decideRename(mechanic, [
      ryo(),
      ryo({ _id: 'ryo-2', slug: 'mechanic-999', name: 'اقرأ خصمك (نسخة)' }),
      ...bystanders,
    ]);

    expect(decision.kind).toBe('ambiguous');
    expect(decision.kind === 'ambiguous' && decision.candidates).toHaveLength(
      2,
    );
  });

  it('refuses to overwrite the slug when a different mechanic holds it', () => {
    const squatter: ChallengeTypeRecord = {
      _id: 'squatter',
      slug: RYO_MODE_KEY,
      name: 'شيء آخر',
      family: ChallengeFamily.COOP,
      itemStructure: ChallengeItemStructure.CONTINUOUS,
      answerMode: ChallengeAnswerMode.CLOSEST,
    };

    const decision = decideRename(mechanic, [ryo(), squatter, ...bystanders]);

    expect(decision.kind).toBe('slug-conflict');
    expect(decision.kind === 'slug-conflict' && decision.holder._id).toBe(
      'squatter',
    );
  });

  it('reports nothing to do in a database without the mechanic', () => {
    expect(decideRename(mechanic, bystanders)).toEqual({
      kind: 'absent',
      slug: RYO_MODE_KEY,
    });
  });

  it('leaves the mechanics this phase deliberately does not converge', () => {
    // معلومات مقسّمة answers with `split`, which ركّبها's launcher rejects, so it
    // is a different mechanic rather than a mis-slugged one. Nothing in the
    // canonical table may claim it.
    const claimed = CANONICAL_MECHANICS.map((entry) => entry.answerMode);
    expect(claimed).not.toContain(ChallengeAnswerMode.SPLIT);
    expect(claimed).not.toContain(ChallengeAnswerMode.VOTE);
    expect(claimed).toContain(ChallengeAnswerMode.CLOSEST);

    for (const bystander of bystanders) {
      const decision = decideRename(mechanic, [ryo(), ...bystanders]);
      expect(decision.kind === 'rename' && decision.from._id).not.toBe(
        bystander._id,
      );
    }
  });
});
