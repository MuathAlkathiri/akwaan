import { Injectable } from '@nestjs/common';
import {
  LocalImageStorageService,
  UploadedImageFile,
} from '../../../common/uploads/local-image-storage.service';
import { ContentAssetRef } from '../domain/world-content.types';

export type WorldContentAssetKind =
  | 'worlds'
  | 'scopes'
  | 'challenge-types'
  | 'world-challenge-configurations'
  | 'content-items';

/**
 * Image handling for every World Content record.
 *
 * Uploads belong to the record that survives the write, so this stores the new
 * asset, runs the mutation, and only then discards the replaced file — cleaning
 * up the new file if the mutation fails. Shared by every service so the sequence
 * exists exactly once.
 */
@Injectable()
export class WorldContentAssetMutator {
  constructor(private readonly storage: LocalImageStorageService) {}

  async withAsset<TResult>(input: {
    kind: WorldContentAssetKind;
    field: string;
    data: Record<string, unknown>;
    file?: UploadedImageFile;
    previous?: ContentAssetRef;
    run: (data: Record<string, unknown>) => Promise<TResult>;
  }): Promise<TResult> {
    if (!input.file) return input.run(input.data);
    const asset = await this.save(input.file, input.kind);
    try {
      const result = await input.run({ ...input.data, [input.field]: asset });
      await this.discard(input.previous);
      return result;
    } catch (error) {
      await this.discard(asset);
      throw error;
    }
  }

  async discard(asset?: ContentAssetRef): Promise<void> {
    if (!asset?.path) return;
    await this.storage.delete(asset as { path: string });
  }

  private save(file: UploadedImageFile, kind: WorldContentAssetKind) {
    return this.storage.save(file, {
      directory: ['world-content', kind],
      filenamePrefix: kind.replace(/s$/, ''),
    });
  }
}
