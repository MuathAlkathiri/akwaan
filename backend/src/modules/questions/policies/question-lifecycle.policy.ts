import { BadRequestException, Injectable } from '@nestjs/common';
import { QuestionStatus } from '../schemas/question.schema';

/** Centralizes the lifecycle already accepted by the existing update endpoint. */
@Injectable()
export class QuestionLifecyclePolicy {
  private readonly statuses = new Set<string>(Object.values(QuestionStatus));

  assertKnownStatus(status: string): void {
    if (!this.statuses.has(status)) {
      throw new BadRequestException({
        code: 'INVALID_QUESTION_STATUS_TRANSITION',
        message: `Unsupported question status: ${status}`,
      });
    }
  }
}
