import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import type { KnowledgeUnit } from '../../domain/knowledge-unit.types';
import {
  KnowledgeUnitRecord,
  type KnowledgeUnitDocument,
} from './knowledge-unit.schema';

@Injectable()
export class KnowledgeUnitRepository {
  constructor(
    @InjectModel(KnowledgeUnitRecord.name)
    private readonly model: Model<KnowledgeUnitDocument>,
  ) {}

  async findFresh(cacheKey: string): Promise<KnowledgeUnit[]> {
    const rows = await this.model
      .find({ cacheKey, status: 'verified', expiresAt: { $gt: new Date() } })
      .lean();
    return rows.map(
      (row) => ({ ...row, id: String(row._id) }) as unknown as KnowledgeUnit,
    );
  }

  async putMany(units: KnowledgeUnit[]): Promise<void> {
    await Promise.all(
      units.map((unit) =>
        this.model.updateOne(
          { cacheKey: unit.cacheKey, factHash: unit.factHash },
          { $set: unit },
          { upsert: true },
        ),
      ),
    );
  }
}
