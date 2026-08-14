import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type {
  OtpChallenge,
  OtpChallengeRepository,
} from '../domain/otp-challenge.repository';
import { OtpChallengeDocument } from './otp-challenge.schema';

@Injectable()
export class MongooseOtpChallengeRepository implements OtpChallengeRepository {
  constructor(
    @InjectModel(OtpChallengeDocument.name)
    private readonly model: Model<OtpChallengeDocument>,
  ) {}

  async issue(input: {
    normalizedIdentifier: string;
    identifierType: 'email' | 'phone';
    codeHash: string;
    expiresAt: Date;
    issuedAt: Date;
    issuanceCount: number;
    requestIp: string | null;
  }): Promise<OtpChallenge> {
    // Invalidate first. If the insert then fails the user simply has no live
    // code, which is recoverable; the reverse order would leave two codes
    // valid at once, which is not.
    await this.model
      .updateMany(
        {
          normalizedIdentifier: input.normalizedIdentifier,
          purpose: 'login',
          consumedAt: null,
          invalidatedAt: null,
        },
        { $set: { invalidatedAt: input.issuedAt } },
      )
      .exec();

    const created = await this.model.create({
      normalizedIdentifier: input.normalizedIdentifier,
      identifierType: input.identifierType,
      purpose: 'login',
      codeHash: input.codeHash,
      expiresAt: input.expiresAt,
      consumedAt: null,
      invalidatedAt: null,
      issuedAt: input.issuedAt,
      issuanceCount: input.issuanceCount,
      requestIp: input.requestIp,
    });
    return toDomain(created);
  }

  async findLatest(normalizedIdentifier: string): Promise<OtpChallenge | null> {
    const found = await this.model
      .findOne({ normalizedIdentifier, purpose: 'login' })
      .sort({ createdAt: -1 })
      .exec();
    return found ? toDomain(found) : null;
  }

  async findActive(normalizedIdentifier: string): Promise<OtpChallenge | null> {
    const found = await this.model
      .findOne({
        normalizedIdentifier,
        purpose: 'login',
        consumedAt: null,
        invalidatedAt: null,
      })
      .sort({ createdAt: -1 })
      .exec();
    return found ? toDomain(found) : null;
  }

  async consume(id: string, consumedAt: Date): Promise<boolean> {
    // `consumedAt: null` in the filter is the whole mechanism: Mongo applies
    // one document update atomically, so of two concurrent verifications only
    // the first matches and the second modifies nothing.
    const result = await this.model
      .updateOne({ _id: id, consumedAt: null }, { $set: { consumedAt } })
      .exec();
    return result.modifiedCount === 1;
  }
}

function toDomain(document: OtpChallengeDocument): OtpChallenge {
  return {
    id: String(document._id),
    normalizedIdentifier: document.normalizedIdentifier,
    identifierType: document.identifierType,
    purpose: document.purpose,
    codeHash: document.codeHash,
    expiresAt: new Date(document.expiresAt),
    consumedAt: document.consumedAt ? new Date(document.consumedAt) : null,
    invalidatedAt: document.invalidatedAt
      ? new Date(document.invalidatedAt)
      : null,
    issuedAt: new Date(document.issuedAt),
    issuanceCount: document.issuanceCount,
  };
}
