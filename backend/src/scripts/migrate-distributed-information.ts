import 'dotenv/config';
import mongoose from 'mongoose';
import type { Db } from 'mongodb';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  DISTRIBUTED_INFORMATION_ITEM_COUNT,
  DISTRIBUTED_INFORMATION_LOCK_MS,
  DISTRIBUTED_INFORMATION_SLUG,
  DISTRIBUTED_INFORMATION_TEAM_SIZES,
  DISTRIBUTED_INFORMATION_TIMER_SECONDS,
  WorldContentStatus,
} from '../modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../modules/scoring/domain/scoring-rule';

const APPLY = process.argv.includes('--apply');
const MONGO_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/lammah-quiz';

/** Names an ambiguous record might carry. Reported, never converted. */
const POSSIBLE_LEGACY_NAMES = [
  'معلومات مقسمة',
  'معلومات موزعة',
  'ركبها',
  'ركّبها',
];

export interface DistributedInformationSeedReport {
  apply: boolean;
  challengeTypeCreated: number;
  challengeTypeAlreadyPresent: number;
  ambiguousCandidates: Array<{ id: string; name: string; slug: string }>;
}

/**
 * Seeds the global "ركّبها" ChallengeType.
 *
 * Every gameplay property comes from the implemented canonical constants, so the
 * seed can never drift from the runtime. Nothing existing is converted: a record
 * that merely *looks* like this mechanic is reported and left exactly as it is,
 * because an inexact mapping would silently break someone's authored content.
 */
export class DistributedInformationSeed {
  constructor(
    private readonly db: Db,
    private readonly apply: boolean,
  ) {}

  async run(): Promise<DistributedInformationSeedReport> {
    const challengeTypes = this.db.collection('challenge_types');
    const existing = await challengeTypes.findOne({
      slug: DISTRIBUTED_INFORMATION_SLUG,
    });

    const ambiguous = await challengeTypes
      .find({
        slug: { $ne: DISTRIBUTED_INFORMATION_SLUG },
        name: { $in: POSSIBLE_LEGACY_NAMES },
      })
      .toArray();

    if (this.apply && !existing) {
      const now = new Date();
      await challengeTypes.insertOne({
        name: 'ركّبها',
        slug: DISTRIBUTED_INFORMATION_SLUG,
        description:
          'ثلاث معلومات خاصة موزّعة على الفريق، وسؤال واحد يراه الجميع. أول فريق يحل الألغاز الثلاثة يفوز.',
        family: ChallengeFamily.COOP,
        isExclusive: false,
        itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
        answerMode: ChallengeAnswerMode.DISTRIBUTED,
        defaultPresentation: {
          inputType: 'phone-text',
          timerSeconds: DISTRIBUTED_INFORMATION_TIMER_SECONDS,
          soundPack: null,
          revealStyle: null,
        },
        scoringRuleId: SCORING_RULE_IDS.DISTRIBUTED_INFORMATION_RACE_RESULT,
        // Draft until an admin activates it, so seeding never publishes a
        // mechanic nobody has authored content for yet.
        status: WorldContentStatus.DRAFT,
        sortOrder: 0,
        createdAt: now,
        updatedAt: now,
      });
    }

    return {
      apply: this.apply,
      challengeTypeCreated: existing ? 0 : 1,
      challengeTypeAlreadyPresent: existing ? 1 : 0,
      ambiguousCandidates: ambiguous.map((candidate) => ({
        id: String(candidate._id),
        name: String(candidate.name),
        slug: String(candidate.slug),
      })),
    };
  }
}

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const report = await new DistributedInformationSeed(db, APPLY).run();
  console.log(
    JSON.stringify(
      {
        mode: APPLY ? 'APPLIED' : 'DRY RUN',
        ...report,
        canonical: {
          slug: DISTRIBUTED_INFORMATION_SLUG,
          playerFacingName: 'ركّبها',
          runtimeKey: DISTRIBUTED_INFORMATION_SLUG,
          answerMode: ChallengeAnswerMode.DISTRIBUTED,
          timerSeconds: DISTRIBUTED_INFORMATION_TIMER_SECONDS,
          wrongAnswerLockMs: DISTRIBUTED_INFORMATION_LOCK_MS,
          itemsPerChallenge: DISTRIBUTED_INFORMATION_ITEM_COUNT,
          supportedTeamSizes: DISTRIBUTED_INFORMATION_TEAM_SIZES,
          scoringRuleId: SCORING_RULE_IDS.DISTRIBUTED_INFORMATION_RACE_RESULT,
        },
        note: 'Ambiguous look-alike mechanics are reported and left untouched; nothing is converted or deleted.',
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('distributed-information seed failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  });
}
