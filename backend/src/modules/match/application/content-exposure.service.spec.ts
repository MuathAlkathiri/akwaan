import { ContentExposureRepository } from '../persistence/content-exposure.repository';
import {
  ContentExposureScope,
  ContentExposureService,
} from './content-exposure.service';

/**
 * The account's per-mechanic content history.
 *
 * The two rules these tests exist for: the ledger is keyed on the *triple*, so a
 * question burned in one mechanic is untouched in another; and **selection is not
 * exposure**, so reserving is not spending.
 */
describe('ContentExposureService', () => {
  const NOW = new Date('2026-08-20T10:00:00.000Z');

  const scope = (overrides: Partial<ContentExposureScope> = {}) => ({
    ownerAccountId: 'account-a',
    challengeTypeKey: 'bomb',
    matchId: 'match-1',
    ...overrides,
  });

  const build = (blocked: string[] = []) => {
    const repository = {
      blockedContentItemIds: jest.fn().mockResolvedValue(new Set(blocked)),
      reserve: jest.fn((_scope: unknown, ids: string[]) =>
        Promise.resolve(ids),
      ),
      markExposed: jest.fn((_scope: unknown, ids: string[]) =>
        Promise.resolve(ids.length),
      ),
      releaseReservations: jest.fn().mockResolvedValue(3),
    } as unknown as ContentExposureRepository;
    return { service: new ContentExposureService(repository), repository };
  };

  it('removes only what this account has seen in this mechanic', async () => {
    const { service, repository } = build(['i2']);

    await expect(
      service.selectable(scope(), ['i1', 'i2', 'i3'], NOW),
    ).resolves.toEqual(['i1', 'i3']);

    // Scoped by owner *and* mechanic, so neither dimension can leak.
    expect(repository.blockedContentItemIds).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerAccountId: 'account-a',
        challengeTypeKey: 'bomb',
      }),
      ['i1', 'i2', 'i3'],
      { forMatchId: 'match-1', now: NOW },
    );
  });

  it('asks only about the candidates in hand, never the whole history', async () => {
    // The query is bounded by the pool the selector already narrowed, which is
    // what keeps the cost independent of how much the account has played.
    const { service, repository } = build();
    await service.selectable(scope(), ['i1'], NOW);
    const [, candidates] = (
      repository.blockedContentItemIds as unknown as jest.Mock
    ).mock.calls[0];
    expect(candidates).toEqual(['i1']);
  });

  it('reports which items a concurrent Match won', async () => {
    const { service, repository } = build();
    (repository.reserve as unknown as jest.Mock).mockResolvedValue(['i1']);

    const result = await service.reserve(scope(), ['i1', 'i2'], NOW);

    expect(result.claimed).toEqual(['i1']);
    // The caller must fail the launch rather than present a lost item.
    expect(result.lost).toEqual(['i2']);
  });

  it('gives a reservation an expiry so a crash cannot withhold content forever', async () => {
    const { service, repository } = build();
    await service.reserve(scope(), ['i1'], NOW);
    const [, , input] = (repository.reserve as unknown as jest.Mock).mock
      .calls[0];
    expect(input.expiresAt.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it('reserving does not spend anything', async () => {
    // The whole point of the reserved/exposed split.
    const { service, repository } = build();
    await service.reserve(scope(), ['i1', 'i2'], NOW);
    expect(repository.markExposed).not.toHaveBeenCalled();
  });

  it('records presentation against the same triple', async () => {
    const { service, repository } = build();
    await service.recordPresented(scope(), ['i1'], NOW);
    expect(repository.markExposed).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerAccountId: 'account-a',
        challengeTypeKey: 'bomb',
      }),
      ['i1'],
      { matchId: 'match-1', now: NOW },
    );
  });

  it('writes nothing for an empty presentation', async () => {
    const { service, repository } = build();
    await expect(service.recordPresented(scope(), [], NOW)).resolves.toBe(0);
    expect(repository.markExposed).not.toHaveBeenCalled();
  });

  it('releases by Match, and only reservations', async () => {
    const { service, repository } = build();
    await expect(service.releaseUnseen('match-1')).resolves.toBe(3);
    expect(repository.releaseReservations).toHaveBeenCalledWith('match-1');
  });
});
