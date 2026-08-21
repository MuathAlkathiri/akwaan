import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AssetResolutionModule } from '../modules/ai-agent/asset-resolution.module';
import { WikimediaImageProvider } from '../modules/ai-agent/infrastructure/assets/wikimedia-image.provider';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AssetResolutionModule],
})
class ProbeModule {}

async function run() {
  const app = await NestFactory.createApplicationContext(ProbeModule, {
    logger: ['error', 'warn'],
  });
  try {
    const wik = app.get(WikimediaImageProvider);
    const entity = process.env.PROBE_ENTITY ?? 'cannon';
    const request: any = {
      type: 'image',
      entity,
      canonicalEntity: entity,
      entityType: 'object',
      categoryType: 'anime',
      purpose: 'gameplay',
      gameMode: 'bomb',
    };
    const candidates = wik.buildCandidates(request);
    console.log('queries:', JSON.stringify(candidates));
    for (const q of candidates.slice(0, 3)) {
      const r: any = await (wik as any).search(q);
      console.log('query:', q, 'raw:', r.rawCount);
      for (const p of r.pages.slice(0, 6)) {
        const u = p.original?.source ?? p.thumbnail?.source;
        console.log('  ', JSON.stringify(p.title), '->', u);
      }
    }
  } finally {
    await app.close();
  }
}
void run();