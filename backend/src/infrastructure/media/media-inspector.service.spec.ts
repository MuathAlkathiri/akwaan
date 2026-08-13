import { MediaCommandRunnerService } from './media-command-runner.service';
import { MediaInspectorService } from './media-inspector.service';

describe('MediaInspectorService', () => {
  it('parses and rounds ffprobe duration', async () => {
    const commands = {
      run: jest.fn().mockResolvedValue('42.1299\n'),
    } as unknown as MediaCommandRunnerService;
    await expect(
      new MediaInspectorService(commands).audioDurationSeconds(
        '/tmp/audio.mp3',
      ),
    ).resolves.toBe(42.13);
    expect(commands.run).toHaveBeenCalledWith(
      'ffprobe',
      expect.arrayContaining(['/tmp/audio.mp3']),
    );
  });

  it('rejects invalid duration output', async () => {
    const commands = {
      run: jest.fn().mockResolvedValue('N/A'),
    } as unknown as MediaCommandRunnerService;
    await expect(
      new MediaInspectorService(commands).audioDurationSeconds('/tmp/audio'),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INVALID_AUDIO_FILE' }),
    });
  });
});
