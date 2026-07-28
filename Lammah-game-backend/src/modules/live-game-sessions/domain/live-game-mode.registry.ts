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
  defaultJoinPolicy: 'explicit' | 'balanced' | 'host-assigned';
  readyPlayersRequiredPerTeam: number;
}

export const CORE_TIMED_TURNS_MODE: LiveGameModeRules = {
  key: 'core-timed-turns',
  version: 1,
  initialTeamDurationMs: 120_000,
  minimumTeamCount: 2,
  maximumTeamCount: 8,
  onlyOneClockRuns: true,
  timePersistsBetweenTurns: true,
  expirationMs: 24 * 60 * 60 * 1000,
  defaultJoinPolicy: 'explicit',
  readyPlayersRequiredPerTeam: 1,
};

export const BOMB_TIMED_TURNS_MODE: LiveGameModeRules = {
  ...CORE_TIMED_TURNS_MODE,
  key: 'bomb',
  version: 1,
  initialTeamDurationMs: 30_000,
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
