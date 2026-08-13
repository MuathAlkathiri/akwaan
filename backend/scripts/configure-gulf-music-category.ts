import 'dotenv/config';
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required');

async function main() {
  await mongoose.connect(uri);
  const categories = mongoose.connection.collection('categories');
  const result = await categories.updateMany(
    {
      $or: [
        { slug: { $in: ['gulf-music', 'khaleeji-music', 'gulf-songs'] } },
        { name: /^(أغاني الخليج|اغاني الخليج|الموسيقى الخليجية|Gulf Music)$/i },
        { 'aiConfig.knowledgeFile': 'music/gulf-music.md' },
      ],
    },
    {
      $set: {
        'aiConfig.knowledgeFile': 'music/gulf-music.md',
        'gameplayConfig.gameModes': {
          trivia: 0,
          identifyCharacter: 0,
          identifyVoice: 0,
          identifyImage: 0,
          completeQuote: 0,
          timeline: 0,
          emojiPuzzle: 0,
          identifySong: 100,
          identifySinger: 0,
          identifyMusicIntro: 0,
        },
        'gameplayConfig.supportedAssetTypes': ['audio', 'image'],
      },
    },
  );
  process.stdout.write(
    `Gulf music categories matched=${result.matchedCount} modified=${result.modifiedCount}\n`,
  );
  await mongoose.disconnect();
}

void main().catch(async (error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Category update failed'}\n`,
  );
  await mongoose.disconnect();
  process.exitCode = 1;
});
