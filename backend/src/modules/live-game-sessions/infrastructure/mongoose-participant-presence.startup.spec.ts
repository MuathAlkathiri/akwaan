import { Logger } from '@nestjs/common';
import { MongooseParticipantPresenceRepository } from './mongoose-participant-presence.repository';

/**
 * Startup diagnostics must observe the presence reset, never change it: the
 * same single reset still runs, and a failure still fails startup.
 */
describe('MongooseParticipantPresenceRepository startup diagnostics', () => {
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
    error = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  const repositoryWith = (exec: () => Promise<unknown>) => {
    const updateMany = jest.fn(() => ({ exec }));
    return {
      repository: new MongooseParticipantPresenceRepository({
        updateMany,
      } as never),
      updateMany,
    };
  };

  it('still clears every connection exactly once, and traces it', async () => {
    const { repository, updateMany } = repositoryWith(async () => ({}));
    await repository.onApplicationBootstrap();
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalledWith({}, { $set: { connections: [] } });
    const messages = log.mock.calls.map((call) => String(call[0]));
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^ParticipantPresence\.onApplicationBootstrap: started/,
        ),
        expect.stringMatching(
          /^ParticipantPresence\.onApplicationBootstrap: completed in \d+ms$/,
        ),
      ]),
    );
  });

  it('still fails startup when the reset fails, and logs why', async () => {
    const failure = new Error('presence unavailable');
    const { repository } = repositoryWith(async () => {
      throw failure;
    });
    await expect(repository.onApplicationBootstrap()).rejects.toBe(failure);
    expect(String(error.mock.calls[0][0])).toMatch(
      /^ParticipantPresence\.onApplicationBootstrap: failed after \d+ms — Error: presence unavailable$/,
    );
  });
});
