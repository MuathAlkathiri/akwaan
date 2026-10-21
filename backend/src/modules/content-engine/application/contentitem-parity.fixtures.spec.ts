import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { CandidateCompatibilityService } from './candidate-compatibility.service';
import { DeterministicScreenService } from './deterministic-screen.service';
import { ContentItemCompatibilityPolicy } from '../../world-content/domain/content-item-compatibility.policy';
import {
  challengeType,
  scope,
} from '../../world-content/domain/world-content.fixtures';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  WorldContentStatus,
} from '../../world-content/domain/world-content.constants';
import type { ChallengeTypeView } from '../../world-content/domain/world-content.types';

type LayerExpectation = {
  applicable: boolean;
  expected: 'pass' | 'fail' | 'deferred' | 'blocked' | 'not_applicable';
  blockingCodes?: string[];
  blockerCodes?: string[];
  deferredCodes?: string[];
  diagnosticContains?: string[];
  reason?: string;
};

type MechanicValidatorExpectation = LayerExpectation & {
  key: 'one-clue';
  baseFixture: 'one-clue.valid.json';
  overrides: Record<string, unknown>;
  diagnosticCodes: string[];
};

type ParityCase = {
  id: string;
  item: {
    prompt: { ar: string };
    compatibleChallengeTypeKey: string;
    media?: {
      type: string;
      assets: Array<{ url?: string }>;
    };
    answerPayload: Record<string, unknown>;
  };
  context: {
    worldKey: string;
    scopeKey: string;
    challengeTypeKey: string;
    scopeExcludedChallengeTypeKey?: string;
  };
  layers: {
    questionCraft: LayerExpectation;
    deterministicScreen: LayerExpectation;
    compatibility: LayerExpectation;
  };
  mechanicValidator?: MechanicValidatorExpectation;
};

type ParityFixture = {
  version: number;
  contract: string;
  cases: ParityCase[];
};

const ROOT = resolve(__dirname, '../../../../..');
const FIXTURE_PATH = join(
  ROOT,
  'ai/.opencode/validators/examples/contentitem-parity.v1.json',
);
const EXPECTED_CASE_IDS = new Set([
  'valid-ryo-multiple-choice',
  'missing-required-prompt',
  'invalid-correct-option-id',
  'normalized-mc-answer-leakage',
  'normalized-match-duplicate',
  'match-public-truth-leakage',
  'scope-excludes-challenge-type',
  'challenge-type-answer-mode-mismatch',
  'media-shape-missing-assets',
  'resolved-media-awaiting-ready',
  'moving-xo-visual-scope-media-required',
]);
const CHALLENGE_KEYS = new Set(['ryo', 'match', 'moving-xo']);
const WORLD_KEYS = new Set(['football', 'puzzles']);
const SCOPE_KEYS = new Set(['world-cup', 'observation-illusions']);
const LAYER_NAMES = new Set([
  'questionCraft',
  'deterministicScreen',
  'compatibility',
]);

const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as ParityFixture;

function assertFixtureContract(document: ParityFixture): void {
  expect(document.version).toBe(1);
  expect(document.contract).toBe('contentitem-validation-parity');
  expect(document.cases).toHaveLength(11);
  expect(new Set(document.cases.map((item) => item.id))).toEqual(
    EXPECTED_CASE_IDS,
  );

  for (const item of document.cases) {
    expect(item.item.prompt).toEqual(
      expect.objectContaining({ ar: expect.any(String) }),
    );
    if (item.item.answerPayload.mode === 'multiple_choice') {
      expect(item.item.answerPayload.options).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: expect.any(String) }),
        ]),
      );
      expect(
        (item.item.answerPayload.options as unknown[]).length,
      ).toBeGreaterThanOrEqual(2);
      expect(item.item.answerPayload.correctOptionId).toEqual(
        expect.any(String),
      );
    } else if (item.item.answerPayload.mode === 'match') {
      expect(item.item.answerPayload.acceptedAnswers).toEqual(
        expect.arrayContaining([expect.any(String)]),
      );
    } else {
      throw new Error(
        `unsupported answer payload mode: ${String(item.item.answerPayload.mode)}`,
      );
    }
    expect(item.item.compatibleChallengeTypeKey).toBe(
      item.context.challengeTypeKey,
    );
    expect(CHALLENGE_KEYS).toContain(item.context.challengeTypeKey);
    expect(WORLD_KEYS).toContain(item.context.worldKey);
    expect(SCOPE_KEYS).toContain(item.context.scopeKey);
    if (item.context.scopeExcludedChallengeTypeKey !== undefined) {
      expect(CHALLENGE_KEYS).toContain(
        item.context.scopeExcludedChallengeTypeKey,
      );
    }
    if (item.item.media !== undefined) {
      expect(['none', 'image', 'audio', 'video']).toContain(
        item.item.media.type,
      );
      expect(item.item.media.assets).toEqual(expect.any(Array));
      for (const asset of item.item.media.assets) {
        expect(asset).toEqual(expect.any(Object));
        if (asset.url !== undefined) {
          expect(asset.url).toEqual(expect.any(String));
        }
      }
    }
    expect(new Set(Object.keys(item.layers))).toEqual(LAYER_NAMES);

    for (const [layerName, expectation] of Object.entries(item.layers)) {
      expect(expectation.applicable).toEqual(expect.any(Boolean));
      expect(expectation.expected).toEqual(expect.any(String));
      if (expectation.applicable) {
        expect(expectation.expected).not.toBe('not_applicable');
      } else {
        expect(expectation.expected).toBe('not_applicable');
        expect(expectation.reason).toEqual(expect.any(String));
      }
      if (expectation.diagnosticContains !== undefined) {
        expect(expectation.diagnosticContains).toEqual(expect.any(Array));
      }
      if (expectation.deferredCodes !== undefined) {
        expect(expectation.deferredCodes).toEqual(expect.any(Array));
        expect(expectation.deferredCodes.length).toBeGreaterThan(0);
      }
      if (layerName === 'deterministicScreen') {
        expect(expectation.blockingCodes).toEqual(expect.any(Array));
        if (!expectation.applicable) {
          expect(expectation.blockingCodes).toEqual([]);
        } else if (expectation.expected === 'pass') {
          expect(expectation.blockingCodes).toEqual([]);
        } else {
          expect(expectation.blockingCodes!.length).toBeGreaterThan(0);
        }
      }
      if (layerName === 'compatibility') {
        expect(expectation.blockerCodes).toEqual(expect.any(Array));
        if (!expectation.applicable) {
          expect(expectation.blockerCodes).toEqual([]);
        } else if (expectation.expected === 'deferred') {
          expect(expectation.blockerCodes).toEqual([]);
        } else {
          expect(expectation.blockerCodes!.length).toBeGreaterThan(0);
        }
      }
    }

    if (item.mechanicValidator !== undefined) {
      expect(item.mechanicValidator.key).toBe('one-clue');
      expect(item.mechanicValidator.baseFixture).toBe('one-clue.valid.json');
      expect(item.mechanicValidator.applicable).toBe(true);
      expect(item.mechanicValidator.expected).toBe('fail');
      expect(item.mechanicValidator.overrides).toEqual(expect.any(Object));
      expect(item.mechanicValidator.diagnosticCodes).toEqual(expect.any(Array));
      expect(item.mechanicValidator.diagnosticCodes.length).toBeGreaterThan(0);
    }
  }
}

function draftFor(item: ParityCase['item']): Record<string, unknown> {
  return {
    prompt: item.prompt,
    ...(item.media ? { media: item.media } : {}),
    answerPayload: item.answerPayload,
  };
}

function referencesFor(item: ParityCase): {
  scope: ReturnType<typeof scope>;
  worldStatus: WorldContentStatus;
  challengeType: ChallengeTypeView;
} {
  expect(CHALLENGE_KEYS).toContain(item.context.challengeTypeKey);
  const challengeIds: Record<string, string> = {
    ryo: 'parity-challenge-ryo',
    match: 'parity-challenge-match',
    'moving-xo': 'parity-challenge-moving-xo',
  };
  const challengeProfiles: Record<
    string,
    {
      name: string;
      slug: string;
      family: ChallengeFamily;
      answerMode: ChallengeAnswerMode;
    }
  > = {
    ryo: {
      name: 'Read Your Opponent',
      slug: 'read-your-opponent',
      family: ChallengeFamily.RYO,
      answerMode: ChallengeAnswerMode.RYO,
    },
    match: {
      name: 'Parity Match',
      slug: 'parity-match',
      family: ChallengeFamily.COOP,
      answerMode: ChallengeAnswerMode.MATCH,
    },
    'moving-xo': {
      name: 'Moving XO',
      slug: 'moving-xo',
      family: ChallengeFamily.SIGNATURE,
      answerMode: ChallengeAnswerMode.MOVING_XO,
    },
  };
  const worldProfiles: Record<
    string,
    { id: string; scopeId: string; name: string }
  > = {
    football: {
      id: 'parity-world-football',
      scopeId: 'parity-scope-world-cup',
      name: 'World Cup',
    },
    puzzles: {
      id: 'parity-world-puzzles',
      scopeId: 'parity-scope-observation-illusions',
      name: 'Observation & Illusions',
    },
  };
  const profile = challengeProfiles[item.context.challengeTypeKey];
  const world = worldProfiles[item.context.worldKey];
  expect(profile).toBeDefined();
  expect(world).toBeDefined();
  const excludedChallengeTypeKey = item.context.scopeExcludedChallengeTypeKey;
  return {
    scope: scope({
      id: world.scopeId,
      worldId: world.id,
      name: world.name,
      slug: item.context.scopeKey,
      excludedChallengeTypeIds: excludedChallengeTypeKey
        ? [challengeIds[excludedChallengeTypeKey]]
        : [],
    }),
    worldStatus: WorldContentStatus.DRAFT,
    challengeType: challengeType({
      id: challengeIds[item.context.challengeTypeKey],
      ...profile,
    }),
  };
}

describe('ContentItem parity fixture contract (test-only)', () => {
  it('accepts the complete shared fixture contract', () => {
    expect(() => assertFixtureContract(fixture)).not.toThrow();
  });

  it('rejects an incomplete shared fixture contract', () => {
    const malformed = { ...fixture, cases: fixture.cases.slice(0, 2) };
    expect(() => assertFixtureContract(malformed)).toThrow();
  });

  it('rejects unknown validation layer names', () => {
    const malformed = {
      ...fixture,
      cases: fixture.cases.map((item, index) =>
        index === 0
          ? {
              ...item,
              layers: {
                ...item.layers,
                unexpected: {
                  applicable: false,
                  expected: 'not_applicable',
                  reason: 'unsupported layer',
                },
              },
            }
          : item,
      ),
    } as unknown as ParityFixture;
    expect(() => assertFixtureContract(malformed)).toThrow();
  });

  for (const item of fixture.cases) {
    it(`${item.id}: invokes the applicable real validation layers`, () => {
      assertFixtureContract(fixture);
      const draft = draftFor(item.item);

      const screenExpectation = item.layers.deterministicScreen;
      if (screenExpectation.applicable) {
        const screen = new DeterministicScreenService({
          get: () => undefined,
        } as unknown as ConfigService);
        screen.beginBatch();
        const screenResult = screen.screen(draft);
        expect(screenResult.passed).toBe(screenExpectation.expected === 'pass');
        expect(
          screenResult.findings
            .filter((finding) => finding.severity === 'blocking')
            .map((finding) => finding.code),
        ).toEqual(screenExpectation.blockingCodes);
      }

      const compatibility = new CandidateCompatibilityService(
        new ContentItemCompatibilityPolicy(),
      ).evaluate({
        mechanicKey:
          item.context.challengeTypeKey === 'ryo'
            ? 'read-your-opponent'
            : item.context.challengeTypeKey === 'moving-xo'
              ? 'moving-xo'
              : 'parity-match',
        draft,
        references: referencesFor(item),
      });
      const compatibilityExpectation = item.layers.compatibility;
      if (compatibilityExpectation.applicable) {
        expect(compatibility.status.toLowerCase()).toBe(
          compatibilityExpectation.expected,
        );
        expect(
          compatibility.preDraft.blockers.map((blocker) => blocker.code),
        ).toEqual(compatibilityExpectation.blockerCodes);
        if (compatibilityExpectation.deferredCodes !== undefined) {
          expect(
            compatibility.deferredChecks.map((check) => check.code),
          ).toEqual(
            expect.arrayContaining(compatibilityExpectation.deferredCodes),
          );
        }
      }
    });
  }
});
