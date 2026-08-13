import type {
  EntityVerificationRequest,
  VerifiedEntity,
} from './entity-verification.types';

export class EntityVerificationPolicy {
  requiresExternalVerification(request: EntityVerificationRequest): boolean {
    return (
      !request.locallyGrounded &&
      (request.intendedAsset !== 'none' ||
        Boolean(request.proposedEntity) ||
        Boolean(request.artist) ||
        Boolean(request.franchise))
    );
  }

  maySearchProviders(
    entity: VerifiedEntity,
    request?: EntityVerificationRequest,
  ): boolean {
    if (entity.verificationStatus === 'VERIFIED') return true;
    if (
      request?.intendedAsset === 'video' &&
      entity.verificationStatus === 'PARTIALLY_VERIFIED' &&
      entity.evidence.length >= 4 &&
      entity.confidence.identity >= 0.6 &&
      entity.confidence.answer >= 0.6 &&
      (!request.franchise || entity.confidence.association >= 0.55)
    ) {
      return true;
    }
    return (
      entity.verificationStatus === 'PARTIALLY_VERIFIED' &&
      entity.confidence.identity >= 0.85 &&
      entity.confidence.answer >= 0.85
    );
  }
}

export const entityVerificationPolicy = new EntityVerificationPolicy();
