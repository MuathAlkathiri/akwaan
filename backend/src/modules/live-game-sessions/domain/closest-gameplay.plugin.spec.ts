import {
  CLOSEST_GAMEPLAY_PLUGIN,
  closestAnswerAction,
  closestDistance,
  gradeClosestItem,
} from './closest-gameplay.plugin';
import {
  assignmentFor,
  assignNextTeamAction,
  createTeamActionAssignmentState,
  parseTeamActionAssignments,
  serializeTeamActionAssignments,
} from './team-action-assignment';
import { ContentMediaType } from '../../world-content/domain/world-content.constants';

const item = { id: 'item-1', prompt: 'كم؟', correctValue: 20 };

describe('Closest gameplay', () => {
  it.each([
    [19, 22, 'a', false],
    [19, 21, null, true],
    [20, 20, null, true],
    [18, 18, null, true],
    [-21.5, -18.25, 'b', false],
  ])(
    'grades %s against %s by absolute distance only',
    (answerA, answerB, winner, tie) => {
      const result = gradeClosestItem({
        item,
        teamIds: ['a', 'b'],
        answers: { a: answerA, b: answerB },
        assignedParticipantIds: { a: 'a1', b: 'b1' },
        itemIndex: 0,
        resolutionReason: 'both-submitted',
        resolvedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(result.winnerTeamId).toBe(winner);
      expect(result.tie).toBe(tie);
    },
  );

  describe('colour-hue («تذكّر اللون»)', () => {
    const hue = { mode: 'colour-hue' as const, min: 0, max: 360 };
    const colour = (correctValue: number, revealSeconds?: number) => ({
      id: 'colour-1',
      prompt: 'وش لون القميص؟',
      correctValue,
      media: {
        type: ContentMediaType.IMAGE,
        assets: [{ url: 'https://cdn/shirt.webp' }],
      },
      slider: { ...hue, ...(revealSeconds ? { revealSeconds } : {}) },
    });

    it.each([
      [10, 350, 20],
      [350, 10, 20],
      [0, 360, 0],
      [180, 0, 180],
      [200, 230, 30],
    ])('measures %s against %s around the wheel as %s', (answer, target, d) => {
      expect(closestDistance(answer, colour(target))).toBe(d);
    });

    it('still measures every other mode in a straight line', () => {
      expect(
        closestDistance(10, {
          correctValue: 350,
          slider: { mode: 'numeric-range', min: 0, max: 360 },
        }),
      ).toBe(340);
      expect(closestDistance(10, { correctValue: 350 })).toBe(340);
    });

    it('gives the point to the team nearer across the red seam', () => {
      const result = gradeClosestItem({
        item: colour(355),
        teamIds: ['a', 'b'],
        answers: { a: 5, b: 330 },
        assignedParticipantIds: { a: 'a1', b: 'b1' },
        itemIndex: 0,
        resolutionReason: 'both-submitted',
        resolvedAt: '2026-01-01T00:00:00.000Z',
      });
      expect(result.distances).toEqual({ a: 10, b: 25 });
      expect(result.winnerTeamId).toBe('a');
      // The end-of-challenge recap sees results, not items.
      expect(result.sliderMode).toBe('colour-hue');
    });

    const runtime = (first: unknown, deadlineAt?: string) => ({
      itemsJson: JSON.stringify([
        first,
        { ...item, id: 'item-2' },
        { ...item, id: 'item-3' },
      ]),
      teamIdsJson: '["a","b"]',
      currentItemIndex: 0,
      phase: 'collecting',
      answersJson: '{}',
      resultsJson: '[]',
      teamActionJson: serializeTeamActionAssignments(
        createTeamActionAssignmentState([
          { teamId: 'a', order: ['a1'], cursor: 0 },
          { teamId: 'b', order: ['b1'], cursor: 0 },
        ]),
      ),
      ...(deadlineAt ? { deadlineAt } : {}),
    });

    it('tells the screen when the picture goes grey, from the server deadline', () => {
      // 45-second timer armed to end at 00:00:45, so the item opened at 00:00:00.
      const deadline = '2026-01-01T00:00:45.000Z';
      expect(
        CLOSEST_GAMEPLAY_PLUGIN.projectRuntimeState(
          runtime(colour(210), deadline),
        ).mediaGreyAt,
      ).toBe('2026-01-01T00:00:04.000Z');
      expect(
        CLOSEST_GAMEPLAY_PLUGIN.projectRuntimeState(
          runtime(colour(210, 7), deadline),
        ).mediaGreyAt,
      ).toBe('2026-01-01T00:00:07.000Z');
    });

    it('shows no colour before the deadline is armed', () => {
      expect(
        CLOSEST_GAMEPLAY_PLUGIN.projectRuntimeState(runtime(colour(210)))
          .mediaGreyAt,
      ).toBeNull();
    });

    it('says nothing about grey for an ordinary item', () => {
      expect(
        CLOSEST_GAMEPLAY_PLUGIN.projectRuntimeState(
          runtime(item, '2026-01-01T00:00:45.000Z'),
        ),
      ).not.toHaveProperty('mediaGreyAt');
    });
  });

  it('rejects malformed, NaN, and infinite estimates', () => {
    const validate =
      CLOSEST_GAMEPLAY_PLUGIN.command('submit-estimate')!.validatePayload;
    for (const value of ['20', Number.NaN, Infinity, -Infinity]) {
      expect(() => validate({ value } as never)).toThrow(
        'finite numeric estimate',
      );
    }
  });

  it('enforces an authored slider range and step through the canonical command', () => {
    let assignments = createTeamActionAssignmentState([
      { teamId: 'a', order: ['a1'], cursor: 0 },
      { teamId: 'b', order: ['b1'], cursor: 0 },
    ]);
    assignments = assignNextTeamAction(assignments, {
      teamId: 'a',
      action: closestAnswerAction('a'),
      participants: [{ participantId: 'a1', teamId: 'a', connected: true }],
      now: new Date('2026-01-01T00:00:00.000Z'),
    }).state;
    const state = {
      itemsJson: JSON.stringify([
        {
          ...item,
          slider: { mode: 'numeric-range', min: 0, max: 100, step: 5 },
        },
        { ...item, id: 'item-2' },
        { ...item, id: 'item-3' },
      ]),
      teamIdsJson: '["a","b"]',
      currentItemIndex: 0,
      phase: 'collecting',
      answersJson: '{}',
      resultsJson: '[]',
      teamActionJson: serializeTeamActionAssignments(assignments),
      deadlineAt: '2026-01-01T00:00:45.000Z',
    };
    for (const value of [-1, 101, 12]) {
      expect(() =>
        CLOSEST_GAMEPLAY_PLUGIN.handleCommand!(
          { now: new Date(), submitterParticipantId: 'a1' } as never,
          {
            type: 'submit-estimate',
            payload: { value },
            runtimeState: state,
            roundState: { phase: 'collecting', itemIndex: 0 },
          },
        ),
      ).toThrow(/authored range|authored step/);
    }
    expect(
      CLOSEST_GAMEPLAY_PLUGIN.handleCommand!(
        { now: new Date(), submitterParticipantId: 'a1' } as never,
        {
          type: 'submit-estimate',
          payload: { value: 15 },
          runtimeState: state,
          roundState: { phase: 'collecting', itemIndex: 0 },
        },
      ).eventType,
    ).toBe('closest-estimate-submitted');
  });

  it('keeps truth and the opposing value out of pre-resolution projections', () => {
    let assignments = createTeamActionAssignmentState([
      { teamId: 'a', order: ['a1'], cursor: 0 },
      { teamId: 'b', order: ['b1'], cursor: 0 },
    ]);
    for (const [teamId, participantId] of [
      ['a', 'a1'],
      ['b', 'b1'],
    ] as const) {
      assignments = assignNextTeamAction(assignments, {
        teamId,
        action: closestAnswerAction(teamId),
        participants: [{ participantId, teamId, connected: true }],
        now: new Date('2026-01-01T00:00:00.000Z'),
      }).state;
    }
    const state = {
      itemsJson: JSON.stringify([
        item,
        { ...item, id: 'item-2' },
        { ...item, id: 'item-3' },
      ]),
      teamIdsJson: '["a","b"]',
      currentItemIndex: 0,
      phase: 'collecting',
      answersJson: '{"a":19}',
      resultsJson: '[]',
      teamActionJson: serializeTeamActionAssignments(assignments),
      deadlineAt: '2026-01-01T00:00:45.000Z',
    };
    const projected = CLOSEST_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(
      state,
      { kind: 'participant', participantId: 'b1', teamId: 'b' } as never,
    );
    expect(JSON.stringify(projected)).not.toContain('correctValue');
    expect(projected.ownSubmittedValue).toBeUndefined();
    expect(JSON.stringify(projected)).not.toContain(':19');
    expect(JSON.parse(String(projected.submissionStatusJson))).toEqual({
      a: true,
      b: false,
    });
  });

  it('closes a submitted team action without losing its answerer from the result', () => {
    let assignments = createTeamActionAssignmentState([
      { teamId: 'a', order: ['a1', 'a2'], cursor: 0 },
      { teamId: 'b', order: ['b1', 'b2'], cursor: 0 },
    ]);
    for (const [teamId, participantId] of [
      ['a', 'a1'],
      ['b', 'b1'],
    ] as const) {
      assignments = assignNextTeamAction(assignments, {
        teamId,
        action: closestAnswerAction(teamId),
        participants: [
          { participantId, teamId, connected: true },
          { participantId: `${teamId}2`, teamId, connected: true },
        ],
        now: new Date('2026-01-01T00:00:00.000Z'),
      }).state;
    }
    const base = {
      itemsJson: JSON.stringify([
        item,
        { ...item, id: 'item-2' },
        { ...item, id: 'item-3' },
      ]),
      teamIdsJson: '["a","b"]',
      currentItemIndex: 0,
      phase: 'collecting',
      answersJson: '{}',
      resultsJson: '[]',
      teamActionJson: serializeTeamActionAssignments(assignments),
      deadlineAt: '2026-01-01T00:00:45.000Z',
    };
    const first = CLOSEST_GAMEPLAY_PLUGIN.handleCommand!(
      {
        now: new Date('2026-01-01T00:00:10.000Z'),
        submitterParticipantId: 'a1',
      } as never,
      {
        type: 'submit-estimate',
        payload: { value: 19 },
        runtimeState: base,
        roundState: { phase: 'collecting', itemIndex: 0 },
      },
    );
    const afterFirst = first.runtimeState;
    expect(
      assignmentFor(
        parseTeamActionAssignments(afterFirst.teamActionJson),
        closestAnswerAction('a'),
      ),
    ).toBeUndefined();

    const second = CLOSEST_GAMEPLAY_PLUGIN.handleCommand!(
      {
        now: new Date('2026-01-01T00:00:20.000Z'),
        submitterParticipantId: 'b1',
      } as never,
      {
        type: 'submit-estimate',
        payload: { value: 22 },
        runtimeState: afterFirst,
        roundState: { phase: 'collecting', itemIndex: 0 },
      },
    );
    expect(
      JSON.parse(String(second.runtimeState.resultsJson))[0],
    ).toMatchObject({
      assignedParticipantIds: { a: 'a1', b: 'b1' },
    });
  });

  describe('media projection', () => {
    const runtimeWithItemMedia = (media: unknown) => ({
      itemsJson: JSON.stringify([
        {
          ...item,
          media,
          revealMedia: {
            type: 'image',
            assets: [{ url: 'https://cdn/answer.webp' }],
          },
        },
        { ...item, id: 'item-2' },
        { ...item, id: 'item-3' },
      ]),
      teamIdsJson: '["a","b"]',
      currentItemIndex: 0,
      phase: 'collecting',
      answersJson: '{}',
      resultsJson: '[]',
      teamActionJson: serializeTeamActionAssignments(
        createTeamActionAssignmentState([
          { teamId: 'a', order: ['a1'], cursor: 0 },
          { teamId: 'b', order: ['b1'], cursor: 0 },
        ]),
      ),
      deadlineAt: '2026-01-01T00:00:45.000Z',
    });
    const projectedItem = (media: unknown) =>
      JSON.parse(
        String(
          CLOSEST_GAMEPLAY_PLUGIN.projectRuntimeState(
            runtimeWithItemMedia(media),
          ).currentItemJson,
        ),
      ) as { media: unknown };

    it('projects a safe image media shape: type, playable url, no raw asset metadata', () => {
      const { media } = projectedItem({
        type: ContentMediaType.IMAGE,
        assets: [
          {
            url: 'https://cdn/closest-image.webp',
            altText: 'صورة السؤال',
            path: 'question-assets/images/closest-image.webp',
            filename: 'الإجابة-فورست-غامب.webp',
            mimetype: 'image/webp',
            size: 45210,
          },
        ],
      });
      expect(media).toEqual({
        type: 'image',
        url: 'https://cdn/closest-image.webp',
        altText: 'صورة السؤال',
      });
      const raw = JSON.stringify(media);
      expect(raw).not.toContain('path');
      expect(raw).not.toContain('filename');
      expect(raw).not.toContain('mimetype');
      expect(raw).not.toContain('answer.webp');
      expect(raw).not.toContain('size');
      expect(raw).not.toContain('45210');
    });

    it('projects a safe audio media shape: type, playable url, no raw asset metadata', () => {
      const { media } = projectedItem({
        type: ContentMediaType.AUDIO,
        assets: [
          {
            url: 'https://cdn/closest-audio.mp3',
            path: 'question-assets/audio/closest-audio.mp3',
            filename: 'answer-forty-two.mp3',
            mimetype: 'audio/mpeg',
            size: 88213,
          },
        ],
      });
      expect(media).toEqual({
        type: 'audio',
        url: 'https://cdn/closest-audio.mp3',
      });
      const raw = JSON.stringify(media);
      expect(raw).not.toContain('path');
      expect(raw).not.toContain('filename');
      expect(raw).not.toContain('mimetype');
    });

    it('never leaks the accepted correctValue through the projected item, image or audio alike', () => {
      for (const media of [
        null,
        {
          type: ContentMediaType.IMAGE,
          assets: [{ url: 'https://cdn/i.webp' }],
        },
        {
          type: ContentMediaType.AUDIO,
          assets: [{ url: 'https://cdn/a.mp3' }],
        },
      ]) {
        const raw = JSON.stringify(projectedItem(media));
        expect(raw).not.toContain('correctValue');
        expect(raw).not.toContain(':20');
      }
    });

    it('a text-only item (no media) remains valid and projects no media block', () => {
      const projected = CLOSEST_GAMEPLAY_PLUGIN.projectRuntimeState(
        runtimeWithItemMedia(undefined),
      );
      expect(JSON.parse(String(projected.currentItemJson)).media).toBeNull();
    });

    it('degrades unsupported/malformed media to no media rather than failing the projection', () => {
      for (const media of [
        {
          type: ContentMediaType.VIDEO,
          assets: [{ url: 'https://cdn/v.mp4' }],
        },
        { type: ContentMediaType.IMAGE, assets: [] },
        { type: ContentMediaType.IMAGE, assets: [{ url: '' }] },
      ]) {
        expect(() => projectedItem(media)).not.toThrow();
        expect(projectedItem(media).media).toBeNull();
      }
    });

    it('reconnect/re-projection retains the same media identity', () => {
      const media = {
        type: ContentMediaType.IMAGE,
        assets: [{ url: 'https://cdn/stable.webp', altText: 'ثابت' }],
      };
      const state = runtimeWithItemMedia(media);
      const first = projectedItem(media);
      const second = JSON.parse(
        String(
          CLOSEST_GAMEPLAY_PLUGIN.projectRuntimeStateForActor!(state, {
            kind: 'participant',
            participantId: 'a1',
            teamId: 'a',
          } as never).currentItemJson,
        ),
      ) as { media: unknown };
      expect(first.media).toEqual(second.media);
    });
  });
});
