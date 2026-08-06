import { Inject, Injectable } from '@nestjs/common';
import { LiveGameSession } from '../domain/live-game-session';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import { GameplayRuntimeNotFoundError } from '../domain/live-session.errors';
import { GameplayObserverRegistry } from './gameplay-observer.registry';
import { GameplayRuntimeSnapshotMapper } from './gameplay-runtime.snapshot';
import { actorSnapshotId, LiveSessionActor } from './live-session-actor';
import {
  LiveGameSessionSnapshot,
  LiveGameSessionSnapshotMapper,
} from './live-game-session.snapshot';

@Injectable()
export class LiveSessionSnapshotComposer {
  constructor(
    private readonly sessions: LiveGameSessionSnapshotMapper,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    private readonly gameplay: GameplayRuntimeSnapshotMapper,
    private readonly observers: GameplayObserverRegistry,
  ) {}

  async compose(
    session: LiveGameSession,
    actor: LiveSessionActor,
    now: Date,
  ): Promise<LiveGameSessionSnapshot> {
    const snapshot = this.sessions.toSnapshot(
      session,
      actorSnapshotId(actor),
      now,
    );
    const runtime = await this.runtimes.findBySessionId(session.id);
    if (!runtime) {
      const state = session.serialize();
      if (state.modeKey === 'bomb' && state.status === 'active') {
        throw new GameplayRuntimeNotFoundError(session.id);
      }
      // Stages before the first challenge still carry their Match projection.
      return this.observers.enrichSnapshot(snapshot, actor);
    }
    snapshot.availableActions = snapshot.availableActions.filter(
      (action) => action !== 'runtime:create',
    );
    snapshot.gameplay = this.gameplay.toSnapshot(runtime, session, actor, now);
    return this.observers.enrichSnapshot(snapshot, actor);
  }
}
