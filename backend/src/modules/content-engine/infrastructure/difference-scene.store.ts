import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { EngineDifferenceSceneDocument } from '../schemas/engine-difference-scene.schema';

/** A drawing larger than this is not kept: a document has a size limit. */
const MAX_KEPT_BYTES = 8 * 1024 * 1024;

/**
 * Keeps each scene's one drawing. Best-effort in both directions: a drawing
 * that cannot be read is drawn again, and one that cannot be kept is only
 * paid for again next time.
 */
@Injectable()
export class DifferenceSceneStore {
  constructor(
    @InjectModel(EngineDifferenceSceneDocument.name)
    private readonly scenes: Model<EngineDifferenceSceneDocument>,
  ) {}

  async get(key: string): Promise<Buffer | undefined> {
    try {
      const found = await this.scenes.findOne({ key }).lean().exec();
      if (!found?.png) return undefined;
      // A lean read hands back the driver's Binary, not a Buffer.
      const png = found.png as unknown as { buffer?: Buffer } | Buffer;
      return Buffer.isBuffer(png) ? png : Buffer.from(png.buffer ?? []);
    } catch {
      return undefined;
    }
  }

  async put(key: string, model: string, png: Buffer): Promise<void> {
    if (png.length > MAX_KEPT_BYTES) return;
    try {
      await this.scenes
        .updateOne(
          { key },
          { $setOnInsert: { key, model, png } },
          { upsert: true },
        )
        .exec();
    } catch {
      // Not kept; the next item draws it again.
    }
  }
}
