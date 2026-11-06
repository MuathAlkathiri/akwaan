import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController, deployedCommit } from './health.controller';

const SHA = '402df01fca9485824724ed327b7d4c33322e0897';

describe('HealthController', () => {
  const original = process.env.RENDER_GIT_COMMIT;
  afterEach(() => {
    if (original === undefined) delete process.env.RENDER_GIT_COMMIT;
    else process.env.RENDER_GIT_COMMIT = original;
  });

  const controllerWith = (ping: jest.Mock) =>
    new HealthController({ db: { admin: () => ({ ping }) } } as never);

  it('reports a connected database after a successful ping', async () => {
    delete process.env.RENDER_GIT_COMMIT;
    const ping = jest.fn().mockResolvedValue({ ok: 1 });

    await expect(controllerWith(ping).check()).resolves.toEqual({
      status: 'ok',
      database: 'connected',
      commit: null,
    });
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('reports the deployed commit alongside a healthy database', async () => {
    process.env.RENDER_GIT_COMMIT = SHA;

    await expect(
      controllerWith(jest.fn().mockResolvedValue({ ok: 1 })).check(),
    ).resolves.toEqual({ status: 'ok', database: 'connected', commit: SHA });
  });

  it('still says which code is running when MongoDB cannot be reached', async () => {
    process.env.RENDER_GIT_COMMIT = SHA;
    const controller = controllerWith(jest.fn().mockRejectedValue(new Error()));

    const failure = await controller.check().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as ServiceUnavailableException).getResponse()).toEqual({
      status: 'unavailable',
      database: 'disconnected',
      commit: SHA,
    });
  });
});

describe('deployedCommit', () => {
  it('accepts short and full SHAs and normalises case', () => {
    expect(deployedCommit({ RENDER_GIT_COMMIT: '402df01' })).toBe('402df01');
    expect(
      deployedCommit({ RENDER_GIT_COMMIT: ` ${SHA.toUpperCase()} ` }),
    ).toBe(SHA);
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
    ['too short', '402df0'],
    ['too long', `${SHA}0`],
    ['not hex', 'main'],
    ['a secret-shaped value', 'mongodb+srv://user:pass@cluster/db'],
  ])('reports null for a %s value, never echoing it', (_label, value) => {
    expect(deployedCommit({ RENDER_GIT_COMMIT: value })).toBeNull();
  });
});
