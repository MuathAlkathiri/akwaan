import { Injectable } from '@nestjs/common';
import { access, readFile } from 'fs/promises';
import { constants } from 'fs';
import { join, normalize } from 'path';
import {
  ParsedKnowledge,
  parseKnowledgeMarkdown,
} from '../utils/markdown-parser';

export type LoadedKnowledge = {
  requestedFile: string;
  knowledgeFile: string;
  usedDefaultKnowledge: boolean;
  localKnowledgeFound: boolean;
  issueCode?: 'CATEGORY_LOCAL_KNOWLEDGE_NOT_FOUND';
  knowledge: ParsedKnowledge;
};

@Injectable()
export class KnowledgeLoaderService {
  private readonly cache = new Map<string, ParsedKnowledge>();
  private readonly defaultKnowledgeFile = 'default.md';

  async load(
    knowledgeFile?: string | null,
    options: { allowDefault?: boolean } = {},
  ): Promise<LoadedKnowledge> {
    const requestedFile = this.normalizeKnowledgeFile(
      knowledgeFile || this.defaultKnowledgeFile,
    );
    const found = await this.exists(requestedFile);
    const allowDefault = options.allowDefault === true;
    const resolvedFile = found
      ? requestedFile
      : allowDefault
        ? this.defaultKnowledgeFile
        : requestedFile;
    const usedDefaultKnowledge = resolvedFile === this.defaultKnowledgeFile;

    return {
      requestedFile,
      knowledgeFile: resolvedFile,
      usedDefaultKnowledge,
      localKnowledgeFound: found || (allowDefault && usedDefaultKnowledge),
      ...(!found && !allowDefault
        ? { issueCode: 'CATEGORY_LOCAL_KNOWLEDGE_NOT_FOUND' as const }
        : {}),
      knowledge:
        found || allowDefault
          ? await this.loadParsed(resolvedFile)
          : { raw: '', sections: {} },
    };
  }

  inferKnowledgeFile(catalogName: string, categoryName: string): string {
    if (this.isSongsCategory(categoryName)) return 'music/gulf-music.md';
    if (this.isFromCategory(categoryName)) return 'series/from.md';
    if (this.isVideoGamesCategory(catalogName, categoryName))
      return 'games/video-games.md';
    return `${this.slugify(catalogName)}/${this.slugify(categoryName)}.md`;
  }

  private async loadParsed(knowledgeFile: string): Promise<ParsedKnowledge> {
    const cacheKey = knowledgeFile.toLowerCase();
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return cached;
    }

    const markdown = await readFile(this.toAbsolutePath(knowledgeFile), 'utf8');
    const parsed = parseKnowledgeMarkdown(markdown);
    this.cache.set(cacheKey, parsed);
    return parsed;
  }

  private async exists(knowledgeFile: string): Promise<boolean> {
    try {
      await access(this.toAbsolutePath(knowledgeFile), constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  private toAbsolutePath(knowledgeFile: string): string {
    return join(__dirname, '..', 'knowledge', knowledgeFile);
  }

  private normalizeKnowledgeFile(knowledgeFile: string): string {
    const normalizedFile = normalize(knowledgeFile.trim())
      .replace(/^(\.\.(\/|\\|$))+/, '')
      .replace(/^[/\\]+/, '');

    return normalizedFile.endsWith('.md')
      ? normalizedFile
      : `${normalizedFile}.md`;
  }

  private slugify(value: string): string {
    return (
      value
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '') || 'default'
    );
  }

  private isSongsCategory(value: string): boolean {
    const normalized = value
      .trim()
      .toLowerCase()
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/[ـ\u064b-\u065f\u0670]/g, '')
      .replace(/\s+/g, ' ');
    return normalized === 'اغاني' || normalized === 'اغاني الخليج';
  }

  private isFromCategory(value: string): boolean {
    const normalized = value.trim().toLowerCase();
    return normalized === 'from' || normalized === 'فروم';
  }

  private isVideoGamesCategory(catalogName: string, categoryName: string) {
    const normalized = `${catalogName} ${categoryName}`
      .trim()
      .toLowerCase()
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/[ـ\u064b-\u065f\u0670]/g, '')
      .replace(/\s+/g, ' ');

    return [
      'العاب',
      'الالعاب',
      'العاب الفيديو',
      'فيديو قيمز',
      'قيمز',
      'video games',
      'videogames',
      'games',
      'gaming',
    ].some((keyword) => normalized.includes(keyword));
  }
}
