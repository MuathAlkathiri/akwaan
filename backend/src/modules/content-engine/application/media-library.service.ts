import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, isValidObjectId } from 'mongoose';
import { AuthenticatedUser } from '../../auth/auth.types';
import { BOMB_IMAGE_KINDS } from '../domain/candidate-media-intent';
import { subjectTokens } from '../domain/media-discovery';
import { EngineImageIngestionService } from '../infrastructure/engine-image-ingestion.service';
import { EngineMediaLibraryDocument } from '../schemas/engine-media-library.schema';

export const MEDIA_LIBRARY_PROVIDER = 'media-library';

export interface MediaLibraryEntryView {
  id: string;
  name: string;
  nameAr: string | null;
  aliases: string[];
  kind: string;
  asset: EngineMediaLibraryDocument['asset'];
  createdByEmail: string;
  createdAt: string | null;
}

/** A subject's name as a set of comparable words, order ignored. */
export function libraryKey(name: string): string {
  return [...new Set(subjectTokens(name))].sort().join(' ');
}

const STORAGE_FAILURES = new Set([
  'STORAGE_NOT_DURABLE',
  'STORAGE_LOCAL_WRITE_FAILED',
  'STORAGE_MIRROR_WRITE_FAILED',
]);

/**
 * The Admin's own pictures, by subject (see the schema for why it exists).
 *
 * Bytes go through the same verified, content-addressed ingestion as every
 * other engine image, so a library picture is stored exactly like one found
 * or uploaded on a candidate — and can be attached to a candidate as it is.
 */
@Injectable()
export class MediaLibraryService {
  constructor(
    @InjectModel(EngineMediaLibraryDocument.name)
    private readonly entries: Model<EngineMediaLibraryDocument>,
    private readonly ingestion: EngineImageIngestionService,
  ) {}

  async list(): Promise<MediaLibraryEntryView[]> {
    const rows = await this.entries
      .find()
      .sort({ kind: 1, name: 1 })
      .limit(1000)
      .lean()
      .exec();
    return rows.map((row) => this.view(row));
  }

  async add(
    input: { name?: string; nameAr?: string; aliases?: string; kind?: string },
    file: { buffer?: Buffer } | undefined,
    actor: AuthenticatedUser,
  ): Promise<MediaLibraryEntryView> {
    const name = input.name?.trim() ?? '';
    const kind = input.kind?.trim() || 'club-or-brand-mark';
    if (!name || !libraryKey(name)) {
      throw new BadRequestException({
        code: 'MEDIA_LIBRARY_NAME_REQUIRED',
        message: 'A subject name is required',
      });
    }
    if (!(BOMB_IMAGE_KINDS as readonly string[]).includes(kind)) {
      throw new BadRequestException({
        code: 'MEDIA_LIBRARY_KIND_INVALID',
        message: `kind must be one of ${BOMB_IMAGE_KINDS.join(', ')}`,
      });
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException({
        code: 'MEDIA_ASSET_REQUIRED',
        message: 'An image file is required',
      });
    }
    const nameAr = input.nameAr?.trim() || null;
    const aliases = (input.aliases ?? '')
      .split(/[,\n،]/)
      .map((alias) => alias.trim())
      .filter(Boolean)
      .slice(0, 20);
    const keys = [
      ...new Set(
        [name, nameAr ?? '', ...aliases].map(libraryKey).filter(Boolean),
      ),
    ];

    // One subject, one picture per kind: a second upload under a name another
    // entry already answers to would make which one is used a matter of luck.
    const clash = await this.entries
      .findOne({ kind, keys: { $in: keys } })
      .lean()
      .exec();
    if (clash) {
      throw new ConflictException({
        code: 'MEDIA_LIBRARY_SUBJECT_EXISTS',
        message: `"${clash.name}" is already in the library for this kind; delete it first to replace its picture`,
      });
    }

    const ingested = await this.ingestion.ingestBytes({
      bytes: file.buffer,
      acquisition: 'upload',
      provenance: { provider: MEDIA_LIBRARY_PROVIDER },
    });
    if (ingested.status !== 'resolved') {
      const body = { code: ingested.failureReason, message: ingested.detail };
      if (STORAGE_FAILURES.has(ingested.failureReason)) {
        throw new ServiceUnavailableException(body);
      }
      throw new UnprocessableEntityException(body);
    }

    const created = await this.entries.create({
      name,
      nameAr,
      aliases,
      kind,
      keys,
      asset: ingested.asset,
      createdBy: actor.id,
      createdByEmail: actor.email,
    });
    return this.view(created.toObject());
  }

  /** Removes the entry only. Candidates that already use the picture keep it. */
  async remove(id: string): Promise<{ id: string }> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException('Library entry not found');
    }
    const result = await this.entries.deleteOne({ _id: id }).exec();
    if (result.deletedCount !== 1) {
      throw new NotFoundException('Library entry not found');
    }
    return { id };
  }

  /**
   * The library's picture for a subject of this kind, under any of the names
   * given, or null. Never throws: the library is a shortcut, and a database
   * hiccup must fall back to searching, not fail the job.
   */
  async find(
    names: ReadonlyArray<string | undefined>,
    kind: string,
  ): Promise<MediaLibraryEntryView | null> {
    const keys = [
      ...new Set(
        names.map((name) => (name ? libraryKey(name) : '')).filter(Boolean),
      ),
    ];
    if (keys.length === 0) return null;
    try {
      const row = await this.entries
        .findOne({ kind, keys: { $in: keys } })
        .lean()
        .exec();
      return row ? this.view(row) : null;
    } catch {
      return null;
    }
  }

  private view(
    row: EngineMediaLibraryDocument & {
      _id?: unknown;
      createdAt?: Date | string;
    },
  ): MediaLibraryEntryView {
    return {
      id: String(row._id),
      name: row.name,
      nameAr: row.nameAr ?? null,
      aliases: row.aliases ?? [],
      kind: row.kind,
      asset: row.asset,
      createdByEmail: row.createdByEmail,
      createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    };
  }
}
