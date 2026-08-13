import { Injectable } from '@nestjs/common';
import type { CategoryGenerationProfile } from './category-generation-profile.registry';
import type {
  GenerationPlanSlot,
  GenerationDiagnostic,
  PipelineQuestionCandidate,
  FactCandidate,
} from './ai-generation-pipeline.types';

@Injectable()
export class DeterministicQuestionValidatorService {
  validateGenerated(
    candidate: PipelineQuestionCandidate,
    slot: GenerationPlanSlot,
    profile: CategoryGenerationProfile,
  ): GenerationDiagnostic[] {
    const placeholderFact: FactCandidate = {
      id: 'optional-source',
      fact: candidate.explanation,
      canonicalAnswer: candidate.answer,
      acceptedAnswerHints: candidate.acceptedAnswers,
      entities: [candidate.answer],
      source: {
        title: 'optional-source',
        url: 'internal://optional-source',
        excerpt: candidate.explanation,
      },
      sources: [
        {
          sourceId: 'optional-source',
          title: 'optional-source',
          url: 'internal://optional-source',
          excerpt: candidate.explanation,
        },
      ],
      confidence: 0,
    };
    return this.validate(
      {
        ...candidate,
        knowledgeFactIds: ['optional-source'],
        sourceIds: ['optional-source'],
      },
      placeholderFact,
      slot,
      profile,
    ).filter(
      (issue) =>
        ![
          'SOURCE_METADATA_REQUIRED',
          'UNKNOWN_KNOWLEDGE_FACT_ID',
          'UNKNOWN_SOURCE_ID',
        ].includes(issue.code),
    );
  }

  validate(
    candidate: PipelineQuestionCandidate,
    fact: FactCandidate,
    slot: GenerationPlanSlot,
    profile: CategoryGenerationProfile,
  ): GenerationDiagnostic[] {
    const issues: GenerationDiagnostic[] = [];
    const add = (code: string, message?: string) =>
      issues.push({ code, stage: 'validation', message });
    if (!candidate.question.trim()) add('QUESTION_REQUIRED');
    if (!candidate.answer.trim()) add('ANSWER_REQUIRED');
    if (candidate.question.length > 500) add('QUESTION_TOO_LONG');
    if (candidate.answer.length > 200) add('ANSWER_TOO_LONG');
    if (
      candidate.answer.trim() &&
      this.norm(candidate.question).includes(this.norm(candidate.answer))
    )
      add('ANSWER_LEAKAGE');
    if (
      !profile.allowedGameModes.includes(candidate.gameMode) ||
      candidate.gameMode !== slot.gameMode
    )
      add('UNSUPPORTED_GAME_MODE');
    if (!profile.supportedAssetTypes.includes(candidate.type))
      add('UNSUPPORTED_ASSET_TYPE');
    if (candidate.type !== 'text' && !candidate.assetRequest)
      add('ASSET_REQUEST_REQUIRED');
    if (!fact.source.url || !fact.source.title || !fact.source.excerpt)
      add('SOURCE_METADATA_REQUIRED');
    if (
      candidate.knowledgeFactIds?.length !== 1 ||
      candidate.knowledgeFactIds[0] !== fact.id
    )
      add('UNKNOWN_KNOWLEDGE_FACT_ID');
    const allowedSourceIds = new Set(
      fact.sources?.length
        ? fact.sources.map((source) => source.sourceId)
        : [fact.source.url],
    );
    if (
      !candidate.sourceIds?.length ||
      candidate.sourceIds.some((sourceId) => !allowedSourceIds.has(sourceId))
    )
      add('UNKNOWN_SOURCE_ID');
    if (this.norm(candidate.answer) !== this.norm(fact.canonicalAnswer))
      add('CANONICAL_ANSWER_CHANGED');
    for (const pattern of profile.forbiddenQuestionPhrases ?? [])
      if (this.norm(candidate.question).includes(this.norm(pattern)))
        add('BANNED_PATTERN');
    return issues;
  }
  private norm(value: string) {
    return value
      .toLowerCase()
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/[^\u0600-\u06ffA-Za-z0-9]+/g, '');
  }
}
