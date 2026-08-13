import type { Question } from "@/types";
import type { QuestionAudioRequestDto } from "@/api/generated/models"

type QuestionAudioRequest =
  NonNullable<Question["audioRequest"]>;

export function mapQuestionAudioRequestToDto(
  request: QuestionAudioRequest,
): QuestionAudioRequestDto {
  return {
    kind: request.kind,
    searchQuery: request.searchQuery,
    targetName: request.targetName ?? undefined,
    sourceTitle: request.sourceTitle ?? undefined,
    language: request.language ?? undefined,
    preferredDurationSeconds:
      request.preferredDurationSeconds ?? undefined,
    preferredStartSeconds:
      request.preferredStartSeconds ?? undefined,
    provider: request.provider ?? undefined,
  };
}