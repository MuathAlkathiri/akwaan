import { Injectable } from '@nestjs/common';
import { QuestionsService } from '../questions.service';
import { BulkQuestionActionDto } from '../dto/review-question.dto';

@Injectable()
export class ReviewQuestionService {
  constructor(private readonly questions: QuestionsService) {}
  bulkAction(dto: BulkQuestionActionDto) {
    return this.questions.bulkAction(dto.ids, dto.action);
  }
}
