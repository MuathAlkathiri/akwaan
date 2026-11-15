import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import {
  isTolerantAnswerMatchingEnabled,
  TOLERANT_MATCHING_ENV,
} from './answer-matching-activation';

describe('isTolerantAnswerMatchingEnabled', () => {
  it('is off unless the environment names the mechanic', () => {
    expect(isTolerantAnswerMatchingEnabled('marhala', {})).toBe(false);
    expect(
      isTolerantAnswerMatchingEnabled('marhala', {
        [TOLERANT_MATCHING_ENV]: '',
      }),
    ).toBe(false);
    expect(
      isTolerantAnswerMatchingEnabled('marhala', {
        [TOLERANT_MATCHING_ENV]: 'bomb',
      }),
    ).toBe(false);
  });

  it('is on for exactly the mechanics listed', () => {
    const env = { [TOLERANT_MATCHING_ENV]: ' bomb , marhala ' };
    expect(isTolerantAnswerMatchingEnabled('marhala', env)).toBe(true);
    expect(isTolerantAnswerMatchingEnabled('bomb', env)).toBe(true);
    expect(isTolerantAnswerMatchingEnabled('combo', env)).toBe(false);
    // Not a substring match.
    expect(
      isTolerantAnswerMatchingEnabled('marhala', {
        [TOLERANT_MATCHING_ENV]: 'marhala-v2',
      }),
    ).toBe(false);
  });

  it('is off in this test environment', () => {
    expect(isTolerantAnswerMatchingEnabled('marhala')).toBe(false);
  });
});

describe('activation cannot be widened by accident', () => {
  it.each([
    ['upper case', 'MARHALA'],
    ['a different separator', 'marhala;bomb'],
    ['a wildcard', '*'],
    ['a truthy word', 'true'],
    ['a policy name', 'c4-guarded-v1'],
  ])('ignores %s', (_case, value) => {
    expect(
      isTolerantAnswerMatchingEnabled('marhala', {
        [TOLERANT_MATCHING_ENV]: value,
      }),
    ).toBe(false);
  });

  it('switches back to exact the moment the setting is removed', () => {
    const env: Record<string, string | undefined> = {
      [TOLERANT_MATCHING_ENV]: 'marhala',
    };
    expect(isTolerantAnswerMatchingEnabled('marhala', env)).toBe(true);
    delete env[TOLERANT_MATCHING_ENV];
    expect(isTolerantAnswerMatchingEnabled('marhala', env)).toBe(false);
  });

  it('is consulted only by المرحلة, so naming another mechanic changes nothing', () => {
    // The policy itself is a code constant; the environment can only name
    // mechanics. A mechanic that does not read the switch cannot be loosened
    // by it — Bomb, Combo and the rest keep their exact comparison.
    const root = join(__dirname, '..', '..');
    const readers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) walk(path);
        else if (
          path.endsWith('.ts') &&
          !path.endsWith('.spec.ts') &&
          !path.endsWith('answer-matching-activation.ts') &&
          readFileSync(path, 'utf8').includes('isTolerantAnswerMatchingEnabled')
        ) {
          readers.push(path.slice(root.length + 1));
        }
      }
    };
    walk(root);
    expect(readers.sort()).toEqual([
      'modules/live-game-sessions/domain/marhala-gameplay.plugin.ts',
      'modules/match/application/marhala-question-source.ts',
    ]);
  });
});
