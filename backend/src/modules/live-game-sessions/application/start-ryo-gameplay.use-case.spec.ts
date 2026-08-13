import { plainAnswerPayload } from './start-ryo-gameplay.use-case';
import { RYO_GAMEPLAY_PLUGIN } from '../domain/ryo-gameplay.plugin';

/**
 * Getting the authored answer contract into the runtime item.
 *
 * This is the field that decides whether the answering phone is offered anything
 * to press, and whether the answer can be graded at all. It arrives as a Mongoose
 * subdocument, so it has to be flattened rather than spread.
 */

/** A stand-in for what the ContentItem repository actually returns. */
function subdocument(fields: Record<string, unknown>) {
  const document = {
    $__: { activePaths: {} },
    $isNew: false,
    _id: 'subdocument-id',
    toObject: () => ({ _id: 'subdocument-id', ...fields }),
  };
  // A real subdocument exposes its internals as own enumerable properties and
  // its fields only through the prototype, which is exactly why spreading fails.
  return document as unknown as Record<string, unknown>;
}

describe('read-your-opponent runtime item answer payload', () => {
  const multipleChoice = {
    mode: 'multiple_choice',
    options: [
      { id: 'a', label: { ar: 'فيلق الاستطلاع' } },
      { id: 'b', label: { ar: 'شرطة العاصمة' } },
    ],
    correctOptionId: 'a',
  };

  it('carries the options the answering phone has to choose from', () => {
    const payload = plainAnswerPayload(subdocument(multipleChoice));

    expect(payload.options).toEqual(multipleChoice.options);
    expect(payload.mode).toBe('multiple_choice');
  });

  it('carries the correct answer, without which every answer grades as wrong', () => {
    expect(
      plainAnswerPayload(subdocument(multipleChoice)).correctOptionId,
    ).toBe('a');
    expect(
      plainAnswerPayload(
        subdocument({
          mode: 'closest',
          correctValue: 16,
          acceptedTolerance: 0,
        }),
      ),
    ).toMatchObject({ correctValue: 16, acceptedTolerance: 0 });
  });

  it('leaves persistence internals out of the runtime payload', () => {
    const payload = plainAnswerPayload(subdocument(multipleChoice));

    for (const internal of ['$__', '$isNew', '$__parent', '_id']) {
      expect(Object.keys(payload)).not.toContain(internal);
    }
  });

  it('accepts a payload that is already plain', () => {
    expect(plainAnswerPayload({ ...multipleChoice })).toMatchObject(
      multipleChoice,
    );
  });

  it('survives a missing payload rather than throwing mid-launch', () => {
    expect(plainAnswerPayload(undefined)).toEqual({});
    expect(plainAnswerPayload(null)).toEqual({});
  });
});

/**
 * The two submissions are separate transitions, and both are required.
 *
 * A steal is only meaningful against an answer that exists, so the interaction
 * must not resolve on a decision alone — and the answering side must not be able
 * to send one.
 */
describe('read-your-opponent requires an answer and a decision', () => {
  const interaction = RYO_GAMEPLAY_PLUGIN.interaction!;
  const pending = (kind: string, extra: Record<string, unknown> = {}) =>
    ({
      status: 'pending-adjudication',
      payload: { kind, ...extra },
    }) as never;

  it('does not resolve on a decision alone', () => {
    expect(
      interaction.shouldAutoResolve!(
        [pending('decision', { decision: 'steal' })],
        {} as never,
      ),
    ).toBe(false);
  });

  it('does not resolve on an answer alone', () => {
    expect(
      interaction.shouldAutoResolve!(
        [pending('answer', { mode: 'multiple_choice', optionId: 'a' })],
        {} as never,
      ),
    ).toBe(false);
  });

  it('resolves once both have arrived', () => {
    expect(
      interaction.shouldAutoResolve!(
        [
          pending('answer', { mode: 'multiple_choice', optionId: 'a' }),
          pending('decision', { decision: 'trust' }),
        ],
        {} as never,
      ),
    ).toBe(true);
  });

  it('refuses a decision from the answering side and an answer from the reading side', () => {
    const prompt = {
      internalPayload: { answeringTeamId: 'team-a', opposingTeamId: 'team-b' },
    } as never;

    expect(() =>
      interaction.validateSubmissionForActor!(
        { kind: 'decision', decision: 'steal' } as never,
        { teamId: 'team-a' } as never,
        prompt,
        {} as never,
      ),
    ).toThrow(/RYO_WRONG_SIDE|not available/);
    expect(() =>
      interaction.validateSubmissionForActor!(
        { kind: 'answer', mode: 'multiple_choice', optionId: 'a' } as never,
        { teamId: 'team-b' } as never,
        prompt,
        {} as never,
      ),
    ).toThrow(/RYO_WRONG_SIDE|not available/);
  });

  it('shows each side only its own role', () => {
    const prompt = {
      publicPayload: { itemJson: '{}' },
      internalPayload: { answeringTeamId: 'team-a', opposingTeamId: 'team-b' },
    } as never;

    expect(
      interaction.projectPrompt!(prompt, { teamId: 'team-a' } as never)
        ?.actorRole,
    ).toBe('answering');
    expect(
      interaction.projectPrompt!(prompt, { teamId: 'team-b' } as never)
        ?.actorRole,
    ).toBe('opposing');
    expect(
      interaction.projectPrompt!(prompt, { teamId: 'team-c' } as never)
        ?.actorRole,
    ).toBe('spectator');
  });
});
