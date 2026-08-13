import { GulfMusicQuestionPolicy } from '../application/gulf-music-question.policy';

describe('GulfMusicQuestionPolicy', () => {
  const policy = new GulfMusicQuestionPolicy();
  const knowledge = `
| Title | Artist | Country | Difficulty | Title aliases | Artist aliases | Year |
| --- | --- | --- | --- | --- | --- | --- |
| الأماكن | محمد عبده | Saudi Arabia | easy | الاماكن | Mohammed Abdu | 2005 |
| تناديك | ماجد المهندس | UAE | easy | | Majid Al Mohandis | 2018 |`;

  it('recognizes Gulf music categories and parses verified rows', () => {
    expect(policy.isGulfMusicCategory({ categoryName: 'أغاني الخليج' })).toBe(
      true,
    );
    expect(policy.isGulfMusicCategory({ categoryName: 'اغاني' })).toBe(true);
    expect(policy.parseKnowledge(knowledge)).toHaveLength(2);
  });

  it('normalizes Arabic title and artist aliases', () => {
    const songs = policy.parseKnowledge(knowledge);
    expect(
      policy.resolve(songs, 'الأَمَاكِن', 'Mohammed Abdu').song,
    ).toMatchObject({
      title: 'الأماكن',
      artist: 'محمد عبده',
    });
  });

  it('requires a verified title and artist pair', () => {
    const songs = policy.parseKnowledge(knowledge);
    expect(policy.resolve(songs, '', 'محمد عبده').failure).toBe(
      'MUSIC_TITLE_REQUIRED',
    );
    expect(policy.resolve(songs, 'الأماكن', '').failure).toBe(
      'MUSIC_ARTIST_REQUIRED',
    );
    expect(policy.resolve(songs, 'أغنية حزينة', 'محمد عبده').failure).toBe(
      'MUSIC_SONG_NOT_VERIFIED',
    );
  });

  it('builds a YouTube song request with title as identity and artist metadata', () => {
    const song = policy.parseKnowledge(knowledge)[0];
    expect(policy.assetRequest(song, 6)).toMatchObject({
      gameMode: 'identifySong',
      mediaIntent: 'music',
      sourceType: 'song',
      entity: 'الأماكن',
      title: 'الأماكن',
      artist: 'محمد عبده',
      provider: 'youtube',
      duration: 6,
    });
  });
});
