import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import { QuestionAudioRequest } from '../schemas/question.schema';

export type ProcessingAudioRequest = Pick<
  QuestionAudioRequest,
  | 'kind'
  | 'searchQuery'
  | 'targetName'
  | 'sourceTitle'
  | 'language'
  | 'preferredDurationSeconds'
  | 'preferredStartSeconds'
  | 'provider'
>;

@Injectable()
export class AudioRequestIdentityService {
  create(
    request: ProcessingAudioRequest,
    requestVersion: number,
  ): QuestionAudioRequest {
    const normalized = this.normalize(request);
    return {
      ...normalized,
      requestVersion: Math.max(1, Math.trunc(requestVersion)),
      requestHash: this.hash(normalized),
      requestedAt: new Date().toISOString(),
      selectedCandidateId: null,
      candidateSetVersion: null,
    };
  }

  hash(request: ProcessingAudioRequest): string {
    const normalized = this.normalize(request);
    return createHash('sha256')
      .update(
        JSON.stringify([
          normalized.kind,
          normalized.searchQuery,
          normalized.targetName ?? '',
          normalized.sourceTitle ?? '',
          normalized.language ?? '',
          normalized.preferredDurationSeconds ?? null,
          normalized.preferredStartSeconds ?? null,
          normalized.provider ?? '',
        ]),
      )
      .digest('hex');
  }

  same(left: ProcessingAudioRequest, right: ProcessingAudioRequest): boolean {
    return this.hash(left) === this.hash(right);
  }

  ensure(request: QuestionAudioRequest): QuestionAudioRequest {
    const version = Math.max(1, Math.trunc(request.requestVersion ?? 1));
    const normalized = this.normalize(request);
    return {
      ...request,
      ...normalized,
      requestVersion: version,
      requestHash: request.requestHash || this.hash(normalized),
      requestedAt: request.requestedAt || new Date().toISOString(),
      selectedCandidateId: request.selectedCandidateId ?? null,
      candidateSetVersion: request.candidateSetVersion ?? null,
    };
  }

  private normalize(request: ProcessingAudioRequest): ProcessingAudioRequest {
    const optional = (value?: string) => {
      const normalized = value?.trim().replace(/\s+/g, ' ');
      return normalized || undefined;
    };
    return {
      kind: request.kind,
      searchQuery: request.searchQuery.trim().replace(/\s+/g, ' '),
      targetName: optional(request.targetName),
      sourceTitle: optional(request.sourceTitle),
      language: optional(request.language)?.toLowerCase(),
      preferredDurationSeconds: request.preferredDurationSeconds,
      preferredStartSeconds: request.preferredStartSeconds ?? null,
      provider: optional(request.provider)?.toLowerCase(),
    };
  }
}
