import { GameplayModeState } from './gameplay-mode.plugin';
import {
  RAKKIBHA_LOCK_MS,
  RAKKIBHA_PLUGIN,
  RakkibhaPuzzle,
  RakkibhaTeamPlan,
} from './rakkibha.plugin';

const START = new Date('2026-01-01T00:00:00.000Z');
const puzzle = (id: string): RakkibhaPuzzle => ({
  contentItemId: id,
  instruction: 'صفوا الأشكال ولقوا القطعة الصحيحة',
  reference: { media: { type: 'image', url: `/${id}-reference.webp` } },
  correctCanonicalIdentity: `${id}-true`,
  candidateViews: [
    {
      id: 'holder-b',
      candidates: [
        {
          localId: 'option-1',
          canonicalIdentity: `${id}-wrong-b1`,
          media: { type: 'image', url: '/b1.webp' },
        },
        {
          localId: 'option-2',
          canonicalIdentity: `${id}-true`,
          media: { type: 'image', url: '/b2.webp' },
        },
      ],
    },
    {
      id: 'holder-c',
      candidates: [
        {
          localId: 'option-1',
          canonicalIdentity: `${id}-wrong-c1`,
          media: { type: 'image', url: '/c1.webp' },
        },
        {
          localId: 'option-2',
          canonicalIdentity: `${id}-wrong-c2`,
          media: { type: 'image', url: '/c2.webp' },
        },
      ],
    },
  ],
});
const puzzles = [
  puzzle('honeycomb-cluster'),
  puzzle('tangram-crystal'),
  puzzle('modular-conduit'),
];
const alphaAssignments = [
  { participantId: 'a-ref', hasReference: true },
  { participantId: 'a-b', hasReference: false, candidateViewId: 'holder-b' },
  { participantId: 'a-c', hasReference: false, candidateViewId: 'holder-c' },
];
const plans: RakkibhaTeamPlan[] = [
  {
    teamId: 'alpha',
    participantIds: ['a-ref', 'a-b', 'a-c'],
    order: [0, 1, 2],
    assignments: [alphaAssignments, alphaAssignments, alphaAssignments],
  },
  {
    teamId: 'zeta',
    participantIds: ['z-ref', 'z-b'],
    order: [0, 1, 2],
    assignments: Array.from({ length: 3 }, () => [
      { participantId: 'z-ref', hasReference: true },
      {
        participantId: 'z-b',
        hasReference: false,
        candidateViewId: 'holder-b',
      },
    ]),
  },
];
const runtime = (): GameplayModeState =>
  RAKKIBHA_PLUGIN.createInitialRuntimeState({
    sessionId: 'session',
    runtimeId: 'runtime',
    now: START,
    initialState: {
      phase: 'active',
      puzzlesJson: JSON.stringify(puzzles),
      plansJson: JSON.stringify(plans),
      progressJson: JSON.stringify(
        plans.map(({ teamId }) => ({
          teamId,
          solved: 0,
          wrongAttempts: 0,
          lastProgressAt: 0,
          lockUntil: 0,
        })),
      ),
      startedAtMs: START.getTime(),
      deadlineAt: new Date(START.getTime() + 135_000).toISOString(),
    },
  });
const submit = (
  state: GameplayModeState,
  participantId: string,
  localCandidateId: string,
  now = START,
) =>
  RAKKIBHA_PLUGIN.handleCommand(
    {
      sessionId: 'session',
      runtimeId: 'runtime',
      roundId: 'round',
      submitterParticipantId: participantId,
      now,
    },
    {
      type: 'submit-candidate',
      payload: { contentItemId: 'honeycomb-cluster', localCandidateId },
      runtimeState: state,
      roundState: { phase: 'active' },
    },
  );
const progress = (state: GameplayModeState) =>
  JSON.parse(String(state.progressJson))[0];

describe('Rakkibha plugin', () => {
  it('resolves the same local option number against its owning holder', () => {
    expect(
      progress(submit(runtime(), 'a-c', 'option-2').runtimeState),
    ).toMatchObject({ solved: 0, wrongAttempts: 1 });
    expect(
      progress(submit(runtime(), 'a-b', 'option-2').runtimeState),
    ).toMatchObject({ solved: 1, wrongAttempts: 0 });
  });
  it('prevents a reference-only holder from submitting', () => {
    expect(() => submit(runtime(), 'a-ref', 'option-2')).toThrow(
      /reference holder/i,
    );
  });
  it('rejects candidates outside the actor private view', () => {
    expect(() => submit(runtime(), 'a-c', 'missing')).toThrow(
      /not in your private view/i,
    );
  });
  it('applies the existing five-second lock', () => {
    const wrong = submit(runtime(), 'a-c', 'option-2');
    expect(progress(wrong.runtimeState).lockUntil).toBe(
      START.getTime() + RAKKIBHA_LOCK_MS,
    );
    expect(() =>
      submit(
        wrong.runtimeState,
        'a-b',
        'option-2',
        new Date(START.getTime() + 1_000),
      ),
    ).toThrow(/locked/i);
  });
  it('projects only the actor view and no server identities', () => {
    const reference = RAKKIBHA_PLUGIN.projectRuntimeStateForActor!(runtime(), {
      controller: false,
      participantId: 'a-ref',
    });
    const holder = RAKKIBHA_PLUGIN.projectRuntimeStateForActor!(runtime(), {
      controller: false,
      participantId: 'a-b',
    });
    const distractor = RAKKIBHA_PLUGIN.projectRuntimeStateForActor!(runtime(), {
      controller: false,
      participantId: 'a-c',
    });
    expect(reference.myReferenceJson).toContain('reference.webp');
    expect(reference.myCandidatesJson).toBeUndefined();
    expect(holder.myCandidatesJson).toContain('option-2');
    expect(distractor.myCandidatesJson).toContain('option-1');
    expect(distractor.myCandidatesJson).not.toContain('/b2.webp');
    expect(JSON.stringify(holder)).not.toContain('canonicalIdentity');
    expect(JSON.stringify(holder)).not.toContain('correctCanonicalIdentity');
  });
  it('keeps the two-player reference away from every candidate set', () => {
    const twoPlayer = (
      JSON.parse(String(runtime().plansJson)) as RakkibhaTeamPlan[]
    )[1].assignments[0];
    expect(
      twoPlayer.find((entry) => entry.hasReference)?.candidateViewId,
    ).toBeUndefined();
    expect(
      twoPlayer.find((entry) => entry.candidateViewId === 'holder-b')
        ?.hasReference,
    ).toBe(false);
  });
});
