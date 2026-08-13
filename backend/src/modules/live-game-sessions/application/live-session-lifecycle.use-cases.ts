import { Inject, Injectable } from '@nestjs/common';
import {
  LiveSessionCommand,
  LiveSessionCommandExecutor,
} from './live-session-command.base';
import {
  PARENT_GAME_ACCESS,
  ParentGameAccess,
} from './parent-game-access.port';

@Injectable()
export class MarkSessionReady {
  constructor(private readonly commands: LiveSessionCommandExecutor) {}
  execute(command: LiveSessionCommand) {
    return this.commands.execute(
      'live-session:state-changed',
      command,
      (s, n) => s.markReady(n),
    );
  }
}

@Injectable()
export class StartLiveGameSession {
  constructor(
    private readonly commands: LiveSessionCommandExecutor,
    @Inject(PARENT_GAME_ACCESS)
    private readonly parentGames: ParentGameAccess,
  ) {}
  async execute(command: LiveSessionCommand) {
    const snapshot = await this.commands.execute(
      'live-session:state-changed',
      command,
      (s, n) => s.start(n),
    );
    if (snapshot.parentGameId && snapshot.parentGameQuestionId) {
      await this.parentGames.markQuestionStarted(
        snapshot.parentGameId,
        snapshot.parentGameQuestionId,
      );
    }
    return snapshot;
  }
}

@Injectable()
export class PauseLiveGameSession {
  constructor(private readonly commands: LiveSessionCommandExecutor) {}
  execute(command: LiveSessionCommand) {
    return this.commands.execute(
      'live-session:clock-synchronized',
      command,
      (s, n) => s.pause(n),
    );
  }
}

@Injectable()
export class ResumeLiveGameSession {
  constructor(private readonly commands: LiveSessionCommandExecutor) {}
  execute(command: LiveSessionCommand) {
    return this.commands.execute(
      'live-session:clock-synchronized',
      command,
      (s, n) => s.resume(n),
    );
  }
}

export interface FinishLiveSessionCommand extends LiveSessionCommand {
  reason: string;
  winnerTeamId?: string;
  metadata?: Record<string, string | number | boolean>;
}

@Injectable()
export class FinishLiveGameSession {
  constructor(private readonly commands: LiveSessionCommandExecutor) {}
  execute(command: FinishLiveSessionCommand) {
    return this.commands.execute('live-session:finished', command, (s, n) =>
      s.finish(command.reason, command.winnerTeamId, command.metadata, n),
    );
  }
}

@Injectable()
export class CancelLiveGameSession {
  constructor(private readonly commands: LiveSessionCommandExecutor) {}
  execute(command: LiveSessionCommand) {
    return this.commands.execute(
      'live-session:state-changed',
      command,
      (s, n) => s.cancel(n),
    );
  }
}
