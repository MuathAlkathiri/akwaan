import { AssetRequest } from '../contracts/asset-provider.interface';
import { normalize } from '../contracts/asset-relevance';

export type GulfSong = {
  title: string;
  artist: string;
  country: string;
  difficulty: 'easy' | 'medium' | 'hard';
  titleAliases: string[];
  artistAliases: string[];
  releaseYear?: number;
};

export type GulfMusicFailureCode =
  | 'MUSIC_TITLE_REQUIRED'
  | 'MUSIC_ARTIST_REQUIRED'
  | 'MUSIC_ENTITY_NOT_CANONICAL'
  | 'MUSIC_SONG_NOT_VERIFIED';

export class GulfMusicQuestionPolicy {
  static readonly question = 'ما اسم هذه الأغنية؟';

  isGulfMusicCategory(input: {
    catalogName?: string;
    categoryName?: string;
    knowledgeFile?: string;
  }): boolean {
    const category = this.normalizeArabic(input.categoryName ?? '');
    const knowledgeFile = input.knowledgeFile ?? '';
    const haystack = [input.catalogName, input.categoryName, knowledgeFile]
      .filter(Boolean)
      .join(' ');
    return (
      category === 'اغاني' ||
      /gulf.?music|khaleeji|خليج|اغاني الخليج|أغاني الخليج|music\/gulf-music\.md/i.test(
        haystack,
      )
    );
  }

  parseKnowledge(markdown: string): GulfSong[] {
    return markdown
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('|') && !/^\|\s*[-:]+/.test(line))
      .map((line) =>
        line
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim()),
      )
      .filter((cells) =>
        ['easy', 'medium', 'hard'].includes(cells[3]?.toLowerCase()),
      )
      .map(
        ([
          title,
          artist,
          country,
          difficulty,
          titleAliases,
          artistAliases,
          year,
        ]) => ({
          title,
          artist,
          country,
          difficulty: difficulty.toLowerCase() as GulfSong['difficulty'],
          titleAliases: this.aliases(title, titleAliases),
          artistAliases: this.aliases(artist, artistAliases),
          ...(Number(year) ? { releaseYear: Number(year) } : {}),
        }),
      );
  }

  resolve(
    songs: GulfSong[],
    title: string,
    artist: string,
  ): { song?: GulfSong; failure?: GulfMusicFailureCode } {
    if (!title.trim()) return { failure: 'MUSIC_TITLE_REQUIRED' };
    if (!artist.trim()) return { failure: 'MUSIC_ARTIST_REQUIRED' };
    const song = songs.find(
      (candidate) =>
        candidate.titleAliases.some((alias) => this.same(alias, title)) &&
        candidate.artistAliases.some((alias) => this.same(alias, artist)),
    );
    return song ? { song } : { failure: 'MUSIC_SONG_NOT_VERIFIED' };
  }

  assetRequest(song: GulfSong, duration: number): AssetRequest {
    return {
      type: 'audio',
      assetType: 'audio',
      provider: 'youtube',
      gameMode: 'identifySong',
      mediaIntent: 'music',
      sourceType: 'song',
      entityType: 'song',
      canonicalEntity: song.title,
      entity: song.title,
      title: song.title,
      aliases: song.titleAliases,
      artist: song.artist,
      artistAliases: song.artistAliases,
      searchEntity: `${song.artist} ${song.title}`,
      language: 'ar',
      region: 'gulf',
      country: song.country,
      duration,
    };
  }

  duplicateKey(song: GulfSong): string {
    return `${this.normalizeArabic(song.title)}::${this.normalizeArabic(song.artist)}`;
  }

  private aliases(canonical: string, raw = ''): string[] {
    return Array.from(
      new Set(
        [canonical, ...raw.split(',')]
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    );
  }

  private same(left: string, right: string): boolean {
    return this.normalizeArabic(left) === this.normalizeArabic(right);
  }

  private normalizeArabic(value: string): string {
    return normalize(value)
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/ـ/g, '')
      .replace(/[\u064b-\u065f\u0670]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

export const gulfMusicQuestionPolicy = new GulfMusicQuestionPolicy();
