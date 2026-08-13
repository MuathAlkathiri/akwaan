import { GameResponseDto } from '../dto/game-response.dto';
import { resolveQuestionMediaAvailability } from '../../questions/application/question-media-availability.policy';
import { defaultTeamColor } from '../team-colors';

export class GameResponseMapper {
  static toResponse(value: unknown): GameResponseDto {
    const source = this.sanitize(this.toPlain(value)) as Record<
      string,
      unknown
    >;
    const { __v: _version, ...safe } = source;
    void _version;
    const board = Array.isArray(safe.board)
      ? safe.board.map((categoryBoard) =>
          this.withPresentation(categoryBoard as Record<string, unknown>),
        )
      : [];
    return {
      ...safe,
      _id: String(safe._id ?? ''),
      name: String(safe.name ?? ''),
      status: String(safe.status ?? ''),
      teams: Array.isArray(safe.teams)
        ? safe.teams.map((team, index) => ({
            ...(team as Record<string, unknown>),
            color:
              (team as Record<string, unknown>).color ??
              defaultTeamColor(index),
          }))
        : [],
      selectedCategories: Array.isArray(safe.selectedCategories)
        ? safe.selectedCategories
        : [],
      board,
      currentTurnTeamIndex: Number(safe.currentTurnTeamIndex ?? 0),
    } as unknown as GameResponseDto;
  }

  private static withPresentation(categoryBoard: Record<string, unknown>) {
    if (!Array.isArray(categoryBoard.questions)) return categoryBoard;
    return {
      ...categoryBoard,
      questions: categoryBoard.questions.map((value) => {
        if (!value || typeof value !== 'object') return value;
        const item = value as Record<string, unknown>;
        if (!item.question || typeof item.question !== 'object') return item;
        const question = item.question as Record<string, unknown>;
        const { snapshot: _snapshot, ...publicItem } = item;
        void _snapshot;
        const {
          primaryAsset: _primaryAsset,
          audioAsset: _audioAsset,
          mediaUrl: _mediaUrl,
          mediaKey: _mediaKey,
          audioStatus: _audioStatus,
          audioReviewStatus: _audioReviewStatus,
          audioRequest: _audioRequest,
          audioRequestStale: _audioRequestStale,
          audioCandidates: _audioCandidates,
          audioDiagnostics: _audioDiagnostics,
          assetStatus: _assetStatus,
          assetFailureReason: _assetFailureReason,
          assetFailureStep: _assetFailureStep,
          assetFailureDiagnostics: _assetFailureDiagnostics,
          primaryAssetRequest: _primaryAssetRequest,
          coverImageRequest: _coverImageRequest,
          ...playerQuestion
        } = question;
        void _primaryAsset;
        void _audioAsset;
        void _mediaUrl;
        void _mediaKey;
        void _audioStatus;
        void _audioReviewStatus;
        void _audioRequest;
        void _audioRequestStale;
        void _audioCandidates;
        void _audioDiagnostics;
        void _assetStatus;
        void _assetFailureReason;
        void _assetFailureStep;
        void _assetFailureDiagnostics;
        void _primaryAssetRequest;
        void _coverImageRequest;
        const publicQuestion = this.withAnswerVisibility(
          playerQuestion,
          item.isAnswerRevealed === true,
        );
        if (item.presentation)
          return { ...publicItem, question: publicQuestion };
        const availability = resolveQuestionMediaAvailability(
          this.withoutUnverifiedLegacyImage(question),
        );
        return {
          ...publicItem,
          question: publicQuestion,
          presentation: {
            preferredType: availability.preferredPresentationType,
            type: availability.effectivePresentationType,
            mediaAvailable: availability.mediaAvailable,
            ...(availability.mediaUrl
              ? { mediaUrl: availability.mediaUrl }
              : {}),
            ...(availability.resolvedMedia?.duration
              ? { mediaDuration: availability.resolvedMedia.duration }
              : {}),
            ...(availability.mediaFallbackReason
              ? { fallbackReason: availability.mediaFallbackReason }
              : {}),
          },
        };
      }),
    };
  }

  static toResponseList(values: unknown[]): GameResponseDto[] {
    return values.map((value) => this.toResponse(value));
  }

  private static withAnswerVisibility(
    question: Record<string, unknown>,
    revealed: boolean,
  ): Record<string, unknown> {
    if (revealed) return question;
    const {
      answer: _answer,
      correctAnswer: _correctAnswer,
      acceptedAnswers: _acceptedAnswers,
      wrongAnswers: _wrongAnswers,
      explanation: _explanation,
      rankedList,
      ...safe
    } = question;
    void _answer;
    void _correctAnswer;
    void _acceptedAnswers;
    void _wrongAnswers;
    void _explanation;
    if (!rankedList || typeof rankedList !== 'object') return safe;
    const list = rankedList as Record<string, unknown>;
    return {
      ...safe,
      rankedList: {
        ...list,
        entries: Array.isArray(list.entries)
          ? list.entries.map((entry) => {
              if (!entry || typeof entry !== 'object') return entry;
              const {
                answer: _entryAnswer,
                aliases: _aliases,
                ...entrySafe
              } = entry as Record<string, unknown>;
              void _entryAnswer;
              void _aliases;
              return entrySafe;
            })
          : [],
      },
    };
  }

  /**
   * Older question transforms synthesized a primary image asset from mediaUrl.
   * That compatibility shape has no provider evidence and must not make an old
   * game expose unverified media. The text fallback remains playable.
   */
  private static withoutUnverifiedLegacyImage(
    question: Record<string, unknown>,
  ): Record<string, unknown> {
    const primaryAsset = question.primaryAsset;
    if (
      question.type !== 'image' ||
      !primaryAsset ||
      typeof primaryAsset !== 'object'
    )
      return question;
    const asset = primaryAsset as Record<string, unknown>;
    const isSynthesizedLegacyAsset =
      typeof question.mediaUrl === 'string' &&
      asset.url === question.mediaUrl &&
      asset.source === question.source &&
      !asset.provider;
    return isSynthesizedLegacyAsset
      ? { ...question, primaryAsset: undefined }
      : question;
  }

  private static toPlain(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object' && 'toObject' in value)
      return (value as { toObject(): Record<string, unknown> }).toObject();
    return (value ?? {}) as Record<string, unknown>;
  }

  private static sanitize(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((item) => this.sanitize(item));
    if (!value || typeof value !== 'object') return value;
    if (value.constructor?.name === 'ObjectId') return value;
    const source =
      'toObject' in value
        ? (value as { toObject(): Record<string, unknown> }).toObject()
        : (value as Record<string, unknown>);
    const asset = 'provider' in source && 'url' in source && 'type' in source;
    return Object.fromEntries(
      Object.entries(source)
        .filter(
          ([key]) =>
            key !== '__v' &&
            key !== 'localPath' &&
            (!asset || !['metadata', 'sourceUrl', 'searchQuery'].includes(key)),
        )
        .map(([key, item]) => [key, this.sanitize(item)]),
    );
  }
}
