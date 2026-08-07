import 'dotenv/config';
import mongoose from 'mongoose';
import type { Db } from 'mongodb';
import {
  ChallengeAnswerMode,
  TOP5_ENTRY_COUNT,
  TOP5_RANKED_COUNT,
  TOP5_SLUG,
  TOP5_VARIANT,
} from '../modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../modules/scoring/domain/scoring-rule';

/**
 * Retires Top 10 and turns the same ChallengeType into Top 5.
 *
 * This is a *rename plus a payload reshape*, deliberately not a replacement. The
 * ChallengeType document keeps its `_id`, so every WorldChallengeConfiguration
 * and every ContentItem `compatibleChallengeTypeIds` entry still points at it:
 * there is nothing to repoint, no board to reconfigure, and no duplicate
 * ChallengeType to reconcile afterwards. A second document already holding
 * `top-5` aborts the run rather than being merged into.
 *
 * The rename carries the scoring rule with it. That is not cosmetic: a
 * ChallengeType pointing at a rule the registry no longer knows makes its whole
 * World board invalid, so leaving `top10.poison-deck.result` behind would stop
 * every Match on that World from being created.
 *
 * The content conversion is the part that has to be conservative. A Top 10 item
 * authored for the poison deck holds fourteen candidates: ten with explicit
 * ranks 1..10, and four author-chosen decoys. Top 5 needs ten entries — five
 * ranked 1..5 and five traps — so the only question is which five are traps, and
 * it is answered from the authored data rather than invented:
 *
 *   ranks 1..5  → the five real Top 5 entries, proven by the authored rank
 *   ranks 6..10 → exactly five entries the authored data proves are *not* in the
 *                 top five, and they are the near misses, which is the better
 *                 trap anyway
 *   the four authored decoys → dropped, because keeping any of them would make
 *                 the choice of which five traps to keep arbitrary
 *
 * An item that does not carry that proof — a missing rank, a duplicate rank, a
 * gap in 1..10, an unresolvable candidate id — is reported as needing
 * re-authoring and left exactly as it is. Nothing is truncated blindly and no
 * ranking semantics are ever fabricated.
 *
 * Titles are *not* rewritten by default. "أفضل 10 أندية…" is authored prose, and
 * turning it into "أفضل 5" is an editorial decision, not a data migration. Every
 * affected title is listed in the report; `--rewrite-titles` opts into the
 * substitution explicitly.
 *
 * Finally it retires the runtimes of the mechanic that no longer exists. A
 * GameplayRuntime is restored through its registered plugin, and the session
 * repository always returns a session's *latest* runtime — so a single leftover
 * `top-10` document makes that whole live session unreadable, terminal or not.
 * There is no version of the retired mechanic left to resume them with, so they
 * are removed and any Match still bound to one is cancelled rather than left
 * pointing at a runtime nothing can load.
 *
 * Idempotent: a second run finds the ChallengeType already canonical, every item
 * already reshaped, and no retired runtimes left, and writes nothing.
 */

const APPLY = process.argv.includes('--apply');
const REWRITE_TITLES = process.argv.includes('--rewrite-titles');
const MONGO_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/lammah-quiz';

export const LEGACY_TOP10_SLUG = 'top-10';
export const LEGACY_TOP10_ANSWER_MODE = 'top_10';
export const LEGACY_POISON_DECK_VARIANT = 'poison-deck';
const LEGACY_RANK_COUNT = 10;

export interface LegacyCandidate {
  id?: string;
  label?: string;
  shortLabel?: string;
  media?: unknown;
}

export interface LegacyTop10Payload {
  variant?: string;
  title?: string;
  instruction?: string;
  rankingBasis?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  asOfDate?: string;
  candidates?: LegacyCandidate[];
  rankedAnswer?: Array<{ candidateId?: string; rank?: number }>;
  decoyCandidateIds?: string[];
  explanation?: string;
}

export interface Top5EntryRecord {
  id: string;
  label: string;
  shortLabel?: string;
  media?: unknown;
  rank: number | null;
}

export type ContentDecision =
  | {
      kind: 'convert';
      entries: Top5EntryRecord[];
      titleNeedsReauthoring: boolean;
    }
  | { kind: 'already-migrated' }
  | { kind: 'needs-reauthoring'; reason: string };

/**
 * Decides what can be done with one authored Top 10 payload, and refuses to
 * guess. Pure, so the rule is testable without a database.
 */
export function planContentConversion(
  payload: LegacyTop10Payload | undefined,
): ContentDecision {
  if (payload?.variant === TOP5_VARIANT) return { kind: 'already-migrated' };
  if (payload?.variant !== LEGACY_POISON_DECK_VARIANT) {
    return {
      kind: 'needs-reauthoring',
      reason: `unsupported variant "${String(payload?.variant)}"`,
    };
  }
  const candidates = payload.candidates ?? [];
  const ranked = payload.rankedAnswer ?? [];
  const byId = new Map(
    candidates
      .filter((candidate) => candidate?.id)
      .map((candidate) => [String(candidate.id), candidate]),
  );
  if (byId.size !== candidates.length) {
    return {
      kind: 'needs-reauthoring',
      reason: 'duplicate or missing candidate ids',
    };
  }
  const ranks = ranked.map((entry) => Number(entry?.rank));
  const expected = Array.from({ length: LEGACY_RANK_COUNT }, (_, i) => i + 1);
  if (
    ranked.length !== LEGACY_RANK_COUNT ||
    [...ranks].sort((a, b) => a - b).join(',') !== expected.join(',')
  ) {
    // Without a complete, unique 1..10 there is no proof of which entries are
    // the top five and which are the next five.
    return {
      kind: 'needs-reauthoring',
      reason: 'ranked answers are not a complete unique 1..10',
    };
  }
  if (
    ranked.some(
      (entry) => !entry?.candidateId || !byId.has(String(entry.candidateId)),
    )
  ) {
    return {
      kind: 'needs-reauthoring',
      reason: 'a ranked answer points at an unknown candidate',
    };
  }
  const entries: Top5EntryRecord[] = [];
  for (const answer of [...ranked].sort(
    (left, right) => Number(left.rank) - Number(right.rank),
  )) {
    const candidate = byId.get(String(answer.candidateId))!;
    const label = String(candidate.label ?? '').trim();
    if (!label) {
      return {
        kind: 'needs-reauthoring',
        reason: 'a ranked candidate has no label',
      };
    }
    entries.push({
      id: String(candidate.id),
      label,
      ...(candidate.shortLabel ? { shortLabel: candidate.shortLabel } : {}),
      ...(candidate.media ? { media: candidate.media } : {}),
      // Ranks 1..5 stay ranked; 6..10 become traps because the authored data
      // proves they are not in the top five.
      rank:
        Number(answer.rank) <= TOP5_RANKED_COUNT ? Number(answer.rank) : null,
    });
  }
  if (
    entries.length !== TOP5_ENTRY_COUNT ||
    entries.filter((entry) => entry.rank !== null).length !==
      TOP5_RANKED_COUNT ||
    new Set(entries.map((entry) => entry.label)).size !== TOP5_ENTRY_COUNT
  ) {
    return {
      kind: 'needs-reauthoring',
      reason: 'converted entries are not ten unique with exactly five ranked',
    };
  }
  return {
    kind: 'convert',
    entries,
    titleNeedsReauthoring: /10|١٠/.test(String(payload.title ?? '')),
  };
}

export function rewriteTitle(title: string): string {
  return title.replace(/أفضل\s*10/g, 'أفضل 5').replace(/Top\s*10/gi, 'Top 5');
}

export function buildTop5Payload(
  payload: LegacyTop10Payload,
  entries: Top5EntryRecord[],
  title: string,
): Record<string, unknown> {
  return {
    variant: TOP5_VARIANT,
    title,
    ...(payload.instruction ? { instruction: payload.instruction } : {}),
    rankingBasis: payload.rankingBasis ?? '',
    sourceLabel: payload.sourceLabel ?? '',
    ...(payload.sourceUrl ? { sourceUrl: payload.sourceUrl } : {}),
    ...(payload.asOfDate ? { asOfDate: payload.asOfDate } : {}),
    entries,
    ...(payload.explanation ? { explanation: payload.explanation } : {}),
  };
}

export type SlugDecision =
  | { kind: 'rename'; id: unknown; from: string }
  | { kind: 'already-canonical'; id: unknown }
  | { kind: 'absent' }
  | { kind: 'slug-conflict'; holderId: unknown }
  | { kind: 'ambiguous'; count: number };

/** Refuses anything that is not one unambiguous document to rename. */
export function planSlugMigration(input: {
  legacy: Array<{ _id: unknown; slug: string }>;
  canonical: Array<{ _id: unknown; slug: string }>;
}): SlugDecision {
  if (input.canonical.length > 1) {
    return { kind: 'ambiguous', count: input.canonical.length };
  }
  if (input.canonical.length === 1) {
    if (input.legacy.length) {
      // Two documents claim the mechanic. Merging them would silently move board
      // configurations; a human decides which one survives.
      return { kind: 'slug-conflict', holderId: input.canonical[0]._id };
    }
    return { kind: 'already-canonical', id: input.canonical[0]._id };
  }
  if (!input.legacy.length) return { kind: 'absent' };
  if (input.legacy.length > 1) {
    return { kind: 'ambiguous', count: input.legacy.length };
  }
  return {
    kind: 'rename',
    id: input.legacy[0]._id,
    from: input.legacy[0].slug,
  };
}

async function main(): Promise<void> {
  const connection = await mongoose.connect(MONGO_URI);
  const db = connection.connection.db as Db;
  const host = connection.connection.host;
  const port = connection.connection.port;
  const database = connection.connection.name;
  console.log(
    `[top-5 migration] mode=${APPLY ? 'APPLY' : 'DRY RUN'} mongo=${host}:${port} db=${database}`,
  );

  const challengeTypes = db.collection('challenge_types');
  const contentItems = db.collection('content_items');

  const legacy = (await challengeTypes
    .find({ slug: LEGACY_TOP10_SLUG })
    .toArray()) as Array<{ _id: unknown; slug: string }>;
  const canonical = (await challengeTypes
    .find({ slug: TOP5_SLUG })
    .toArray()) as Array<{ _id: unknown; slug: string }>;
  const slugPlan = planSlugMigration({ legacy, canonical });
  console.log(`[top-5 migration] challenge type: ${slugPlan.kind}`);

  if (slugPlan.kind === 'slug-conflict' || slugPlan.kind === 'ambiguous') {
    console.error(
      `[top-5 migration] refusing to run: ${JSON.stringify(slugPlan)}`,
    );
    await mongoose.disconnect();
    process.exitCode = 1;
    return;
  }

  const challengeTypeId =
    slugPlan.kind === 'rename' || slugPlan.kind === 'already-canonical'
      ? slugPlan.id
      : undefined;

  if (slugPlan.kind === 'rename' && APPLY) {
    await challengeTypes.updateOne(
      { _id: slugPlan.id as never },
      {
        $set: {
          slug: TOP5_SLUG,
          name: 'أفضل 5',
          answerMode: ChallengeAnswerMode.TOP_5,
          // The retired rule id is no longer registered, and a ChallengeType
          // referencing an unregistered rule makes its whole World board
          // invalid — so no Match on that World could be created at all.
          scoringRuleId: SCORING_RULE_IDS.TOP5_RESULT,
        },
      },
    );
    console.log(
      `[top-5 migration] renamed ${String(slugPlan.id)}: ${LEGACY_TOP10_SLUG} -> ${TOP5_SLUG}`,
    );
  }
  if (slugPlan.kind === 'already-canonical' && APPLY) {
    // Repairs a document renamed by an earlier revision of this migration, which
    // moved the slug but left the retired scoring rule behind.
    await challengeTypes.updateOne(
      { _id: slugPlan.id as never },
      {
        $set: {
          answerMode: ChallengeAnswerMode.TOP_5,
          scoringRuleId: SCORING_RULE_IDS.TOP5_RESULT,
        },
      },
    );
  }

  const items = await contentItems
    .find({
      'answerPayload.mode': {
        $in: [LEGACY_TOP10_ANSWER_MODE, ChallengeAnswerMode.TOP_5],
      },
    })
    .toArray();
  const report = {
    converted: [] as string[],
    alreadyMigrated: [] as string[],
    needsReauthoring: [] as Array<{ id: string; reason: string }>,
    titlesNeedingReauthoring: [] as Array<{ id: string; title: string }>,
  };

  for (const item of items) {
    const payload = item.mechanicPayload as LegacyTop10Payload | undefined;
    const decision = planContentConversion(payload);
    const id = String(item._id);
    if (decision.kind === 'already-migrated') {
      report.alreadyMigrated.push(id);
      continue;
    }
    if (decision.kind === 'needs-reauthoring') {
      report.needsReauthoring.push({ id, reason: decision.reason });
      continue;
    }
    const originalTitle = String(payload?.title ?? '');
    const title = REWRITE_TITLES ? rewriteTitle(originalTitle) : originalTitle;
    if (decision.titleNeedsReauthoring && !REWRITE_TITLES) {
      report.titlesNeedingReauthoring.push({ id, title: originalTitle });
    }
    report.converted.push(id);
    if (APPLY) {
      await contentItems.updateOne(
        { _id: item._id },
        {
          $set: {
            'answerPayload.mode': ChallengeAnswerMode.TOP_5,
            mechanicPayload: buildTop5Payload(
              payload!,
              decision.entries,
              title,
            ),
          },
        },
      );
    }
  }

  console.log(
    `[top-5 migration] content items: converted=${report.converted.length} alreadyMigrated=${report.alreadyMigrated.length} needsReauthoring=${report.needsReauthoring.length}`,
  );
  for (const entry of report.needsReauthoring) {
    console.warn(`[top-5 migration]   re-author ${entry.id}: ${entry.reason}`);
  }
  for (const entry of report.titlesNeedingReauthoring) {
    console.warn(
      `[top-5 migration]   title still says ten: ${entry.id} "${entry.title}"`,
    );
  }
  if (challengeTypeId) {
    console.log(
      `[top-5 migration] ChallengeType _id preserved: ${String(challengeTypeId)} — every board configuration still points at it`,
    );
  }
  // Retired-mechanic runtimes. Nothing can load them, and the session repository
  // hands back a session's *latest* runtime whatever its status, so a single
  // leftover one makes that whole live session unreadable.
  const runtimes = db.collection('gameplay_runtimes');
  const stale = await runtimes
    .find({ modeKey: LEGACY_TOP10_SLUG })
    .project({ runtimeId: 1, sessionId: 1, status: 1 })
    .toArray();
  const staleRuntimeIds = new Set(
    stale.map((runtime) => String(runtime.runtimeId)),
  );
  const boundMatchIds = staleRuntimeIds.size
    ? (
        await db
          .collection('matches')
          .find({ status: 'active' })
          .project({ matchId: 1, occurrences: 1 })
          .toArray()
      )
        .filter((match) =>
          [...staleRuntimeIds].some((runtimeId) =>
            JSON.stringify(match.occurrences ?? []).includes(runtimeId),
          ),
        )
        .map((match) => String(match.matchId))
    : [];
  console.log(
    `[top-5 migration] retired-mechanic runtimes: ${stale.length} across ${
      new Set(stale.map((runtime) => String(runtime.sessionId))).size
    } live session(s); active matches bound to one: ${boundMatchIds.length}`,
  );
  if (APPLY && stale.length) {
    await runtimes.deleteMany({ modeKey: LEGACY_TOP10_SLUG });
    if (boundMatchIds.length) {
      // A Match pointing at a runtime nothing can load cannot be finished; it is
      // cancelled rather than left in a stage it can never leave.
      await db
        .collection('matches')
        .updateMany(
          { matchId: { $in: boundMatchIds } },
          { $set: { status: 'cancelled' }, $unset: { currentChallenge: '' } },
        );
    }
    console.log(
      `[top-5 migration] removed ${stale.length} retired-mechanic runtime(s) and cancelled ${boundMatchIds.length} bound match(es)`,
    );
  }

  if (!APPLY) {
    console.log(
      '[top-5 migration] dry run: nothing was written. Re-run with --apply.',
    );
  }
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[top-5 migration] failed', error);
    process.exit(1);
  });
}
