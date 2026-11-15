import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  MarhalaDrawOutcome,
  MarhalaDrawRequest,
  MarhalaQuestionSource,
  MarhalaQuestionSourceRegistry,
} from '../../live-game-sessions/application/marhala-question-source.registry';
import { MARHALA_MODE_KEY } from '../../live-game-sessions/domain/marhala-board';
import { MarhalaRuntimeQuestion } from '../../live-game-sessions/domain/marhala-gameplay.plugin';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../../live-game-sessions/domain/live-game-session.repository';
import {
  MARHALA_DIFFICULTIES,
  MarhalaDifficulty,
  marhalaDifficultyOf,
  normalizeMarhalaMedia,
} from '../../world-content/domain/marhala-content.policy';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import { MATCH_CLOCK, MatchClock } from './match-clock';
import { buildAnswerGuard } from '../../../common/utils/answer-collision-guard.util';
import { C4_GUARDED_V1 } from '../../../common/utils/answer-matching.util';
import { isTolerantAnswerMatchingEnabled } from '../../../common/utils/answer-matching-activation';
import { AnswerGuardCatalogReader } from '../persistence/answer-guard-catalog.reader';

/**
 * The longest a draw waits for its guard. Past it the question opens without
 * one — exact-only — rather than holding the team at an empty screen. Covers
 * what the read's own `maxTimeMS` cannot: a connection that never answers.
 */
export const ANSWER_GUARD_BUILD_BUDGET_MS = 2_000;

/** Resolves to `undefined` once the budget is spent, never rejects. */
function withinBudget<T>(work: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const expired = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([work, expired]).finally(() => clearTimeout(timer));
}
import {
  MATCH_REPOSITORY,
  MatchRepository,
} from '../persistence/match.repository';
import { ContentExposureService } from './content-exposure.service';
import { MatchContentSelector } from './match-content-selection.service';

/**
 * Draws "المرحلة" questions, one at a time, when a team has chosen a difficulty.
 *
 * Lives on the Match side because everything the draw needs lives here: the
 * owner account, the occurrence's Scopes, the shared selector and the exposure
 * ledger. It registers itself into the runtime's question-source registry, so the
 * dependency arrow stays match → live-game-sessions and no cycle exists.
 *
 * There is no deck and no lookahead. Each call draws exactly one item, reserves
 * it, and hands it over; the runtime committing it is what spends it.
 */
@Injectable()
export class MarhalaQuestionSourceProvider
  implements MarhalaQuestionSource, OnModuleInit
{
  readonly name = 'match-marhala-question-source';
  private readonly logger = new Logger(MarhalaQuestionSourceProvider.name);

  constructor(
    private readonly registry: MarhalaQuestionSourceRegistry,
    @Inject(MATCH_REPOSITORY) private readonly matches: MatchRepository,
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    private readonly selector: MatchContentSelector,
    private readonly exposures: ContentExposureService,
    private readonly items: ContentItemRepository,
    private readonly configurations: WorldChallengeConfigurationRepository,
    @Inject(MATCH_CLOCK) private readonly clock: MatchClock,
    private readonly guardCatalog: AnswerGuardCatalogReader,
  ) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  /**
   * One unseen item at the requested difficulty, reserved for this Match.
   *
   * Difficulty is a **hard filter**: a Hard request that cannot be satisfied comes
   * back as unavailable, never as an easier question wearing a Hard label.
   */
  async draw(request: MarhalaDrawRequest): Promise<MarhalaDrawOutcome> {
    const context = await this.context(request.sessionId);
    // No visible binding yet: unknown, never "empty". See MarhalaDrawOutcome.
    if (!context) return { kind: 'unknown' };

    const pool = await this.eligible(context, request.playedContentItemIds);
    const atDifficulty = pool.get(request.difficulty) ?? [];
    if (!atDifficulty.length) {
      // Nothing at the chosen difficulty. Report what *is* still playable so the
      // runtime can withdraw the choice rather than downgrade it.
      const available = MARHALA_DIFFICULTIES.filter(
        (difficulty) => (pool.get(difficulty) ?? []).length > 0,
      );
      return available.length
        ? { kind: 'unavailable', available: [...available] }
        : { kind: 'exhausted' };
    }

    // The shared selector picks, seeded by Match and board position — so a retried
    // draw over the same pool re-picks the *same* item rather than burning a
    // second one, which is what makes this safe under repeated execution.
    const [chosen] = await this.selector.select({
      matchId: context.matchId,
      occurrenceIndex: context.occurrenceIndex,
      worldId: context.worldId,
      selectedScopeIds: context.selectedScopeIds,
      slotKey: context.slotKey,
      challengeTypeId: context.challengeTypeId,
      requirements: {
        contentItemCount: 1,
        requiresPhones: true,
        // The hard difficulty filter, declared to the shared selector rather than
        // applied afterwards, so the draw can never hand back the wrong band.
        isPlayableItem: (item: { marhalaDifficulty?: string }) =>
          item.marhalaDifficulty === request.difficulty,
      } as never,
      // Everything this race has already shown is off the table for the rest of it.
      usedContentItemIds: [...request.playedContentItemIds],
      exposureScope: {
        ownerAccountId: context.ownerAccountId,
        challengeTypeKey: MARHALA_MODE_KEY,
        matchId: context.matchId,
      },
      now: this.clock.now(),
    });
    // The pool said there was one and the selector disagreed. That is a
    // disagreement to retry, not a depletion to act on.
    if (!chosen) return { kind: 'unknown' };

    const { lost } = await this.exposures.reserve(
      {
        ownerAccountId: context.ownerAccountId,
        challengeTypeKey: MARHALA_MODE_KEY,
        matchId: context.matchId,
      },
      [chosen],
      this.clock.now(),
    );
    if (lost.length) {
      // A concurrent Match of the same account took it between the read and the
      // claim. Never repeat content: report availability and let the team choose
      // again rather than serving something already spoken for.
      const available = MARHALA_DIFFICULTIES.filter(
        (difficulty) => (pool.get(difficulty) ?? []).length > 0,
      );
      return available.length
        ? { kind: 'unavailable', available: [...available] }
        : { kind: 'exhausted' };
    }

    const hydrated = await this.hydrate(chosen, request.difficulty);
    // An item that cannot be reduced to a playable question is a data defect;
    // the turn stays visibly pending rather than ending the race over it.
    if (!hydrated) return { kind: 'unknown' };
    const question = await this.withAnswerGuard(hydrated, context.worldId);
    this.logger.log({
      event: 'marhala_question_drawn',
      matchId: context.matchId,
      difficulty: request.difficulty,
      turnNumber: request.turnNumber,
      contentItemId: chosen,
    });
    return { kind: 'question', question };
  }

  /** Which difficulties have at least one eligible unseen item right now. */
  async availability(input: {
    sessionId: string;
    playedContentItemIds: readonly string[];
  }): Promise<MarhalaDifficulty[] | undefined> {
    const context = await this.context(input.sessionId);
    if (!context) return undefined;
    const pool = await this.eligible(context, input.playedContentItemIds);
    return MARHALA_DIFFICULTIES.filter(
      (difficulty) => (pool.get(difficulty) ?? []).length > 0,
    );
  }

  /**
   * The eligible pool, grouped by difficulty.
   *
   * One content query for the occurrence and one exposure read over exactly those
   * candidates, then grouped — so availability for all three difficulties costs the
   * same as asking about one, and the account's history is never loaded whole.
   */
  private async eligible(
    context: MarhalaDrawContext,
    played: readonly string[],
  ): Promise<Map<MarhalaDifficulty, string[]>> {
    const documents = await this.items.listPlayableForOccurrence({
      worldId: context.worldId,
      scopeIds: context.selectedScopeIds,
      challengeTypeId: context.challengeTypeId,
    });
    const spentHere = new Set(played);
    const candidates = documents
      .map((document) => ({
        id: String(document._id),
        difficulty: marhalaDifficultyOf(document.mechanicPayload),
      }))
      .filter(
        (
          candidate,
        ): candidate is { id: string; difficulty: MarhalaDifficulty } =>
          candidate.difficulty !== undefined && !spentHere.has(candidate.id),
      );

    const selectable = new Set(
      await this.exposures.selectable(
        {
          ownerAccountId: context.ownerAccountId,
          challengeTypeKey: MARHALA_MODE_KEY,
          matchId: context.matchId,
        },
        candidates.map((candidate) => candidate.id),
        this.clock.now(),
      ),
    );

    const grouped = new Map<MarhalaDifficulty, string[]>();
    for (const candidate of candidates) {
      if (!selectable.has(candidate.id)) continue;
      grouped.set(candidate.difficulty, [
        ...(grouped.get(candidate.difficulty) ?? []),
        candidate.id,
      ]);
    }
    return grouped;
  }

  /**
   * Attach the question's collision guard, only while typo tolerance is on for
   * المرحلة. Built now, from the World's live READY catalog, so it reflects the
   * content as it stands when the question is drawn — new, edited and retired
   * items included — and is read once per question, never per answer. Any
   * reason it cannot be built leaves the question without one, which the
   * matcher treats as exact-only.
   */
  private async withAnswerGuard(
    question: MarhalaRuntimeQuestion,
    worldId: string,
  ): Promise<MarhalaRuntimeQuestion> {
    if (!isTolerantAnswerMatchingEnabled(MARHALA_MODE_KEY)) return question;
    try {
      const domain = await withinBudget(
        this.guardCatalog.readyMatchAnswers(worldId),
        ANSWER_GUARD_BUILD_BUDGET_MS,
      );
      // Over the ceiling, or not back in time: exact-only for this question.
      if (!domain) return question;
      const built = buildAnswerGuard({
        itemId: question.contentItemId,
        acceptedAnswers: question.acceptedAnswers,
        domain,
        config: C4_GUARDED_V1,
      });
      if (built.status !== 'ready') return question;
      return { ...question, answerGuard: built.guard };
    } catch (error) {
      // A guard is an allowance, never a requirement: without one the question
      // is still played, exactly.
      this.logger.warn({
        event: 'marhala_answer_guard_unavailable',
        contentItemId: question.contentItemId,
        error: error instanceof Error ? error.message : String(error),
      });
      return question;
    }
  }

  /** Reduce a persisted item to what the runtime plays. */
  private async hydrate(
    contentItemId: string,
    difficulty: MarhalaDifficulty,
  ): Promise<MarhalaRuntimeQuestion | undefined> {
    const item = await this.items.findById(contentItemId);
    if (!item) return undefined;
    const accepted = (item.answerPayload as { acceptedAnswers?: string[] })
      .acceptedAnswers;
    if (!accepted?.length) return undefined;
    const media = normalizeMarhalaMedia(item.media);
    return {
      contentItemId,
      scopeId: String(item.scopeId),
      difficulty,
      prompt: item.prompt,
      ...(media.type !== 'none' ? { media } : {}),
      acceptedAnswers: accepted,
    };
  }

  /** The Match, the occurrence and the owner this runtime belongs to. */
  private async context(
    sessionId: string,
  ): Promise<MarhalaDrawContext | undefined> {
    const [match, session] = await Promise.all([
      this.matches.findActiveBySessionId(sessionId),
      this.sessions.findById(sessionId),
    ]);
    const challenge = match?.currentChallenge;
    if (!match || !session || !challenge) return undefined;
    if (challenge.challengeKey !== MARHALA_MODE_KEY) return undefined;
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

interface MarhalaDrawContext {
  matchId: string;
  ownerAccountId: string;
  occurrenceIndex: number;
  slotKey: MarhalaDrawContextSlot;
  worldId: string;
  challengeTypeId: string;
  selectedScopeIds: string[];
}

type MarhalaDrawContextSlot = Parameters<
  MatchContentSelector['select']
>[0]['slotKey'];
