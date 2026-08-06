import { Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { MatchBoardPositionKey } from '../domain/match-board-position-key';
import { MatchDomainError } from '../domain/match.errors';
import {
  MatchChallengeLaunchRequirements,
  MatchSelectableContentItem,
} from './challenge-launcher.registry';

/**
 * Choosing the content one board position will play.
 *
 * The player never picks ContentItems and never sees their ids: the host chooses a
 * *position*, and the server draws the content for it. Everything the draw is
 * allowed to consider comes from that one occurrence — its World, its four Scopes,
 * and the mechanic configured in that position — so two occurrences of the same
 * World can never borrow each other's content.
 *
 * The draw is deterministic in the position, not in the clock: the same Match and
 * the same position always produce the same set, so a retried launch cannot end up
 * playing different content than the attempt it is retrying.
 */
@Injectable()
export class MatchContentSelector {
  constructor(private readonly items: ContentItemRepository) {}

  async select(input: {
    matchId: string;
    occurrenceIndex: number;
    worldId: string;
    /** This occurrence's four Scopes, and nothing else. */
    selectedScopeIds: string[];
    slotKey: Parameters<typeof MatchBoardPositionKey.of>[1];
    challengeTypeId: string;
    requirements: MatchChallengeLaunchRequirements;
    /** Items this occurrence has already played. */
    usedContentItemIds: string[];
  }): Promise<string[]> {
    const required = input.requirements.contentItemCount;
    const documents = await this.items.listPlayableForOccurrence({
      worldId: input.worldId,
      scopeIds: input.selectedScopeIds,
      challengeTypeId: input.challengeTypeId,
    });

    const used = new Set(input.usedContentItemIds);
    const playable = documents
      .map((document) => this.toSelectable(document))
      .filter((item) => !used.has(item.id))
      .filter(
        (item) =>
          // The mechanic's own payload contract, declared by its launcher, so the
          // draw can never hand the runtime an item it will refuse.
          !input.requirements.isPlayableItem ||
          input.requirements.isPlayableItem(item),
      );

    if (playable.length < required) {
      throw new MatchDomainError(
        'MATCH_INSUFFICIENT_PLAYABLE_CONTENT',
        `World occurrence ${input.occurrenceIndex} has ${playable.length} playable ContentItems left for this challenge, which needs ${required}`,
      );
    }

    return this.draw(
      playable,
      required,
      MatchBoardPositionKey.of(input.occurrenceIndex, input.slotKey).value,
      input.matchId,
    );
  }

  /**
   * Spreads the draw across the occurrence's Scopes: one item from each Scope in
   * turn before taking a second from any. That is the whole balancing rule — a
   * challenge normally reaches three of the four Scopes rather than draining one —
   * and it is deliberately not a weighting engine.
   */
  private draw(
    playable: MatchSelectableContentItem[],
    required: number,
    positionKey: string,
    matchId: string,
  ): string[] {
    const random = seededRandom(`${matchId}:${positionKey}`);
    const byScope = new Map<string, MatchSelectableContentItem[]>();
    for (const item of playable) {
      const bucket = byScope.get(item.scopeId) ?? [];
      bucket.push(item);
      byScope.set(item.scopeId, bucket);
    }
    const scopes = shuffle([...byScope.keys()], random);
    for (const scopeId of scopes) {
      byScope.set(scopeId, shuffle(byScope.get(scopeId) ?? [], random));
    }

    const selected: string[] = [];
    while (selected.length < required) {
      let tookOne = false;
      for (const scopeId of scopes) {
        if (selected.length === required) break;
        const item = byScope.get(scopeId)?.shift();
        if (!item) continue;
        selected.push(item.id);
        tookOne = true;
      }
      // Guarded rather than assumed: the caller already proved the pool is big
      // enough, and an empty pass would otherwise spin forever.
      if (!tookOne) break;
    }
    if (selected.length !== required) {
      throw new MatchDomainError(
        'MATCH_INSUFFICIENT_PLAYABLE_CONTENT',
        `Could only draw ${selected.length} of the ${required} ContentItems this challenge needs`,
      );
    }
    return selected;
  }

  private toSelectable(document: {
    _id: unknown;
    worldId: unknown;
    scopeId: unknown;
    answerPayload: { mode: string };
    mechanicPayload?: Record<string, unknown>;
  }): MatchSelectableContentItem {
    const payload = document.mechanicPayload ?? {};
    return {
      id: String(document._id),
      worldId: String(document.worldId),
      scopeId: String(document.scopeId),
      answerMode: document.answerPayload.mode,
      ...(typeof payload.variant === 'string'
        ? { mechanicVariant: payload.variant }
        : {}),
      ...(typeof payload.authorSafetyConfirmation === 'boolean'
        ? { authorSafetyConfirmation: payload.authorSafetyConfirmation }
        : {}),
    };
  }
}

/**
 * A small deterministic generator, seeded by Match and board position.
 *
 * Deliberately not `Math.random`: the point is that the same position always draws
 * the same content, so a duplicate or retried launch request is indistinguishable
 * from the first one.
 */
function seededRandom(seed: string): () => number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
