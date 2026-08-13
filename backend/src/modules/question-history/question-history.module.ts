import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  QuestionHistory,
  QuestionHistorySchema,
} from './schemas/question-history.schema';
import { QuestionHistoryService } from './question-history.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: QuestionHistory.name, schema: QuestionHistorySchema },
    ]),
  ],
  providers: [QuestionHistoryService],
  exports: [QuestionHistoryService],
})
export class QuestionHistoryModule {}
