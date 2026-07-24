import { Injectable } from '@nestjs/common';
import {
  AudioQuestionKind,
  QuestionAudioRequest,
} from '../schemas/question.schema';

@Injectable()
export class AudioSearchQueryBuilder {
  build(request: QuestionAudioRequest): string[] {
    const target = this.clean(request.targetName);
    const source = this.clean(request.sourceTitle);
    const supplied = this.clean(request.searchQuery);
    const language = this.clean(request.language);
    let combinations: Array<Array<string | undefined>>;

    switch (request.kind) {
      case AudioQuestionKind.IDENTIFY_SONG:
      case AudioQuestionKind.IDENTIFY_ARTIST:
        combinations = [
          [source, target, 'official audio'],
          [target, source, 'lyrics'],
          [supplied],
          [source, target, 'audio'],
        ];
        break;
      case AudioQuestionKind.IDENTIFY_CHARACTER:
      case AudioQuestionKind.IDENTIFY_VOICE:
        combinations = [
          [target, source, language, 'voice clip clean dialogue'],
          [target, source, 'character voice'],
          [target, source, 'voice lines'],
          [target, source, 'dialogue'],
          [target, source, 'صوت شخصية مقطع صوت'],
          [supplied],
        ];
        break;
      case AudioQuestionKind.IDENTIFY_GAME:
        combinations = [
          [target, source, 'game dialogue clip'],
          [target, source, 'voice line'],
          [supplied],
        ];
        break;
      case AudioQuestionKind.IDENTIFY_MOVIE:
      case AudioQuestionKind.IDENTIFY_DIALOGUE_SOURCE:
        combinations = [
          [target, source, 'scene audio dialogue clip'],
          [target, source, 'quote audio'],
          [supplied],
        ];
        break;
      case AudioQuestionKind.IDENTIFY_SOUND_EFFECT:
        combinations = [
          [target, source, 'sound effect clean'],
          [target, source, 'sound clip'],
          [supplied],
        ];
        break;
      default:
        combinations = [[supplied], [target, source, 'audio clip']];
    }

    return Array.from(
      new Set(
        combinations
          .map((parts) => parts.filter(Boolean).join(' ').trim())
          .filter(Boolean),
      ),
    ).slice(0, 6);
  }

  private clean(value?: string): string | undefined {
    return value?.trim().replace(/\s+/g, ' ') || undefined;
  }
}
