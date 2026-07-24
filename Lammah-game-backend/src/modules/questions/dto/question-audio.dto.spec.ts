import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PreviewQuestionMediaClipDto } from './question-audio.dto';

describe('PreviewQuestionMediaClipDto', () => {
  it('receives exact integer timing fields in seconds', async () => {
    const dto = plainToInstance(PreviewQuestionMediaClipDto, {
      startTimeSeconds: 74,
      durationSeconds: 10,
    });
    await expect(validate(dto)).resolves.toEqual([]);
    expect(dto).toEqual({
      startTimeSeconds: 74,
      durationSeconds: 10,
    });
  });

  it('rejects non-integer or negative start times', async () => {
    const dto = plainToInstance(PreviewQuestionMediaClipDto, {
      startTimeSeconds: -1,
      durationSeconds: 10.5,
    });
    expect(await validate(dto)).not.toHaveLength(0);
  });
});
