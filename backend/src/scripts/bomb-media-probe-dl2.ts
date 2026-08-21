import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AssetResolutionModule } from '../modules/ai-agent/asset-resolution.module';
import { ImageDownloadService } from '../modules/ai-agent/infrastructure/assets/image-download.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), AssetResolutionModule],
})
class M {}

async function run() {
  const app = await NestFactory.createApplicationContext(M, { logger: ['error', 'warn'] });
  const dl = app.get(ImageDownloadService);
  const urls = [
    'https://upload.wikimedia.org/wikipedia/commons/8/83/%28Saint-Lys%29_Fauconneau_de_1589.jpg',
    'https://upload.wikimedia.org/wikipedia/commons/8/83/%28Saint-Lys%29_Fauconneau_de_1589.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=original',
  ];
  for (const u of urls) {
    try {
      const r = await dl.download(u, 'cannon-test');
      console.log('OK', r.url);
    } catch (e: any) {
      console.log('ERR', e.message);
    }
  }
  await app.close();
}
void run();