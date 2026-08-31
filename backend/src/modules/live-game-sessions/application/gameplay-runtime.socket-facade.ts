import { Injectable } from '@nestjs/common';
import {
  CancelGameplayRound,
  CancelGameplayRuntime,
  CompleteGameplayRound,
  CompleteGameplayRuntime,
  CreateGameplayRound,
  PauseGameplayRound,
  PresentationReady,
  ResumeGameplayRound,
  StartGameplayRound,
  StartGameplayRuntime,
} from './gameplay-runtime.lifecycle';
import { GetGameplayRuntime } from './gameplay-runtime.queries';
import { LiveSessionActor } from './live-session-actor';
import { SubmitGameplayCommand } from './submit-gameplay-command.use-case';
import {
  CompleteGameplayRoundSocketDto,
  GameplayRoundSocketMutationDto,
  GameplaySocketMutationDto,
  SubmitGameplaySocketCommandDto,
} from '../presentation/gameplay-runtime.dto';

@Injectable()
export class GameplayRuntimeSocketFacade {
  constructor(
    private readonly getRuntime: GetGameplayRuntime,
    private readonly startRuntime: StartGameplayRuntime,
    private readonly createRound: CreateGameplayRound,
    private readonly startRound: StartGameplayRound,
    private readonly pauseRound: PauseGameplayRound,
    private readonly resumeRound: ResumeGameplayRound,
    private readonly completeRound: CompleteGameplayRound,
    private readonly cancelRound: CancelGameplayRound,
    private readonly command: SubmitGameplayCommand,
    private readonly completeRuntime: CompleteGameplayRuntime,
    private readonly cancelRuntime: CancelGameplayRuntime,
    private readonly presentationReadyAck: PresentationReady,
  ) {}

  snapshot(actor: LiveSessionActor, sessionId: string) {
    return this.getRuntime.execute(sessionId, actor);
  }
  start(actor: LiveSessionActor, body: GameplaySocketMutationDto) {
    return this.startRuntime.execute({ ...body, actor });
  }
  create(
    actor: LiveSessionActor,
    body: GameplaySocketMutationDto & {
      activeTeamId?: string;
      activeParticipantId?: string;
    },
  ) {
    return this.createRound.execute({ ...body, actor });
  }
  startRoundCommand(
    actor: LiveSessionActor,
    body: GameplayRoundSocketMutationDto,
  ) {
    return this.startRound.execute({ ...body, actor });
  }
  pause(actor: LiveSessionActor, body: GameplayRoundSocketMutationDto) {
    return this.pauseRound.execute({ ...body, actor });
  }
  resume(actor: LiveSessionActor, body: GameplayRoundSocketMutationDto) {
    return this.resumeRound.execute({ ...body, actor });
  }
  completeRoundCommand(
    actor: LiveSessionActor,
    body: CompleteGameplayRoundSocketDto,
  ) {
    return this.completeRound.execute({ ...body, actor });
  }
  cancelRoundCommand(
    actor: LiveSessionActor,
    body: GameplayRoundSocketMutationDto,
  ) {
    return this.cancelRound.execute({ ...body, actor });
  }
  submit(actor: LiveSessionActor, body: SubmitGameplaySocketCommandDto) {
    return this.command.execute({ ...body, actor });
  }
  complete(actor: LiveSessionActor, body: GameplaySocketMutationDto) {
    return this.completeRuntime.execute({ ...body, actor });
  }
  cancel(actor: LiveSessionActor, body: GameplaySocketMutationDto) {
    return this.cancelRuntime.execute({ ...body, actor });
  }
  /**
   * Fair-start acknowledgement over a socket. `connectionId` is the
   * server-observed `client.id`, required to satisfy the multi-surface contract;
   * it binds the ack to the exact connection so a disconnect can withdraw it.
   */
  presentationReady(
    actor: LiveSessionActor,
    body: GameplaySocketMutationDto,
    connectionId: string,
  ) {
    return this.presentationReadyAck.execute({ ...body, actor, connectionId });
  }
}
