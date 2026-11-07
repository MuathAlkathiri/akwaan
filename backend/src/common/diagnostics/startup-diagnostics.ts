import { Logger } from '@nestjs/common';

/**
 * Startup diagnostics: one timestamped line per startup step, written at the
 * moment it happens, so a deploy that never opens its port still shows how far
 * it got. Nest's Logger writes straight to stdout here (the app is created
 * without `bufferLogs`), so nothing waits for `listen()` to be flushed.
 *
 * Observation only: no step is reordered, retried, skipped or time-limited.
 * Messages never include connection strings, credentials or player data.
 */
export const STARTUP_DIAGNOSTICS_CONTEXT = 'StartupDiagnostics';
export const STARTUP_WATCHDOG_INTERVAL_MS = 30_000;
const MAX_ERROR_LENGTH = 300;

/** One traced operation that has started and not yet finished. */
interface ActiveOperation {
  step: string;
  startedAt: number;
}

interface StartupState {
  processStartedAt: number;
  /** The most recent milestone (markStartupStep), e.g. "database: connecting". */
  lastStep: string;
  lastStepAt: number;
  /**
   * Every traced operation in flight, keyed by a per-call id. Nest runs the
   * onApplicationBootstrap hooks of different modules concurrently, so several
   * may be active at once and they finish in any order.
   */
  active: Map<number, ActiveOperation>;
  nextId: number;
  watchdog?: ReturnType<typeof setInterval>;
  completed: boolean;
}

const state: StartupState = {
  processStartedAt: Date.now(),
  lastStep: 'loading modules',
  lastStepAt: Date.now(),
  active: new Map(),
  nextId: 1,
  completed: false,
};

const sinceStart = (now = Date.now()) => now - state.processStartedAt;

const info = (message: string) =>
  Logger.log(message, STARTUP_DIAGNOSTICS_CONTEXT);

/**
 * An error reduced to its name and a bounded, single-line message with
 * credentials removed: database URIs, `user:password@` in any URI, bearer
 * tokens, Authorization headers and JWTs.
 */
export function describeStartupError(error: unknown): string {
  const name = error instanceof Error ? error.name : typeof error;
  const raw = error instanceof Error ? error.message : String(error);
  const message = redactSecrets(raw)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ERROR_LENGTH);
  return `${name}: ${message}`;
}

/** Removes credential-shaped substrings from free text. */
export function redactSecrets(text: string): string {
  return (
    text
      // Whole MongoDB URIs (host names and options included).
      .replace(/mongodb(?:\+srv)?:\/\/\S+/gi, 'mongodb://<redacted>')
      // user:password@ embedded in any other URI.
      .replace(
        /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]*@/gi,
        '$1<redacted>@',
      )
      // Authorization headers, whatever the scheme.
      .replace(
        /\bauthorization\s*[:=]\s*\S+(?:\s+\S+)?/gi,
        'authorization: <redacted>',
      )
      // Bearer tokens on their own.
      .replace(/\bbearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer <redacted>')
      // JSON Web Tokens: three base64url segments, the first a JSON header.
      .replace(
        /\beyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g,
        '<redacted-jwt>',
      )
  );
}

/** Called once, before the application modules load. */
export function markProcessStart(now = Date.now()): void {
  stopStartupWatchdog();
  state.processStartedAt = now;
  state.lastStep = 'loading modules';
  state.lastStepAt = now;
  state.active = new Map();
  state.completed = false;
  info(
    `process started (pid ${process.pid}, node ${process.version}); loading modules`,
  );
}

/** Records a step boundary that has no duration of its own. */
export function markStartupStep(step: string): void {
  const now = Date.now();
  state.lastStep = step;
  state.lastStepAt = now;
  info(`${step} (t+${sinceStart(now)}ms)`);
}

/**
 * Runs one asynchronous startup step and logs its start, its completion with
 * duration, or its failure. The step's result and any error pass through
 * unchanged. Concurrent and nested steps are tracked independently.
 */
export async function traceStartupStep<T>(
  step: string,
  work: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  const id = state.nextId++;
  state.active.set(id, { step, startedAt });
  info(`${step}: started (t+${sinceStart(startedAt)}ms)`);
  try {
    const result = await work();
    info(`${step}: completed in ${Date.now() - startedAt}ms`);
    return result;
  } catch (error) {
    Logger.error(
      `${step}: failed after ${Date.now() - startedAt}ms — ${describeStartupError(error)}`,
      undefined,
      STARTUP_DIAGNOSTICS_CONTEXT,
    );
    throw error;
  } finally {
    state.active.delete(id);
  }
}

/** The single watchdog line: every active operation and the last milestone. */
export function describeStartupProgress(now = Date.now()): string {
  const active = [...state.active.values()]
    .map(({ step, startedAt }) => `${step} ${now - startedAt}ms`)
    .join(', ');
  return (
    `startup still in progress (t+${sinceStart(now)}ms): active [${active || 'none'}]; ` +
    `last step "${state.lastStep}" ${now - state.lastStepAt}ms ago`
  );
}

/**
 * While startup is incomplete, reports progress at a fixed interval, so a hang
 * names every operation it is stuck in. Never keeps the process alive.
 */
export function startStartupWatchdog(
  intervalMs = STARTUP_WATCHDOG_INTERVAL_MS,
): void {
  if (state.watchdog || state.completed) return;
  state.watchdog = setInterval(() => {
    Logger.warn(describeStartupProgress(), STARTUP_DIAGNOSTICS_CONTEXT);
  }, intervalMs);
  state.watchdog.unref?.();
}

/** Stops the watchdog without marking startup complete (e.g. on failure). */
export function stopStartupWatchdog(): void {
  if (state.watchdog) clearInterval(state.watchdog);
  state.watchdog = undefined;
}

/** Stops the watchdog and records total startup time. */
export function completeStartup(): void {
  stopStartupWatchdog();
  state.completed = true;
  info(`startup complete in ${sinceStart()}ms`);
}
