import { Injectable, Logger } from '@nestjs/common';
import {
  WorldContentConflictError,
  WorldContentReferenceDetail,
} from '../domain/world-content.errors';
import type { WorldContentDeletionParticipant } from './permanent-deletion/world-content-deletion.types';

export type WorldContentReferenceKind = 'world' | 'scope' | 'challengeType';

/**
 * Outward-facing reference guard. Legacy modules that still point at a World,
 * Scope, or Challenge Type register a guard here so deletion stays safe without
 * the World Content domain importing legacy code (roadmap 17).
 *
 * The dependency arrow only ever points legacy -> world-content.
 */
export interface WorldContentReferenceGuard {
  /** Human-readable owner, used in the conflict message. */
  readonly source: string;
  countReferences(
    kind: WorldContentReferenceKind,
    id: string,
    identity?: { slug?: string },
  ): Promise<number>;
  /**
   * The blocking records, when the guard can name them. A count alone tells an
   * admin something is wrong but not what to fix, so a guard that can identify
   * its references should.
   */
  describeReferences?(
    kind: WorldContentReferenceKind,
    id: string,
  ): Promise<WorldContentReferenceDetail[]>;
}

@Injectable()
export class WorldContentReferenceRegistry {
  private readonly logger = new Logger(WorldContentReferenceRegistry.name);
  private readonly guards: WorldContentReferenceGuard[] = [];
  private readonly deletionParticipants: WorldContentDeletionParticipant[] = [];

  register(guard: WorldContentReferenceGuard): void {
    if (this.guards.some((existing) => existing.source === guard.source))
      return;
    this.guards.push(guard);
    this.logger.log(`Registered external reference guard "${guard.source}"`);
  }

  /**
   * A module that holds data about World content and must take part in a
   * permanent deletion: report its impact, and clean its own records inside the
   * deletion transaction. Same dependency direction as `register`.
   */
  registerDeletionParticipant(
    participant: WorldContentDeletionParticipant,
  ): void {
    if (
      this.deletionParticipants.some(
        (existing) => existing.source === participant.source,
      )
    )
      return;
    this.deletionParticipants.push(participant);
    this.logger.log(
      `Registered permanent-deletion participant "${participant.source}"`,
    );
  }

  participants(): readonly WorldContentDeletionParticipant[] {
    return this.deletionParticipants;
  }

  /** Guards other than the given sources (e.g. legacy reference guards only). */
  guardsExcept(
    sources: readonly string[],
  ): readonly WorldContentReferenceGuard[] {
    return this.guards.filter((guard) => !sources.includes(guard.source));
  }

  async assertUnreferenced(
    kind: WorldContentReferenceKind,
    id: string,
  ): Promise<void> {
    for (const guard of this.guards) {
      const count = await guard.countReferences(kind, id);
      if (count > 0) {
        const references = (await guard.describeReferences?.(kind, id)) ?? [];
        throw new WorldContentConflictError(
          'WORLD_CONTENT_STILL_REFERENCED',
          `${count} record(s) in "${guard.source}" still reference this ${kind}`,
          references,
        );
      }
    }
  }

  async countReferences(
    kind: WorldContentReferenceKind,
    id: string,
    identity?: { slug?: string },
  ): Promise<number> {
    const counts = await Promise.all(
      this.guards.map((guard) => guard.countReferences(kind, id, identity)),
    );
    return counts.reduce((total, count) => total + count, 0);
  }

  async countReferencesFrom(
    source: string,
    kind: WorldContentReferenceKind,
    id: string,
    identity?: { slug?: string },
  ): Promise<number> {
    const guard = this.guards.find((entry) => entry.source === source);
    return guard ? guard.countReferences(kind, id, identity) : 0;
  }
}
