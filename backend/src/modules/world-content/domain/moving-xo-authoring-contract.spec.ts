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
 * The seams where Moving XO runtime, READY enforcement and the authoring
 * Knowledge layer must remain identical after integration.
 *
 * Each test here fails when the two halves drift apart, which is the only
 * failure mode duplication actually has.
 */
describe('Moving XO authoring contract (roadmap §23.11)', () => {
  const scopesDir = join(
    __dirname,
    '../../../../../ai/.opencode/skills/worlds/puzzles/scopes',
  );

  it('keeps runtime and READY answer modes on the canonical V1 pair', () => {
    const runtimeModes =
      ANSWER_MODE_COMPATIBLE_ITEM_MODES[ChallengeAnswerMode.MOVING_XO];
    expect([...runtimeModes].map(String).sort()).toEqual(
      [...MOVING_XO_AUTHORING_ANSWER_MODES].sort(),
    );
    expect([...MOVING_XO_AUTHORING_ANSWER_MODES].sort()).toEqual([
      'match',
      'multiple_choice',
    ]);
  });

  it('keeps the mechanic slug the runtime provisions', () => {
    // The provisioning definition keys its ChallengeType on this exact string.
    // The authoring policy gates on it, so a rename on
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
