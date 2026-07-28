import { Injectable } from '@nestjs/common';
import { Namespace } from 'socket.io';
import { LiveGameSessionSnapshot } from '../application/live-game-session.snapshot';
import { LiveSessionTransitionPublisher } from '../application/live-session-transition.publisher';

@Injectable()
export class SocketLiveSessionPublisher implements LiveSessionTransitionPublisher {
  private namespace?: Namespace;

  attach(namespace: Namespace): void {
    this.namespace = namespace;
  }

  publish(event: string, snapshot: LiveGameSessionSnapshot): void {
    const room = `live-session:${snapshot.sessionId}`;
    this.namespace?.to(room).emit(event, {
      sessionId: snapshot.sessionId,
      revision: snapshot.revision,
    });
  }

  publishEvent(
    sessionId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    this.namespace?.to(`live-session:${sessionId}`).emit(event, payload);
  }
}
