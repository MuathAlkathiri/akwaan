import { AssetRequest } from '../contracts/asset-provider.interface';

export type SearchRejectionCode =
  | 'SEARCH_ENTITY_REQUIRED'
  | 'SEARCH_ENTITY_ALIAS_MISSING'
  | 'SEARCH_CONTEXT_ONLY'
  | 'SEARCH_QUERY_IS_DESCRIPTION'
  | 'SEARCH_QUERY_TOO_LONG'
  | 'SEARCH_COVER_TOPIC_NOT_CANONICAL'
  | 'SEARCH_LEGACY_QUERY_REJECTED';

export type EntityFirstSearchPlan = {
  canonicalEntity: string;
  aliases: string[];
  franchise?: string;
  coverTopic?: string;
  entityType: string;
  mediaIntent?: string;
  sourceType?: string;
  languagePreferences: string[];
  requiredTerms: string[];
  optionalContextTerms: string[];
  prohibitedStandaloneTerms: string[];
  rejectedCodes: SearchRejectionCode[];
};

type QueryScope = 'primary' | 'cover';

const DESCRIPTION =
  /\b(character|person|place|thing|user|who|that|which|uses?|describes?|showing|scene about|training ground|exploding ninja|mysterious area|شخصية|الشخص الذي|التي|الذي|يستخدم|يصف|تظهر|لقطة|ساحة|منطقة|ميدان)\b/i;
const QUESTION =
  /^(who|what|where|when|how|why|من|ما|ماذا|أين|اين|متى|كيف|لماذا|هل)\b/i;
const CONTEXT_TRANSLATIONS: Array<[RegExp, string]> = [
  [/ساخر|سخرية/i, 'sarcastic'],
  [/انفجار|تفجير|متفجر/i, 'explosion'],
  [/فن/i, 'art'],
  [/كلام|حديث|جملة|صوت/i, 'speech'],
];

/** Provider-neutral boundary which keeps identity separate from activity. */
export class EntityFirstSearchPolicy {
  create(request: AssetRequest): EntityFirstSearchPlan {
    const canonicalEntity = this.term(
      request.canonicalEntity ?? request.entity,
    );
    const aliases = this.aliases(request, canonicalEntity);
    const coverTopic = this.term(request.coverTopic);
    const rejectedCodes: SearchRejectionCode[] = [];
    if (!canonicalEntity) rejectedCodes.push('SEARCH_ENTITY_REQUIRED');
    if (request.purpose === 'decorative' && !coverTopic && !canonicalEntity)
      rejectedCodes.push('SEARCH_COVER_TOPIC_NOT_CANONICAL');
    return {
      canonicalEntity,
      aliases,
      franchise: this.term(request.franchise) || undefined,
      coverTopic: coverTopic || undefined,
      entityType: this.term(request.entityType) || 'unknown',
      mediaIntent: this.term(request.mediaIntent) || undefined,
      sourceType: this.term(request.sourceType) || undefined,
      languagePreferences: this.languages(request.language),
      requiredTerms: aliases,
      optionalContextTerms: this.contextTerms(
        request.searchContext ?? request.context,
      ),
      prohibitedStandaloneTerms: ['context', 'visualHint', 'question'],
      rejectedCodes,
    };
  }

  queries(
    plan: EntityFirstSearchPlan,
    candidates: Array<Array<string | undefined> | string | undefined>,
    scope: QueryScope = 'primary',
  ): { queries: string[]; rejectedCodes: SearchRejectionCode[] } {
    const queries: string[] = [];
    const rejectedCodes = [...plan.rejectedCodes];
    for (const candidate of candidates) {
      const query = this.term(
        Array.isArray(candidate)
          ? candidate.filter(Boolean).join(' ')
          : candidate,
      );
      if (!query) continue;
      const code = this.validate(plan, query, scope);
      if (code) rejectedCodes.push(code);
      else if (!queries.includes(query)) queries.push(query);
    }
    return { queries, rejectedCodes };
  }

  validate(
    plan: EntityFirstSearchPlan,
    query: string,
    scope: QueryScope = 'primary',
  ): SearchRejectionCode | undefined {
    const cleaned = this.term(query);
    if (!cleaned || !plan.canonicalEntity) return 'SEARCH_ENTITY_REQUIRED';
    if (cleaned.length > 100 || cleaned.split(/\s+/).length > 12)
      return 'SEARCH_QUERY_TOO_LONG';
    if (QUESTION.test(cleaned) || DESCRIPTION.test(cleaned))
      return 'SEARCH_QUERY_IS_DESCRIPTION';
    const identityTerms =
      scope === 'cover'
        ? [plan.coverTopic || plan.canonicalEntity, plan.franchise].filter(
            Boolean,
          )
        : plan.aliases;
    if (!identityTerms.some((alias) => this.contains(cleaned, alias!)))
      return scope === 'cover'
        ? 'SEARCH_COVER_TOPIC_NOT_CANONICAL'
        : plan.optionalContextTerms.some((term) => this.contains(cleaned, term))
          ? 'SEARCH_CONTEXT_ONLY'
          : 'SEARCH_ENTITY_ALIAS_MISSING';
    return undefined;
  }

  legacyQuery(
    plan: EntityFirstSearchPlan,
    value: unknown,
    scope: QueryScope = 'primary',
  ): string | undefined {
    const query = this.term(value);
    return query && !this.validate(plan, query, scope) ? query : undefined;
  }

  private aliases(request: AssetRequest, canonical: string): string[] {
    const supplied = [
      canonical,
      ...(Array.isArray(request.aliases) ? request.aliases : []),
      request.originalName,
      request.localizedName,
    ];
    if (/^[A-Za-z][A-Za-z' -]+$/.test(canonical)) {
      const parts = canonical.split(/\s+/);
      if (parts.length > 1) supplied.push(parts[0]);
      const spellingVariant = canonical.replace(/iy/gi, 'y');
      if (spellingVariant !== canonical) supplied.push(spellingVariant);
    }
    return Array.from(
      new Set(
        supplied
          .map((value) => this.term(value))
          .filter(
            (value) =>
              Boolean(value) &&
              value.split(/\s+/).length <= 5 &&
              !DESCRIPTION.test(value),
          ),
      ),
    );
  }

  private contextTerms(value: unknown): string[] {
    const context = this.term(value);
    if (!context || context.length > 120) return [];
    const translated = CONTEXT_TRANSLATIONS.filter(([pattern]) =>
      pattern.test(context),
    ).map(([, word]) => word);
    const english = context
      .toLowerCase()
      .match(/[a-z]{3,}/g)
      ?.filter(
        (word) =>
          !['voice', 'character', 'anime', 'scene', 'about', 'with'].includes(
            word,
          ),
      );
    return Array.from(new Set([...(english ?? []), ...translated])).slice(0, 4);
  }

  private languages(value: unknown): string[] {
    const language = this.term(value).toLowerCase();
    return [
      ...(language.includes('japanese') || language.includes('يابان')
        ? ['Japanese']
        : []),
      ...(language.includes('english') || language.includes('إنجل')
        ? ['English']
        : []),
      ...(language.includes('arabic') || language.includes('عرب')
        ? ['Arabic']
        : []),
    ];
  }

  private contains(value: string, term: string): boolean {
    const normalizedValue = this.normalize(value);
    const normalizedTerm = this.normalize(term);
    return Boolean(
      normalizedTerm && ` ${normalizedValue} `.includes(` ${normalizedTerm} `),
    );
  }

  private normalize(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toLowerCase();
  }

  private term(value: unknown): string {
    return typeof value === 'string'
      ? value
          .replace(/[؟?!.،,:;؛"'()[\]{}]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
  }
}

export const entityFirstSearchPolicy = new EntityFirstSearchPolicy();
