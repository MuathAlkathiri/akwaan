import type {
  EntityVerificationRequest,
  VerifiedEntity,
} from '../application/entity-verification.types';

export const ENTITY_RESEARCH_PROVIDER = Symbol('ENTITY_RESEARCH_PROVIDER');

export interface EntityResearchProvider {
  verifyEntity(request: EntityVerificationRequest): Promise<VerifiedEntity>;
  health?(): Promise<{ available: boolean; researchToolAvailable: boolean }>;
}
