import { PlayerCatalogService } from './player-catalog.service';
import { WorldContentStatus } from '../domain/world-content.constants';
import type { WorldSummary } from './world.service';

/**
 * What the public catalogue calls playable.
 *
 * The rule under test is narrow and load-bearing: `available` must mean the
 * Match's own selection gate will accept this World, not merely that somebody
 * flipped it to active. Those came apart in Production — عالم الالغاز sat
 * active with an incomplete board, so the catalogue offered a World that
 * `MatchWorldSelectionPolicy` was refusing with `MATCH_WORLD_BOARD_NOT_READY`.
 *
 * `boardReady` is read off the readiness report `WorldService` already computed,
 * so nothing here is a second readiness algorithm; these tests pin the mapping.
 */

const summary = (
  over: Partial<WorldSummary> & { boardReady?: boolean } = {},
): WorldSummary => {
  const { boardReady = true, ...rest } = over;
  return {
    id: over.id ?? 'world-1',
    name: 'عالم',
    slug: 'world',
    status: WorldContentStatus.ACTIVE,
    sortOrder: 0,
    scopeCount: 4,
    challengeConfigurationCount: 4,
    contentItemCount: 40,
    readiness: { boardReady } as WorldSummary['readiness'],
    ...rest,
  } as WorldSummary;
};

const catalogOf = (worlds: WorldSummary[]) =>
  new PlayerCatalogService(
    { list: async () => worlds } as never,
    {} as never,
    {} as never,
  );

const availabilityOf = async (world: WorldSummary) =>
  (await catalogOf([world]).listPlayableWorlds())[0]?.availability;

describe('the public World catalogue', () => {
  it('calls an active World with a complete board available', async () => {
    expect(await availabilityOf(summary())).toBe('available');
  });

  it('refuses to call an active World available when its board is incomplete', async () => {
    // Status is not playability. This is the عالم الالغاز state exactly.
    expect(await availabilityOf(summary({ boardReady: false }))).toBe(
      'upcoming',
    );
  });

  it('announces a draft World rather than offering it', async () => {
    expect(
      await availabilityOf(
        summary({ status: WorldContentStatus.DRAFT, boardReady: false }),
      ),
    ).toBe('upcoming');
  });

  it('does not promote a draft just because its board is complete', async () => {
    expect(
      await availabilityOf(summary({ status: WorldContentStatus.DRAFT })),
    ).toBe('upcoming');
  });

  it('never lists an archived World at all', async () => {
    const worlds = await catalogOf([
      summary({ id: 'kept' }),
      summary({ id: 'gone', status: WorldContentStatus.ARCHIVED }),
    ]).listPlayableWorlds();
    expect(worlds.map((world) => world.id)).toEqual(['kept']);
  });

  it('moves a World between the two groups on domain state alone', async () => {
    // The same World, before and after its board is completed. Nothing about
    // the projection knows this World's slug.
    const before = summary({ id: 'w', slug: 'celebrities', boardReady: false });
    expect(await availabilityOf(before)).toBe('upcoming');
    expect(
      await availabilityOf({
        ...before,
        readiness: { boardReady: true } as WorldSummary['readiness'],
      }),
    ).toBe('available');
  });

  it('leaks no readiness, authoring or status field to a player', async () => {
    const [world] = await catalogOf([summary()]).listPlayableWorlds();
    for (const field of [
      'readiness',
      'status',
      'contentItemCount',
      'soundPack',
      'timerProfile',
      'toneProfile',
      'blockers',
      'warnings',
    ]) {
      expect(world).not.toHaveProperty(field);
    }
    expect(Object.keys(world).sort()).toEqual(
      [
        'availability',
        'challengeConfigurationCount',
        'id',
        'name',
        'scopeCount',
        'slug',
        'sortOrder',
      ].sort(),
    );
  });
});
