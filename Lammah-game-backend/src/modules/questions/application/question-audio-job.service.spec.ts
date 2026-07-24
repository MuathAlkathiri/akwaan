import { QuestionAudioJobService } from './question-audio-job.service';
import { AudioRetryMode } from './question-audio-job.types';

describe('QuestionAudioJobService', () => {
  it('deduplicates identical jobs but permits a new request version', () => {
    const processor = { process: jest.fn().mockResolvedValue('ready') };
    const service = new QuestionAudioJobService(processor as never);
    const first = {
      questionId: 'question-1',
      requestVersion: 1,
      requestHash: 'hash-1',
      mode: AudioRetryMode.RESEARCH,
    };
    expect(service.enqueue(first)).toBe(true);
    expect(service.enqueue(first)).toBe(false);
    expect(
      service.enqueue({
        ...first,
        requestVersion: 2,
        requestHash: 'hash-2',
      }),
    ).toBe(true);
  });
});
