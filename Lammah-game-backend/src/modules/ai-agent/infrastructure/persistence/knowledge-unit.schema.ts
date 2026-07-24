import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({ timestamps: true, collection: 'ai_knowledge_units' })
export class KnowledgeUnitRecord {
  @Prop({ required: true }) cacheKey!: string;
  @Prop({ required: true }) packId!: string;
  @Prop({ required: true }) topicIntent!: string;
  @Prop({ required: true }) fact!: string;
  @Prop({ required: true }) canonicalAnswer!: string;
  @Prop({ type: [String], default: [] }) acceptedAnswers!: string[];
  @Prop({ type: [String], default: [] }) entities!: string[];
  @Prop({ type: [Object], default: [] }) evidence!: Record<string, unknown>[];
  @Prop({ required: true }) confidence!: number;
  @Prop({ enum: ['verified', 'conflicted', 'rejected'], required: true })
  status!: string;
  @Prop({ required: true }) factHash!: string;
  @Prop({ required: true, index: true }) expiresAt!: Date;
}

export type KnowledgeUnitDocument = HydratedDocument<KnowledgeUnitRecord>;
export const KnowledgeUnitSchema =
  SchemaFactory.createForClass(KnowledgeUnitRecord);
KnowledgeUnitSchema.index({ cacheKey: 1, factHash: 1 }, { unique: true });
KnowledgeUnitSchema.index({ cacheKey: 1, status: 1, expiresAt: 1 });
