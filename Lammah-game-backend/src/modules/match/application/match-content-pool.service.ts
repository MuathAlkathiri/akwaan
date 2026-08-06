import { Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ScopeRepository } from '../../world-content/persistence/scope.repository';
import { ScopeCompatibilityPolicy } from '../../world-content/domain/scope-compatibility.policy';
import {
  ContentItemStatus,
  WorldContentStatus,
} from '../../world-content/domain/world-content.constants';
import { MATCH_SCOPES_PER_OCCURRENCE } from '../domain/match.constants';
import { MatchDomainError } from '../domain/match.errors';

export interface MatchSelectableScope {
  scopeId: string;
  name: string;
  readyContentItemCount: number;
  /** Roadmap 5.2: mechanics this Scope's content must never be played through. */
  excludedChallengeTypeIds: string[];
}

/**
 * The content pool of one World occurrence.
 *
 * Four Scopes are chosen per occurrence and every challenge on that occurrence's
 * board draws from those four and nothing else. This service is the only place
 * that decides whether a Scope may join a pool and whether a ContentItem may be
 * played from it — there is deliberately no fallback to an unselected Scope.
 */
@Injectable()
export class MatchContentPool {
  constructor(
    private readonly scopes: ScopeRepository,
    private readonly items: ContentItemRepository,
  ) {}

  /** Every Scope of a World that a Match may put in a pool. */
  async listSelectableScopes(worldId: string): Promise<MatchSelectableScope[]> {
    const [scopes, readyCounts] = await Promise.all([
      this.scopes.listByWorld(worldId),
      this.items.readyCountsByScope(worldId),
    ]);
    return scopes
      .filter((scope) => scope.status === WorldContentStatus.ACTIVE)
      .map((scope) => ({
        scopeId: String(scope._id),
        name: scope.name,
        readyContentItemCount: readyCounts.get(String(scope._id)) ?? 0,
        excludedChallengeTypeIds: (scope.excludedChallengeTypeIds ?? []).map(
          (challengeTypeId) => String(challengeTypeId),
        ),
      }))
      .filter((scope) => scope.readyContentItemCount > 0);
  }

  /**
   * Validates the Scope pool of one configured occurrence, one Scope at a time so
   * the reason is exact: a Scope that does not exist, one that belongs to another
   * World, one that is not active, one with no ready content, and one whose
   * exclusions leave it no playable board position are five different mistakes
   * and are reported as five different codes.
   *
   * Cardinality and distinctness are not re-checked here — `UnifiedMatchSetupPolicy`
   * owns those, and this is deliberately the only place the World Content facts
   * are asserted.
   */
  async assertOccurrencePool(input: {
    occurrenceIndex: number;
    worldId: string;
    scopeIds: string[];
    /** The four mechanics this occurrence's World has on its board. */
    boardChallengeTypeIds: string[];
  }): Promise<void> {
    const selectable = new Map(
      (await this.listSelectableScopes(input.worldId)).map((scope) => [
        scope.scopeId,
        scope,
      ]),
    );
    for (const scopeId of input.scopeIds) {
      const scope = await this.findScope(scopeId);
      if (!scope) {
        throw new MatchDomainError(
          'SCOPE_NOT_FOUND',
          `Scope "${scopeId}" does not exist`,
        );
      }
      if (String(scope.worldId) !== input.worldId) {
        throw new MatchDomainError(
          'SCOPE_NOT_IN_OCCURRENCE_WORLD',
          `Scope "${scopeId}" belongs to another World than the one configured for occurrence ${input.occurrenceIndex}`,
        );
      }
      if (scope.status !== WorldContentStatus.ACTIVE) {
        throw new MatchDomainError(
          'SCOPE_NOT_ACTIVE',
          `Scope "${scopeId}" is ${scope.status}`,
        );
      }
      const entry = selectable.get(scopeId);
      if (!entry) {
        throw new MatchDomainError(
          'SCOPE_HAS_NO_READY_CONTENT',
          `Scope "${scopeId}" holds no ready ContentItem`,
        );
      }
      const usable = input.boardChallengeTypeIds.filter((challengeTypeId) =>
        ScopeCompatibilityPolicy.isChallengeTypeAllowed(
          { excludedChallengeTypeIds: entry.excludedChallengeTypeIds },
          challengeTypeId,
        ),
      );
      if (!usable.length) {
        throw new MatchDomainError(
          'SCOPE_HAS_NO_USABLE_SLOT',
          `Scope "${scopeId}" excludes every mechanic on this World's board`,
        );
      }
    }
  }

  /**
   * Validates a proposed pool: four distinct Scopes, all of this World, all
   * active, all holding ready content.
   *
   * @deprecated Legacy sequential only; the unified setup uses
   * {@link MatchContentPool.assertOccurrencePool}.
   */
  async assertSelectableScopes(
    worldId: string,
    scopeIds: string[],
  ): Promise<void> {
    if (scopeIds.length !== MATCH_SCOPES_PER_OCCURRENCE) {
      throw new MatchDomainError(
        'SCOPE_SELECTION_COUNT_INVALID',
        `Each World occurrence is played from exactly ${MATCH_SCOPES_PER_OCCURRENCE} Scopes, received ${scopeIds.length}`,
      );
    }
    if (new Set(scopeIds).size !== scopeIds.length) {
      throw new MatchDomainError(
        'SCOPE_SELECTION_DUPLICATED',
        'The same Scope cannot be selected twice for one World occurrence',
      );
    }
    const selectable = await this.listSelectableScopes(worldId);
    const byId = new Map(selectable.map((scope) => [scope.scopeId, scope]));
    for (const scopeId of scopeIds) {
      if (!byId.has(scopeId)) {
        throw new MatchDomainError(
          'SCOPE_NOT_SELECTABLE',
          'Every selected Scope must be an active Scope of this World with ready content',
        );
      }
    }
  }

  /**
   * Validates the ContentItems a challenge is about to play.
   *
   * An item is playable only when it is ready, compatible with the mechanic in
   * that board position, drawn from the World *and* one of the four Scopes of the
   * occurrence being played, and not already consumed by an earlier challenge of
   * the same occurrence.
   *
   * The World and the Scope pool are both checked, and both come from the named
   * occurrence. That is what keeps two occurrences of the same World from ever
   * borrowing each other's content: they answer to different pools even though
   * they answer to the same worldId.
   */
  async assertPlayableItems(input: {
    /** Which occurrence is being played — the pool below belongs to it alone. */
    occurrenceIndex: number;
    worldId: string;
    contentItemIds: string[];
    selectedScopeIds: string[];
    challengeTypeId: string;
    usedContentItemIds: string[];
  }): Promise<void> {
    const unique = new Set(input.contentItemIds);
    if (unique.size !== input.contentItemIds.length) {
      throw new MatchDomainError(
        'CONTENT_ITEM_DUPLICATED',
        'The same ContentItem cannot be played twice in one challenge',
      );
    }
    const reused = input.contentItemIds.filter((id) =>
      input.usedContentItemIds.includes(id),
    );
    if (reused.length) {
      throw new MatchDomainError(
        'CONTENT_ITEM_ALREADY_PLAYED',
        'This World occurrence has already played one of these ContentItems',
      );
    }

    const pool = new Set(input.selectedScopeIds);
    const documents = await Promise.all(
      input.contentItemIds.map((id) => this.items.findById(id)),
    );
    for (const [index, item] of documents.entries()) {
      if (!item) {
        throw new MatchDomainError(
          'CONTENT_ITEM_NOT_FOUND',
          `ContentItem "${input.contentItemIds[index]}" does not exist`,
        );
      }
      if (String(item.worldId) !== input.worldId) {
        throw new MatchDomainError(
          'CONTENT_ITEM_OUTSIDE_OCCURRENCE_WORLD',
          `Every ContentItem must belong to the World played at occurrence ${input.occurrenceIndex}`,
        );
      }
      if (!pool.has(String(item.scopeId))) {
        throw new MatchDomainError(
          'CONTENT_ITEM_OUTSIDE_SCOPE_POOL',
          `Every ContentItem must come from one of the four Scopes selected for occurrence ${input.occurrenceIndex}`,
        );
      }
      if (item.status !== ContentItemStatus.READY) {
        throw new MatchDomainError(
          'CONTENT_ITEM_NOT_READY',
          'Every ContentItem must be ready to play',
        );
      }
      if (
        !item.compatibleChallengeTypeIds.some(
          (id) => String(id) === input.challengeTypeId,
        )
      ) {
        throw new MatchDomainError(
          'CONTENT_ITEM_INCOMPATIBLE',
          'Every ContentItem must be compatible with the mechanic in this board position',
        );
      }
    }
  }

  /** A malformed id is a missing Scope, not a 500. */
  private async findScope(scopeId: string) {
    try {
      return await this.scopes.findById(scopeId);
    } catch {
      return null;
    }
  }
}
