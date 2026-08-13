import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { QuestionHistory } from './schemas/question-history.schema';

@Injectable()
export class QuestionHistoryService {
  constructor(
    @InjectModel(QuestionHistory.name)
    private questionHistoryModel: Model<QuestionHistory>,
  ) {}

  async findSeenQuestionIds(
    userId: string | Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const history = await this.questionHistoryModel
      .find({ user: new Types.ObjectId(userId) })
      .select('question')
      .lean()
      .exec();

    return history.map((item) => item.question as Types.ObjectId);
  }

  async recordQuestions(
    userId: string | Types.ObjectId,
    gameId: string | Types.ObjectId,
    entries: { question: Types.ObjectId; category: Types.ObjectId }[],
  ): Promise<void> {
    if (entries.length === 0) {
      return;
    }

    await this.questionHistoryModel.insertMany(
      entries.map((entry) => ({
        user: new Types.ObjectId(userId),
        game: new Types.ObjectId(gameId),
        question: entry.question,
        category: entry.category,
        seenAt: new Date(),
      })),
    );
  }
}
