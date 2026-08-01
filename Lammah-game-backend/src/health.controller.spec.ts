import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('reports a connected database after a successful ping', async () => {
    const ping = jest.fn().mockResolvedValue({ ok: 1 });
    const controller = new HealthController({
      db: { admin: () => ({ ping }) },
    } as never);

    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      database: 'connected',
    });
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('returns service unavailable when MongoDB cannot be reached', async () => {
    const controller = new HealthController({
      db: { admin: () => ({ ping: jest.fn().mockRejectedValue(new Error()) }) },
    } as never);

    await expect(controller.check()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
