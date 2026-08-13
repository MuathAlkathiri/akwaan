import { Injectable } from '@nestjs/common';
import {
  CreateQuestionDto,
  UpdateQuestionDto,
} from '../dto/create-question.dto';
import { QuestionsService } from '../questions.service';
import { QuestionLifecyclePolicy } from '../policies/question-lifecycle.policy';
import type { UploadedImageFile } from '../../../common/uploads/local-image-storage.service';

@Injectable()
export class MutateQuestionService {
  constructor(
    private readonly questions: QuestionsService,
    private readonly lifecycle: QuestionLifecyclePolicy,
  ) {}
  create(dto: CreateQuestionDto, image?: UploadedImageFile) {
    return this.questions.create(dto, image);
  }
  update(id: string, dto: UpdateQuestionDto) {
    if (dto.status) this.lifecycle.assertKnownStatus(dto.status);
    return this.questions.update(id, dto);
  }
  uploadImage(id: string, file: UploadedImageFile) {
    return this.questions.uploadImage(id, file);
  }

  uploadBombItemImage(file: UploadedImageFile) {
    return this.questions.uploadBombItemImage(file);
  }
  removeImage(id: string) {
    return this.questions.removeImage(id);
  }
  delete(id: string) {
    return this.questions.delete(id);
  }
}
