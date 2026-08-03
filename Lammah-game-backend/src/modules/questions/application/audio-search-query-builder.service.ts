import { Injectable } from '@nestjs/common';
import {
  AudioQuestionKind,
  QuestionAudioRequest,
} from '../schemas/question.schema';

interface QueryCombination {
  parts: Array<string | undefined>;
  // Combinations built only from filler keywords (no target/source anchor)
  // degrade into meaningless single-word queries like "lyrics" or "audio
  // clip" once target/source are blank, so they're dropped unless the
  // admin actually supplied one of those fields.
  anchored?: boolean;
}

@Injectable()
export class AudioSearchQueryBuilder {
  build(request: QuestionAudioRequest): string[] {
    const target = this.clean(request.targetName);
    const source = this.clean(request.sourceTitle);
    const supplied = this.clean(request.searchQuery);
    const language = this.clean(request.language);
    const hasAnchor = Boolean(target || source);
    let combinations: QueryCombination[];

    switch (request.kind) {
      case AudioQuestionKind.IDENTIFY_SONG:
      case AudioQuestionKind.IDENTIFY_ARTIST:
        combinations = [
          { parts: [source, target, 'official audio'], anchored: true },
          { parts: [target, source, 'lyrics'], anchored: true },
          { parts: [supplied] },
          { parts: [source, target, 'audio'], anchored: true },
        ];
        break;
      case AudioQuestionKind.IDENTIFY_CHARACTER:
      case AudioQuestionKind.IDENTIFY_VOICE:
        combinations = [
          {
            parts: [target, source, language, 'voice clip clean dialogue'],
            anchored: true,
          },
          { parts: [target, source, 'character voice'], anchored: true },
          { parts: [target, source, 'voice lines'], anchored: true },
          { parts: [target, source, 'dialogue'], anchored: true },
          { parts: [target, source, 'صوت شخصية مقطع صوت'], anchored: true },
          { parts: [supplied] },
        ];
        break;
      case AudioQuestionKind.IDENTIFY_GAME:
        combinations = [
          { parts: [target, source, 'game dialogue clip'], anchored: true },
          { parts: [target, source, 'voice line'], anchored: true },
          { parts: [supplied] },
        ];
        break;
      case AudioQuestionKind.IDENTIFY_MOVIE:
      case AudioQuestionKind.IDENTIFY_DIALOGUE_SOURCE:
        combinations = [
          {
            parts: [target, source, 'scene audio dialogue clip'],
            anchored: true,
          },
          { parts: [target, source, 'quote audio'], anchored: true },
          { parts: [supplied] },
        ];
        break;
      case AudioQuestionKind.IDENTIFY_SOUND_EFFECT:
        combinations = [
          { parts: [target, source, 'sound effect clean'], anchored: true },
          { parts: [target, source, 'sound clip'], anchored: true },
          { parts: [supplied] },
        ];
        break;
      default:
        combinations = [
          { parts: [supplied] },
          { parts: [target, source, 'audio clip'], anchored: true },
        ];
    }

    return Array.from(
      new Set(
        combinations
          .filter((combination) => !combination.anchored || hasAnchor)
          .map((combination) =>
            combination.parts.filter(Boolean).join(' ').trim(),
          )
          .filter(Boolean),
      ),
    ).slice(0, 6);
  }

  private clean(value?: string): string | undefined {
    return value?.trim().replace(/\s+/g, ' ') || undefined;
  }
}
