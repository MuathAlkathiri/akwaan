import { Injectable } from '@nestjs/common';
import type {
  KnowledgeUnit,
  ResearchRequest,
} from '../domain/knowledge-unit.types';
import { KnowledgeNormalizerService } from './knowledge-normalizer.service';

@Injectable()
export class EvidenceEvaluatorService {
  constructor(private readonly normalizer: KnowledgeNormalizerService) {}
  evaluate(request: ResearchRequest, units: KnowledgeUnit[]) {
    const byClaim = new Map<string, KnowledgeUnit[]>();
    for (const unit of units) {
      const key = this.normalizer.normalizeText(unit.fact);
      byClaim.set(key, [...(byClaim.get(key) ?? []), unit]);
    }
    let conflictCount = 0;
    for (const candidates of byClaim.values()) {
      const answers = new Set(
        candidates.map((unit) =>
          this.normalizer.normalizeText(unit.canonicalAnswer),
        ),
      );
      if (answers.size > 1) {
        conflictCount += 1;
        candidates.forEach((unit) => (unit.status = 'conflicted'));
      }
    }
    const accepted = units.filter((unit) => this.accept(request, unit));
    return {
      accepted,
      rejectedCount: units.length - accepted.length,
      conflictCount,
    };
  }
  private accept(request: ResearchRequest, unit: KnowledgeUnit) {
    if (unit.status !== 'verified' || unit.confidence < 0.55) return false;
    if (
      !unit.evidence.length ||
      unit.evidence.some((evidence) => !evidence.url || !evidence.excerpt)
    )
      return false;
    const groups = new Set(
      unit.evidence.map(
        (evidence) => evidence.independenceGroup ?? evidence.sourceId,
      ),
    );
    const authoritative = unit.evidence.some(
      (evidence) =>
        evidence.sourceType === 'structured-data' ||
        evidence.sourceType === 'local' ||
        (evidence.sourceType === 'encyclopedia' &&
          evidence.trustScore >= 0.75) ||
        evidence.url.startsWith('knowledge://') ||
        evidence.provider.includes('local'),
    );
    if (request.pack.freshnessPolicy === 'live') return groups.size >= 2;
    if (request.pack.verificationPolicy === 'required')
      return authoritative || groups.size >= 2;
    return true;
  }
}
