import { Injectable } from '@nestjs/common';
import type {
  CuratedQuestionCandidate,
  GenerationDiagnostic,
  GenerationPlanSlot,
} from './ai-generation-pipeline.types';
import type { SourceQuestionCandidate } from '../domain/question-source.types';
import { SourceQuestionNormalizerService } from './source-question-normalizer.service';

@Injectable()
export class SourceCuratedQuestionValidatorService {
  constructor(private readonly normalizer: SourceQuestionNormalizerService) {}
  validate(
    candidate: CuratedQuestionCandidate,
    source: SourceQuestionCandidate,
    slot: GenerationPlanSlot,
  ): GenerationDiagnostic[] {
    const issues: GenerationDiagnostic[] = [];
    const add = (code: string, message?: string) =>
      issues.push({ code, stage: 'source-validation', message });
    if (!candidate.question?.trim()) add('QUESTION_REQUIRED');
    if (!candidate.answer?.trim()) add('ANSWER_REQUIRED');
    if (
      candidate.gameMode !== 'trivia' ||
      candidate.type !== 'text' ||
      candidate.assetRequest
    )
      add('SOURCE_MODE_CHANGED');
    if (candidate.difficulty !== slot.difficulty)
      add('SOURCE_DIFFICULTY_CHANGED');
    if (candidate.sourceFingerprint !== source.fingerprint)
      add('SOURCE_FINGERPRINT_CHANGED');
    if (
      candidate.sourceIds?.length !== 1 ||
      candidate.sourceIds[0] !== source.sourceId
    )
      add('SOURCE_ID_CHANGED');
    if (
      !source.sourceId ||
      !source.sourceQuestionId ||
      !source.sourceUrl ||
      !source.sourceCategory
    )
      add('SOURCE_PROVENANCE_MISSING');
    const answer = this.normalizer.key(candidate.answer);
    if (source.originalType === 'boolean') {
      const expected =
        source.normalizedCorrectAnswer === 'true'
          ? this.normalizer.key('صح')
          : source.normalizedCorrectAnswer === 'false'
            ? this.normalizer.key('خطأ')
            : '';
      if (!expected || answer !== expected) add('BOOLEAN_ANSWER_INVALID');
    }
    if (
      source.originalType !== 'boolean' &&
      candidate.question &&
      candidate.answer &&
      this.normalizer.key(candidate.question).includes(answer)
    )
      add('ANSWER_LEAKAGE');
    if (
      /\b(?:which\s+of\s+the\s+following|all\s+of\s+the\s+above|none\s+of\s+the\s+above)\b/i.test(
        candidate.question,
      ) ||
      /(?:أي\s+(?:من\s+)?(?:الخيارات|الآتي|التالي)|جميع\s+ما\s+سبق|لا\s+شيء\s+مما\s+سبق)/u.test(
        candidate.question,
      )
    )
      add('OPTION_DEPENDENT_QUESTION');
    if (
      /(?:^|\s)[A-D][).:]\s|(?:^|\s)[أ-د][).:]\s|\boption\s+[A-D]\b|الخيار\s+[أ-د]/iu.test(
        candidate.question,
      )
    )
      add('MULTIPLE_CHOICE_MARKERS_REMAIN');
    const renderedText = `${candidate.question ?? ''} ${candidate.answer ?? ''}`;
    if (/&(?:#\d+|#x[0-9a-f]+|[a-z]+);/i.test(renderedText))
      add('HTML_ENTITY_REMAINS');
    if (/<[^>]+>/.test(renderedText)) add('MALFORMED_MARKUP_REMAINS');
    if (candidate.curationStatus === 'REJECT') add('SOURCE_STRUCTURE_UNUSABLE');
    if (candidate.question?.trim() && !this.isClearlyArabic(candidate.question))
      add('OUTPUT_LANGUAGE_MISMATCH');
    return issues;
  }

  private isClearlyArabic(value: string): boolean {
    const arabic = (value.match(/[\p{Script=Arabic}]/gu) ?? []).length;
    const letters = (value.match(/\p{L}/gu) ?? []).length;
    return letters > 0 && arabic / letters >= 0.55;
  }
}
