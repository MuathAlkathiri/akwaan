import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type {
  EntityVerificationRequest,
  VerifiedEntity,
} from '../../application/entity-verification.types';

type CacheRow = {
  expiresAt: number;
  value: VerifiedEntity;
  schemaVersion: 1;
  providerVersion: string;
};

@Injectable()
export class WigoloCacheRepository {
  private loaded = false;
  private readonly rows = new Map<string, CacheRow>();
  private readonly file: string;

  constructor(config: ConfigService) {
    this.file = resolve(
      config.get<string>('WIGOLO_CACHE_FILE') ??
        '.cache/entity-verification.json',
    );
  }

  key(request: EntityVerificationRequest): string {
    return [
      request.entityType,
      request.proposedEntity,
      request.artist,
      request.franchise,
      request.language,
    ]
      .map((value) => this.normalize(value ?? ''))
      .join('|');
  }

  async get(
    request: EntityVerificationRequest,
  ): Promise<VerifiedEntity | undefined> {
    await this.load();
    const key = this.key(request);
    const row = this.rows.get(key);
    if (!row) return undefined;
    if (row.expiresAt <= Date.now()) {
      this.rows.delete(key);
      return undefined;
    }
    return { ...row.value, cacheHit: true };
  }

  async set(
    request: EntityVerificationRequest,
    value: VerifiedEntity,
    ttlSeconds: number,
  ): Promise<void> {
    await this.load();
    this.rows.set(this.key(request), {
      expiresAt: Date.now() + ttlSeconds * 1000,
      value: { ...value, cacheHit: false },
      schemaVersion: 1,
      providerVersion: 'wigolo-mcp-v1',
    });
    await this.persist();
  }

  async invalidate(request: EntityVerificationRequest): Promise<void> {
    await this.load();
    this.rows.delete(this.key(request));
    await this.persist();
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed = JSON.parse(await readFile(this.file, 'utf8')) as Record<
        string,
        unknown
      >;
      for (const [key, row] of Object.entries(parsed)) {
        if (this.isCacheRow(row)) this.rows.set(key, row);
      }
    } catch {
      /* empty or absent cache */
    }
  }

  private async persist(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    await writeFile(temp, JSON.stringify(Object.fromEntries(this.rows)), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temp, this.file);
  }

  private normalize(value: string): string {
    const normalized = value
      .normalize('NFKD')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/[إأآٱ]/g, 'ا')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toLocaleLowerCase('ar');
    const aliases: Record<string, string> = {
      'al amaken': 'الاماكن',
      alamaken: 'الاماكن',
      'mohammed abdo': 'محمد عبده',
      'mohamed abdo': 'محمد عبده',
      'mohammed abdu': 'محمد عبده',
      'mohamed abdu': 'محمد عبده',
      deidara: 'ديدارا',
    };
    return aliases[normalized] ?? normalized;
  }

  private isCacheRow(value: unknown): value is CacheRow {
    if (!value || typeof value !== 'object') return false;
    const row = value as Partial<CacheRow>;
    return (
      row.schemaVersion === 1 &&
      typeof row.providerVersion === 'string' &&
      typeof row.expiresAt === 'number' &&
      Number.isFinite(row.expiresAt) &&
      Boolean(row.value) &&
      typeof row.value === 'object' &&
      typeof row.value.verificationStatus === 'string' &&
      Array.isArray(row.value.evidence)
    );
  }
}
