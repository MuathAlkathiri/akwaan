import { Injectable } from '@nestjs/common';
import { QuestionsService } from '../questions.service';
import { QueryQuestionsDto } from '../dto/query-questions.dto';

@Injectable()
export class QueryQuestionsService {
  constructor(private readonly questions: QuestionsService) {}

  listPublic() {
    return this.questions.findAll();
  }
  listAdmin() {
    return this.questions.findAllWithAnswers();
  }

  bombReadiness(categoryId: string) {
    return this.questions.bombReadiness(categoryId);
  }
  listAiGenerated(filters: QueryQuestionsDto) {
    return this.questions.findAiGenerated(filters);
  }
  getPublic(id: string) {
    return this.questions.findById(id);
  }
  getAdmin(id: string) {
    return this.questions.findByIdWithAnswer(id);
  }
}
