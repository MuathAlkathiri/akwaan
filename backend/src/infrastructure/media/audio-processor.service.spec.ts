import { mkdtemp, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { AudioProcessorService } from './audio-processor.service';

describe('AudioProcessorService video trimming', () => {
  it('passes the exact submitted start time to ffmpeg', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'akwaan-video-trim-'));
    const outputPath = join(directory, 'clip.mp4');
    const commands = {
      run: jest.fn(async (_command: string, args: string[]) => {
        await writeFile(args.at(-1)!, 'video');
      }),
    };
    const service = new AudioProcessorService(commands as never);
    try {
      await service.createMp4Snippet({
        inputPath: join(directory, 'source.mp4'),
        outputPath,
        startSecond: 74,
        durationSeconds: 10,
      });
      expect(commands.run).toHaveBeenCalledWith(
        'ffmpeg',
        expect.arrayContaining(['-ss', '74', '-t', '10']),
      );
      const args = commands.run.mock.calls[0][1];
      expect(args[args.indexOf('-ss') + 1]).toBe('74');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
