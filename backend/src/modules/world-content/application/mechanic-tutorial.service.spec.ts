import { Types } from 'mongoose';
import { MechanicTutorialService } from './mechanic-tutorial.service';

describe('MechanicTutorialService world resolution', () => {
  const worldId = new Types.ObjectId().toString();
  const mechanicId = new Types.ObjectId();
  const generic = {
    mechanicKey: 'read-your-opponent',
    revision: 3,
    scenario: { kind: 'ryo', prompt: 'عام' },
  };

  function service(overrides?: {
    world?: unknown;
    configuration?: unknown;
    scoped?: unknown;
    mechanic?: unknown;
  }) {
    const challengeTypes = {
      findOne: jest.fn().mockResolvedValue(
        overrides && 'mechanic' in overrides
          ? overrides.mechanic
          : {
              _id: mechanicId,
              slug: 'read-your-opponent',
              tutorial: { published: generic.scenario, publishedRevision: 3 },
            },
      ),
    };
    const worlds = {
      findById: jest
        .fn()
        .mockResolvedValue(
          overrides && 'world' in overrides
            ? overrides.world
            : { _id: worldId },
        ),
    };
    const configurations = {
      findByWorldAndChallengeType: jest
        .fn()
        .mockResolvedValue(
          overrides && 'configuration' in overrides
            ? overrides.configuration
            : { worldId },
        ),
    };
    const scopedTutorials = {
      findByPair: jest
        .fn()
        .mockResolvedValue(
          overrides && 'scoped' in overrides ? overrides.scoped : null,
        ),
    };

    return {
      service: new MechanicTutorialService(
        challengeTypes as never,
        undefined as never,
        worlds as never,
        configurations as never,
        scopedTutorials as never,
      ),
      scopedTutorials,
    };
  }

  it('falls back to generic only when the World/mechanic pair is absent', async () => {
    const setup = service({ world: null });

    await expect(
      setup.service.getPublishedForWorld(worldId, 'read-your-opponent'),
    ).resolves.toMatchObject({ source: 'generic', worldId: null });
  });

  it('propagates a scoped inventory read failure instead of hiding it with generic content', async () => {
    const setup = service();
    setup.scopedTutorials.findByPair.mockRejectedValue(
      new Error('Mongo read failed'),
    );

    await expect(
      setup.service.getPublishedForWorld(worldId, 'read-your-opponent'),
    ).rejects.toThrow('Mongo read failed');
  });

  it('keeps a missing generic publication as a real empty result', async () => {
    const setup = service({
      world: null,
      mechanic: {
        _id: mechanicId,
        slug: 'read-your-opponent',
        tutorial: { published: null, publishedRevision: 0 },
      },
    });

    await expect(
      setup.service.getPublishedForWorld(worldId, 'read-your-opponent'),
    ).resolves.toBeNull();
  });

  it('returns a published World scenario ahead of the generic scenario', async () => {
    const setup = service({
      scoped: {
        published: { kind: 'ryo', prompt: 'Football' },
        publishedRevision: 4,
      },
    });

    await expect(
      setup.service.getPublishedForWorld(worldId, 'read-your-opponent'),
    ).resolves.toMatchObject({
      source: 'world',
      worldId,
      revision: 4,
      scenario: { prompt: 'Football' },
    });
  });

  it('keeps two World publications isolated for the same mechanic', async () => {
    const setup = service();
    const animeWorldId = new Types.ObjectId().toString();
    setup.scopedTutorials.findByPair.mockImplementation(
      async (requestedWorldId: string) => ({
        published: {
          kind: 'ryo',
          prompt: requestedWorldId === worldId ? 'Football' : 'Anime',
        },
        publishedRevision: 1,
      }),
    );

    const football = await setup.service.getPublishedForWorld(
      worldId,
      'read-your-opponent',
    );
    const anime = await setup.service.getPublishedForWorld(
      animeWorldId,
      'read-your-opponent',
    );

    expect(football).toMatchObject({
      source: 'world',
      scenario: { prompt: 'Football' },
    });
    expect(anime).toMatchObject({
      source: 'world',
      scenario: { prompt: 'Anime' },
    });
  });
});
