import { LiveSessionDomainError } from './live-session.errors';

export interface TeamClockState {
  allocatedMs: number;
  consumedMs: number;
  startedAt?: Date;
  running: boolean;
}

export class TeamClock {
  private constructor(private readonly state: TeamClockState) {}

  static create(allocatedMs: number): TeamClock {
    if (!Number.isFinite(allocatedMs) || allocatedMs <= 0) {
      throw new LiveSessionDomainError(
        'INVALID_CLOCK_DURATION',
        'Clock duration must be positive',
      );
    }
    return new TeamClock({ allocatedMs, consumedMs: 0, running: false });
  }

  static restore(state: TeamClockState): TeamClock {
    return new TeamClock({
      ...state,
      startedAt: state.startedAt ? new Date(state.startedAt) : undefined,
    });
  }

  remainingMs(now: Date): number {
    const liveElapsed =
      this.state.running && this.state.startedAt
        ? Math.max(0, now.getTime() - this.state.startedAt.getTime())
        : 0;
    return Math.max(
      0,
      this.state.allocatedMs - this.state.consumedMs - liveElapsed,
    );
  }

  isExpired(now: Date): boolean {
    return this.remainingMs(now) === 0;
  }

  start(now: Date): void {
    if (this.isExpired(now)) {
      throw new LiveSessionDomainError(
        'TEAM_CLOCK_EXPIRED',
        'An expired team clock cannot be started',
      );
    }
    if (this.state.running) {
      throw new LiveSessionDomainError(
        'CLOCK_ALREADY_RUNNING',
        'Team clock is already running',
      );
    }
    this.state.running = true;
    this.state.startedAt = now;
  }

  pause(now: Date): void {
    if (!this.state.running) return;
    this.consumeRunningElapsed(now);
    this.state.running = false;
    this.state.startedAt = undefined;
  }

  resume(now: Date): void {
    this.start(now);
  }

  stop(now: Date): void {
    this.pause(now);
  }

  adjust(deltaMs: number, now: Date): void {
    if (!Number.isFinite(deltaMs)) {
      throw new LiveSessionDomainError(
        'INVALID_TIME_ADJUSTMENT',
        'Time adjustment must be finite',
      );
    }
    if (this.state.running) {
      this.consumeRunningElapsed(now);
      this.state.startedAt = now;
    }
    this.state.consumedMs = Math.max(
      0,
      Math.min(
        this.state.allocatedMs,
        this.state.consumedMs - Math.trunc(deltaMs),
      ),
    );
    if (this.isExpired(now)) this.stop(now);
  }

  serialize(): TeamClockState {
    return {
      ...this.state,
      startedAt: this.state.startedAt
        ? new Date(this.state.startedAt)
        : undefined,
    };
  }

  private consumeRunningElapsed(now: Date): void {
    if (!this.state.startedAt) return;
    this.state.consumedMs = Math.min(
      this.state.allocatedMs,
      this.state.consumedMs +
        Math.max(0, now.getTime() - this.state.startedAt.getTime()),
    );
  }
}
