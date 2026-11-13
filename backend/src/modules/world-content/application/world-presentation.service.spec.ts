import { Types } from 'mongoose';
import { WorldPresentationService } from './world-presentation.service';

/**
 * world-content's outward answer to "what sits behind a question in this
 * World?" (roadmap §30.22 Track A).
 *
 * The contract is that it can never fail a challenge launch: every unhappy
 * answer is `null` plus an advisory finding, never a thrown error.
 */
describe('WorldPresentationService', () => {
  const WORLD = new Types.ObjectId().toHexString();
  const artwork = {
    url: '/world-content/worlds/world-anime-fallback.jpg',
    path: 'world-content/worlds/world-anime-fallback.jpg',
  };

  const build = (world: unknown) => {
    const findById = jest.fn().mockResolvedValue(world);
    return {
      service: new WorldPresentationService({ findById } as never),
      findById,
    };
  };

  it('returns the World’s question fallback artwork', async () => {
    const { service, findById } = build({ questionFallback: artwork });

    const backdrop = await service.questionBackdropFor(WORLD);

    expect(findById).toHaveBeenCalledWith(WORLD);
    expect(backdrop.asset).toEqual(artwork);
    expect(backdrop.defects).toEqual([]);
  });

  it('reports an advisory finding for a World with no artwork', async () => {
    const { service } = build({ questionFallback: null });

    const backdrop = await service.questionBackdropFor(WORLD);

    expect(backdrop.asset).toBeNull();
    expect(backdrop.defects).toEqual([
      {
        code: 'WORLD_FALLBACK_MISSING',
        severity: 'advisory',
        message: expect.any(String),
      },
    ]);
  });

  it('treats artwork with a blank url as no artwork', async () => {
    const { service } = build({ questionFallback: { url: '   ' } });

    const backdrop = await service.questionBackdropFor(WORLD);

    expect(backdrop.asset).toBeNull();
    expect(backdrop.defects.map((defect) => defect.code)).toEqual([
      'WORLD_FALLBACK_MISSING',
    ]);
  });

  it('answers for a World that no longer exists instead of throwing', async () => {
    const { service } = build(null);

    await expect(service.questionBackdropFor(WORLD)).resolves.toEqual({
      asset: null,
      defects: [expect.objectContaining({ severity: 'advisory' })],
    });
  });

  it('does not query the database for an id that cannot be one', async () => {
    const { service, findById } = build({ questionFallback: artwork });

    const backdrop = await service.questionBackdropFor('not-an-object-id');

    expect(findById).not.toHaveBeenCalled();
    expect(backdrop.asset).toBeNull();
  });

  it('never reports a blocking defect: a missing backdrop is decorative', async () => {
    const { service } = build(null);

    const backdrop = await service.questionBackdropFor(WORLD);

    expect(
      backdrop.defects.some((defect) => defect.severity === 'blocking'),
    ).toBe(false);
  });
});
