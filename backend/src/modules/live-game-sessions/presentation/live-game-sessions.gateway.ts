import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { corsOriginDelegate } from '../../../common/config/cors-origins';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { UsersService } from '../../users/users.service';
import { JwtPayload } from '../../auth/auth.types';
import { GetLiveGameSession } from '../application/get-live-game-session.use-case';
import { UpdateParticipantPresence } from '../application/update-participant-presence.use-case';
import { ParticipantCredentialService } from '../application/participant-credential.service';
import { LiveSessionActor } from '../application/live-session-actor';
import { SetParticipantReadiness } from '../application/live-participant.use-cases';
import {
  CancelLiveGameSession,
  FinishLiveGameSession,
  MarkSessionReady,
  PauseLiveGameSession,
  ResumeLiveGameSession,
  StartLiveGameSession,
} from '../application/live-session-lifecycle.use-cases';
import {
  EndActiveTurn,
  PauseActiveTurn,
  ResumeActiveTurn,
  StartTeamTurn,
  SwitchActiveTeam,
} from '../application/live-session-turn.use-cases';
import { SocketLiveSessionPublisher } from '../infrastructure/socket-live-session.publisher';
import {
  FinishLiveSessionDto,
  LiveSessionSocketMutationDto,
  LiveSessionTurnMutationDto,
  SubscribeLiveSessionDto,
} from './live-game-session.dto';
import { GameplayRuntimeSocketFacade } from '../application/gameplay-runtime.socket-facade';
import {
  CompleteGameplayRoundSocketDto,
  CreateGameplayRoundSocketDto,
  GameplayRoundSocketMutationDto,
  GameplaySocketMutationDto,
  SubmitGameplaySocketCommandDto,
} from './gameplay-runtime.dto';
import { GameplayInteractionUseCases } from '../application/gameplay-interaction.use-cases';
import {
  AdjudicateInteractionSocketDto,
  InteractionSocketMutationDto,
  PrepareInteractionSocketDto,
  SubmitInteractionSocketDto,
} from './gameplay-interaction.dto';

interface LiveSocketData {
  actor: LiveSessionActor;
  subscribedParticipants: Map<string, string>;
  commandTimestamps: number[];
  lastHeartbeatAt?: number;
}
interface LiveServerEvents {
  'live-session:error': (error: { code: string; message: string }) => void;
  'live-session:gameplay-error': (error: {
    code: string;
    message: string;
  }) => void;
  'live-session:snapshot': (snapshot: unknown) => void;
}
type LiveSocket = Socket<
  Record<string, never>,
  LiveServerEvents,
  Record<string, never>,
  LiveSocketData
>;

@UsePipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
)
@WebSocketGateway({
  namespace: '/live-game-sessions',
  // The same allowlist the HTTP API uses. `origin: true` reflected whatever
  // asked, which with `credentials: true` lets any page on the internet open a
  // session socket on a signed-in player's behalf.
  cors: { origin: corsOriginDelegate(), credentials: true },
})
export class LiveGameSessionsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  private namespace!: Namespace;

  private readonly logger = new Logger(LiveGameSessionsGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly users: UsersService,
    private readonly publisher: SocketLiveSessionPublisher,
    private readonly getSession: GetLiveGameSession,
    private readonly markReady: MarkSessionReady,
    private readonly startSession: StartLiveGameSession,
    private readonly pauseSession: PauseLiveGameSession,
    private readonly resumeSession: ResumeLiveGameSession,
    private readonly startTurn: StartTeamTurn,
    private readonly pauseTurn: PauseActiveTurn,
    private readonly resumeTurn: ResumeActiveTurn,
    private readonly endTurn: EndActiveTurn,
    private readonly switchTurn: SwitchActiveTeam,
    private readonly finishSession: FinishLiveGameSession,
    private readonly cancelSession: CancelLiveGameSession,
    private readonly presence: UpdateParticipantPresence,
    private readonly participantCredentials: ParticipantCredentialService,
    private readonly participantReadiness: SetParticipantReadiness,
    private readonly gameplay: GameplayRuntimeSocketFacade,
    private readonly interactions: GameplayInteractionUseCases,
  ) {}

  afterInit(namespace: Namespace): void {
    this.publisher.attach(namespace);
    namespace.use((socket, next) => {
      void this.authenticateSocket(socket as LiveSocket)
        .then(() => next())
        .catch(() => next(new Error('Unauthorized')));
    });
  }

  handleConnection(client: LiveSocket): void {
    this.logger.log({
      event: 'live_session_socket_connected',
      actorId: client.data.actor.actorId,
      socketId: client.id,
    });
  }

  private async authenticateSocket(client: LiveSocket): Promise<void> {
    try {
      const rawToken = client.handshake.auth?.token;
      if (typeof rawToken !== 'string') throw new Error('Missing token');
      const token = rawToken.startsWith('Bearer ')
        ? rawToken.slice(7)
        : rawToken;
      try {
        client.data.actor =
          await this.participantCredentials.authenticate(token);
      } catch {
        const payload = await this.jwt.verifyAsync<JwtPayload>(token);
        const user = await this.users.findById(payload.sub);
        client.data.actor = {
          kind: 'user',
          actorId: user._id.toString(),
        };
      }
      client.data.subscribedParticipants = new Map();
      client.data.commandTimestamps = [];
    } catch {
      throw new Error('A valid access token is required');
    }
  }

  handleDisconnect(client: LiveSocket): void {
    for (const [sessionId, participantId] of client.data
      .subscribedParticipants ?? []) {
      void this.presence.disconnected(sessionId, participantId);
    }
  }

  @SubscribeMessage('live-session:subscribe')
  async subscribe(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: SubscribeLiveSessionDto,
  ) {
    return this.respond(client, async () => {
      const initial = await this.getSession.execute(
        body.sessionId,
        client.data.actor,
      );
      const participantId =
        client.data.actor.kind === 'participant'
          ? client.data.actor.participantId
          : initial.participants.find(
              (participant) => participant.role === 'controller',
            )?.id;
      if (!participantId) {
        throw new Error('Session participant identity is unavailable');
      }
      await client.join(this.room(body.sessionId));
      client.data.subscribedParticipants.set(body.sessionId, participantId);
      const connected = await this.presence.connected(
        body.sessionId,
        participantId,
      );
      if (!connected) {
        await client.leave(this.room(body.sessionId));
        client.data.subscribedParticipants.delete(body.sessionId);
        throw Object.assign(new Error('Participant connection limit reached'), {
          code: 'PARTICIPANT_CONNECTION_LIMIT',
        });
      }
      const snapshot = await this.getSession.execute(
        body.sessionId,
        client.data.actor,
      );
      client.emit('live-session:snapshot', snapshot);
      this.publisher.publishEvent(
        body.sessionId,
        'live-session:participant-presence-changed',
        { participantId, presence: 'connected' },
      );
      this.logger.log({
        event: 'participant_connected',
        sessionId: body.sessionId,
        actorId: client.data.actor.actorId,
      });
      return snapshot;
    });
  }

  @SubscribeMessage('live-session:unsubscribe')
  async unsubscribe(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: SubscribeLiveSessionDto,
  ) {
    await client.leave(this.room(body.sessionId));
    const participantId = client.data.subscribedParticipants.get(
      body.sessionId,
    );
    client.data.subscribedParticipants.delete(body.sessionId);
    if (participantId) {
      await this.presence.disconnected(body.sessionId, participantId);
    }
  }

  @SubscribeMessage('live-session:request-snapshot')
  requestSnapshot(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: SubscribeLiveSessionDto,
  ) {
    return this.respond(client, async () => {
      const snapshot = await this.getSession.execute(
        body.sessionId,
        client.data.actor,
      );
      client.emit('live-session:snapshot', snapshot);
      return snapshot;
    });
  }

  @SubscribeMessage('live-session:participant-subscribe')
  participantSubscribe(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: SubscribeLiveSessionDto,
  ) {
    return this.subscribe(client, body);
  }

  @SubscribeMessage('live-session:participant-ready')
  participantReady(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: LiveSessionSocketMutationDto,
  ) {
    return this.participantMutation(client, body, true);
  }

  @SubscribeMessage('live-session:participant-not-ready')
  participantNotReady(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: LiveSessionSocketMutationDto,
  ) {
    return this.participantMutation(client, body, false);
  }

  @SubscribeMessage('live-session:participant-heartbeat')
  participantHeartbeat(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: SubscribeLiveSessionDto,
  ) {
    return this.respond(client, async () => {
      const participantId = client.data.subscribedParticipants.get(
        body.sessionId,
      );
      if (!participantId) throw new Error('Subscribe before sending heartbeat');
      const now = Date.now();
      if (
        !client.data.lastHeartbeatAt ||
        now - client.data.lastHeartbeatAt > 30_000
      ) {
        client.data.lastHeartbeatAt = now;
        await this.presence.heartbeat(body.sessionId, participantId);
      }
      return { serverTimestamp: new Date(now).toISOString() };
    });
  }

  @SubscribeMessage('live-session:runtime-subscribe')
  runtimeSubscribe(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: SubscribeLiveSessionDto,
  ) {
    return this.runtimeRespond(client, () =>
      this.gameplay.snapshot(client.data.actor, body.sessionId),
    );
  }

  @SubscribeMessage('live-session:runtime-request-snapshot')
  runtimeSnapshot(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: SubscribeLiveSessionDto,
  ) {
    return this.runtimeSubscribe(client, body);
  }

  @SubscribeMessage('live-session:runtime-start')
  runtimeStart(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: GameplaySocketMutationDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.gameplay.start(client.data.actor, body),
    );
  }

  @SubscribeMessage('live-session:round-create')
  roundCreate(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: CreateGameplayRoundSocketDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.gameplay.create(client.data.actor, body),
    );
  }

  @SubscribeMessage('live-session:round-start')
  gameplayRoundStart(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: GameplayRoundSocketMutationDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.gameplay.startRoundCommand(client.data.actor, body),
    );
  }

  @SubscribeMessage('live-session:round-pause')
  gameplayRoundPause(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: GameplayRoundSocketMutationDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.gameplay.pause(client.data.actor, body),
    );
  }

  @SubscribeMessage('live-session:round-resume')
  gameplayRoundResume(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: GameplayRoundSocketMutationDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.gameplay.resume(client.data.actor, body),
    );
  }

  @SubscribeMessage('live-session:round-complete')
  gameplayRoundComplete(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: CompleteGameplayRoundSocketDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.gameplay.completeRoundCommand(client.data.actor, body),
    );
  }

  @SubscribeMessage('live-session:round-cancel')
  gameplayRoundCancel(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: GameplayRoundSocketMutationDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.gameplay.cancelRoundCommand(client.data.actor, body),
    );
  }

  @SubscribeMessage('live-session:gameplay-command')
  gameplayCommand(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: SubmitGameplaySocketCommandDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.gameplay.submit(client.data.actor, body),
    );
  }

  @SubscribeMessage('live-session:runtime-complete')
  runtimeComplete(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: GameplaySocketMutationDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.gameplay.complete(client.data.actor, body),
    );
  }

  @SubscribeMessage('live-session:runtime-cancel')
  runtimeCancel(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: GameplaySocketMutationDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.gameplay.cancel(client.data.actor, body),
    );
  }

  @SubscribeMessage('live-session:interaction-prepare')
  interactionPrepare(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: PrepareInteractionSocketDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.interactions.prepare({ ...body, actor: client.data.actor }),
    );
  }

  @SubscribeMessage('live-session:interaction-open')
  interactionOpen(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: InteractionSocketMutationDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.interactions.open({ ...body, actor: client.data.actor }),
    );
  }

  @SubscribeMessage('live-session:interaction-close')
  interactionClose(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: InteractionSocketMutationDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.interactions.close({ ...body, actor: client.data.actor }),
    );
  }

  @SubscribeMessage('live-session:interaction-submit')
  interactionSubmit(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: SubmitInteractionSocketDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.interactions.submit({ ...body, actor: client.data.actor }),
    );
  }

  @SubscribeMessage('live-session:interaction-adjudicate')
  interactionAdjudicate(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: AdjudicateInteractionSocketDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.interactions.adjudicate({ ...body, actor: client.data.actor }),
    );
  }

  @SubscribeMessage('live-session:interaction-resolve')
  interactionResolve(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: InteractionSocketMutationDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.interactions.resolve({ ...body, actor: client.data.actor }),
    );
  }

  @SubscribeMessage('live-session:interaction-cancel')
  interactionCancel(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: InteractionSocketMutationDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.interactions.cancel({ ...body, actor: client.data.actor }),
    );
  }

  @SubscribeMessage('live-session:interaction-expire')
  interactionExpire(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: InteractionSocketMutationDto,
  ) {
    return this.runtimeMutation(client, () =>
      this.interactions.expire({ ...body, actor: client.data.actor }),
    );
  }

  @SubscribeMessage('live-session:ready')
  ready(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: LiveSessionSocketMutationDto,
  ) {
    return this.mutate(client, body, (command) =>
      this.markReady.execute(command),
    );
  }

  @SubscribeMessage('live-session:start')
  start(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: LiveSessionSocketMutationDto,
  ) {
    return this.mutate(client, body, (command) =>
      this.startSession.execute(command),
    );
  }

  @SubscribeMessage('live-session:pause')
  pause(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: LiveSessionSocketMutationDto,
  ) {
    return this.mutate(client, body, (command) =>
      this.pauseSession.execute(command),
    );
  }

  @SubscribeMessage('live-session:resume')
  resume(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: LiveSessionSocketMutationDto,
  ) {
    return this.mutate(client, body, (command) =>
      this.resumeSession.execute(command),
    );
  }

  @SubscribeMessage('live-session:start-turn')
  startTeamTurn(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: LiveSessionTurnMutationDto,
  ) {
    return this.mutate(client, body, (command) => {
      if (!body.teamId) throw new Error('teamId is required');
      return this.startTurn.execute({
        ...command,
        teamId: body.teamId,
        reason: body.reason,
      });
    });
  }

  @SubscribeMessage('live-session:pause-turn')
  pauseActiveTurn(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: LiveSessionSocketMutationDto,
  ) {
    return this.mutate(client, body, (command) =>
      this.pauseTurn.execute(command),
    );
  }

  @SubscribeMessage('live-session:resume-turn')
  resumeActiveTurn(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: LiveSessionSocketMutationDto,
  ) {
    return this.mutate(client, body, (command) =>
      this.resumeTurn.execute(command),
    );
  }

  @SubscribeMessage('live-session:end-turn')
  endActiveTurn(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: LiveSessionTurnMutationDto,
  ) {
    return this.mutate(client, body, (command) =>
      this.endTurn.execute({ ...command, reason: body.reason }),
    );
  }

  @SubscribeMessage('live-session:switch-turn')
  switchActiveTurn(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: LiveSessionTurnMutationDto,
  ) {
    return this.mutate(client, body, (command) =>
      this.switchTurn.execute({
        ...command,
        teamId: body.teamId,
        reason: body.reason,
      }),
    );
  }

  @SubscribeMessage('live-session:finish')
  finish(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: FinishLiveSessionDto,
  ) {
    return this.mutate(client, body, (command) =>
      this.finishSession.execute({
        ...command,
        reason: body.reason,
        winnerTeamId: body.winnerTeamId,
        metadata: body.metadata,
      }),
    );
  }

  @SubscribeMessage('live-session:cancel')
  cancel(
    @ConnectedSocket() client: LiveSocket,
    @MessageBody() body: LiveSessionSocketMutationDto,
  ) {
    return this.mutate(client, body, (command) =>
      this.cancelSession.execute(command),
    );
  }

  private mutate<T extends LiveSessionSocketMutationDto>(
    client: LiveSocket,
    body: T,
    action: (command: T & { actorId: string }) => Promise<unknown>,
  ): Promise<unknown> {
    return this.respond(client, () => {
      this.assertCommandRate(client);
      return action({ ...body, actorId: client.data.actor.actorId });
    });
  }

  private async respond(
    client: LiveSocket,
    action: () => Promise<unknown>,
  ): Promise<unknown> {
    try {
      return await action();
    } catch (error) {
      const details =
        error instanceof Error
          ? {
              code:
                'code' in error && typeof error.code === 'string'
                  ? error.code
                  : 'LIVE_SESSION_ERROR',
              message: error.message,
            }
          : { code: 'LIVE_SESSION_ERROR', message: 'Live session error' };
      client.emit('live-session:error', details);
      this.logger.warn({
        event: 'live_session_command_rejected',
        actorId: client.data.actor.actorId,
        ...details,
      });
      return details;
    }
  }

  private runtimeMutation(
    client: LiveSocket,
    action: () => Promise<unknown>,
  ): Promise<unknown> {
    return this.runtimeRespond(client, () => {
      this.assertCommandRate(client);
      return action();
    });
  }

  private async runtimeRespond(
    client: LiveSocket,
    action: () => Promise<unknown>,
  ): Promise<unknown> {
    try {
      const snapshot = await action();
      client.emit('live-session:snapshot', snapshot);
      return snapshot;
    } catch (error) {
      const details =
        error instanceof Error
          ? {
              code:
                'code' in error && typeof error.code === 'string'
                  ? error.code
                  : 'GAMEPLAY_RUNTIME_ERROR',
              message: error.message,
            }
          : {
              code: 'GAMEPLAY_RUNTIME_ERROR',
              message: 'Gameplay runtime error',
            };
      client.emit('live-session:gameplay-error', details);
      this.logger.warn({
        event: 'gameplay_command_rejected',
        actorId: client.data.actor.actorId,
        ...details,
      });
      return details;
    }
  }

  private participantMutation(
    client: LiveSocket,
    body: LiveSessionSocketMutationDto,
    ready: boolean,
  ) {
    return this.respond(client, () => {
      this.assertCommandRate(client);
      return this.participantReadiness.execute({
        actor: client.data.actor,
        ready,
        expectedRevision: body.expectedRevision,
        commandId: body.commandId,
      });
    });
  }

  private room(sessionId: string): string {
    return `live-session:${sessionId}`;
  }

  private assertCommandRate(client: LiveSocket): void {
    const now = Date.now();
    const recent = (client.data.commandTimestamps ?? []).filter(
      (timestamp) => now - timestamp < 1_000,
    );
    if (recent.length >= 20) {
      throw Object.assign(new Error('Live session command rate exceeded'), {
        code: 'COMMAND_RATE_EXCEEDED',
      });
    }
    recent.push(now);
    client.data.commandTimestamps = recent;
  }
}
