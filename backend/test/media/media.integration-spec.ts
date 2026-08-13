import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AudioProcessorService } from '../../src/infrastructure/media/audio-processor.service';
import { MediaCommandRunnerService } from '../../src/infrastructure/media/media-command-runner.service';
import { MediaInspectorService } from '../../src/infrastructure/media/media-inspector.service';

describe('FFmpeg media integration', () => {
  let directory: string;
  const commands = new MediaCommandRunnerService();
  const inspector = new MediaInspectorService(commands);
  const processor = new AudioProcessorService(commands);

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'lammah-media-test-'));
  });
  afterAll(async () => rm(directory, { recursive: true, force: true }));

  it('generates, inspects, and clips a synthetic tone', async () => {
    const source = join(directory, 'tone.wav');
    const snippet = join(directory, 'snippet.mp3');
    await commands.run('ffmpeg', [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=3',
      source,
    ]);
    expect(await inspector.audioDurationSeconds(source)).toBeCloseTo(3, 1);
    await processor.createMp3Snippet({
      inputPath: source,
      outputPath: snippet,
      startSecond: 1,
      durationSeconds: 1,
    });
    expect(await inspector.audioDurationSeconds(snippet)).toBeCloseTo(1, 1);
  });
});
