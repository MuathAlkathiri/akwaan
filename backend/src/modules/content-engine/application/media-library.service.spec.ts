import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MediaLibraryService, libraryKey } from './media-library.service';

const actor = { id: 'admin-1', email: 'admin@example.test' } as never;
const ASSET = {
  url: `/uploads/world-content/content-items/engine-${'a'.repeat(64)}.png`,
  mimetype: 'image/png',
  width: 600,
  height: 600,
  sha256: 'a'.repeat(64),
};
const file = { buffer: Buffer.from('png') };

const chain = <T>(value: T) => {
  const query = {
    sort: () => query,
    limit: () => query,
    lean: () => query,
    exec: async () => value,
  };
  return query;
};

const build = (
  options: {
    existing?: Record<string, unknown> | null;
    ingest?: Record<string, unknown>;
    findThrows?: boolean;
    deleted?: number;
  } = {},
) => {
  const entries = {
    find: jest.fn(() => chain(options.existing ? [options.existing] : [])),
    findOne: jest.fn(() => {
      if (options.findThrows) throw new Error('db down');
      return chain(options.existing ?? null);
    }),
    create: jest.fn(async (doc: Record<string, unknown>) => ({
      toObject: () => ({ _id: 'entry-1', ...doc }),
    })),
    deleteOne: jest.fn(() => chain({ deletedCount: options.deleted ?? 1 })),
  };
  const ingestion = {
    ingestBytes: jest.fn(
      async () => options.ingest ?? { status: 'resolved', asset: ASSET },
    ),
  };
  const service = new MediaLibraryService(entries as never, ingestion as never);
  return { service, entries, ingestion };
};

describe('libraryKey', () => {
  it('treats spellings of one name as one key', () => {
    expect(libraryKey('Leicester City F.C.')).toBe(
      libraryKey('Leicester City FC'),
    );
    expect(libraryKey("N'Golo Kanté")).toBe(libraryKey("N'Golo Kante"));
    expect(libraryKey('نادي ليستر سيتي')).toBe(libraryKey('ليستر سيتي'));
  });

  it('keeps different subjects apart', () => {
    expect(libraryKey('Manchester City')).not.toBe(
      libraryKey('Manchester United'),
    );
  });
});

describe('MediaLibraryService', () => {
  it('stores the verified bytes and files the entry under every name it goes by', async () => {
    const { service, entries, ingestion } = build();
    const view = await service.add(
      {
        name: 'Leicester City F.C.',
        nameAr: 'ليستر سيتي',
        aliases: 'Leicester, The Foxes',
      },
      file,
      actor,
    );
    expect(ingestion.ingestBytes).toHaveBeenCalledWith({
      bytes: file.buffer,
      acquisition: 'upload',
      provenance: { provider: 'media-library' },
    });
    const [stored] = entries.create.mock.calls[0] as unknown as [
      Record<string, any>,
    ];
    expect(stored).toMatchObject({
      name: 'Leicester City F.C.',
      nameAr: 'ليستر سيتي',
      aliases: ['Leicester', 'The Foxes'],
      // A crest is the common case, so it is the default kind.
      kind: 'club-or-brand-mark',
      asset: ASSET,
      createdBy: 'admin-1',
    });
    expect(stored.keys).toEqual(
      expect.arrayContaining([
        libraryKey('Leicester City F.C.'),
        libraryKey('ليستر سيتي'),
        libraryKey('The Foxes'),
      ]),
    );
    expect(view).toMatchObject({ id: 'entry-1', name: 'Leicester City F.C.' });
  });

  it('refuses a second picture for a subject the library already answers to', async () => {
    const { service, ingestion } = build({
      existing: {
        _id: 'e',
        name: 'Leicester City F.C.',
        kind: 'club-or-brand-mark',
      },
    });
    await expect(
      service.add({ name: 'Leicester City FC' }, file, actor),
    ).rejects.toBeInstanceOf(ConflictException);
    // Nothing was stored for an upload that was going to be refused.
    expect(ingestion.ingestBytes).not.toHaveBeenCalled();
  });

  it.each([
    ['no name', { name: '  ' }, file],
    ['a name with nothing comparable in it', { name: 'F.C.' }, file],
    ['an unknown kind', { name: 'Arsenal', kind: 'meme' }, file],
    ['no file', { name: 'Arsenal' }, undefined],
  ])('refuses %s', async (_name, input, upload) => {
    const { service } = build();
    await expect(service.add(input, upload, actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('reports bytes that are not a usable image', async () => {
    const { service, entries } = build({
      ingest: { status: 'failed', failureReason: 'NOT_AN_IMAGE', detail: 'x' },
    });
    await expect(
      service.add({ name: 'Arsenal' }, file, actor),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(entries.create).not.toHaveBeenCalled();
  });

  it('finds an entry by any of the names asked for, within the kind', async () => {
    const { service, entries } = build({
      existing: {
        _id: 'e',
        name: 'Leicester City F.C.',
        kind: 'club-or-brand-mark',
        asset: ASSET,
        createdByEmail: 'a',
      },
    });
    const found = await service.find(
      ['Leicester City F.C.', 'نادي ليستر سيتي', undefined],
      'club-or-brand-mark',
    );
    expect(found?.asset).toEqual(ASSET);
    expect(entries.findOne).toHaveBeenCalledWith({
      kind: 'club-or-brand-mark',
      keys: {
        $in: [libraryKey('Leicester City F.C.'), libraryKey('ليستر سيتي')],
      },
    });
  });

  it('answers null, never throws, when it cannot look', async () => {
    expect(await build().service.find([undefined, ''], 'person')).toBeNull();
    expect(
      await build({ findThrows: true }).service.find(['Arsenal'], 'person'),
    ).toBeNull();
  });

  it('removes an entry, and says so when there is none', async () => {
    const id = 'a'.repeat(24);
    expect(await build().service.remove(id)).toEqual({ id });
    await expect(
      build({ deleted: 0 }).service.remove(id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(build().service.remove('nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
