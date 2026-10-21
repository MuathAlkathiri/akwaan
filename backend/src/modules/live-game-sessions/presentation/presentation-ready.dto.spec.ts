import { ValidationPipe, ArgumentMetadata } from '@nestjs/common';
import {
  GameplayRuntimeMutationDto,
  GameplaySocketMutationDto,
} from './gameplay-runtime.dto';

/**
 * `forcePresentationActivation` must stay server-only.
 *
 * It is the one input that skips the presentation surface check, and the
 * acknowledgement handlers spread the request body straight into the command.
 * If it were ever accepted from the wire, any team player could activate a held
 * item on their own — starting the clock on a room that is still loading, which
 * is precisely the unfairness the barrier exists to remove. Nothing declares it
 * on a DTO, and both transports validate with `forbidNonWhitelisted`, so the
 * wire rejects it; this asserts that pair of facts rather than trusting it.
 */
describe('presentation acknowledgement DTOs', () => {
  // The exact configuration `configureApiApplication` and the gateway both use.
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  const valid = {
    commandId: '7a1f0b1a-0f3a-4c0e-9a2b-2f1d8c7b4e55',
    expectedRuntimeRevision: 3,
    expectedSessionRevision: 4,
  };

  const meta = (metatype: unknown): ArgumentMetadata => ({
    type: 'body',
    metatype: metatype as ArgumentMetadata['metatype'],
  });

  /** The property names a rejection actually complained about. */
  const refusalMessages = async (body: object, dto: unknown) => {
    try {
      await pipe.transform(body, meta(dto));
    } catch (error) {
      const response = (
        error as { getResponse?: () => unknown }
      ).getResponse?.();
      const message = (response as { message?: string[] })?.message ?? [];
      return Array.isArray(message) ? message.join(' ') : String(message);
    }
    return undefined;
  };

  for (const [name, dto, extra] of [
    ['HTTP', GameplayRuntimeMutationDto, {}],
    [
      'socket',
      GameplaySocketMutationDto,
      { sessionId: '2c4f3e55-2b1a-4d6f-9c0e-7a3b5d1e9f20' },
    ],
  ] as const) {
    it(`accepts a legitimate ${name} acknowledgement`, async () => {
      await expect(
        pipe.transform(
          { ...valid, ...extra, presentationGeneration: 2 },
          meta(dto),
        ),
      ).resolves.toMatchObject({ presentationGeneration: 2 });
    });

    it(`refuses a ${name} body carrying forcePresentationActivation`, async () => {
      // Not merely "a 400": the rejection must name this property, so a future
      // DTO that quietly declared it would fail here rather than pass because
      // some unrelated field happened to be invalid.
      await expect(
        refusalMessages(
          { ...valid, ...extra, forcePresentationActivation: true },
          dto,
        ),
      ).resolves.toMatch(/forcePresentationActivation/);
    });

    it(`accepts a declared ${name} outcome`, async () => {
      await expect(
        pipe.transform(
          { ...valid, ...extra, presentationOutcome: 'media-unavailable' },
          meta(dto),
        ),
      ).resolves.toMatchObject({ presentationOutcome: 'media-unavailable' });
    });

    it(`refuses an undeclared ${name} outcome`, async () => {
      // The set is closed on purpose: this value decides whether a barrier
      // releases, and a free string would let a client invent one.
      await expect(
        refusalMessages(
          { ...valid, ...extra, presentationOutcome: 'definitely-ready' },
          dto,
        ),
      ).resolves.toMatch(/presentationOutcome/);
    });
  }
});
