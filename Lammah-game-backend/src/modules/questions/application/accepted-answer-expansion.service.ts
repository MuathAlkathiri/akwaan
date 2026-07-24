import { Injectable, Logger } from '@nestjs/common';
import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import {
  LlmClientError,
  LlmClientService,
  StructuredOutputError,
} from '../../ai-agent/infrastructure/ai/llm-client.service';
import { CategoriesService } from '../../categories/categories.service';
import {
  AcceptedAnswerAliasSuggestionDto,
  AcceptedAnswerGenerationResponseDto,
  GenerateAcceptedAnswersDto,
  GenerateRankedAcceptedAnswersDto,
  RankedAcceptedAnswerGenerationResponseDto,
} from '../dto/accepted-answer-generation.dto';

type RawAlias = {
  value?: unknown;
  language?: unknown;
  reason?: unknown;
  confidence?: unknown;
};
type RawRow = {
  rowIndex?: unknown;
  clientId?: unknown;
  aliases?: unknown;
  warnings?: unknown;
};
type ValidationIssue = {
  path: string;
  expected: string;
  received: string;
};
type ValidatedRow = {
  rowIndex: number;
  aliases: RawAlias[];
  warnings: string[];
};
type BulkValidationResult = {
  status: 'PASS' | 'PARTIAL' | 'FAIL';
  rows: Map<number, ValidatedRow>;
  issues: ValidationIssue[];
  duplicateRowIndexes: number[];
  unknownRowIndexes: number[];
  unmatchedInputRowIndexes: number[];
  topLevelWarnings: string[];
};

type AliasWarningCode =
  | 'ALIAS_PROVIDER_NOT_CONFIGURED'
  | 'ALIAS_PROVIDER_CONNECTION_FAILED'
  | 'ALIAS_MODEL_NOT_FOUND'
  | 'ALIAS_GENERATION_TIMEOUT'
  | 'ALIAS_RESPONSE_INVALID'
  | 'ALIAS_GENERATION_UNAVAILABLE';

class AliasResponseInvalidError extends Error {
  constructor(
    message: string,
    readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
    this.name = 'AliasResponseInvalidError';
  }
}

const AMBIGUOUS_FORMS = new Set(
  [
    'فريق',
    'لاعب',
    'نادي',
    'بلد',
    'دوله',
    'الاجابه',
    'team',
    'player',
    'club',
    'country',
    'answer',
  ].map(normalizeAnswer),
);

@Injectable()
export class AcceptedAnswerExpansionService {
  private readonly logger = new Logger(AcceptedAnswerExpansionService.name);

  constructor(
    private readonly llm: LlmClientService,
    private readonly categories: CategoriesService,
  ) {}

  async generate(
    input: GenerateAcceptedAnswersDto,
  ): Promise<AcceptedAnswerGenerationResponseDto> {
    const response = await this.generateRows(
      [
        {
          clientId: 'answer',
          canonicalAnswerAr: input.canonicalAnswerAr,
          canonicalAnswerEn: input.canonicalAnswerEn,
        },
      ],
      input.questionText,
      input.categoryId,
      input.siblingAnswers ?? [],
      input.locale ?? 'mixed',
      'accepted_answer.generate',
    );
    const row = response.entries[0];
    return row
      ? { aliases: row.aliases, warnings: row.warnings }
      : { aliases: [], warnings: ['ALIAS_GENERATION_UNAVAILABLE'] };
  }

  async generateRanked(
    input: GenerateRankedAcceptedAnswersDto,
  ): Promise<RankedAcceptedAnswerGenerationResponseDto> {
    return this.generateRows(
      input.entries,
      input.questionText,
      input.categoryId,
      input.entries.flatMap((entry) =>
        [entry.canonicalAnswerAr, entry.canonicalAnswerEn].filter(
          (value): value is string => Boolean(value),
        ),
      ),
      input.locale ?? 'mixed',
      'accepted_answer.generate_ranked_list',
    );
  }

  private async generateRows(
    entries: Array<{
      clientId: string;
      canonicalAnswerAr: string;
      canonicalAnswerEn?: string;
    }>,
    questionText: string,
    categoryId?: string,
    siblingAnswers: string[] = [],
    locale: 'ar' | 'en' | 'mixed' = 'mixed',
    operationName = 'accepted_answer.generate',
  ): Promise<RankedAcceptedAnswerGenerationResponseDto> {
    try {
      const categoryContext = categoryId
        ? await this.categories
            .findByIdForQuestionAuthoring(categoryId)
            .then((category) => ({
              id: String(category._id),
              name: category.name,
              description: category.description,
              catalog:
                category.catalog && typeof category.catalog === 'object'
                  ? category.catalog.name
                  : undefined,
            }))
            .catch(() => ({ id: categoryId }))
        : null;
      const generated = await this.llm.generateStructured<{
        entries?: unknown;
        warnings?: unknown;
      }>({
        purpose: 'answer-alias-generation',
        systemPrompt:
          'You generate safe accepted-answer aliases for a trivia authoring tool. Generate only names that unambiguously mean the same entity. Include useful Arabic and English short names, abbreviations, spoken forms, and transliterations. Never add explanations, guesses, typo spam, generic words, or an alias belonging to a sibling answer.',
        userPrompt: JSON.stringify({
          questionText,
          categoryContext,
          locale,
          siblingAnswers,
          entries: entries.map((entry, rowIndex) => ({
            rowIndex,
            canonicalAnswerAr: entry.canonicalAnswerAr,
            canonicalAnswerEn: entry.canonicalAnswerEn,
          })),
          instructions: {
            rowMapping:
              'Return each supplied rowIndex exactly once. Never invent or omit rowIndex values.',
            aliasLimitPerRow: 4,
            conciseReasons: true,
          },
        }),
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['entries', 'warnings'],
          properties: {
            entries: {
              type: 'array',
              minItems: entries.length,
              maxItems: entries.length,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['rowIndex', 'aliases', 'warnings'],
                properties: {
                  rowIndex: {
                    type: 'integer',
                    minimum: 0,
                    maximum: entries.length - 1,
                  },
                  aliases: {
                    type: 'array',
                    maxItems: 4,
                    items: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['value', 'language', 'reason', 'confidence'],
                      properties: {
                        value: { type: 'string', maxLength: 80 },
                        language: { enum: ['ar', 'en', 'other'] },
                        reason: { type: 'string', maxLength: 120 },
                        confidence: { enum: ['high', 'medium', 'low'] },
                      },
                    },
                  },
                  warnings: {
                    type: 'array',
                    maxItems: 10,
                    items: { type: 'string', maxLength: 160 },
                  },
                },
              },
            },
            warnings: {
              type: 'array',
              maxItems: 10,
              items: { type: 'string', maxLength: 160 },
            },
          },
        },
        temperature: 0.2,
        maxTokens: 4096,
        repairMalformed: false,
      });
      const validation = this.validateBulkResponse(
        generated.value,
        entries.length,
      );
      this.logStructuralDiagnostics(
        operationName,
        generated.value,
        validation,
        entries,
      );
      if (validation.status === 'FAIL')
        throw new AliasResponseInvalidError(
          'Structured response has an invalid top-level shape',
          validation.issues,
        );
      const result = {
        entries: entries.map((entry) => {
          const rowIndex = entries.indexOf(entry);
          const row = validation.rows.get(rowIndex);
          if (!row) {
            return {
              clientId: entry.clientId,
              aliases: [],
              warnings: ['ALIAS_RESPONSE_INVALID'],
            };
          }
          const siblingNormalized = new Set(
            siblingAnswers
              .filter(
                (answer) =>
                  ![entry.canonicalAnswerAr, entry.canonicalAnswerEn].includes(
                    answer,
                  ),
              )
              .map(normalizeAnswer),
          );
          const canonical = new Set(
            [entry.canonicalAnswerAr, entry.canonicalAnswerEn]
              .filter((value): value is string => Boolean(value))
              .map(normalizeAnswer),
          );
          return {
            clientId: entry.clientId,
            ...this.sanitize(row, canonical, siblingNormalized),
          };
        }),
        warnings: validation.topLevelWarnings,
      };
      return result;
    } catch (error) {
      const warning = this.warningFor(error);
      this.logFailure(operationName, error, warning);
      return {
        entries: entries.map((entry) => ({
          clientId: entry.clientId,
          aliases: [],
          warnings: [warning],
        })),
        warnings: [warning],
      };
    }
  }

  private validateBulkResponse(
    value: unknown,
    inputCount: number,
  ): BulkValidationResult {
    const issues: ValidationIssue[] = [];
    const rows = new Map<number, ValidatedRow>();
    const duplicateRowIndexes = new Set<number>();
    const unknownRowIndexes = new Set<number>();
    const receivedIndexes = new Set<number>();
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      issues.push({
        path: '$',
        expected: 'object',
        received: this.receivedType(value),
      });
      return {
        status: 'FAIL',
        rows,
        issues,
        duplicateRowIndexes: [],
        unknownRowIndexes: [],
        unmatchedInputRowIndexes: Array.from(
          { length: inputCount },
          (_, index) => index,
        ),
        topLevelWarnings: [],
      };
    }
    const response = value as { entries?: unknown; warnings?: unknown };
    if (!Array.isArray(response.entries))
      issues.push({
        path: '$.entries',
        expected: 'array',
        received: this.receivedType(response.entries),
      });
    if (!this.isStringArray(response.warnings))
      issues.push({
        path: '$.warnings',
        expected: 'string[]',
        received: this.receivedType(response.warnings),
      });
    if (
      !Array.isArray(response.entries) ||
      !this.isStringArray(response.warnings)
    ) {
      return {
        status: 'FAIL',
        rows,
        issues,
        duplicateRowIndexes: [],
        unknownRowIndexes: [],
        unmatchedInputRowIndexes: Array.from(
          { length: inputCount },
          (_, index) => index,
        ),
        topLevelWarnings: [],
      };
    }
    response.entries.slice(0, 30).forEach((candidate, returnedIndex) => {
      const path = `$.entries[${returnedIndex}]`;
      if (
        !candidate ||
        typeof candidate !== 'object' ||
        Array.isArray(candidate)
      ) {
        issues.push({
          path,
          expected: 'object',
          received: this.receivedType(candidate),
        });
        return;
      }
      const raw = candidate as RawRow;
      const rowIndex =
        Number.isInteger(raw.rowIndex) && typeof raw.rowIndex === 'number'
          ? raw.rowIndex
          : undefined;
      if (rowIndex === undefined) {
        issues.push({
          path: `${path}.rowIndex`,
          expected: 'integer',
          received: this.receivedType(raw.rowIndex),
        });
        return;
      }
      if (rowIndex < 0 || rowIndex >= inputCount) {
        unknownRowIndexes.add(rowIndex);
        issues.push({
          path: `${path}.rowIndex`,
          expected: `integer 0..${inputCount - 1}`,
          received: String(rowIndex),
        });
        return;
      }
      if (receivedIndexes.has(rowIndex)) {
        duplicateRowIndexes.add(rowIndex);
        rows.delete(rowIndex);
        issues.push({
          path: `${path}.rowIndex`,
          expected: 'unique rowIndex',
          received: String(rowIndex),
        });
        return;
      }
      receivedIndexes.add(rowIndex);
      const rowIssues = this.validateRow(raw, path);
      issues.push(...rowIssues);
      if (rowIssues.length === 0)
        rows.set(rowIndex, {
          rowIndex,
          aliases: this.coerceAliases(raw.aliases as unknown[]),
          warnings: raw.warnings as string[],
        });
    });
    for (const duplicate of duplicateRowIndexes) rows.delete(duplicate);
    const unmatchedInputRowIndexes = Array.from(
      { length: inputCount },
      (_, index) => index,
    ).filter((index) => !rows.has(index));
    return {
      status:
        issues.length === 0 && unmatchedInputRowIndexes.length === 0
          ? 'PASS'
          : 'PARTIAL',
      rows,
      issues: issues.slice(0, 40),
      duplicateRowIndexes: Array.from(duplicateRowIndexes).slice(0, 10),
      unknownRowIndexes: Array.from(unknownRowIndexes).slice(0, 10),
      unmatchedInputRowIndexes,
      topLevelWarnings: (response.warnings as string[])
        .map((warning) => warning.slice(0, 160))
        .slice(0, 10),
    };
  }

  private validateRow(row: RawRow, path: string): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!Array.isArray(row.aliases)) {
      issues.push({
        path: `${path}.aliases`,
        expected: 'array',
        received: this.receivedType(row.aliases),
      });
    } else {
      row.aliases.slice(0, 30).forEach((alias, aliasIndex) => {
        const aliasPath = `${path}.aliases[${aliasIndex}]`;
        if (typeof alias === 'string') {
          if (!alias.trim())
            issues.push({
              path: aliasPath,
              expected: 'non-empty string',
              received: 'empty string',
            });
          return;
        }
        if (!alias || typeof alias !== 'object' || Array.isArray(alias)) {
          issues.push({
            path: aliasPath,
            expected: 'alias object or legacy string',
            received: this.receivedType(alias),
          });
          return;
        }
        const candidate = alias as RawAlias;
        this.requireString(candidate.value, `${aliasPath}.value`, issues, true);
        this.requireEnum(
          candidate.language,
          ['ar', 'en', 'other'],
          `${aliasPath}.language`,
          issues,
        );
        this.requireString(candidate.reason, `${aliasPath}.reason`, issues);
        this.requireEnum(
          candidate.confidence,
          ['high', 'medium', 'low'],
          `${aliasPath}.confidence`,
          issues,
        );
      });
    }
    if (!this.isStringArray(row.warnings))
      issues.push({
        path: `${path}.warnings`,
        expected: 'string[]',
        received: this.receivedType(row.warnings),
      });
    return issues;
  }

  private coerceAliases(aliases: unknown[]): RawAlias[] {
    return aliases.map((alias) =>
      typeof alias === 'string'
        ? {
            value: alias,
            language: /[\u0600-\u06ff]/.test(alias) ? 'ar' : 'en',
            reason: 'alternate name',
            confidence: 'medium',
          }
        : (alias as RawAlias),
    );
  }

  private requireString(
    value: unknown,
    path: string,
    issues: ValidationIssue[],
    nonEmpty = false,
  ): void {
    if (typeof value !== 'string' || (nonEmpty && !value.trim()))
      issues.push({
        path,
        expected: nonEmpty ? 'non-empty string' : 'string',
        received:
          typeof value === 'string' && !value.trim()
            ? 'empty string'
            : this.receivedType(value),
      });
  }

  private requireEnum(
    value: unknown,
    allowed: string[],
    path: string,
    issues: ValidationIssue[],
  ): void {
    if (typeof value !== 'string' || !allowed.includes(value))
      issues.push({
        path,
        expected: allowed.join(' | '),
        received: this.receivedType(value, true),
      });
  }

  private isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === 'string')
    );
  }

  private receivedType(value: unknown, includeValue = false): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    const type = typeof value;
    if (includeValue && ['string', 'number', 'boolean'].includes(type))
      return `${type}(${String(value).slice(0, 40)})`;
    return type;
  }

  private logStructuralDiagnostics(
    operationName: string,
    value: unknown,
    validation: BulkValidationResult,
    entries: Array<{ clientId: string }>,
  ): void {
    const response =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as { entries?: unknown })
        : undefined;
    const returnedEntries = Array.isArray(response?.entries)
      ? response.entries
      : [];
    const payload = {
      event: 'accepted_answer.response_diagnostics',
      operation: operationName,
      structure: {
        topLevelKeys: response ? Object.keys(response).slice(0, 10) : [],
        returnedEntriesCount: returnedEntries.length,
        items: returnedEntries.slice(0, 10).map((item) => {
          const row =
            item && typeof item === 'object' && !Array.isArray(item)
              ? (item as RawRow)
              : undefined;
          return {
            rowIndexPresence: row ? 'rowIndex' in row : false,
            rowIndexType: this.receivedType(row?.rowIndex),
            clientIdPresence: row ? 'clientId' in row : false,
            clientIdType: this.receivedType(row?.clientId),
            aliasesPresence: row ? 'aliases' in row : false,
            aliasesType: this.receivedType(row?.aliases),
            aliasesCount: Array.isArray(row?.aliases)
              ? row.aliases.length
              : null,
            warningsPresence: row ? 'warnings' in row : false,
            warningsType: this.receivedType(row?.warnings),
          };
        }),
      },
      validation: {
        status: validation.status,
        issues: validation.issues,
      },
      reconciliation: {
        unmatchedInputClientIds: validation.unmatchedInputRowIndexes
          .map((index) => entries[index]?.clientId)
          .filter((clientId): clientId is string => Boolean(clientId))
          .slice(0, 10),
        duplicateReturnedRowIndexes: validation.duplicateRowIndexes,
        unknownReturnedRowIndexes: validation.unknownRowIndexes,
      },
    };
    if (
      process.env.NODE_ENV !== 'production' ||
      process.env.AI_ALIAS_DIAGNOSTICS === 'true' ||
      validation.status !== 'PASS'
    )
      this.logger.warn(JSON.stringify(payload));
  }

  private warningFor(error: unknown): AliasWarningCode {
    if (error instanceof LlmClientError) {
      const codes: Record<LlmClientError['code'], AliasWarningCode> = {
        LLM_PROVIDER_NOT_CONFIGURED: 'ALIAS_PROVIDER_NOT_CONFIGURED',
        LLM_CONNECTION_FAILED: 'ALIAS_PROVIDER_CONNECTION_FAILED',
        LLM_MODEL_NOT_FOUND: 'ALIAS_MODEL_NOT_FOUND',
        LLM_REQUEST_TIMEOUT: 'ALIAS_GENERATION_TIMEOUT',
        LLM_HTTP_ERROR: 'ALIAS_GENERATION_UNAVAILABLE',
        LLM_RESPONSE_INVALID: 'ALIAS_RESPONSE_INVALID',
      };
      return codes[error.code];
    }
    if (
      error instanceof StructuredOutputError ||
      error instanceof AliasResponseInvalidError
    )
      return 'ALIAS_RESPONSE_INVALID';
    const name = error instanceof Error ? error.name : '';
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout|abort/i.test(`${name} ${message}`))
      return 'ALIAS_GENERATION_TIMEOUT';
    if (/fetch|connect|econnrefused|network/i.test(message))
      return 'ALIAS_PROVIDER_CONNECTION_FAILED';
    return 'ALIAS_GENERATION_UNAVAILABLE';
  }

  private logFailure(
    operationName: string,
    error: unknown,
    warningCode: AliasWarningCode,
  ): void {
    const configured = this.llm.getRuntimeConfig('answer-alias-generation');
    const diagnostics =
      error instanceof LlmClientError ? error.diagnostics : undefined;
    this.logger.error(
      JSON.stringify({
        event: 'accepted_answer.generation_failed',
        operation: operationName,
        warningCode,
        provider: diagnostics?.provider ?? configured.provider,
        baseUrl: this.safeBaseUrl(diagnostics?.baseUrl ?? configured.baseUrl),
        model: diagnostics?.model ?? configured.model,
        httpStatus: diagnostics?.httpStatus ?? null,
        errorType:
          diagnostics?.errorType ??
          (error instanceof Error ? error.name : typeof error),
        parsingStage:
          diagnostics?.stage ??
          (error instanceof StructuredOutputError ||
          error instanceof AliasResponseInvalidError
            ? 'structured-parse'
            : 'unknown'),
        message: this.safeMessage(error),
      }),
    );
  }

  private safeBaseUrl(value: string): string {
    try {
      const url = new URL(value);
      url.username = '';
      url.password = '';
      url.search = '';
      url.hash = '';
      return url.toString().replace(/\/$/, '');
    } catch {
      return value.split('?')[0].slice(0, 200);
    }
  }

  private safeMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message
      .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
      .replace(/\b(?:sk|key)-[A-Za-z0-9_-]+\b/g, '[REDACTED]')
      .slice(0, 400);
  }

  private sanitize(
    row: ValidatedRow | undefined,
    canonical: Set<string>,
    siblings: Set<string>,
  ): AcceptedAnswerGenerationResponseDto {
    const aliases: AcceptedAnswerAliasSuggestionDto[] = [];
    const warnings = (row?.warnings ?? [])
      .filter((warning): warning is string => typeof warning === 'string')
      .map((warning) => warning.slice(0, 160))
      .slice(0, 10);
    const seen = new Set<string>();
    for (const candidate of (row?.aliases ?? []).slice(0, 30)) {
      const value =
        typeof candidate.value === 'string'
          ? candidate.value.trim().replace(/\s+/g, ' ').slice(0, 80)
          : '';
      const normalized = normalizeAnswer(value);
      if (!normalized || seen.has(normalized) || canonical.has(normalized))
        continue;
      if (siblings.has(normalized)) {
        warnings.push(`ALIAS_CONFLICTS_WITH_SIBLING:${value}`);
        continue;
      }
      if (AMBIGUOUS_FORMS.has(normalized)) {
        warnings.push(`AMBIGUOUS_ALIAS_REMOVED:${value}`);
        continue;
      }
      seen.add(normalized);
      aliases.push({
        value,
        language: ['ar', 'en', 'other'].includes(String(candidate.language))
          ? (candidate.language as 'ar' | 'en' | 'other')
          : /[\u0600-\u06ff]/.test(value)
            ? 'ar'
            : 'en',
        reason:
          typeof candidate.reason === 'string'
            ? candidate.reason.trim().slice(0, 120)
            : 'alternate name',
        confidence: ['high', 'medium', 'low'].includes(
          String(candidate.confidence),
        )
          ? (candidate.confidence as 'high' | 'medium' | 'low')
          : 'medium',
      });
      if (aliases.length >= 12) break;
    }
    return { aliases, warnings: Array.from(new Set(warnings)).slice(0, 10) };
  }
}
