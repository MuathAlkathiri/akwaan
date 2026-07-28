import { Injectable } from '@nestjs/common';
import {
  LiveSessionCommand,
  LiveSessionCommandExecutor,
} from './live-session-command.base';

export interface TeamTurnCommand extends LiveSessionCommand {
  teamId?: string;
  reason: string;
}

@Injectable()
export class StartTeamTurn {
  constructor(private readonly commands: LiveSessionCommandExecutor) {}
  execute(command: TeamTurnCommand & { teamId: string }) {
    return this.commands.execute('live-session:turn-changed', command, (s, n) =>
      s.startTurn(command.teamId, command.reason, n),
    );
  }
}

@Injectable()
export class PauseActiveTurn {
  constructor(private readonly commands: LiveSessionCommandExecutor) {}
  execute(command: LiveSessionCommand) {
    return this.commands.execute(
      'live-session:clock-synchronized',
      command,
      (s, n) => s.pauseTurn(n),
    );
  }
}

@Injectable()
export class ResumeActiveTurn {
  constructor(private readonly commands: LiveSessionCommandExecutor) {}
  execute(command: LiveSessionCommand) {
    return this.commands.execute(
      'live-session:clock-synchronized',
      command,
      (s, n) => s.resumeTurn(n),
    );
  }
}

@Injectable()
export class EndActiveTurn {
  constructor(private readonly commands: LiveSessionCommandExecutor) {}
  execute(command: TeamTurnCommand) {
    return this.commands.execute('live-session:turn-changed', command, (s, n) =>
      s.endTurn(command.reason, n),
    );
  }
}

@Injectable()
export class SwitchActiveTeam {
  constructor(private readonly commands: LiveSessionCommandExecutor) {}
  execute(command: TeamTurnCommand) {
    return this.commands.execute('live-session:turn-changed', command, (s, n) =>
      s.switchTurn(command.teamId, command.reason, n),
    );
  }
}
