import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { QuestionMediaRepairService } from '../modules/questions/application/question-media-repair.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const apply = process.argv.includes('--apply');
    const questionIdArgument = process.argv.find((value) =>
      value.startsWith('--question-id='),
    );
    const questionId = questionIdArgument?.slice('--question-id='.length);
    const service = app.get(QuestionMediaRepairService);
    const results = await service.repairPendingValidAssets({
      apply,
      questionId,
    });
    process.stdout.write(
      `${JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          scanned: results.length,
          repairable: results.filter(
            (item) =>
              item.outcome === 'REPAIRABLE' || item.outcome === 'REPAIRED',
          ).length,
          repaired: results.filter((item) => item.outcome === 'REPAIRED')
            .length,
          skipped: results.filter((item) => item.outcome === 'SKIPPED').length,
          results,
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
  process.stderr.write(`Media repair failed: ${message}\n`);
  process.exitCode = 1;
});
