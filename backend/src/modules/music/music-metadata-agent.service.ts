import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DifficultyLevel } from '../questions/schemas/question.schema';
import { MusicTrackLanguage } from './schemas/music-track.schema';

export interface MusicMetadataInput {
  filename: string;
  title?: string;
  artist?: string;
  album?: string;
  language?: MusicTrackLanguage;
  genre?: string;
  difficulty?: DifficultyLevel;
}

export interface MusicMetadataResult {
  title: string;
  artist?: string;
  album?: string;
  language?: MusicTrackLanguage;
  genre?: string;
  difficulty?: DifficultyLevel;
}

interface ChatCompletionResponse {
  choices?: {
    message?: {
      content?: string;
    };
  }[];
}

type NullableMetadata = {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  language?: MusicTrackLanguage | null;
  genre?: string | null;
  difficulty?: DifficultyLevel | null;
};

@Injectable()
export class MusicMetadataAgentService {
  constructor(private readonly configService: ConfigService) {}

  async inferMetadata(input: MusicMetadataInput): Promise<MusicMetadataResult> {
    const filenameFallback = this.deriveTitleFromFilename(input.filename);
    const llmMetadata = await this.tryInferWithLmStudio(input);

    const merged: MusicMetadataResult = {
      title:
        this.clean(input.title) ??
        this.clean(llmMetadata?.title) ??
        filenameFallback,
      artist: this.clean(input.artist) ?? this.clean(llmMetadata?.artist),
      album: this.clean(input.album) ?? this.clean(llmMetadata?.album),
      language: input.language ?? this.safeLanguage(llmMetadata?.language),
      genre: this.clean(input.genre) ?? this.clean(llmMetadata?.genre),
      difficulty:
        input.difficulty ??
        this.safeDifficulty(llmMetadata?.difficulty) ??
        DifficultyLevel.EASY,
    };

    return merged;
  }

  private async tryInferWithLmStudio(
    input: MusicMetadataInput,
  ): Promise<NullableMetadata | undefined> {
    const baseUrl = this.getConfig('LM_STUDIO_BASE_URL', 'LMSTUDIO_BASE_URL');
    const model = this.getConfig('LM_STUDIO_MODEL', 'LMSTUDIO_MODEL');

    if (!baseUrl || !model) {
      return undefined;
    }

    try {
      const response = await fetch(
        `${baseUrl.replace(/\/+$/, '')}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${
              this.getConfig('LM_STUDIO_API_KEY', 'LMSTUDIO_API_KEY') ?? 'dummy'
            }`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content:
                  'You extract conservative music metadata. Return JSON only. Never invent an artist, album, language, genre, or difficulty when uncertain; use null.',
              },
              {
                role: 'user',
                content: this.buildPrompt(input),
              },
            ],
            temperature: 0.1,
            max_tokens: 400,
          }),
        },
      );

      if (!response.ok) {
        return undefined;
      }

      const data = (await response.json()) as ChatCompletionResponse;
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        return undefined;
      }

      return this.parseMetadataJson(content);
    } catch {
      return undefined;
    }
  }

  private buildPrompt(input: MusicMetadataInput): string {
    return `Infer metadata for an admin-uploaded audio file.

Filename: ${input.filename}
Admin title: ${input.title ?? 'null'}
Admin artist: ${input.artist ?? 'null'}
Admin album: ${input.album ?? 'null'}
Admin language: ${input.language ?? 'null'}
Admin genre: ${input.genre ?? 'null'}
Admin difficulty: ${input.difficulty ?? 'null'}

Rules:
- Admin-provided title and artist are authoritative.
- If filename clearly looks like "Artist - Song", extract both.
- If uncertain, return null for unknown fields.
- Do not guess or fabricate artist names.
- language must be "ar", "en", "other", or null.
- difficulty must be "easy", "medium", "hard", or null.

Return exactly this JSON shape:
{
  "title": "string or null",
  "artist": "string or null",
  "album": "string or null",
  "language": "ar|en|other|null",
  "genre": "string or null",
  "difficulty": "easy|medium|hard|null"
}`;
  }

  private parseMetadataJson(content: string): NullableMetadata | undefined {
    const cleanContent = content
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    const start = cleanContent.indexOf('{');
    const end = cleanContent.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      return undefined;
    }

    try {
      return JSON.parse(cleanContent.slice(start, end + 1)) as NullableMetadata;
    } catch {
      return undefined;
    }
  }

  private deriveTitleFromFilename(filename: string): string {
    const withoutExtension = filename.replace(/\.[^.]+$/, '');
    const clean = withoutExtension.replace(/[_]+/g, ' ').replace(/\s+/g, ' ');
    const parts = clean.split(/\s+-\s+/).map((part) => part.trim());

    return parts.length > 1 ? parts.slice(1).join(' - ') : clean.trim();
  }

  private getConfig(primaryKey: string, legacyKey: string): string | undefined {
    return (
      this.configService.get<string>(primaryKey) ??
      this.configService.get<string>(legacyKey)
    );
  }

  private clean(value?: string | null): string | undefined {
    const cleaned = value?.trim();

    return cleaned || undefined;
  }

  private safeLanguage(value?: MusicTrackLanguage | null) {
    return Object.values(MusicTrackLanguage).includes(
      value as MusicTrackLanguage,
    )
      ? (value as MusicTrackLanguage)
      : undefined;
  }

  private safeDifficulty(value?: DifficultyLevel | null) {
    return Object.values(DifficultyLevel).includes(value as DifficultyLevel)
      ? (value as DifficultyLevel)
      : undefined;
  }
}
