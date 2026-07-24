import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  AudioQuestionKind,
  QuestionAudioRequest,
} from '../schemas/question.schema';

export interface AudioQuestionCatalogEntry {
  kind: AudioQuestionKind;
  question: string;
  answer: string;
  acceptedAnswers: string[];
  categoryRef?: string;
  audioRequest: QuestionAudioRequest;
  metadata: Record<string, unknown>;
}

/** Normalizes generic entries and the legacy Arabic song rows into one request model. */
@Injectable()
export class AudioQuestionCatalogService {
  async loadLegacySongs(): Promise<AudioQuestionCatalogEntry[]> {
    const path = join(
      __dirname,
      '..',
      '..',
      'ai-agent',
      'knowledge',
      'music',
      'arabic-songs.json',
    );
    return this.normalizeCatalog(JSON.parse(await readFile(path, 'utf8')));
  }

  normalizeCatalog(value: unknown): AudioQuestionCatalogEntry[] {
    if (!Array.isArray(value))
      throw new Error('Audio catalog must be an array');
    return value.map((entry, index) => this.normalize(entry, index));
  }

  private normalize(value: unknown, index: number): AudioQuestionCatalogEntry {
    const raw =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {};
    if (typeof raw.title === 'string' && typeof raw.artist === 'string')
      return this.legacySong(raw, index);
    const search = this.record(raw.search);
    const clip = this.record(raw.clip);
    const kind = this.kind(raw.kind);
    const question = this.requiredText(raw.question, index, 'question');
    const answer = this.requiredText(raw.answer, index, 'answer');
    return {
      kind,
      question,
      answer,
      acceptedAnswers: this.aliases(answer, raw.acceptedAnswers),
      ...(typeof raw.categoryRef === 'string'
        ? { categoryRef: raw.categoryRef }
        : {}),
      audioRequest: {
        kind,
        searchQuery: this.requiredText(search.query, index, 'search.query'),
        ...this.optionalText(search.targetName, 'targetName'),
        ...this.optionalText(search.sourceTitle, 'sourceTitle'),
        ...this.optionalText(search.language, 'language'),
        ...(Number.isFinite(Number(clip.preferredStartSeconds))
          ? { preferredStartSeconds: Number(clip.preferredStartSeconds) }
          : {}),
        ...(Number.isFinite(Number(clip.durationSeconds))
          ? { preferredDurationSeconds: Number(clip.durationSeconds) }
          : {}),
      },
      metadata: this.record(raw.metadata),
    };
  }

  private legacySong(
    raw: Record<string, unknown>,
    index: number,
  ): AudioQuestionCatalogEntry {
    const title = this.requiredText(raw.title, index, 'title');
    const artist = this.requiredText(raw.artist, index, 'artist');
    return {
      kind: AudioQuestionKind.IDENTIFY_SONG,
      question: 'ما اسم هذه الأغنية؟',
      answer: title,
      acceptedAnswers: this.aliases(title, raw.titleAliases),
      audioRequest: {
        kind: AudioQuestionKind.IDENTIFY_SONG,
        searchQuery: `${artist} ${title} official audio`,
        targetName: title,
        sourceTitle: artist,
        language: 'ar',
        preferredDurationSeconds: 12,
      },
      metadata: {
        song: title,
        artist,
        country: raw.country,
        difficulty: raw.difficulty,
        releaseYear: raw.releaseYear,
      },
    };
  }

  private kind(value: unknown): AudioQuestionKind {
    if (Object.values(AudioQuestionKind).includes(value as AudioQuestionKind))
      return value as AudioQuestionKind;
    throw new Error(`Unsupported audio catalog kind: ${String(value)}`);
  }
  private requiredText(value: unknown, index: number, field: string): string {
    if (typeof value === 'string' && value.trim()) return value.trim();
    throw new Error(`Audio catalog row ${index + 1} is missing ${field}`);
  }
  private optionalText(value: unknown, key: string): Record<string, string> {
    return typeof value === 'string' && value.trim()
      ? { [key]: value.trim() }
      : {};
  }
  private aliases(answer: string, value: unknown): string[] {
    return Array.from(
      new Set([
        answer,
        ...(Array.isArray(value)
          ? value.filter((item): item is string => typeof item === 'string')
          : []),
      ]),
    );
  }
  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }
}
