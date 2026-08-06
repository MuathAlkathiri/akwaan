import 'dotenv/config';
import mongoose from 'mongoose';
import type { Db } from 'mongodb';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  WorldContentStatus,
} from '../modules/world-content/domain/world-content.constants';
import { SCORING_RULE_IDS } from '../modules/scoring/domain/scoring-rule';

const APPLY = process.argv.includes('--apply');
const MONGO_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/lammah-quiz';

export interface Top10VariantMigrationReport {
  apply: boolean;
  canonicalMechanicCreated: number;
  classicItemsMarked: number;
  classicQuestionsPreserved: number;
}

/**
 * Introduces the explicit Top 10 variant discriminator without converting or
 * reassigning any existing World content. Missing variant means classic at
 * runtime; apply merely makes that fact explicit on new-system ContentItems.
 */
export class Top10VariantMigration {
  constructor(
    private readonly db: Db,
    private readonly apply: boolean,
  ) {}

  async run(): Promise<Top10VariantMigrationReport> {
    const challengeTypes = this.db.collection('challenge_types');
    const contentItems = this.db.collection('content_items');
    const questions = this.db.collection('questions');
    const canonical = await challengeTypes.findOne({ slug: 'top-10' });
    const classicFilter = {
      'answerPayload.mode': ChallengeAnswerMode.TOP_10,
      $or: [
        { mechanicPayload: { $exists: false } },
        { 'mechanicPayload.variant': { $exists: false } },
      ],
    };
    const classicItemsMarked = await contentItems.countDocuments(classicFilter);
    const classicQuestionsPreserved = await questions.countDocuments({
      $or: [
        { questionType: 'ranked_list' },
        { questionType: 'top_10' },
        { type: 'ranked_list' },
      ],
    });

    if (this.apply) {
      if (!canonical) {
        await challengeTypes.insertOne({
          name: 'أفضل 10',
          slug: 'top-10',
          description: 'تحدي أفضل 10 بنسخته المعتادة أو نسخة خذها أو دسّها.',
          family: ChallengeFamily.SIGNATURE,
          itemStructure: ChallengeItemStructure.CONTINUOUS,
          answerMode: ChallengeAnswerMode.TOP_10,
          defaultPresentation: {
            inputType: 'phone-card-choice',
            timerSeconds: 6,
            soundPack: null,
            revealStyle: 'rank-10-to-1-then-decoys',
          },
          scoringRuleId: SCORING_RULE_IDS.TOP10_POISON_DECK_RESULT,
          status: WorldContentStatus.DRAFT,
          sortOrder: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
      await contentItems.updateMany(classicFilter, {
        $set: { 'mechanicPayload.variant': 'classic', updatedAt: new Date() },
      });
    }

    return {
      apply: this.apply,
      canonicalMechanicCreated: canonical ? 0 : 1,
      classicItemsMarked,
      classicQuestionsPreserved,
    };
  }
}

async function main(): Promise<void> {
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;
  if (!db) throw new Error('MongoDB connection is not ready');
  const report = await new Top10VariantMigration(db, APPLY).run();
  console.log(
    JSON.stringify(
      {
        mode: APPLY ? 'APPLIED' : 'DRY RUN',
        ...report,
        note: 'No World signature assignment was created or changed.',
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('Top 10 migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  });
}
