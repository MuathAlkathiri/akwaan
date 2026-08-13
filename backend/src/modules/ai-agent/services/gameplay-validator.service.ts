import { Injectable } from '@nestjs/common';
import {
  AssetRequest,
  AssetStatus,
  GameMode,
  QuestionAssetType,
} from '../contracts/asset-provider.interface';
import { normalizeAssetRequestIntent } from '../application/asset-request-normalizer';

export type GameplayDraft = {
  question: string;
  gameMode: GameMode;
  type: QuestionAssetType;
  assetRequest: AssetRequest | null;
  assetStatus: AssetStatus;
  issues: string[];
  wasGameplayAutoFixed?: boolean;
  gameplayFixReason?: string;
};

@Injectable()
export class GameplayValidatorService {
  normalize<T extends GameplayDraft>(draft: T, maxAudioDuration = 6): T {
    let normalized = {
      ...draft,
      issues: [...draft.issues],
    };

    normalized = this.fixTriviaLikeQuestion(normalized);
    normalized = this.normalizeByGameMode(normalized, maxAudioDuration);

    return {
      ...normalized,
      issues: Array.from(new Set(normalized.issues)),
      assetStatus: normalized.assetRequest ? 'PENDING' : 'NOT_REQUIRED',
    };
  }

  private fixTriviaLikeQuestion<T extends GameplayDraft>(draft: T): T {
    if (
      draft.gameMode === 'identifyCharacter' &&
      draft.type === 'text' &&
      this.looksLikeTrivia(draft.question)
    ) {
      return this.autoFix(draft, {
        gameMode: 'trivia',
        type: 'text',
        assetRequest: null,
        reason:
          'identifyCharacter question looked like text trivia, so it was normalized to trivia',
      });
    }

    return draft;
  }

  private normalizeByGameMode<T extends GameplayDraft>(
    draft: T,
    maxAudioDuration: number,
  ): T {
    switch (draft.gameMode) {
      case 'trivia':
        return this.autoFix(draft, {
          type: 'text',
          assetRequest: null,
          reason: draft.type !== 'text' ? 'trivia requires text type' : '',
        });

      case 'identifyVoice':
      case 'identifySong':
      case 'identifySinger':
      case 'identifyMusicIntro':
        if (draft.type !== 'audio') {
          if (draft.assetRequest?.type === 'audio') {
            draft = this.autoFix(draft, {
              type: 'audio',
              reason: 'identifyVoice requires audio type',
            });
          } else {
            draft.issues.push('identifyVoice requires audio asset');
          }
        }

        if (!draft.assetRequest) {
          draft.issues.push('identifyVoice requires assetRequest');
        } else {
          draft.assetRequest = {
            ...draft.assetRequest,
            type: 'audio',
            duration: Math.min(
              maxAudioDuration,
              Number(draft.assetRequest.duration) || maxAudioDuration,
            ),
          };
          draft.assetRequest = normalizeAssetRequestIntent(
            draft.assetRequest,
            draft.gameMode,
          );

          if (
            draft.gameMode === 'identifyVoice' &&
            !draft.assetRequest.entity
          ) {
            draft.issues.push(
              'VOICE_ENTITY_REQUIRED: identifyVoice requires assetRequest entity',
            );
          }
        }

        return draft;

      case 'identifyCharacter':
        if (!['image', 'video'].includes(draft.type)) {
          draft = this.autoFix(draft, {
            type: 'image',
            reason: 'identifyCharacter requires image or video type',
          });
        }

        if (!draft.assetRequest) {
          draft.issues.push(
            'identifyCharacter requires image or video assetRequest',
          );
        } else {
          draft.assetRequest = {
            ...draft.assetRequest,
            type: draft.type,
            duration:
              draft.type === 'video'
                ? Math.min(
                    maxAudioDuration,
                    Number(draft.assetRequest.duration) || maxAudioDuration,
                  )
                : draft.assetRequest.duration,
          };

          if (!draft.assetRequest.entity && !draft.assetRequest.context) {
            draft.issues.push(
              'identifyCharacter requires assetRequest entity or context',
            );
          }
        }

        return draft;

      case 'identifyImage':
        if (draft.type !== 'image') {
          draft = this.autoFix(draft, {
            type: 'image',
            reason: 'identifyImage requires image type',
          });
        }

        if (!draft.assetRequest) {
          draft.issues.push('identifyImage requires image assetRequest');
        }

        return draft;

      case 'completeQuote':
        if (!['quote', 'text'].includes(draft.type)) {
          draft = this.autoFix(draft, {
            type: 'quote',
            reason: 'completeQuote requires quote or text type',
          });
        }

        return draft;

      case 'timeline':
        if (!['timeline', 'text'].includes(draft.type)) {
          draft = this.autoFix(draft, {
            type: 'timeline',
            reason: 'timeline gameMode requires timeline or text type',
          });
        }

        return draft;

      case 'emojiPuzzle':
        if (draft.type !== 'emoji') {
          draft = this.autoFix(draft, {
            type: 'emoji',
            reason: 'emojiPuzzle requires emoji type',
          });
        }

        if (!draft.question.match(/\p{Emoji}/u) && !draft.assetRequest) {
          draft.issues.push('emojiPuzzle requires emoji clue or assetRequest');
        }

        return draft;
    }
  }

  private looksLikeTrivia(question: string): boolean {
    return /^(أي|ما|من|متى|أين|كم|لماذا|كيف)\s/.test(question.trim());
  }

  private autoFix<T extends GameplayDraft>(
    draft: T,
    fix: Partial<Pick<GameplayDraft, 'gameMode' | 'type' | 'assetRequest'>> & {
      reason: string;
    },
  ): T {
    if (!fix.reason) {
      return draft;
    }

    return {
      ...draft,
      ...fix,
      wasGameplayAutoFixed: true,
      gameplayFixReason: fix.reason,
      issues: Array.from(new Set([...draft.issues, fix.reason])),
    };
  }
}
