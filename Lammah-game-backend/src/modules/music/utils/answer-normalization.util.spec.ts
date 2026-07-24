import { normalizeMusicAnswer } from './answer-normalization.util';

describe('normalizeMusicAnswer', () => {
  it.each([
    ['الأَمَاكِن!', 'اماكن'],
    ['  The Song  ', 'song'],
    ['فتاةٌ جميلة', 'فتاه جميله'],
  ])('normalizes %s without changing comparison rules', (input, expected) => {
    expect(normalizeMusicAnswer(input)).toBe(expected);
  });

  it('keeps different answers different', () => {
    expect(normalizeMusicAnswer('الأماكن')).not.toBe(
      normalizeMusicAnswer('البخت'),
    );
  });
});
