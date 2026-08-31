import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { GamesModule } from '../games/games.module';
import { CreateLiveGameSession } from './application/create-live-game-session.use-case';
import { GetLiveGameSession } from './application/get-live-game-session.use-case';
import { LiveSessionCommandExecutor } from './application/live-session-command.base';
import {
  CancelLiveGameSession,
  FinishLiveGameSession,
  MarkSessionReady,
  PauseLiveGameSession,
  ResumeLiveGameSession,
  StartLiveGameSession,
} from './application/live-session-lifecycle.use-cases';
import {
  EndActiveTurn,
  PauseActiveTurn,
  ResumeActiveTurn,
  StartTeamTurn,
  SwitchActiveTeam,
} from './application/live-session-turn.use-cases';
import { ReconnectParticipant } from './application/reconnect-participant.use-case';
import {
  LIVE_SESSION_CLOCK,
  SystemLiveSessionClock,
} from './application/live-session-clock';
import { LiveGameSessionSnapshotMapper } from './application/live-game-session.snapshot';
import { LIVE_SESSION_TRANSITION_PUBLISHER } from './application/live-session-transition.publisher';
import { PARENT_GAME_ACCESS } from './application/parent-game-access.port';
import { PARTICIPANT_PRESENCE } from './application/participant-presence.port';
import { MongooseParticipantPresenceRepository } from './infrastructure/mongoose-participant-presence.repository';
import {
  LiveSessionPresenceDocument,
  LiveSessionPresenceSchema,
} from './infrastructure/live-session-presence.schema';
import { UpdateParticipantPresence } from './application/update-participant-presence.use-case';
import {
  CreateSessionJoinAccess,
  GetSessionJoinAccess,
  RegenerateSessionJoinAccess,
  ResolveJoinCode,
  RevokeSessionJoinAccess,
} from './application/live-session-join-access.use-cases';
import {
  AssignParticipantTeam,
  JoinLiveSession,
  ReconnectLiveParticipant,
  RemoveLiveParticipant,
  RevokeParticipantCredential,
  SetParticipantReadiness,
} from './application/live-participant.use-cases';
import { ParticipantCredentialService } from './application/participant-credential.service';
import { LiveGameModeRegistry } from './domain/live-game-mode.registry';
import { LIVE_GAME_SESSION_REPOSITORY } from './domain/live-game-session.repository';
import {
  LiveGameSessionDocument,
  LiveGameSessionSchema,
} from './infrastructure/live-game-session.schema';
import { MongooseLiveGameSessionRepository } from './infrastructure/mongoose-live-game-session.repository';
import { SocketLiveSessionPublisher } from './infrastructure/socket-live-session.publisher';
import { ClassicGameAccessAdapter } from './infrastructure/classic-game-access.adapter';
import {
  LiveSessionJoinAccessDocument,
  LiveSessionJoinAccessSchema,
} from './infrastructure/live-session-join-access.schema';
import { MongooseLiveSessionJoinAccessRepository } from './infrastructure/mongoose-live-session-join-access.repository';
import { LIVE_SESSION_JOIN_ACCESS_REPOSITORY } from './domain/live-session-join-access.repository';
import { PublicJoinRateLimiter } from './infrastructure/public-join-rate-limiter';
import { LiveGameSessionsController } from './presentation/live-game-sessions.controller';
import { LiveGameSessionsGateway } from './presentation/live-game-sessions.gateway';
import {
  LiveGameParticipantsController,
  LiveGameSessionJoinController,
} from './presentation/live-game-session-join.controller';
import { ParticipantCredentialGuard } from './presentation/participant-auth';
import { GameplayModeRegistry } from './domain/gameplay-mode.registry';
import {
  GameplayRuntimeDocument,
  GameplayRuntimeSchema,
} from './infrastructure/gameplay-runtime.schema';
import { MongooseGameplayRuntimeRepository } from './infrastructure/mongoose-gameplay-runtime.repository';
import { GAMEPLAY_RUNTIME_REPOSITORY } from './domain/gameplay-runtime.repository';
import { GameplayAuthorization } from './application/gameplay-authorization';
import { GameplayRuntimeSnapshotMapper } from './application/gameplay-runtime.snapshot';
import { GameplayRuntimeExecutor } from './application/gameplay-runtime.executor';
import {
  CreateGameplayRuntime,
  GetGameplayRuntime,
} from './application/gameplay-runtime.queries';
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
} from './application/gameplay-runtime.lifecycle';
import { SubmitGameplayCommand } from './application/submit-gameplay-command.use-case';
import { GameplayRuntimeSocketFacade } from './application/gameplay-runtime.socket-facade';
import { GameplayRuntimeController } from './presentation/gameplay-runtime.controller';
import { GameplayInteractionUseCases } from './application/gameplay-interaction.use-cases';
import { GAMEPLAY_TRANSACTION_UNIT_OF_WORK } from './application/gameplay-transaction.unit-of-work';
import { MongooseGameplayTransactionUnitOfWork } from './infrastructure/mongoose-gameplay-transaction.unit-of-work';
import {
  GameplayInteractionController,
  GameplayParticipantInteractionController,
} from './presentation/gameplay-interaction.controller';
import { StartBombGameplay } from './application/start-bomb-gameplay.use-case';
import { StartBombGameplayFromContent } from './application/start-bomb-from-content.use-case';
import { BombCountdownScheduler } from './application/bomb-countdown.scheduler';
import { LiveSessionSnapshotComposer } from './application/live-session-snapshot.composer';
import { ScoringModule } from '../scoring/scoring.module';
import { WorldContentModule } from '../world-content/world-content.module';
import { StartRyoGameplay } from './application/start-ryo-gameplay.use-case';
import { StartTop5 } from './application/start-top5.use-case';
import { ReassignTeamActions } from './application/reassign-team-actions.use-case';
import { StartRakkibha } from './application/start-rakkibha.use-case';
import { GameplayDeadlineScheduler } from './application/gameplay-deadline.scheduler';
import { GAMEPLAY_DEADLINE_SYNCHRONIZER } from './application/gameplay-deadline.port';
import { GameplayObserverRegistry } from './application/gameplay-observer.registry';
import { StartClosestGameplay } from './application/start-closest-gameplay.use-case';
import { StartMarhalaGameplay } from './application/start-marhala-gameplay.use-case';
import { MarhalaQuestionSourceRegistry } from './application/marhala-question-source.registry';
import { MarhalaTurnSupplier } from './application/marhala-turn.supplier';
import { StartComboGameplay } from './application/start-combo-gameplay.use-case';
import { StartOneClueGameplay } from './application/start-one-clue-gameplay.use-case';
import { WithdrawPresentationReadiness } from './application/withdraw-presentation-readiness.use-case';

const applicationProviders = [
  CreateLiveGameSession,
  GetLiveGameSession,
  LiveSessionSnapshotComposer,
  ReconnectParticipant,
  LiveSessionCommandExecutor,
  MarkSessionReady,
  StartLiveGameSession,
  PauseLiveGameSession,
  ResumeLiveGameSession,
  StartTeamTurn,
  PauseActiveTurn,
  ResumeActiveTurn,
  EndActiveTurn,
  SwitchActiveTeam,
  FinishLiveGameSession,
  CancelLiveGameSession,
  UpdateParticipantPresence,
  CreateSessionJoinAccess,
  GetSessionJoinAccess,
  RegenerateSessionJoinAccess,
  RevokeSessionJoinAccess,
  ResolveJoinCode,
  JoinLiveSession,
  ReconnectLiveParticipant,
  SetParticipantReadiness,
  AssignParticipantTeam,
  RemoveLiveParticipant,
  RevokeParticipantCredential,
  ParticipantCredentialService,
  GameplayRuntimeExecutor,
  CreateGameplayRuntime,
  GetGameplayRuntime,
  StartGameplayRuntime,
  CreateGameplayRound,
  StartGameplayRound,
  PresentationReady,
  PauseGameplayRound,
  ResumeGameplayRound,
  CompleteGameplayRound,
  CancelGameplayRound,
  SubmitGameplayCommand,
  CompleteGameplayRuntime,
  CancelGameplayRuntime,
  GameplayRuntimeSocketFacade,
  GameplayInteractionUseCases,
  StartBombGameplay,
  StartBombGameplayFromContent,
  BombCountdownScheduler,
  StartRyoGameplay,
  StartTop5,
  ReassignTeamActions,
  StartRakkibha,
  GameplayDeadlineScheduler,
  StartClosestGameplay,
  StartComboGameplay,
  StartOneClueGameplay,
  WithdrawPresentationReadiness,
];

@Module({
  imports: [
    AuthModule,
    UsersModule,
    GamesModule,
    ScoringModule,
    WorldContentModule,
    MongooseModule.forFeature([
      {
        name: LiveGameSessionDocument.name,
        schema: LiveGameSessionSchema,
      },
      {
        name: LiveSessionJoinAccessDocument.name,
        schema: LiveSessionJoinAccessSchema,
      },
      {
        name: GameplayRuntimeDocument.name,
        schema: GameplayRuntimeSchema,
      },
      {
        name: LiveSessionPresenceDocument.name,
        schema: LiveSessionPresenceSchema,
      },
    ]),
  ],
  controllers: [
    LiveGameSessionsController,
    LiveGameSessionJoinController,
    LiveGameParticipantsController,
    GameplayRuntimeController,
    GameplayInteractionController,
    GameplayParticipantInteractionController,
  ],
  providers: [
    StartMarhalaGameplay,
    MarhalaQuestionSourceRegistry,
    MarhalaTurnSupplier,
    LiveGameModeRegistry,
    LiveGameSessionSnapshotMapper,
    GameplayModeRegistry,
    GameplayObserverRegistry,
    GameplayAuthorization,
    GameplayRuntimeSnapshotMapper,
    SystemLiveSessionClock,
    {
      provide: LIVE_SESSION_CLOCK,
      useExisting: SystemLiveSessionClock,
    },
    // The session-command boundary depends on the narrow synchronizer contract,
    // not on the scheduler class, so converging a deadline stays one call with
    // no knowledge of timers on the calling side.
    {
      provide: GAMEPLAY_DEADLINE_SYNCHRONIZER,
      useExisting: GameplayDeadlineScheduler,
    },
    MongooseLiveGameSessionRepository,
    MongooseParticipantPresenceRepository,
    MongooseLiveSessionJoinAccessRepository,
    MongooseGameplayRuntimeRepository,
    MongooseGameplayTransactionUnitOfWork,
    {
      provide: LIVE_GAME_SESSION_REPOSITORY,
      useExisting: MongooseLiveGameSessionRepository,
    },
    {
      provide: LIVE_SESSION_JOIN_ACCESS_REPOSITORY,
      useExisting: MongooseLiveSessionJoinAccessRepository,
    },
    {
      provide: GAMEPLAY_RUNTIME_REPOSITORY,
      useExisting: MongooseGameplayRuntimeRepository,
    },
    {
      provide: GAMEPLAY_TRANSACTION_UNIT_OF_WORK,
      useExisting: MongooseGameplayTransactionUnitOfWork,
    },
    {
      provide: PARTICIPANT_PRESENCE,
      useExisting: MongooseParticipantPresenceRepository,
    },
    ClassicGameAccessAdapter,
    {
      provide: PARENT_GAME_ACCESS,
      useExisting: ClassicGameAccessAdapter,
    },
    SocketLiveSessionPublisher,
    PublicJoinRateLimiter,
    ParticipantCredentialGuard,
    {
      provide: LIVE_SESSION_TRANSITION_PUBLISHER,
      useExisting: SocketLiveSessionPublisher,
    },
    ...applicationProviders,
    LiveGameSessionsGateway,
  ],
  // Exported so the Match layer can register itself without this module
  // ever needing to know that a Match exists.
  exports: [
    // The Match layer registers its content source here; the supplier itself
    // is internal and is driven by the observer registry.
    MarhalaQuestionSourceRegistry,
    StartMarhalaGameplay,
    CancelGameplayRuntime,
    GameplayObserverRegistry,
    GetLiveGameSession,
    GameplayModeRegistry,
    StartBombGameplayFromContent,
    StartRyoGameplay,
    StartTop5,
    StartClosestGameplay,
    StartComboGameplay,
    StartOneClueGameplay,
    StartRakkibha,
    GAMEPLAY_RUNTIME_REPOSITORY,
    LIVE_GAME_SESSION_REPOSITORY,
    // The Match layer announces its transitions on the session's own channel.
    LIVE_SESSION_TRANSITION_PUBLISHER,
    // A challenge preflight shows the session's join code; it reuses this rather
    // than growing a second join system.
    GetSessionJoinAccess,
    CreateSessionJoinAccess,
    ParticipantCredentialService,
    ParticipantCredentialGuard,
    LIVE_SESSION_JOIN_ACCESS_REPOSITORY,
  ],
})
export class LiveGameSessionsModule {}
