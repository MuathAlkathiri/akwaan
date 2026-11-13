import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ImageDownloadService } from '../modules/ai-agent/infrastructure/assets/image-download.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const dl = app.get(ImageDownloadService);
    const urls = [
      'https://upload.wikimedia.org/wikipedia/commons/8/8f/ItsukushimaTorii7379.jpg?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=original',
      'https://upload.wikimedia.org/wikipedia/commons/9/95/Shaken.JPG?utm_source=en.wikipedia.org&utm_campaign=api&utm_content=original',
    ];
    for (const url of urls) {
      try {
        const r = await dl.download(url, 'test');
        console.log('OK', JSON.stringify(r));
      } catch (e) {
        console.log('ERR', (e as Error).message);
      }
    }
  } finally {
    await app.close();
  }
}
void run();