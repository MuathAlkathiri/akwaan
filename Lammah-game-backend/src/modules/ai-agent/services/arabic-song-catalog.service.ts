import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { GulfSong } from '../application/gulf-music-question.policy';

@Injectable()
export class ArabicSongCatalogService {
  async load(): Promise<GulfSong[]> {
    const path = join(
      __dirname,
      '..',
      'knowledge',
      'music',
      'arabic-songs.json',
    );
    const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
    if (!Array.isArray(parsed))
      throw new Error('Song catalog must be an array');
    const songs = parsed.map((value, index) => this.validate(value, index));
    const unique = new Set(
      songs.map(
        (song) =>
          `${song.title.toLocaleLowerCase('ar')}::${song.artist.toLocaleLowerCase('ar')}`,
      ),
    );
    if (unique.size !== songs.length)
      throw new Error('Song catalog contains duplicate title/artist pairs');
    return songs;
  }

  private validate(value: unknown, index: number): GulfSong {
    const raw =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
    const title = this.text(raw.title);
    const artist = this.text(raw.artist);
    const country = this.text(raw.country);
    const difficulty = this.text(raw.difficulty);
    if (!title || !artist || !country)
      throw new Error(
        `Song catalog row ${index + 1} is missing title, artist, or country`,
      );
    if (!['easy', 'medium', 'hard'].includes(difficulty))
      throw new Error(`Song catalog row ${index + 1} has invalid difficulty`);
    return {
      title,
      artist,
      country,
      difficulty: difficulty as GulfSong['difficulty'],
      titleAliases: this.aliases(title, raw.titleAliases),
      artistAliases: this.aliases(artist, raw.artistAliases),
      ...(Number.isFinite(Number(raw.releaseYear))
        ? { releaseYear: Number(raw.releaseYear) }
        : {}),
    };
  }

  private aliases(canonical: string, value: unknown): string[] {
    return Array.from(
      new Set([
        canonical,
        ...(Array.isArray(value)
          ? value.filter((item): item is string => typeof item === 'string')
          : []),
      ]),
    );
  }

  private text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }
}
