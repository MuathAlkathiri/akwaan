import { mapMusicTrackResponse } from './music-track-response.mapper';
import { MusicTrackSource } from '../schemas/music-track.schema';

describe('mapMusicTrackResponse', () => {
  it('normalizes identifiers and removes internal paths and mongoose metadata', () => {
    const track = {
      _id: { toString: () => 'track-id' },
      title: 'Song',
      snippetAudioUrl: '/uploads/music/snippets/song.mp3',
      originalAudioUrl: '/private/server/song.mp3',
      snippetDurationSeconds: 15,
      source: MusicTrackSource.ADMIN_UPLOAD,
      isActive: true,
      __v: 2,
    };
    const mapped = mapMusicTrackResponse(track as never);
    expect(mapped).toMatchObject({
      id: 'track-id',
      _id: 'track-id',
      title: 'Song',
    });
    expect(mapped.originalAudioUrl).toBeUndefined();
    expect(mapped).not.toHaveProperty('__v');
  });
});
