import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  MovingXoDrawOutcome,
  MovingXoDrawRequest,
  MovingXoQuestionSource,
  MovingXoQuestionSourceRegistry,
} from '../../live-game-sessions/application/moving-xo-question-source.registry';
import { MOVING_XO_MODE_KEY } from '../../live-game-sessions/domain/moving-xo-board';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../../live-game-sessions/domain/live-game-session.repository';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ScopeRepository } from '../../world-content/persistence/scope.repository';
import { ContentItemStatus } from '../../world-content/domain/world-content.constants';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import { MATCH_CLOCK, MatchClock } from './match-clock';
import {
  MATCH_REPOSITORY,
  MatchRepository,
} from '../persistence/match.repository';
import {
  ContentExposureService,
  MatchContentExhaustedError,
} from './content-exposure.service';
import { MatchContentSelector } from './match-content-selection.service';
import { MatchDomainError } from '../domain/match.errors';
import {
  isMovingXoPlayableItem,
  MOVING_XO_MAX_DRAW_RECOVERY_ATTEMPTS,
  MovingXoRuntimeContentResult,
  readMovingXoQuestion,
} from './moving-xo-content.policy';

/**
 * Draws Moving XO puzzles, one at a time, when a turn owes one.
 *
 * Lives on the Match side because everything the draw needs lives here: the
 * owner account, the occurrence's Scopes, the shared selector and the exposure
 * ledger. It registers itself into the runtime's question-source registry, so the
 * dependency arrow stays match → live-game-sessions and no cycle exists.
 *
 * There is no deck and no lookahead. Each call draws exactly one item, reserves
 * it, and hands it over; the runtime committing it is what spends it, and putting
 * it on a surface is what burns it.
 */
@Injectable()
export class MovingXoQuestionSourceProvider
  implements MovingXoQuestionSource, OnModuleInit
{
  readonly name = 'match-moving-xo-question-source';
  private readonly logger = new Logger(MovingXoQuestionSourceProvider.name);

  constructor(
    private readonly registry: MovingXoQuestionSourceRegistry,
    @Inject(MATCH_REPOSITORY) private readonly matches: MatchRepository,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    private readonly selector: MatchContentSelector,
    private readonly exposures: ContentExposureService,
    private readonly items: ContentItemRepository,
    private readonly scopes: ScopeRepository,
    private readonly configurations: WorldChallengeConfigurationRepository,
    @Inject(MATCH_CLOCK) private readonly clock: MatchClock,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  /** One unseen eligible item, reserved for this Match. */
  async draw(request: MovingXoDrawRequest): Promise<MovingXoDrawOutcome> {
    const context = await this.context(request.sessionId);
    // No visible binding yet: unknown, never "empty". See MovingXoDrawOutcome.
    if (!context) return { kind: 'unknown' };

    // The shared selector picks, seeded by Match and board position — so a retried
    // draw over the same pool re-picks the *same* item rather than burning a
    // second one, which is what makes this safe under repeated execution.
    //
    // It *throws* when it cannot fill the request, which for a mechanic with no
    // launch-time deck is not a failed launch but the end of the game: the two
    // shortage errors are caught here and turned into depletion rather than
    // being allowed to crash a turn that would then stay pending forever.
    const exposureScope = {
      ownerAccountId: context.ownerAccountId,
      challengeTypeKey: MOVING_XO_MODE_KEY,
      matchId: context.matchId,
    };
    const rejected = new Set<string>();
    for (
      let attempt = 1;
      attempt <= MOVING_XO_MAX_DRAW_RECOVERY_ATTEMPTS;
      attempt += 1
    ) {
      let chosen: string | undefined;
      try {
        [chosen] = await this.selector.select({
          matchId: context.matchId,
          occurrenceIndex: context.occurrenceIndex,
          worldId: context.worldId,
          selectedScopeIds: context.selectedScopeIds,
          slotKey: context.slotKey,
          challengeTypeId: context.challengeTypeId,
          requirements: {
            contentItemCount: 1,
            isPlayableItem: isMovingXoPlayableItem,
            requiresPhones: true,
          },
          // Everything already shown or rejected by this bounded recovery pass
          // is off the table. The ledger covers prior Matches and live rivals.
          usedContentItemIds: [...request.presentedContentItemIds, ...rejected],
          exposureScope,
          now: this.clock.now(),
        });
      } catch (error) {
        if (!this.isDepletion(error)) throw error;
        this.logExhaustion(context.matchId, request.turnNumber, error);
        return { kind: 'exhausted' };
      }
      if (!chosen) return { kind: 'exhausted' };

      const { lost } = await this.exposures.reserve(
        exposureScope,
        [chosen],
        this.clock.now(),
      );
      if (lost.length) {
        // A rival Match won the unique-index race. Retry immediately over the
        // now-blocked pool; do not wait for a reconnect to wake this turn.
        rejected.add(chosen);
        continue;
      }

      let hydrated: MovingXoRuntimeContentResult;
      try {
        hydrated = await this.hydrate(chosen, context);
      } catch (error) {
        hydrated = { ok: false, code: 'MOVING_XO_ITEM_NO_LONGER_ELIGIBLE' };
        this.logger.error({
          event: 'moving_xo_item_hydration_failed',
          contentItemId: chosen,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      if (!hydrated.ok) {
        // This reservation never reached a surface. Release only this row, keep
        // permanent exposures untouched, and try a different candidate.
        try {
          await this.exposures.releaseReserved(exposureScope, [chosen]);
        } catch (error) {
          // A cleanup outage cannot strand the turn. The row is still unseen,
          // remains excluded for this pass, and challenge completion performs
          // the canonical Match-wide reserved-only cleanup as a backstop.
          this.logger.error({
            event: 'moving_xo_rejected_reservation_release_failed',
            matchId: context.matchId,
            contentItemId: chosen,
            message: error instanceof Error ? error.message : String(error),
          });
        }
        rejected.add(chosen);
        this.logger.warn({
          event: 'moving_xo_item_rejected_after_reservation',
          matchId: context.matchId,
          turnNumber: request.turnNumber,
          contentItemId: chosen,
          reason: hydrated.code,
          attempt,
        });
        continue;
      }

      this.logger.log({
        event: 'moving_xo_question_drawn',
        matchId: context.matchId,
        turnNumber: request.turnNumber,
        contentItemId: chosen,
        attempt,
      });
      return { kind: 'question', question: hydrated.question };
    }

    this.logger.error({
      event: 'moving_xo_draw_recovery_limit_reached',
      matchId: context.matchId,
      turnNumber: request.turnNumber,
      attempts: MOVING_XO_MAX_DRAW_RECOVERY_ATTEMPTS,
    });
    return { kind: 'exhausted' };
  }

  /**
   * Reduce a persisted item to what the runtime plays.
   *
   * The answer contract is re-read from the item itself rather than assumed:
   * §23.11 admits `match` and `multiple_choice` only, and an item that arrives in
   * any other mode is refused here instead of being coerced into a binary result
   * it cannot produce.
   */
  private async hydrate(
    contentItemId: string,
    context: MovingXoDrawContext,
  ): Promise<MovingXoRuntimeContentResult> {
    const item = await this.items.findById(contentItemId);
    if (!item) return { ok: false, code: 'MOVING_XO_ITEM_MISSING' };
    const scopeId = String(item.scopeId);
    if (
      item.status !== ContentItemStatus.READY ||
      String(item.worldId) !== context.worldId ||
      !context.selectedScopeIds.includes(scopeId) ||
      !item.compatibleChallengeTypeIds.some(
        (id) => String(id) === context.challengeTypeId,
      )
    ) {
      return { ok: false, code: 'MOVING_XO_ITEM_NO_LONGER_ELIGIBLE' };
    }
    const scope = await this.scopes.findById(scopeId);
    return readMovingXoQuestion({
      id: contentItemId,
      scopeId,
      scopeSlug: scope?.slug,
      prompt: item.prompt,
      answerPayload: item.answerPayload,
      media: item.media,
    });
  }

  private isDepletion(
    error: unknown,
  ): error is MatchContentExhaustedError | MatchDomainError {
    return (
      error instanceof MatchContentExhaustedError ||
      (error instanceof MatchDomainError &&
        (error.getResponse() as { code?: string }).code ===
          'MATCH_INSUFFICIENT_PLAYABLE_CONTENT')
    );
  }

  private logExhaustion(
    matchId: string,
    turnNumber: number,
    error: MatchContentExhaustedError | MatchDomainError,
  ): void {
    this.logger.log({
      event: 'moving_xo_content_exhausted',
      matchId,
      turnNumber,
      reason:
        error instanceof MatchContentExhaustedError
          ? 'account-exhausted'
          : 'catalog-empty',
    });
  }

  /** The Match, the occurrence and the owner this runtime belongs to. */
  private async context(
    sessionId: string,
  ): Promise<MovingXoDrawContext | undefined> {
    const [match, session] = await Promise.all([
      this.matches.findActiveBySessionId(sessionId),
      this.sessions.findById(sessionId),
    ]);
    const challenge = match?.currentChallenge;
    if (!match || !session || !challenge) return undefined;
    if (challenge.challengeKey !== MOVING_XO_MODE_KEY) return undefined;
    const occurrence = match.occurrences.find(
      (candidate) => candidate.index === challenge.occurrenceIndex,
    );
    if (!occurrence) return undefined;
    // The Match records which *mechanic* a slot plays, not its ChallengeType id,
    // so the id comes from the World's own board configuration — the same record
    // the launch resolved its launcher through.
    const configuration = await this.configurations.findByWorldAndSlot(
      occurrence.worldId,
      challenge.slotKey,
    );
    if (!configuration) return undefined;
    return {
      matchId: match.id,
      ownerAccountId: session.controllerActorId,
      occurrenceIndex: challenge.occurrenceIndex,
      slotKey: challenge.slotKey,
      worldId: occurrence.worldId,
      challengeTypeId: String(configuration.challengeTypeId),
      selectedScopeIds: match.selectedScopeIds(challenge.occurrenceIndex),
    };
  }
}

interface MovingXoDrawContext {
  matchId: string;
  ownerAccountId: string;
  occurrenceIndex: number;
  slotKey: MovingXoDrawContextSlot;
  worldId: string;
  challengeTypeId: string;
  selectedScopeIds: string[];
}

type MovingXoDrawContextSlot = Parameters<
  MatchContentSelector['select']
>[0]['slotKey'];
