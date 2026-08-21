import { Injectable, Logger } from '@nestjs/common';
import { ContentExposureRepository } from '../persistence/content-exposure.repository';
import { MatchDomainError } from '../domain/match.errors';

/**
 * How long a drawn-but-unseen item stays claimed.
 *
 * Long enough that no real challenge outlives it, short enough that a crashed
 * process cannot withhold content for long. Reservations are normally released
 * explicitly when a challenge ends; this is only the backstop.
 */
export const CONTENT_RESERVATION_TTL_MS = 6 * 60 * 60 * 1000;

export interface ContentExposureScope {
  /** The account that owns the Match, never a participant. */
  ownerAccountId: string;
  /** The mechanic's canonical slug; see the ledger schema for why not the id. */
  challengeTypeKey: string;
  matchId: string;
}

/**
 * The account's per-mechanic content history.
 *
 * Three operations, in the order a challenge uses them:
 *
 * 1. **filter** — remove what this account has already seen in this mechanic, and
 *    what a concurrent Match of the same account currently holds.
 * 2. **reserve** — claim the drawn set so a concurrent Match cannot draw it too.
 *    A reservation is *not* exposure and does not spend the item.
 * 3. **recordPresented** — spend the items a player was actually shown.
 *
 * Plus **release**, which returns everything a finished or abandoned challenge
 * claimed but never showed.
 */
@Injectable()
export class ContentExposureService {
  private readonly logger = new Logger(ContentExposureService.name);

  constructor(private readonly exposures: ContentExposureRepository) {}

  /**
   * The selectable subset of a candidate pool.
   *
   * Additive to every existing constraint, never a replacement: the caller has
   * already applied World, Scope, mechanic compatibility, readiness and
   * mechanic-specific rules, and this removes seen items from what survived.
   */
  async selectable(
    scope: ContentExposureScope,
    candidateContentItemIds: string[],
    now: Date,
  ): Promise<string[]> {
    const blocked = await this.exposures.blockedContentItemIds(
      scope,
      candidateContentItemIds,
      { forMatchId: scope.matchId, now },
    );
    return candidateContentItemIds.filter((id) => !blocked.has(id));
  }

  /**
   * Claim a drawn set for this Match.
   *
   * Returns the ids actually claimed. A short return means a concurrent Match of
   * the same account won the race for the difference, and the caller must treat
   * the draw as failed rather than proceed — two Matches presenting the same
   * question to one account is the exact thing this prevents.
   */
  async reserve(
    scope: ContentExposureScope,
    contentItemIds: string[],
    now: Date,
  ): Promise<{ claimed: string[]; lost: string[] }> {
    const claimed = await this.exposures.reserve(scope, contentItemIds, {
      matchId: scope.matchId,
      now,
      expiresAt: new Date(now.getTime() + CONTENT_RESERVATION_TTL_MS),
    });
    const held = new Set(claimed);
    return {
      claimed,
      lost: contentItemIds.filter((id) => !held.has(id)),
    };
  }

  /** Spend the items a player was authoritatively shown. Idempotent. */
  async recordPresented(
    scope: ContentExposureScope,
    contentItemIds: string[],
    now: Date,
  ): Promise<number> {
    if (!contentItemIds.length) return 0;
    const written = await this.exposures.markExposed(scope, contentItemIds, {
      matchId: scope.matchId,
      now,
    });
    if (written) {
      this.logger.log({
        event: 'content_exposure_recorded',
        ownerAccountId: scope.ownerAccountId,
        challengeTypeKey: scope.challengeTypeKey,
        matchId: scope.matchId,
        items: contentItemIds.length,
        written,
      });
    }
    return written;
  }

  /**
   * Give back everything this Match claimed but never showed.
   *
   * Safe to call on any ending — completion, abort, cancel — because it deletes
   * only `reserved` rows. Nothing a player saw can be un-seen by it.
   */
  async releaseUnseen(matchId: string): Promise<number> {
    const released = await this.exposures.releaseReservations(matchId);
    if (released) {
      this.logger.log({
        event: 'content_reservations_released',
        matchId,
        released,
      });
    }
    return released;
  }
}

/**
 * The account has seen everything this mechanic could still offer here.
 *
 * Deliberately distinct from ordinary content shortage: the catalog is not too
 * small, this account has exhausted it. That is a product state a future
 * paywall/expansion surface can act on, so it is machine-readable rather than
 * folded into the generic shortage error. Nothing here designs that surface.
 */
export class MatchContentExhaustedError extends MatchDomainError {
  constructor(
    message: string,
    readonly details: {
      challengeTypeKey: string;
      required: number;
      unseenAvailable: number;
      alreadySeen: number;
    },
  ) {
    super('MATCH_CONTENT_EXHAUSTED_FOR_ACCOUNT', message);
  }
}
