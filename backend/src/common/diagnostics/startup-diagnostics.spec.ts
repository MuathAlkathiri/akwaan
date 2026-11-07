import { Logger } from '@nestjs/common';
import {
  STARTUP_DIAGNOSTICS_CONTEXT,
  completeStartup,
  describeStartupError,
  markProcessStart,
  markStartupStep,
  startStartupWatchdog,
  traceStartupStep,
} from './startup-diagnostics';

describe('startup diagnostics', () => {
  let log: jest.SpyInstance;
  let error: jest.SpyInstance;
  let warn: jest.SpyInstance;
  const lines = (spy: jest.SpyInstance) =>
    spy.mock.calls.map((call) => String(call[0]));

  beforeEach(() => {
    log = jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
    error = jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    markProcessStart();
  });

  afterEach(() => {
    completeStartup();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('writes every line under its own context, at the moment it happens', () => {
    markStartupStep('modules loaded');
    expect(log).toHaveBeenLastCalledWith(
      expect.stringMatching(/^modules loaded \(t\+\d+ms\)$/),
      STARTUP_DIAGNOSTICS_CONTEXT,
    );
    expect(lines(log)[0]).toMatch(
      /^process started \(pid \d+, node v[\d.]+\); loading modules$/,
    );
  });

  it('logs start and completion with a duration, and returns the result', async () => {
    await expect(traceStartupStep('step A', async () => 42)).resolves.toBe(42);
    expect(lines(log)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^step A: started \(t\+\d+ms\)$/),
        expect.stringMatching(/^step A: completed in \d+ms$/),
      ]),
    );
    expect(error).not.toHaveBeenCalled();
  });

  it('logs a failure with its duration and rethrows the same error', async () => {
    const failure = new Error('boom');
    await expect(
      traceStartupStep('step B', async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(error).toHaveBeenCalledWith(
      expect.stringMatching(/^step B: failed after \d+ms — Error: boom$/),
      undefined,
      STARTUP_DIAGNOSTICS_CONTEXT,
    );
  });

  it('never logs a connection string or its credentials', () => {
    const described = describeStartupError(
      new Error(
        'bad uri mongodb+srv://user:secret@cluster0.example.net/db?x=1 and mongodb://a:b@h:27017',
      ),
    );
    expect(described).not.toMatch(/secret|user:|a:b@|cluster0/);
    expect(described).toContain('mongodb://<redacted>');
  });

  it('bounds and flattens long error messages', () => {
    const described = describeStartupError(new Error(`a\n${'x'.repeat(1000)}`));
    expect(described.length).toBeLessThanOrEqual(310);
    expect(described).not.toContain('\n');
  });

  it('reports the step in progress while startup hangs, then stops', async () => {
    jest.useFakeTimers();
    startStartupWatchdog(30_000);
    let release!: () => void;
    const hanging = traceStartupStep(
      'PresenceOwnershipService.onApplicationBootstrap',
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    jest.advanceTimersByTime(60_000);
    expect(lines(warn)).toEqual([
      expect.stringMatching(
        /^startup still in progress \(t\+\d+ms\): active \[PresenceOwnershipService\.onApplicationBootstrap \d+ms\]/,
      ),
      expect.stringMatching(
        /active \[PresenceOwnershipService\.onApplicationBootstrap /,
      ),
    ]);
    release();
    await hanging;
    completeStartup();
    warn.mockClear();
    jest.advanceTimersByTime(120_000);
    expect(warn).not.toHaveBeenCalled();
    expect(lines(log)).toContainEqual(
      expect.stringMatching(/^startup complete in \d+ms$/),
    );
  });

  it('names the enclosing step again once a nested step finishes', async () => {
    jest.useFakeTimers();
    startStartupWatchdog(10_000);
    let release!: () => void;
    const outer = traceStartupStep('app.listen', async () => {
      await traceStartupStep('inner hook', async () => undefined);
      await new Promise<void>((resolve) => (release = resolve));
    });
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(10_000);
    expect(lines(warn).at(-1)).toMatch(/active \[app\.listen \d+ms\]/);
    release();
    await outer;
  });

  it('starts only one watchdog', () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(global, 'setInterval');
    startStartupWatchdog(1_000);
    startStartupWatchdog(1_000);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
