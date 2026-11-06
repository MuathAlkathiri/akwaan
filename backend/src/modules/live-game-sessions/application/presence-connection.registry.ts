import { Injectable } from '@nestjs/common';

/** One live socket subscription held by this process. */
export interface RegisteredPresenceConnection {
  sessionId: string;
  participantId: string;
  socketId: string;
  registeredAt: number;
  /** Asks this socket to reconnect (see the gateway's recovery protocol). */
  requestRecovery: () => void;
}

/**
 * The sockets this backend instance is serving, as presence knows them.
 *
 * In memory by design: it describes this process's own sockets, which die with
 * it. It is how the instance notices that one of its live connections has lost
 * its presence entry (a false lease expiry, or a rollback's global reset) and
 * asks that socket to reconnect, rather than silently re-adding an entry the
 * client's own state no longer matches.
 */
@Injectable()
export class PresenceConnectionRegistry {
  private readonly connections = new Map<
    string,
    RegisteredPresenceConnection
  >();
  private readonly recovering = new Set<string>();

  private key(socketId: string, sessionId: string): string {
    return `${socketId}|${sessionId}`;
  }

  register(
    connection: Omit<RegisteredPresenceConnection, 'registeredAt'>,
    now = Date.now(),
  ): void {
    const key = this.key(connection.socketId, connection.sessionId);
    this.connections.set(key, { ...connection, registeredAt: now });
    this.recovering.delete(key);
  }

  unregister(socketId: string, sessionId: string): void {
    const key = this.key(socketId, sessionId);
    this.connections.delete(key);
    this.recovering.delete(key);
  }

  /** Drops every subscription of one socket (it disconnected). */
  unregisterSocket(socketId: string): void {
    for (const [key, connection] of this.connections) {
      if (connection.socketId === socketId) {
        this.connections.delete(key);
        this.recovering.delete(key);
      }
    }
  }

  has(socketId: string, sessionId: string): boolean {
    return this.connections.has(this.key(socketId, sessionId));
  }

  list(): RegisteredPresenceConnection[] {
    return [...this.connections.values()];
  }

  /**
   * Requests recovery once per subscription. Returns false if a request for
   * this subscription is already outstanding.
   */
  requestRecovery(socketId: string, sessionId: string): boolean {
    const key = this.key(socketId, sessionId);
    const connection = this.connections.get(key);
    if (!connection || this.recovering.has(key)) return false;
    this.recovering.add(key);
    connection.requestRecovery();
    return true;
  }

  get size(): number {
    return this.connections.size;
  }
}
