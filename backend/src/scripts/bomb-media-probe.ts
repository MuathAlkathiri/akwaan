import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AssetResolutionModule } from '../modules/ai-agent/asset-resolution.module';
import { AssetService } from '../modules/ai-agent/application/asset.service';
import { AssetRequest } from '../modules/ai-agent/contracts/asset-provider.interface';

/**
 * Authoring-support probe: run the canonical AssetService enrichment workflow
 * for a set of candidate AssetRequests and print the outcome. Does NOT write
 * anything to the database. Used to determine which Bomb section items the
 * existing media workflow can enrich right now.
 *
 * Boots only the media-resolution slice (AssetResolutionModule + ConfigModule)
 * rather than the full AppModule, so the probe is immune to unrelated module
 * wiring and never touches match/gameplay concerns.
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AssetResolutionModule],
})
class ProbeModule {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const app = await NestFactory.createApplicationContext(ProbeModule, {
    logger: ['error', 'warn'],
  });
  try {
    const assetService = app.get(AssetService);
    const requests: Array<{ label: string; request: AssetRequest }> =
      JSON.parse(process.env.PROBE_REQUESTS ?? '[]');
    const attempts = Number(process.env.PROBE_ATTEMPTS ?? '3');
    const delayMs = Number(process.env.PROBE_DELAY_MS ?? '3000');
    for (const { label, request } of requests) {
      let result: Awaited<ReturnType<typeof assetService.process>> | null = null;
      for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
          result = await assetService.process(request);
          if (result.assetStatus !== 'FAILED') break;
          if (attempt < attempts) await sleep(delayMs);
        } catch {
          if (attempt < attempts) await sleep(delayMs);
        }
      }
      if (!result) {
        process.stdout.write(`${JSON.stringify({ label, status: 'UNKNOWN' })}\n`);
        continue;
      }
      if (result.assetStatus === 'READY') {
        const a = result.asset;
        process.stdout.write(
          `${JSON.stringify({
            label,
            status: 'READY',
            url: a.url,
            localPath: a.localPath,
            provider: a.provider,
            sourceUrl: a.sourceUrl,
            searchQuery: a.searchQuery,
            title: a.metadata?.title,
            score: a.metadata?.relevanceScore,
          })}\n`,
        );
      } else if (result.assetStatus === 'FAILED') {
        process.stdout.write(
          `${JSON.stringify({
            label,
            status: result.assetStatus,
            reason: result.assetFailureReason,
            diagnostics: result.assetFailureDiagnostics,
          })}\n`,
        );
      } else {
        process.stdout.write(`${JSON.stringify({ label, status: 'NOT_REQUIRED' })}\n`);
      }
    }
  } finally {
    await app.close();
  }
}

void run().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Probe failed: ${message}\n`);
  process.exitCode = 1;
});