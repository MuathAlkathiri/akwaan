import { Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { MatchBoardPositionKey } from '../domain/match-board-position-key';
import {
  ContentExposureScope,
  ContentExposureService,
  MatchContentExhaustedError,
} from './content-exposure.service';
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
  constructor(
    private readonly items: ContentItemRepository,
    private readonly exposures: ContentExposureService,
  ) {}

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
    /**
     * Whose content history to respect, when the caller could resolve an owner.
     *
     * An additional eligibility constraint, applied after every existing one —
     * World, Scope, compatibility, readiness and the mechanic's own payload rules
     * all still decide first, and exposure only removes what survived them. The
     * ledger is asked here rather than by the caller because the candidate set is
     * already in hand, so the check costs one indexed read over a bounded list.
     */
    exposureScope?: ContentExposureScope;
    now?: Date;
  }): Promise<string[]> {
    const required = input.requirements.contentItemCount;
    const documents = await this.items.listPlayableForOccurrence({
      worldId: input.worldId,
      scopeIds: input.selectedScopeIds,
      challengeTypeId: input.challengeTypeId,
    });

    const used = new Set(input.usedContentItemIds);
    const eligible = documents
      .map((document) => this.toSelectable(document))
      .filter((item) => !used.has(item.id))
      .filter(
        (item) =>
          // The mechanic's own payload contract, declared by its launcher, so the
          // draw can never hand the runtime an item it will refuse.
          !input.requirements.isPlayableItem ||
          input.requirements.isPlayableItem(item),
      );
    const unseen = new Set(
      input.exposureScope
        ? await this.exposures.selectable(
            input.exposureScope,
            eligible.map((item) => item.id),
            input.now ?? new Date(),
          )
        : eligible.map((item) => item.id),
    );
    const seen = input.exposureScope
      ? new Set(eligible.map((item) => item.id).filter((id) => !unseen.has(id)))
      : new Set<string>();
    // Kept separate from `eligible` so a shortage can say *why*: a catalog that
    // never had enough is a different problem from an account that has seen it
    // all, and only the second is a per-account product state.
    const playable = eligible.filter((item) => !seen.has(item.id));
    const spentByAccount = eligible.length - playable.length;

    /**
     * Never silently repeat. A pool that only falls short once exposure is
     * applied is reported as account exhaustion, with the numbers a product
     * surface would need, rather than being quietly topped up with seen content.
     */
    const refuse = (need: number, have: number): never => {
      if (spentByAccount > 0 && have + spentByAccount >= need) {
        throw new MatchContentExhaustedError(
          `This account has already seen every remaining item for this mechanic in World occurrence ${input.occurrenceIndex}: ${have} unseen of ${need} needed, ${spentByAccount} already seen`,
          {
            challengeTypeKey: input.exposureScope!.challengeTypeKey,
            required: need,
            unseenAvailable: have,
            alreadySeen: spentByAccount,
          },
        );
      }
      throw new MatchDomainError(
        'MATCH_INSUFFICIENT_PLAYABLE_CONTENT',
        `World occurrence ${input.occurrenceIndex} has ${have} playable ContentItems left for this challenge, which needs ${need}`,
      );
    };

    const positionKey = MatchBoardPositionKey.of(
      input.occurrenceIndex,
      input.slotKey,
    ).value;
    const strata = input.requirements.selectionStrata;
    if (strata) {
      // Each stratum is drawn independently, and a stratum that cannot be
      // filled fails the launch with the same shortage error as any other —
      // before a runtime exists, so nothing is left half-owned.
      const chosen: string[] = [];
      for (const stratum of strata.strata) {
        const bucket = playable.filter(
          (item) => strata.stratumOf(item) === stratum,
        );
        if (bucket.length < strata.perStratum) {
          const seenInStratum = eligible.filter(
            (item) => seen.has(item.id) && strata.stratumOf(item) === stratum,
          ).length;
          if (seenInStratum > 0) {
            throw new MatchContentExhaustedError(
              `This account has already seen the remaining stage ${stratum} content for this mechanic: ${bucket.length} unseen of ${strata.perStratum} needed, ${seenInStratum} already seen`,
              {
                challengeTypeKey: input.exposureScope!.challengeTypeKey,
                required: strata.perStratum,
                unseenAvailable: bucket.length,
                alreadySeen: seenInStratum,
              },
            );
          }
          throw new MatchDomainError(
            'MATCH_INSUFFICIENT_PLAYABLE_CONTENT',
            `World occurrence ${input.occurrenceIndex} has ${bucket.length} playable ContentItems for stage ${stratum}, which needs ${strata.perStratum}`,
          );
        }
        chosen.push(
          ...this.draw(
            bucket,
            strata.perStratum,
            `${positionKey}#${stratum}`,
            input.matchId,
          ),
        );
      }
      return chosen;
    }

    if (playable.length < required) refuse(required, playable.length);

    return this.draw(playable, required, positionKey, input.matchId);
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
      ...(typeof payload.comboStage === 'number'
        ? { comboStage: payload.comboStage }
        : {}),
      ...(typeof payload.marhalaDifficulty === 'string'
        ? { marhalaDifficulty: payload.marhalaDifficulty }
        : {}),
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
