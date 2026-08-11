import mongoose from 'mongoose';
import {
  ChallengeAnswerMode,
  ChallengeFamily,
  ChallengeItemStructure,
  WorldContentStatus,
} from '../modules/world-content/domain/world-content.constants';
import { ONE_CLUE_MODE_KEY } from '../modules/live-game-sessions/domain/one-clue-gameplay.plugin';

const APPLY = process.argv.includes('--apply');
const MONGO_URI =
  process.env.MONGODB_URI ?? 'mongodb://localhost:27017/lammah-quiz';

async function main(): Promise<void> {
  const connection = await mongoose.connect(MONGO_URI);
  const db = connection.connection.db as mongoose.mongo.Db;
  const challengeTypes = db.collection('challenge_types');
  const existing = await challengeTypes.findOne({ slug: ONE_CLUE_MODE_KEY });
  if (existing) {
    console.log(
      `[one-clue provisioning] already present id=${String(existing._id)}`,
    );
    await mongoose.disconnect();
    return;
  }
  if (!APPLY) {
    console.log('[one-clue provisioning] DRY RUN: would create one-clue');
    await mongoose.disconnect();
    return;
  }
  const now = new Date();
  const result = await challengeTypes.insertOne({
    name: 'بدليل واحد',
    slug: ONE_CLUE_MODE_KEY,
    description: 'خمسة أدلة متدرجة، وإجابة واحدة مقفلة لكل فريق.',
    family: ChallengeFamily.COOP,
    itemStructure: ChallengeItemStructure.DISCRETE_TRIPLE,
    answerMode: ChallengeAnswerMode.MATCH,
    defaultPresentation: {
      inputType: 'phone-text',
      timerSeconds: 7,
      soundPack: null,
      revealStyle: null,
    },
    // Match scoring remains challenge.win. This is only the authoring-side
    // compatibility rule required by the ChallengeType contract.
    scoringRuleId: 'coop.item-success',
    status: WorldContentStatus.ACTIVE,
    sortOrder: 0,
    createdAt: now,
    updatedAt: now,
    __v: 0,
  });
  console.log(
    `[one-clue provisioning] created id=${String(result.insertedId)}`,
  );
  await mongoose.disconnect();
}

void main().catch(async (error) => {
  console.error(error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
