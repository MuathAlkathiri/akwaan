import { Logger } from '@nestjs/common';
import {
  completeStartup,
  markProcessStart,
  startStartupWatchdog,
  stopStartupWatchdog,
  traceStartupStep,
} from './startup-diagnostics';

/**
 * Nest runs onApplicationBootstrap hooks of different modules concurrently,
 * so the watchdog must track every active startup operation independently.
 */
describe('startup diagnostics — concurrent operations', () => {
  let warn: jest.SpyInstance;
  const INTERVAL = 10_000;

  /** A traced operation the test finishes (or fails) on demand. */
  const operation = (step: string) => {
    let finish!: () => void;
    let fail!: (error: Error) => void;
    const done = traceStartupStep(
      step,
      () =>
        new Promise<void>((resolve, reject) => {
          finish = resolve;
          fail = reject;
        }),
    );
    return {
      done,
      finish: () => finish(),
      fail: (error: Error) => fail(error),
    };
  };

  /** Lets pending promise callbacks (trace bookkeeping) run. */
  const settle = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };

  /** The active-operation names in the most recent watchdog line. */
  const reported = () => {
    jest.advanceTimersByTime(INTERVAL);
    const line = String(warn.mock.calls.at(-1)?.[0] ?? '');
    const match = /active \[(.*?)\]/.exec(line);
    if (!match) throw new Error(`no watchdog line: ${line}`);
    if (match[1] === 'none') return [];
    return match[1].split(', ').map((entry) => entry.replace(/ \d+ms$/, ''));
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(Logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    warn = jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    markProcessStart();
    startStartupWatchdog(INTERVAL);
  });

  afterEach(() => {
    completeStartup();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('reports both of two overlapping operations', async () => {
    const a = operation('Hook A');
    const b = operation('Hook B');
    await settle();
    expect(reported()).toEqual(['Hook A', 'Hook B']);
    a.finish();
    b.finish();
    await Promise.all([a.done, b.done]);
  });

  it('keeps reporting the hanging operation after the other completes', async () => {
    const a = operation('Hook A');
    const b = operation('Hook B');
    await settle();
    a.finish();
    await a.done;
    expect(reported()).toEqual(['Hook B']);
    b.finish();
    await b.done;
  });

  it('reports nothing stale when both complete in reverse order', async () => {
    const a = operation('Hook A');
    const b = operation('Hook B');
    await settle();
    a.finish();
    await a.done;
    b.finish();
    await b.done;
    expect(reported()).toEqual([]);
  });

  it('drops a failed operation and keeps the one still running', async () => {
    const a = operation('Hook A');
    const b = operation('Hook B');
    await settle();
    const failure = new Error('boom');
    a.fail(failure);
    await expect(a.done).rejects.toBe(failure);
    expect(reported()).toEqual(['Hook B']);
    b.finish();
    await b.done;
  });

  it('tracks nested operations and returns to the outer one', async () => {
    const outer = operation('app.listen');
    await settle();
    const inner = operation('Hook A');
    await settle();
    expect(reported()).toEqual(['app.listen', 'Hook A']);
    inner.finish();
    await inner.done;
    expect(reported()).toEqual(['app.listen']);
    outer.finish();
    await outer.done;
  });

  it('reports each operation with its own elapsed time', async () => {
    const a = operation('Hook A');
    jest.advanceTimersByTime(4_000);
    const b = operation('Hook B');
    await settle();
    jest.advanceTimersByTime(INTERVAL - 4_000);
    const line = String(warn.mock.calls.at(-1)?.[0]);
    expect(line).toMatch(/Hook A 10000ms, Hook B 6000ms/);
    a.finish();
    b.finish();
    await Promise.all([a.done, b.done]);
  });

  it('stops for good after completion, failure-stop, or a second start', () => {
    const spy = jest.spyOn(global, 'clearInterval');
    completeStartup();
    expect(spy).toHaveBeenCalled();
    warn.mockClear();
    jest.advanceTimersByTime(INTERVAL * 5);
    expect(warn).not.toHaveBeenCalled();

    markProcessStart();
    startStartupWatchdog(INTERVAL);
    stopStartupWatchdog();
    jest.advanceTimersByTime(INTERVAL * 5);
    expect(warn).not.toHaveBeenCalled();
  });

  it('never keeps Node.js alive', () => {
    markProcessStart();
    const unref = jest.fn();
    jest
      .spyOn(global, 'setInterval')
      .mockReturnValueOnce({ unref } as unknown as ReturnType<
        typeof setInterval
      >);
    completeStartup();
    markProcessStart();
    startStartupWatchdog(INTERVAL);
    expect(unref).toHaveBeenCalledTimes(1);
  });
});
