import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

/** Records intentional product-data deletion without touching runtime source. */
@Injectable()
export class ProductionMechanicLifecycleRepository {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async markDeleted(slug: string, challengeTypeId: string): Promise<void> {
    await this.connection.collection('production_mechanic_lifecycle').updateOne(
      { slug },
      {
        $set: {
          slug,
          challengeTypeId,
          deletedAt: new Date(),
          state: 'deleted_by_admin',
        },
      },
      { upsert: true },
    );
  }
}
