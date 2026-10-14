import { MovingXoQuestionSourceRegistry } from '../../live-game-sessions/application/moving-xo-question-source.registry';
import { ContentItemStatus } from '../../world-content/domain/world-content.constants';
import { MatchDomainError } from '../domain/match.errors';
import { MovingXoQuestionSourceProvider } from './moving-xo-question-source';

interface Harness {
  provider: MovingXoQuestionSourceProvider;
  reserved: string[][];
  released: string[][];
  selected: Array<Record<string, unknown>>;
}

const validItem = (overrides: Record<string, unknown> = {}) => ({
  _id: 'item-1',
  worldId: 'world-1',
  scopeId: 'scope-1',
  status: ContentItemStatus.READY,
  compatibleChallengeTypeIds: ['challenge-type-1'],
  prompt: { ar: 'ما الكلمة؟' },
  media: null,
  answerPayload: { mode: 'match', acceptedAnswers: ['مثلث'] },
  ...overrides,
});

function harness(
  options: {
    selects?: Array<string[] | Error>;
    items?: Record<string, Record<string, unknown> | null>;
    throwOnItemIds?: string[];
    releaseFails?: boolean;
    lostByReservation?: string[][];
    boundToMovingXo?: boolean;
  } = {},
): Harness {
  const reserved: string[][] = [];
  const released: string[][] = [];
  const selected: Array<Record<string, unknown>> = [];
  let selectionIndex = 0;
  let reservationIndex = 0;
  const challenge = {
    challengeKey: options.boundToMovingXo === false ? 'bomb' : 'moving-xo',
    occurrenceIndex: 0,
    slotKey: 'slot_1',
    runtimeId: 'runtime-1',
  };
  const provider = new MovingXoQuestionSourceProvider(
    new MovingXoQuestionSourceRegistry(),
    {
      findActiveBySessionId: () =>
        Promise.resolve({
          id: 'match-1',
          currentChallenge: challenge,
          occurrences: [{ index: 0, worldId: 'world-1' }],
          selectedScopeIds: () => ['scope-1'],
        }),
    } as never,
    {
      findById: () => Promise.resolve({ controllerActorId: 'account-1' }),
    } as never,
    {
      select: (input: Record<string, unknown>) => {
        selected.push(input);
        const next = options.selects?.[selectionIndex++] ?? ['item-1'];
        return next instanceof Error
          ? Promise.reject(next)
          : Promise.resolve(next);
      },
    } as never,
    {
      reserve: (_scope: unknown, ids: string[]) => {
        reserved.push(ids);
        const lost = options.lostByReservation?.[reservationIndex++] ?? [];
        return Promise.resolve({
          claimed: lost.length ? [] : ids,
          lost,
        });
      },
      releaseReserved: (_scope: unknown, ids: string[]) => {
        released.push(ids);
        return options.releaseFails
          ? Promise.reject(new Error('release failed'))
          : Promise.resolve(ids.length);
      },
    } as never,
    {
      findById: (id: string) =>
        options.throwOnItemIds?.includes(id)
          ? Promise.reject(new Error('hydration failed'))
          : Promise.resolve(
              options.items && id in options.items
                ? options.items[id]
                : validItem({ _id: id }),
            ),
    } as never,
    {
      findById: () =>
        Promise.resolve({ _id: 'scope-1', slug: 'wordplay-letters' }),
    } as never,
    {
      findByWorldAndSlot: () =>
        Promise.resolve({ challengeTypeId: 'challenge-type-1' }),
    } as never,
    { now: () => new Date('2026-10-07T00:00:00.000Z') } as never,
  );
  return { provider, reserved, released, selected };
}

const request = {
  sessionId: 'session-1',
  runtimeId: 'runtime-1',
  turnNumber: 3,
  presentedContentItemIds: ['item-a', 'item-b'],
};

describe('MovingXoQuestionSourceProvider', () => {
  it('draws, reserves and hydrates exactly one item', async () => {
    const { provider, reserved, selected } = harness();
    const outcome = await provider.draw(request);

    expect(selected[0]).toMatchObject({
      matchId: 'match-1',
      challengeTypeId: 'challenge-type-1',
      requirements: { contentItemCount: 1, requiresPhones: true },
      usedContentItemIds: ['item-a', 'item-b'],
      exposureScope: {
        ownerAccountId: 'account-1',
        challengeTypeKey: 'moving-xo',
        matchId: 'match-1',
      },
    });
    expect(reserved).toEqual([['item-1']]);
    expect(outcome).toEqual({
      kind: 'question',
      question: {
        contentItemId: 'item-1',
        scopeId: 'scope-1',
        answerMode: 'match',
        prompt: { ar: 'ما الكلمة؟' },
        acceptedAnswers: ['مثلث'],
      },
    });
  });

  it('is unknown before the Match binds Moving XO', async () => {
    const { provider, reserved } = harness({ boundToMovingXo: false });
    expect(await provider.draw(request)).toEqual({ kind: 'unknown' });
    expect(reserved).toEqual([]);
  });

  it('maps selector depletion to the terminal exhausted outcome', async () => {
    const error = new MatchDomainError(
      'MATCH_INSUFFICIENT_PLAYABLE_CONTENT',
      'empty',
    );
    const { provider } = harness({ selects: [error] });
    expect(await provider.draw(request)).toEqual({ kind: 'exhausted' });
  });

  it('retries immediately after losing a reservation race', async () => {
    const { provider, reserved, selected } = harness({
      selects: [['item-1'], ['item-2']],
      lostByReservation: [['item-1'], []],
    });

    await expect(provider.draw(request)).resolves.toMatchObject({
      kind: 'question',
      question: { contentItemId: 'item-2' },
    });
    expect(reserved).toEqual([['item-1'], ['item-2']]);
    expect(selected[1].usedContentItemIds).toEqual([
      'item-a',
      'item-b',
      'item-1',
    ]);
  });

  it('releases an unseen malformed reservation and continues', async () => {
    const { provider, released, selected } = harness({
      selects: [['bad'], ['good']],
      items: {
        bad: validItem({ _id: 'bad', answerPayload: { mode: 'closest' } }),
        good: validItem({ _id: 'good' }),
      },
    });

    await expect(provider.draw(request)).resolves.toMatchObject({
      kind: 'question',
      question: { contentItemId: 'good' },
    });
    expect(released).toEqual([['bad']]);
    expect(selected[1].usedContentItemIds).toContain('bad');
  });

  it('releases and retries after an unexpected hydration failure', async () => {
    const { provider, released } = harness({
      selects: [['throws'], ['good']],
      throwOnItemIds: ['throws'],
      items: { good: validItem({ _id: 'good' }) },
    });

    await expect(provider.draw(request)).resolves.toMatchObject({
      kind: 'question',
      question: { contentItemId: 'good' },
    });
    expect(released).toEqual([['throws']]);
  });

  it('still converges when rejected-reservation cleanup fails', async () => {
    const { provider, released } = harness({
      selects: [['bad'], ['good']],
      releaseFails: true,
      items: {
        bad: validItem({ _id: 'bad', answerPayload: { mode: 'closest' } }),
        good: validItem({ _id: 'good' }),
      },
    });

    await expect(provider.draw(request)).resolves.toMatchObject({
      kind: 'question',
      question: { contentItemId: 'good' },
    });
    expect(released).toEqual([['bad']]);
  });

  it.each([
    ['missing', null],
    ['not ready', validItem({ _id: 'bad', status: ContentItemStatus.DRAFT })],
    [
      'wrong mechanic',
      validItem({ _id: 'bad', compatibleChallengeTypeIds: ['other'] }),
    ],
    ['wrong scope', validItem({ _id: 'bad', scopeId: 'scope-2' })],
  ])('recovers when a reserved item is %s', async (_label, badItem) => {
    const { provider, released } = harness({
      selects: [['bad'], ['good']],
      items: { bad: badItem, good: validItem({ _id: 'good' }) },
    });
    await expect(provider.draw(request)).resolves.toMatchObject({
      kind: 'question',
      question: { contentItemId: 'good' },
    });
    expect(released).toEqual([['bad']]);
  });

  it('preserves a complete multiple-choice contract', async () => {
    const { provider } = harness({
      items: {
        'item-1': validItem({
          prompt: { ar: 'أي شكل؟' },
          answerPayload: {
            toObject: () => ({
              mode: 'multiple_choice',
              options: [
                { id: 'A', label: { ar: 'دائرة' } },
                { id: 'B', label: { ar: 'مثلث' } },
              ],
              correctOptionId: 'B',
            }),
          },
        }),
      },
    });

    expect(await provider.draw(request)).toMatchObject({
      kind: 'question',
      question: {
        answerMode: 'multiple_choice',
        correctOptionId: 'B',
      },
    });
  });

  it('terminates safely after the bounded recovery limit', async () => {
    const selects = Array.from({ length: 24 }, (_, index) => [`bad-${index}`]);
    const items = Object.fromEntries(
      selects.map(([id]) => [
        id,
        validItem({ _id: id, answerPayload: { mode: 'distributed' } }),
      ]),
    );
    const { provider, reserved, released } = harness({ selects, items });

    expect(await provider.draw(request)).toEqual({ kind: 'exhausted' });
    expect(reserved).toHaveLength(24);
    expect(released).toHaveLength(24);
  });
});
