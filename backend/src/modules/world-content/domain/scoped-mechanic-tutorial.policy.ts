import {
  TutorialScenarioInput,
  tutorialKind,
} from './mechanic-tutorial.policy';
import { WorldContentIssue } from './world-content.types';
import { issue } from './world-content.errors';

export const SCOPED_TUTORIAL_FLOW_CONTRACT_VERSION = 'world-example-v1';

/** Publicly supported release identities. Historical One Clue is excluded. */
export const SCOPED_TUTORIAL_MECHANIC_KEYS = [
  'read-your-opponent',
  'closest',
  'bomb',
  'top-5',
  'combo',
  'marhala',
  'laqatha',
  'first-note',
  'odd-piece',
  'ekshifni',
  'la-tahriqha',
] as const;

export type ScopedTutorialMechanicKey =
  (typeof SCOPED_TUTORIAL_MECHANIC_KEYS)[number];

export type ScopedTutorialFieldClass =
  'EXAMPLE_EDITABLE' | 'FLOW_LOCKED' | 'DERIVED_OR_VALIDATED';

export interface ScopedTutorialFieldClassification {
  exampleEditable: readonly string[];
  flowLocked: readonly string[];
  derivedOrValidated: readonly string[];
}

/**
 * The authoring contract is explicit instead of being inferred from the
 * editor. The backend policy below enforces the locked relationships; this
 * registry makes the same contract inspectable by Admin tooling and tests.
 */
export const SCOPED_TUTORIAL_FIELD_CLASSIFICATION: Record<
  ScopedTutorialMechanicKey,
  ScopedTutorialFieldClassification
> = {
  'read-your-opponent': {
    exampleEditable: [
      'prompt',
      'options',
      'correctOptionId',
      'answeringSelectionOptionId',
      'caption',
    ],
    flowLocked: ['opposingDecision'],
    derivedOrValidated: ['outcome'],
  },
  closest: {
    exampleEditable: [
      'prompt',
      'teamAEstimate',
      'teamBEstimate',
      'correctValue',
      'unit',
      'caption',
    ],
    flowLocked: [],
    derivedOrValidated: ['outcome', 'winnerTeam', 'distances'],
  },
  bomb: {
    exampleEditable: [
      'prompt',
      'acceptedAnswer',
      'nextPrompt',
      'nextQuestion',
      'returnQuestion',
      'media',
      'caption',
    ],
    flowLocked: [
      'startingTeam',
      'correctAtSecondsRemaining',
      'opponentExpiresAtSecondsRemaining',
    ],
    derivedOrValidated: ['outcome'],
  },
  'top-5': {
    exampleEditable: [
      'prompt',
      'title',
      'rankingBasis',
      'sourceLabel',
      'entries',
      'instruction',
      'caption',
    ],
    flowLocked: ['startingTeam', 'decisions'],
    derivedOrValidated: ['outcome', 'ownership', 'top5Counts', 'trapCounts'],
  },
  combo: {
    exampleEditable: [
      'stages[].prompt',
      'stages[].correctAnswer',
      'stages[].submittedAnswer',
      'caption',
    ],
    flowLocked: ['stages[].stage'],
    derivedOrValidated: ['outcome', 'breakArmedAtStage', 'forcedQuestionStage'],
  },
  marhala: {
    exampleEditable: [
      'prompt',
      'correctAnswer',
      'submittedAnswer',
      'teamAPosition',
      'teamBPosition',
      'caption',
    ],
    flowLocked: ['activeTeam', 'difficulty', 'movement'],
    derivedOrValidated: ['baseLanding', 'tile', 'finalLanding', 'outcome'],
  },
  laqatha: {
    exampleEditable: [
      'prompt',
      'title',
      'clues[].text',
      'acceptedAnswers',
      'firstSubmittedAnswer',
      'secondSubmittedAnswer',
      'caption',
    ],
    flowLocked: ['clues[].order', 'clues[].value'],
    derivedOrValidated: ['outcome', 'firstClaimAtClue', 'secondClaimAtClue'],
  },
  'first-note': {
    exampleEditable: [
      'prompt',
      'title',
      'clueLabel',
      'contextualClue',
      'acceptedAnswers',
      'firstSubmittedAnswer',
      'stealSubmittedAnswer',
      'caption',
    ],
    flowLocked: ['bids'],
    derivedOrValidated: ['outcome', 'auctionWinner', 'stealTeam'],
  },
  'odd-piece': {
    exampleEditable: [
      'prompt',
      'targetVehicleIdentity',
      'targetVehicleLabel',
      'intruderVehicleIdentity',
      'intruderVehicleLabel',
      'intruderPartIdentity',
      'intruderPartLabel',
      'modifiedImage',
      'originalImage',
      'hotspot',
      'wrongPoint',
      'correctPoint',
      'tutorialMediaDisclosure',
      'caption',
    ],
    // Reveal privacy and scoring are runtime contracts, not authorable DTO
    // fields; the generic V2 validator and renderer own those invariants.
    flowLocked: ['version', 'tutorialRevealMode'],
    derivedOrValidated: [
      'outcome',
      'hotspotContainment',
      'revealPrivacy',
      'scoring',
      'team1Tap',
      'team2Tap',
    ],
  },
  ekshifni: {
    exampleEditable: [
      'prompt',
      'celebrityIdentity',
      'image',
      'regions[].shape',
      'wrongSubmittedAnswer',
      'correctSubmittedAnswer',
      'caption',
    ],
    flowLocked: ['version', 'regions[].number'],
    derivedOrValidated: [
      'outcome',
      'clearWindowCount',
      'revealOrder',
      'privacy',
    ],
  },
  'la-tahriqha': {
    exampleEditable: [
      'prompt',
      'dishes[].name',
      'dishes[].ingredients[].label',
      'dishes[].ingredients[].correct',
      'dishes[].teamASelection',
      'dishes[].teamBSelection',
      'caption',
    ],
    flowLocked: [
      'dishWindowSeconds',
      'dishes.length',
      'dishes[].ingredients.length',
      'captainRotation',
    ],
    derivedOrValidated: ['outcome', 'dishResults', 'finalTotals'],
  },
};

export function isScopedTutorialMechanicKey(
  mechanicKey: string,
): mechanicKey is ScopedTutorialMechanicKey {
  return (SCOPED_TUTORIAL_MECHANIC_KEYS as readonly string[]).includes(
    mechanicKey,
  );
}

function stable(value: unknown): string {
  return JSON.stringify(value);
}

function locked(
  issues: WorldContentIssue[],
  field: string,
  actual: unknown,
  expected: unknown,
): void {
  if (stable(actual) !== stable(expected)) {
    issues.push(
      issue(
        'SCOPED_TUTORIAL_FLOW_LOCKED',
        `${field} is part of the canonical mechanic flow and cannot vary by World.`,
        { field, expected, actual },
      ),
    );
  }
}

/**
 * Validates the part of a tutorial that is not example data. When a generic
 * published scenario exists it is the canonical flow baseline; otherwise the
 * release's deterministic teaching path is used for the few fields that are
 * values rather than structure.
 */
export function validateScopedTutorialFlow(
  mechanicKey: string,
  input: TutorialScenarioInput,
  baseline?: TutorialScenarioInput | null,
): WorldContentIssue[] {
  const issues: WorldContentIssue[] = [];
  if (!isScopedTutorialMechanicKey(mechanicKey)) {
    issues.push(
      issue(
        'SCOPED_TUTORIAL_MECHANIC_UNSUPPORTED',
        'This mechanic is not eligible for World-specific tutorial examples.',
      ),
    );
    return issues;
  }

  const kind = tutorialKind(input);
  if (mechanicKey === 'read-your-opponent') {
    if (kind !== 'ryo') {
      issues.push(
        issue('SCOPED_TUTORIAL_KIND_MISMATCH', 'RYO scenario required.'),
      );
    }
    const value = input as Extract<TutorialScenarioInput, { kind?: 'ryo' }>;
    const base = baseline as
      Extract<TutorialScenarioInput, { kind?: 'ryo' }> | null | undefined;
    locked(
      issues,
      'opposingDecision',
      value.opposingDecision,
      base?.opposingDecision ?? 'STEAL',
    );
  }

  if (mechanicKey === 'closest' && kind !== 'closest') {
    issues.push(
      issue('SCOPED_TUTORIAL_KIND_MISMATCH', 'Closest scenario required.'),
    );
  }

  if (mechanicKey === 'bomb') {
    if (kind !== 'bomb') {
      issues.push(
        issue('SCOPED_TUTORIAL_KIND_MISMATCH', 'Bomb scenario required.'),
      );
    } else {
      const value = input as Extract<TutorialScenarioInput, { kind: 'bomb' }>;
      const base = baseline as
        Extract<TutorialScenarioInput, { kind: 'bomb' }> | null | undefined;
      locked(
        issues,
        'startingTeam',
        value.startingTeam,
        base?.startingTeam ?? 'team-a',
      );
      locked(
        issues,
        'correctAtSecondsRemaining',
        value.correctAtSecondsRemaining,
        base?.correctAtSecondsRemaining ?? 18,
      );
      locked(
        issues,
        'opponentExpiresAtSecondsRemaining',
        value.opponentExpiresAtSecondsRemaining,
        0,
      );
    }
  }

  if (mechanicKey === 'top-5') {
    if (kind !== 'top-5') {
      issues.push(
        issue('SCOPED_TUTORIAL_KIND_MISMATCH', 'Top 5 scenario required.'),
      );
    } else {
      const value = input as Extract<TutorialScenarioInput, { kind: 'top-5' }>;
      const base = baseline as
        Extract<TutorialScenarioInput, { kind: 'top-5' }> | null | undefined;
      const decisions = base?.decisions ?? [
        { action: 'keep' },
        { action: 'give' },
        { action: 'keep' },
        { action: 'give' },
        { action: 'give' },
        { action: 'keep' },
        { action: 'give' },
        { action: 'give' },
        { action: 'keep' },
        { action: 'keep' },
      ];
      locked(
        issues,
        'startingTeam',
        value.startingTeam,
        base?.startingTeam ?? 'team-a',
      );
      locked(issues, 'decisions', value.decisions, decisions);
    }
  }

  if (mechanicKey === 'combo') {
    if (kind !== 'combo') {
      issues.push(
        issue('SCOPED_TUTORIAL_KIND_MISMATCH', 'Combo scenario required.'),
      );
    } else {
      const value = input as Extract<TutorialScenarioInput, { kind: 'combo' }>;
      locked(
        issues,
        'stages.stage',
        value.stages.map((stage) => stage.stage),
        [1, 2, 3],
      );
    }
  }

  if (mechanicKey === 'marhala') {
    if (kind !== 'marhala') {
      issues.push(
        issue('SCOPED_TUTORIAL_KIND_MISMATCH', 'Marhala scenario required.'),
      );
    } else {
      const value = input as Extract<
        TutorialScenarioInput,
        { kind: 'marhala' }
      >;
      const base = baseline as
        Extract<TutorialScenarioInput, { kind: 'marhala' }> | null | undefined;
      locked(
        issues,
        'activeTeam',
        value.activeTeam,
        base?.activeTeam ?? 'team-a',
      );
      locked(
        issues,
        'difficulty',
        value.difficulty,
        base?.difficulty ?? 'hard',
      );
      locked(issues, 'movement', value.movement, base?.movement ?? 4);
    }
  }

  if (mechanicKey === 'first-note') {
    if (kind !== 'first-note') {
      issues.push(
        issue('SCOPED_TUTORIAL_KIND_MISMATCH', 'First Note scenario required.'),
      );
    } else {
      const value = input as Extract<
        TutorialScenarioInput,
        { kind: 'first-note' }
      >;
      const base = baseline as
        | Extract<TutorialScenarioInput, { kind: 'first-note' }>
        | null
        | undefined;
      const bids = base?.bids ?? [
        { team: 'team-a', seconds: 8 },
        { team: 'team-b', seconds: 5 },
        { team: 'team-a', seconds: 3 },
      ];
      locked(issues, 'bids', value.bids, bids);
    }
  }

  if (mechanicKey === 'laqatha') {
    if (kind !== 'laqatha') {
      issues.push(
        issue('SCOPED_TUTORIAL_KIND_MISMATCH', 'Laqatha scenario required.'),
      );
    } else {
      const value = input as Extract<
        TutorialScenarioInput,
        { kind: 'laqatha' }
      >;
      const base = baseline as
        Extract<TutorialScenarioInput, { kind: 'laqatha' }> | null | undefined;
      locked(
        issues,
        'clues[].order',
        value.clues.map((clue) => clue.order),
        base?.clues.map((clue) => clue.order) ?? [1, 2, 3, 4, 5],
      );
      locked(
        issues,
        'clues[].value',
        value.clues.map((clue) => clue.value),
        base?.clues.map((clue) => clue.value) ?? [5, 4, 3, 2, 1],
      );
    }
  }

  if (mechanicKey === 'la-tahriqha') {
    if (kind !== 'la-tahriqha') {
      issues.push(
        issue(
          'SCOPED_TUTORIAL_KIND_MISMATCH',
          'La Tahriqha scenario required.',
        ),
      );
    } else {
      const value = input as Extract<
        TutorialScenarioInput,
        { kind: 'la-tahriqha' }
      >;
      const base = baseline as
        | Extract<TutorialScenarioInput, { kind: 'la-tahriqha' }>
        | null
        | undefined;
      locked(
        issues,
        'dishWindowSeconds',
        value.dishWindowSeconds,
        base?.dishWindowSeconds ?? 30,
      );
      locked(issues, 'dishCount', value.dishes.length, 3);
      locked(
        issues,
        'ingredientCountPerDish',
        value.dishes.map((dish) => dish.ingredients.length),
        [8, 8, 8],
      );
      locked(
        issues,
        'captainRotationShape',
        [
          value.captainRotation.teamA.length,
          value.captainRotation.teamB.length,
        ],
        [3, 3],
      );
    }
  }

  if (mechanicKey === 'odd-piece') {
    if (kind !== 'odd-piece') {
      issues.push(
        issue('SCOPED_TUTORIAL_KIND_MISMATCH', 'Odd Piece scenario required.'),
      );
    } else if (input.version !== 2) {
      issues.push(
        issue(
          'SCOPED_TUTORIAL_VERSION_LOCKED',
          'World-specific Odd Piece examples use the single-image hotspot contract (version 2).',
        ),
      );
    }
  }

  if (mechanicKey === 'ekshifni') {
    if (kind !== 'ekshifni') {
      issues.push(
        issue('SCOPED_TUTORIAL_KIND_MISMATCH', 'Ekshifni scenario required.'),
      );
    } else {
      const value = input as Extract<
        TutorialScenarioInput,
        { kind: 'ekshifni' }
      >;
      const base = baseline as
        Extract<TutorialScenarioInput, { kind: 'ekshifni' }> | null | undefined;
      locked(issues, 'version', value.version, base?.version ?? 1);
      locked(
        issues,
        'regions[].number',
        value.regions.map((region) => region.number),
        base?.regions.map((region) => region.number) ?? [1, 2, 3, 4, 5, 6],
      );
    }
  }

  return issues;
}
