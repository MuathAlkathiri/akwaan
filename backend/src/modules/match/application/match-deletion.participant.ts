import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { ClientSession, Connection, FilterQuery, Model } from 'mongoose';
import type {
  DeletionBlocker,
  DeletionExecuteOptions,
  DeletionParticipantContext,
  DeletionParticipantImpact,
  WorldContentDeletionParticipant,
} from '../../world-content/application/permanent-deletion/world-content-deletion.types';
import { WorldContentReferenceRegistry } from '../../world-content/application/world-content-reference.registry';
import { MARHALA_MODE_KEY } from '../../live-game-sessions/domain/marhala-board';
import { MOVING_XO_MODE_KEY } from '../../live-game-sessions/domain/moving-xo-board';
import { MatchStatus } from '../domain/match.constants';
import { ContentExposureDocument } from '../persistence/content-exposure.schema';
import { MatchDocument } from '../persistence/match.schema';

/**
 * Mechanics whose runtime reads ContentItems by id during play (not only at
 * launch): deleting an item under them can break a live turn.
 */
const CONTENT_REREADING_MECHANICS = [MARHALA_MODE_KEY, MOVING_XO_MODE_KEY];

/** Live-session states in which a Match can still be played or resumed. */
const TERMINAL_SESSION_STATUSES = ['finished', 'cancelled', 'expired'];

interface MatchRow {
  matchId: string;
  liveSessionId: string;
  status: string;
  currentChallenge?: { runtimeId?: string } | null;
  occurrences?: Array<{
    slots?: Record<string, { runtimeId?: string } | undefined>;
  }>;
  challengeResults?: Array<{
    runtimeId?: string;
    challengeTypeId?: string;
    challengeKey?: string;
  }>;
}

interface Classified {
  live: MatchRow[];
  stale: MatchRow[];
  history: MatchRow[];
  /** Completed Matches whose results lack a self-contained mechanic snapshot. */
  unsafeHistory: MatchRow[];
}

/**
 * Matches, their gameplay runtimes and the content-exposure ledger in a
 * permanent deletion.
 *
 * Product policy (2026-11-18): historical Matches, test sessions and runtimes
 * are disposable; approved content is not. So:
 * - a **live** Match (status active, session still playable) always blocks;
 * - a **stale** active Match (session finished, cancelled, expired or gone) and
 *   completed history whose results cannot stand on their own block only until
 *   the operator chooses to remove disposable history in the same transaction;
 * - with that choice, every completed/cancelled/stale Match referencing the
 *   record is deleted together with its own runtimes and reservations;
 * - exposure rows for deleted content are always removed (the item is gone).
 *   `exposed` rows for surviving content are the per-account no-repeat ledger
 *   (§5.5) and are kept.
 */
@Injectable()
export class MatchDeletionParticipant
  implements WorldContentDeletionParticipant, OnModuleInit
{
  readonly source = 'matches';

  constructor(
    @InjectConnection() private readonly connection: Connection,
    @InjectModel(MatchDocument.name)
    private readonly matches: Model<MatchDocument>,
    @InjectModel(ContentExposureDocument.name)
    private readonly exposures: Model<ContentExposureDocument>,
    private readonly registry: WorldContentReferenceRegistry,
  ) {}

  onModuleInit(): void {
    this.registry.registerDeletionParticipant(this);
  }

  async describe(
    context: DeletionParticipantContext,
  ): Promise<DeletionParticipantImpact> {
    const classified = await this.classify(context);
    const exposures = await this.exposures
      .countDocuments(this.exposureFilter(context))
      .session(context.session ?? null)
      .exec();
    const blockers: DeletionBlocker[] = [];
    if (classified.live.length) {
      blockers.push({
        code: 'LIVE_MATCH_IN_PROGRESS',
        message: `${classified.live.length} Match(es) in a live session still use this record. Let them finish or cancel them first.`,
        count: classified.live.length,
        sample: sample(classified.live),
      });
    }
    if (classified.stale.length) {
      blockers.push({
        code: 'STALE_ACTIVE_MATCH',
        message: `${classified.stale.length} abandoned Match(es) (their session has ended) still use this record.`,
        count: classified.stale.length,
        sample: sample(classified.stale),
        clearedByHistoryPurge: true,
      });
    }
    if (classified.unsafeHistory.length) {
      blockers.push({
        code: 'HISTORY_SNAPSHOT_UNSAFE',
        message: `${classified.unsafeHistory.length} finished Match(es) cannot show their results without this record.`,
        count: classified.unsafeHistory.length,
        sample: sample(classified.unsafeHistory),
        clearedByHistoryPurge: true,
      });
    }
    const purgeable = [...classified.stale, ...classified.history];
    return {
      source: this.source,
      counts: {
        liveMatches: classified.live.length,
        staleMatches: classified.stale.length,
        finishedMatches: classified.history.length,
        purgeableMatches: purgeable.length,
        exposuresRemoved: exposures,
      },
      blockers,
      fingerprintIds: [
        ...classified.live.map((row) => `live:${row.matchId}`),
        ...purgeable.map((row) => `purge:${row.matchId}`),
      ],
    };
  }

  async apply(
    context: DeletionParticipantContext & { session: ClientSession },
    options: DeletionExecuteOptions,
  ): Promise<Record<string, number>> {
    const { session } = context;
    const counts: Record<string, number> = {
      exposuresDeleted: (
        await this.exposures
          .deleteMany(this.exposureFilter(context), { session })
          .exec()
      ).deletedCount,
    };
    if (!options.purgeDisposableHistory) return counts;

    const classified = await this.classify(context);
    const purge = [...classified.stale, ...classified.history];
    if (!purge.length) return counts;
    const matchIds = purge.map((row) => row.matchId);
    const runtimeIds = [...new Set(purge.flatMap(runtimeIdsOf))];

    counts.matchesDeleted = (
      await this.matches
        .deleteMany({ matchId: { $in: matchIds } }, { session })
        .exec()
    ).deletedCount;
    counts.runtimesDeleted = runtimeIds.length
      ? (
          await this.connection
            .collection('gameplay_runtimes')
            .deleteMany({ runtimeId: { $in: runtimeIds } }, { session })
        ).deletedCount
      : 0;
    // A purged Match's reservations would otherwise hold content until expiry.
    counts.reservationsReleased = (
      await this.exposures
        .deleteMany(
          { matchId: { $in: matchIds }, state: 'reserved' },
          { session },
        )
        .exec()
    ).deletedCount;
    return counts;
  }

  private async classify(
    context: DeletionParticipantContext,
  ): Promise<Classified> {
    const empty: Classified = {
      live: [],
      stale: [],
      history: [],
      unsafeHistory: [],
    };
    const filter = this.matchFilter(context);
    if (!filter) return empty;
    const rows = await this.matches
      .find(filter)
      .select({
        matchId: 1,
        liveSessionId: 1,
        status: 1,
        'currentChallenge.runtimeId': 1,
        'occurrences.slots': 1,
        'challengeResults.runtimeId': 1,
        'challengeResults.challengeTypeId': 1,
        'challengeResults.challengeKey': 1,
      })
      .session(context.session ?? null)
      .lean<MatchRow[]>()
      .exec();
    if (!rows.length) return empty;

    const activeSessionIds = [
      ...new Set(
        rows
          .filter((row) => row.status === MatchStatus.ACTIVE)
          .map((row) => row.liveSessionId),
      ),
    ];
    const playable = new Set<string>();
    if (activeSessionIds.length) {
      const sessions = await this.connection
        .collection('live_game_sessions')
        .find(
          { sessionId: { $in: activeSessionIds } },
          {
            projection: { sessionId: 1, status: 1, expiresAt: 1 },
            ...(context.session ? { session: context.session } : {}),
          },
        )
        .toArray();
      const now = Date.now();
      for (const session of sessions) {
        const expiresAt = session.expiresAt
          ? new Date(session.expiresAt as Date).getTime()
          : Number.POSITIVE_INFINITY;
        if (
          !TERMINAL_SESSION_STATUSES.includes(String(session.status)) &&
          expiresAt > now
        ) {
          playable.add(String(session.sessionId));
        }
      }
    }

    const result: Classified = { ...empty };
    result.live = [];
    result.stale = [];
    result.history = [];
    result.unsafeHistory = [];
    for (const row of rows) {
      if (row.status === MatchStatus.ACTIVE) {
        (playable.has(row.liveSessionId) ? result.live : result.stale).push(
          row,
        );
      } else {
        result.history.push(row);
        if (
          context.entity.kind === 'challengeType' &&
          row.status === MatchStatus.COMPLETED &&
          this.lacksSnapshot(row, context)
        ) {
          result.unsafeHistory.push(row);
        }
      }
    }
    return result;
  }

  /** Which Matches reference the record being deleted. */
  private matchFilter(
    context: DeletionParticipantContext,
  ): FilterQuery<MatchDocument> | null {
    const { entity } = context;
    switch (entity.kind) {
      case 'world':
        return {
          $or: [
            { 'occurrences.worldId': entity.id },
            { 'selections.worldId': entity.id },
            { 'configuredBoardPositions.worldId': entity.id },
            { 'challengeResults.worldId': entity.id },
          ],
        };
      case 'scope':
        return {
          $or: [
            { 'occurrences.selectedScopeIds': entity.id },
            { 'challengeResults.selectedScopeIds': entity.id },
          ],
        };
      case 'challengeType': {
        const slug = context.challengeTypeSlug;
        return {
          $or: [
            { 'challengeResults.challengeTypeId': entity.id },
            { 'currentChallenge.challengeTypeId': entity.id },
            { 'pendingChallenge.challengeTypeId': entity.id },
            { 'configuredBoardPositions.challengeTypeId': entity.id },
            ...(slug
              ? [
                  { 'challengeResults.challengeKey': slug },
                  { 'currentChallenge.challengeKey': slug },
                  { 'pendingChallenge.challengeTypeSlug': slug },
                  { 'configuredBoardPositions.challengeTypeSlug': slug },
                ]
              : []),
          ],
        };
      }
      case 'contentItem': {
        // A Match playing the item right now depends on it. Most runtimes
        // snapshot their content at launch and history keeps ids only, but
        // المرحلة and Moving XO re-read items by id mid-game, so any live one
        // of those in the item's World is a dependency too.
        const worldId = context.ids.fencedWorlds[0];
        return {
          status: MatchStatus.ACTIVE,
          $or: [
            { 'currentChallenge.contentItemIds': entity.id },
            ...(worldId
              ? [
                  {
                    'occurrences.worldId': worldId,
                    'currentChallenge.challengeKey': {
                      $in: CONTENT_REREADING_MECHANICS,
                    },
                  },
                ]
              : []),
          ],
        };
      }
      default:
        // Detaching a World binding leaves every Match playable: board
        // positions are frozen at creation and the content remains.
        return null;
    }
  }

  private exposureFilter(
    context: DeletionParticipantContext,
  ): FilterQuery<ContentExposureDocument> {
    const clauses: FilterQuery<ContentExposureDocument>[] = [];
    if (context.ids.contentItemsToDelete.length) {
      clauses.push({
        contentItemId: { $in: context.ids.contentItemsToDelete },
      });
    }
    if (context.entity.kind === 'challengeType' && context.challengeTypeSlug) {
      clauses.push({ challengeTypeKey: context.challengeTypeSlug });
    }
    // Nothing to remove: match no document.
    return clauses.length ? { $or: clauses } : { _id: { $in: [] } };
  }

  private lacksSnapshot(
    row: MatchRow,
    context: DeletionParticipantContext,
  ): boolean {
    return (row.challengeResults ?? []).some(
      (result) =>
        (result.challengeTypeId === context.entity.id ||
          (context.challengeTypeSlug &&
            result.challengeKey === context.challengeTypeSlug)) &&
        (!result.challengeTypeId || !result.challengeKey),
    );
  }
}

function runtimeIdsOf(row: MatchRow): string[] {
  const ids: Array<string | undefined> = [
    row.currentChallenge?.runtimeId,
    ...(row.challengeResults ?? []).map((result) => result.runtimeId),
    ...(row.occurrences ?? []).flatMap((occurrence) =>
      Object.values(occurrence.slots ?? {}).map((slot) => slot?.runtimeId),
    ),
  ];
  return ids.filter((id): id is string => Boolean(id));
}

function sample(rows: MatchRow[]): Array<{ id: string; label: string }> {
  return rows.slice(0, 5).map((row) => ({
    id: row.matchId,
    label: `Match ${row.matchId.slice(0, 8)} · ${row.status}`,
  }));
}
