import { Injectable } from '@nestjs/common';
import { QuestionsService } from '../questions.service';

@Injectable()
export class QuestionAssetRetryService {
  constructor(private readonly questions: QuestionsService) {}
  retry(id: string, target: 'primary' | 'cover') {
    return this.questions.retryAsset(id, target);
  }
}
