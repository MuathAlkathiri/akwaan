import { ArabicSongCatalogService } from './arabic-song-catalog.service';

describe('ArabicSongCatalogService', () => {
  it('loads unique editable songs with canonical aliases', async () => {
    const songs = await new ArabicSongCatalogService().load();
    expect(songs.length).toBeGreaterThan(0);
    expect(songs[0].titleAliases).toContain(songs[0].title);
    expect(songs[0].artistAliases).toContain(songs[0].artist);
    expect(
      new Set(songs.map((song) => `${song.title}::${song.artist}`)).size,
    ).toBe(songs.length);
  });
});
