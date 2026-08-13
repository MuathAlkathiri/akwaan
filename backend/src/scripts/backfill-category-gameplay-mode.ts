import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppModule } from '../app.module';
import {
  Category,
  CategoryGameplayMode,
} from '../modules/categories/schemas/category.schema';

function argument(name: string): string | undefined {
  return process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
}

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const apply = process.argv.includes('--apply');
    const confirmStandardDefault = process.argv.includes(
      '--confirm-standard-default',
    );
    const top10Ids = new Set(
      (argument('top10-category-ids') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean),
    );
    const categories = app.get<Model<Category>>(getModelToken(Category.name));
    const reviewedTop10Ids = [...top10Ids];
    const candidates = await categories
      .find({
        $or: [
          { gameplayMode: { $exists: false } },
          ...(reviewedTop10Ids.length
            ? [{ _id: { $in: reviewedTop10Ids } }]
            : []),
        ],
      })
      .select('_id name slug catalogId gameplayMode')
      .lean()
      .exec();
    const classifications = candidates.map((category) => {
      const id = String(category._id);
      const gameplayMode = top10Ids.has(id)
        ? CategoryGameplayMode.TOP_10
        : category.gameplayMode === undefined && confirmStandardDefault
          ? CategoryGameplayMode.STANDARD
          : undefined;
      return {
        categoryId: id,
        name: category.name,
        slug: category.slug,
        catalogId: category.catalogId ? String(category.catalogId) : undefined,
        gameplayMode,
        outcome: gameplayMode ? 'CLASSIFIED' : 'AMBIGUOUS',
      };
    });
    if (apply) {
      const operations = classifications
        .filter((item) => item.gameplayMode)
        .map((item) => ({
          updateOne: {
            filter: {
              _id: item.categoryId,
              ...(item.gameplayMode === CategoryGameplayMode.STANDARD
                ? { gameplayMode: { $exists: false } }
                : {}),
            },
            update: { $set: { gameplayMode: item.gameplayMode } },
          },
        }));
      if (operations.length) await categories.bulkWrite(operations);
    }
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          confirmStandardDefault,
          reviewedTop10CategoryIds: [...top10Ids],
          reviewedTop10CategoryIdsNotFound: reviewedTop10Ids.filter(
            (id) => !candidates.some((category) => String(category._id) === id),
          ),
          scanned: candidates.length,
          classified: classifications.filter(
            (item) => item.outcome === 'CLASSIFIED',
          ).length,
          ambiguous: classifications.filter(
            (item) => item.outcome === 'AMBIGUOUS',
          ).length,
          classifications,
        },
        null,
        2,
      )}\n`,
    );
  } finally {
    await app.close();
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Category gameplay-mode backfill failed: ${message}\n`);
  process.exitCode = 1;
});
