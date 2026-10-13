import { readdirSync } from 'fs';
import { join } from 'path';
import {
  ANSWER_MODE_COMPATIBLE_ITEM_MODES,
  ChallengeAnswerMode,
  FORWARD_PUZZLE_SCOPE_SLUGS,
  MOVING_XO_AUTHORING_ANSWER_MODES,
  MOVING_XO_SLUG,
  VISUAL_PUZZLE_SCOPE_SLUGS,
} from './world-content.constants';

/**
 * The seams where Moving XO authoring has to agree with something it cannot
 * import: the gameplay runtime, which lives on its own branch and must not be
 * depended on from `world-content`, and the authoring Knowledge layer, which is
 * Markdown on disk.
 *
 * Each test here fails when the two halves drift apart, which is the only
 * failure mode duplication actually has.
 */
describe('Moving XO authoring contract (roadmap §23.11)', () => {
  const scopesDir = join(
    __dirname,
    '../../../../../ai/.opencode/skills/worlds/puzzles/scopes',
  );

  it('matches the runtime answer-mode list as soon as the runtime lands', () => {
    // `feat/puzzles-moving-xo` adds `ChallengeAnswerMode.MOVING_XO` and states
    // the same pair as its compatibility-map entry. That enum is deliberately
    // *not* carried here: on `main` it would let an admin configure a mechanic
    // with no runtime behind it.
    //
    // So this test does both jobs. Until the branch merges it pins the pair;
    // from the merge commit onwards it compares the two spellings and fails if
    // either side widens alone. No edit is needed to switch it over.
    const runtimeMode = (ChallengeAnswerMode as Record<string, string>)
      .MOVING_XO;

    if (!runtimeMode) {
      expect([...MOVING_XO_AUTHORING_ANSWER_MODES].sort()).toEqual([
        'match',
        'multiple_choice',
      ]);
      return;
    }

    const runtimeModes =
      ANSWER_MODE_COMPATIBLE_ITEM_MODES[runtimeMode as ChallengeAnswerMode];
    expect(runtimeModes).toBeDefined();
    expect([...runtimeModes].map(String).sort()).toEqual(
      [...MOVING_XO_AUTHORING_ANSWER_MODES].sort(),
    );
  });

  it('keeps the mechanic slug the runtime provisions', () => {
    // The provisioning definition on the runtime branch keys its ChallengeType
    // on this exact string. The authoring policy gates on it, so a rename on
    // either side silently switches every Moving XO blocker off.
    expect(MOVING_XO_SLUG).toBe('moving-xo');
  });

  it('agrees with the Scope profiles that actually exist on disk', () => {
    // The Knowledge layer is the taxonomy's source of truth; these constants
    // are a copy of it. A Scope added or retired in one place and not the other
    // is how content ends up authored against a Scope the gate does not know.
    const onDisk = readdirSync(scopesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(onDisk).toEqual([...FORWARD_PUZZLE_SCOPE_SLUGS].sort());
  });

  it('treats every definitionally visual Scope as a forward Scope', () => {
    for (const slug of VISUAL_PUZZLE_SCOPE_SLUGS) {
      expect(FORWARD_PUZZLE_SCOPE_SLUGS).toContain(slug);
    }
  });
});
