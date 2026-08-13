import { BadRequestException } from '@nestjs/common';
import { MusicTrackPolicy } from './music-track.policy';

describe('MusicTrackPolicy', () => {
  const policy = new MusicTrackPolicy();

  it('preserves default timing behavior', () => {
    expect(policy.snippetPlan(undefined, undefined, 60)).toEqual({
      snippetDurationSeconds: 15,
      snippetStartSecond: 30,
    });
  });

  it('clamps snippet duration and start to the playable range', () => {
    expect(policy.snippetPlan(30, 90, 25)).toEqual({
      snippetDurationSeconds: 20,
      snippetStartSecond: 5,
    });
  });

  it('rejects unsupported audio', () => {
    expect(() =>
      policy.validateFile({
        originalname: '../bad.exe',
        mimetype: 'application/octet-stream',
        buffer: Buffer.from('x'),
      }),
    ).toThrow(BadRequestException);
  });
});
