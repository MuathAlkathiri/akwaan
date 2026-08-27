import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ScoringService } from '../../scoring/application/scoring.service';
import { Match, MatchState } from '../domain/match';
import { MatchSetupMode, MatchStatus } from '../domain/match.constants';
import { MatchDocument } from './match.schema';
import {
  MatchListPage,
  MatchListRecord,
  MatchRepository,
  PendingMatchConvergence,
} from './match.repository';

export class MatchConcurrencyError extends ConflictException {
  constructor() {
    super({
      code: 'MATCH_CONCURRENT_MODIFICATION',
      message: 'The match changed while this command was being applied',
    });
  }
}

const ACTIVE_STATUSES = [MatchStatus.ACTIVE];

@Injectable()
export class MongooseMatchRepository implements MatchRepository {
  constructor(
    @InjectModel(MatchDocument.name)
    private readonly model: Model<MatchDocument>,
    private readonly scoring: ScoringService,
  ) {}

  async create(match: Match): Promise<void> {
    await this.model.create(this.toDocument(match.serialize()));
  }

  async findById(matchId: string): Promise<Match | null> {
    return this.restore(await this.model.findOne({ matchId }).lean().exec());
  }

  async findActiveBySessionId(sessionId: string): Promise<Match | null> {
    return this.restore(
      await this.model
        .findOne({ liveSessionId: sessionId, status: { $in: ACTIVE_STATUSES } })
        .lean()
        .exec(),
    );
  }

  async findLatestBySessionId(sessionId: string): Promise<Match | null> {
    return this.restore(
      await this.model
        .findOne({ liveSessionId: sessionId })
        .sort({ createdAt: -1 })
        .lean()
        .exec(),
    );
  }

  /**
   * Every active Match still naming a bound runtime.
   *
   * The projection is deliberately narrow — three ids — because this runs on a
   * sweep and the aggregate is large. Restoring full Matches here would make
   * recovery cost proportional to Match history rather than to outstanding
   * work.
   */
  async findAwaitingConvergence(): Promise<PendingMatchConvergence[]> {
    const rows = await this.model
      .find(
        {
          status: { $in: ACTIVE_STATUSES },
          'currentChallenge.runtimeId': { $type: 'string' },
        },
        { matchId: 1, liveSessionId: 1, 'currentChallenge.runtimeId': 1 },
      )
      .lean()
      .exec();
    return rows.map((row) => ({
      matchId: row.matchId,
      sessionId: row.liveSessionId,
      runtimeId: String(
        (row.currentChallenge as { runtimeId: string }).runtimeId,
      ),
    }));
  }

  async findListPageBySessionIds(input: {
    sessionIds: string[];
    page: number;
    limit: number;
  }): Promise<MatchListPage> {
    if (!input.sessionIds.length) {
      return { active: [], completed: [], completedTotal: 0 };
    }
    const projection = {
      matchId: 1,
      liveSessionId: 1,
      status: 1,
      stage: 1,
      teams: 1,
      occurrences: 1,
      scoreEvents: 1,
      createdAt: 1,
      updatedAt: 1,
      completedAt: 1,
    } as const;
    const ownerFilter = { liveSessionId: { $in: input.sessionIds } };
    const [activeRows, completedRows, completedTotal] = await Promise.all([
      this.model
        .find({ ...ownerFilter, status: MatchStatus.ACTIVE }, projection)
        .sort({ updatedAt: -1, matchId: -1 })
        .lean()
        .exec(),
      this.model
        .find({ ...ownerFilter, status: MatchStatus.COMPLETED }, projection)
        .sort({ completedAt: -1, matchId: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit)
        .lean()
        .exec(),
      this.model.countDocuments({
        ...ownerFilter,
        status: MatchStatus.COMPLETED,
      }),
    ]);
    const map = (row: Record<string, unknown>): MatchListRecord => ({
      matchId: String(row.matchId),
      liveSessionId: String(row.liveSessionId),
      status: String(row.status),
      stage: String(row.stage),
      teams: (row.teams ?? []) as MatchListRecord['teams'],
      occurrences: (row.occurrences ?? []) as MatchListRecord['occurrences'],
      scoreEvents: (row.scoreEvents ?? []) as unknown[],
      createdAt: new Date(row.createdAt as Date),
      updatedAt: new Date((row.updatedAt ?? row.createdAt) as Date),
      ...(row.completedAt
        ? { completedAt: new Date(row.completedAt as Date) }
        : {}),
    });
    return {
      active: activeRows.map((row) =>
        map(row as unknown as Record<string, unknown>),
      ),
      completed: completedRows.map((row) =>
        map(row as unknown as Record<string, unknown>),
      ),
      completedTotal,
    };
  }

  /**
   * Replaces the document only while the stored revision still matches, so two
   * concurrent commands cannot both win.
   */
  async save(match: Match, expectedRevision: number): Promise<void> {
    const state = match.serialize();
    const result = await this.model
      .replaceOne(
        { matchId: state.id, revision: expectedRevision },
        this.toDocument(state),
      )
      .exec();
    if (result.modifiedCount !== 1) throw new MatchConcurrencyError();
  }

  private toDocument(state: MatchState): Record<string, unknown> {
    return {
      matchId: state.id,
      liveSessionId: state.liveSessionId,
      setupMode: state.setupMode,
      status: state.status,
      stage: state.stage,
      stageEnteredAt: state.stageEnteredAt,
      revision: state.revision,
      processedCommandIds: state.processedCommandIds,
      teams: state.teams,
      teamDoubles: state.teamDoubles,
      coinToss: state.coinToss,
      selections: state.selections,
      occurrences: state.occurrences,
      configuredBoardPositions: state.configuredBoardPositions,
      selectingTeamId: state.selectingTeamId,
      pendingChallenge: state.pendingChallenge,
      currentChallenge: state.currentChallenge,
      // Stored plainly; the brand is re-applied on restore by the scoring module.
      scoreEvents: state.scoreEvents.map((event) => ({ ...event })),
      challengeResults: state.challengeResults.map((result) => ({ ...result })),
      pendingResultId: state.pendingResultId,
      createdAt: state.createdAt,
      startedAt: state.startedAt,
      completedAt: state.completedAt,
    };
  }

  private restore(document: MatchDocument | null): Match | null {
    if (!document) return null;
    const persistedEvents = (document.scoreEvents ?? []) as unknown[];
    const scoreEvents = this.scoring.restoreEvents(persistedEvents);
    const state = {
      id: document.matchId,
      liveSessionId: document.liveSessionId,
      // A stored Match written before the unified redesign carries no setup mode;
      // it is treated as the only mode that still exists. Truly legacy documents
      // no longer have a shape this repository understands.
      setupMode: document.setupMode ?? MatchSetupMode.UNIFIED_PRECONFIGURED,
      status: document.status,
      stage: document.stage,
      stageEnteredAt: new Date(document.stageEnteredAt),
      revision: document.revision,
      processedCommandIds: document.processedCommandIds ?? [],
      teams: document.teams,
      teamDoubles: (
        (document.teamDoubles ?? []) as Array<Record<string, unknown>>
      ).map((token) => ({
        ...token,
        consumedAt: token.consumedAt
          ? new Date(token.consumedAt as string)
          : undefined,
      })),
      coinToss: document.coinToss
        ? {
            ...(document.coinToss as Record<string, unknown>),
            resolvedAt: new Date(
              (document.coinToss as { resolvedAt: string }).resolvedAt,
            ),
          }
        : undefined,
      selections: (
        (document.selections ?? []) as Array<Record<string, unknown>>
      ).map((selection) => ({
        ...selection,
        selectedAt: new Date(selection.selectedAt as string),
      })),
      occurrences: (
        (document.occurrences ?? []) as Array<Record<string, unknown>>
      ).map((occurrence) => ({
        ...occurrence,
        slots: Object.fromEntries(
          Object.entries(
            (occurrence.slots ?? {}) as Record<string, Record<string, unknown>>,
          ).map(([slotKey, slot]) => [slotKey, this.restoreSlot(slot)]),
        ),
        completedAt: occurrence.completedAt
          ? new Date(occurrence.completedAt as string)
          : undefined,
      })),
      configuredBoardPositions: (document.configuredBoardPositions ??
        []) as unknown[],
      selectingTeamId: document.selectingTeamId,
      pendingChallenge: document.pendingChallenge
        ? {
            ...(document.pendingChallenge as Record<string, unknown>),
            preparedAt: new Date(
              (document.pendingChallenge as { preparedAt: string }).preparedAt,
            ),
          }
        : undefined,
      currentChallenge: document.currentChallenge
        ? {
            ...(document.currentChallenge as Record<string, unknown>),
            startedAt: new Date(
              (document.currentChallenge as { startedAt: string }).startedAt,
            ),
          }
        : undefined,
      scoreEvents,
      challengeResults: (
        (document.challengeResults ?? []) as Array<Record<string, unknown>>
      ).map((result) => ({
        ...result,
        // Mongo does not round-trip an empty Mixed object, and a result with no
        // mechanic detail is still a result.
        details: (result.details as Record<string, unknown>) ?? {},
        // A result written before Match scoring was normalised has `teamPoints`
        // holding whatever its mechanic minted. It is read under the new name so
        // stored history stays readable, and is *not* rewritten: the ledger it
        // came from is immutable, and re-deriving it would be inventing history.
        matchPoints:
          result.matchPoints ??
          (result as { teamPoints?: unknown }).teamPoints ??
          [],
        tie: result.tie ?? result.winnerTeamId === null,
        matchPointEventId: result.matchPointEventId ?? null,
        mechanicScoreEvents: result.mechanicScoreEvents ?? [],
        double: result.double ?? {
          consumedTeamIds: [],
          appliedTeamId: null,
        },
        startedAt: new Date(result.startedAt as string),
        completedAt: new Date(result.completedAt as string),
      })),
      pendingResultId: document.pendingResultId,
      createdAt: new Date(document.createdAt),
      startedAt: document.startedAt ? new Date(document.startedAt) : undefined,
      completedAt: document.completedAt
        ? new Date(document.completedAt)
        : undefined,
    } as unknown as MatchState;
    return Match.restore(state, scoreEvents);
  }

  private restoreSlot(slot: Record<string, unknown>): Record<string, unknown> {
    return {
      ...slot,
      startedAt: slot.startedAt
        ? new Date(slot.startedAt as string)
        : undefined,
      completedAt: slot.completedAt
        ? new Date(slot.completedAt as string)
        : undefined,
    };
  }
}
