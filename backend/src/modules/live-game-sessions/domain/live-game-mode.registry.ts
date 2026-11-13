import { Injectable } from '@nestjs/common';
import { LiveSessionDomainError } from './live-session.errors';

export interface LiveGameModeRules {
  key: string;
  version: number;
  initialTeamDurationMs: number;
  minimumTeamCount: number;
  maximumTeamCount: number;
  onlyOneClockRuns: boolean;
  timePersistsBetweenTurns: boolean;
  expirationMs: number;
  /**
   * How long a room nobody has joined stays open.
   *
   * Shorter than `expirationMs`, which is the cap on a session being *played*.
   * A room nobody came to is abandoned long before a day is up, and it holds a
   * live join code the whole time. Six hours rather than two: a host who sets
   * the room up early in the evening for a gathering that starts late has not
   * abandoned anything.
   */
  unjoinedExpirationMs: number;
  defaultJoinPolicy: 'explicit' | 'balanced' | 'host-assigned';
  readyPlayersRequiredPerTeam: number;
}

/** Product-owned Bomb budget, reused by standalone and Unified Match launch. */
export const BOMB_TEAM_CLOCK_MS = 30_000;

export const CORE_TIMED_TURNS_MODE: LiveGameModeRules = {
  key: 'core-timed-turns',
  version: 1,
  initialTeamDurationMs: 120_000,
  minimumTeamCount: 2,
  maximumTeamCount: 8,
  onlyOneClockRuns: true,
  timePersistsBetweenTurns: true,
  expirationMs: 24 * 60 * 60 * 1000,
  unjoinedExpirationMs: 6 * 60 * 60 * 1000,
  defaultJoinPolicy: 'explicit',
  readyPlayersRequiredPerTeam: 1,
};

export const BOMB_TIMED_TURNS_MODE: LiveGameModeRules = {
  ...CORE_TIMED_TURNS_MODE,
  key: 'bomb',
  version: 1,
  initialTeamDurationMs: BOMB_TEAM_CLOCK_MS,
  minimumTeamCount: 2,
  maximumTeamCount: 2,
};

@Injectable()
export class LiveGameModeRegistry {
  private readonly definitions = new Map<string, LiveGameModeRules>([
    [
      this.registryKey(
        CORE_TIMED_TURNS_MODE.key,
        CORE_TIMED_TURNS_MODE.version,
      ),
      CORE_TIMED_TURNS_MODE,
    ],
    [
      this.registryKey(
        BOMB_TIMED_TURNS_MODE.key,
        BOMB_TIMED_TURNS_MODE.version,
      ),
      BOMB_TIMED_TURNS_MODE,
    ],
  ]);

  resolve(key: string, version: number): LiveGameModeRules {
    const definition = this.definitions.get(this.registryKey(key, version));
    if (!definition) {
      throw new LiveSessionDomainError(
        'UNKNOWN_GAME_MODE',
        `Unknown live game mode "${key}" version ${version}`,
      );
    }
    return definition;
  }

  private registryKey(key: string, version: number): string {
    return `${key}:${version}`;
  }
}
