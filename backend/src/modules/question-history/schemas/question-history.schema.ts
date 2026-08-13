import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema()
export class QuestionHistory extends Document {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  user: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Question', required: true, index: true })
  question: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Game', required: true })
  game: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Category', required: true })
  category: Types.ObjectId;

  @Prop({ default: Date.now })
  seenAt: Date;
}

export const QuestionHistorySchema =
  SchemaFactory.createForClass(QuestionHistory);

QuestionHistorySchema.index({ user: 1, question: 1 });
