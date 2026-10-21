import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WigoloClient } from '../../ai-agent/infrastructure/wigolo/wigolo-client';
import {
  FactEvidenceRetriever,
  RetrievedFactEvidence,
} from '../domain/fact-verification.types';

interface WigoloSearchRow {
  url?: unknown;
  title?: unknown;
  snippet?: unknown;
  content?: unknown;
  description?: unknown;
}

/**
 * Factual evidence from the existing Wigolo stack.
 *
 * Transport only: this reuses `WigoloClient.callToolDetailed('search', …)`,
 * the same call the audio pipeline and the research provider already make. It
 * does **not** reuse `wigolo-cache.repository` — that cache is keyed by
 * `EntityVerificationRequest` and stores `VerifiedEntity` values, so putting
 * claim evidence in it would both abuse its contract and collide with real
 * entity-verification rows in the same file. A small bounded memo lives here
 * instead.
 *
 * ## On assigning `relation`, honestly
 *
 * The contract asks the adapter to say whether a retrieved source *supports*,
 * *contradicts* or merely *mentions* a claim. Deciding that properly is textual
 * entailment, and a lexical test cannot do it. What this does instead is
 * deliberately strict:
 *
 * - `supports` only when **every** distinctive term of the claim appears in the
 *   retrieved text **and** no negation marker sits near them;
 * - `contradicts` when those terms appear **with** a negation marker;
 * - `mentions` for everything else, which is the default and the common case.
 *
 * The practical consequence is worth stating plainly: most real claims will
 * come back `UNSUPPORTED`, not `SUPPORTED`, and will go to a human. That is the
 * intended direction — a false `SUPPORTED` is the expensive mistake, because it
 * is the one that buys a quality judgement on an unverified fact.
 *
 * `SUPPORTED` never bypasses human review; it only permits the engine to spend
 * on judging. Nothing here can approve or publish content.
 *
 * A proper entailment check — a model reading the *retrieved* text, never
 * inventing citations — is the natural successor and is recorded as a
 * post-pilot follow-up rather than guessed at here.
 */
@Injectable()
export class WigoloFactEvidenceRetriever implements FactEvidenceRetriever {
  private readonly logger = new Logger(WigoloFactEvidenceRetriever.name);
  /** claim -> { rows, expiresAt }. Bounded; see `remember`. */
  private readonly memo = new Map<
    string,
    { rows: RetrievedFactEvidence[]; expiresAt: number }
  >();

  constructor(
    private readonly wigolo: WigoloClient,
    private readonly config: ConfigService,
  ) {}

  private number(key: string, fallback: number): number {
    const raw = Number(this.config.get<string>(key));
    return Number.isFinite(raw) && raw > 0 ? raw : fallback;
  }

  private ttlMs(): number {
    return this.number('ENGINE_EVIDENCE_CACHE_TTL_SECONDS', 3_600) * 1_000;
  }

  private remember(key: string, rows: RetrievedFactEvidence[]): void {
    // Bounded so a long pilot cannot grow this without limit.
    if (this.memo.size >= 256) {
      const oldest = this.memo.keys().next().value;
      if (oldest) this.memo.delete(oldest);
    }
    this.memo.set(key, { rows, expiresAt: Date.now() + this.ttlMs() });
  }

  async retrieve(input: {
    claim: string;
    attempt: number;
    maxResults: number;
  }): Promise<RetrievedFactEvidence[]> {
    const claim = input.claim.trim();
    if (!claim) return [];

    const key = this.normalize(claim);
    const cached = this.memo.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.rows.slice(0, input.maxResults);
    }

    // Bounded: one search per attempt, capped results, and a timeout so a
    // hung retrieval cannot hold a job lease open indefinitely.
    const timeoutMs = this.number('ENGINE_EVIDENCE_TIMEOUT_MS', 20_000);
    const response = await this.withTimeout(
      this.wigolo.callToolDetailed('search', {
        query: claim,
        max_results: Math.max(1, Math.min(input.maxResults, 8)),
      }),
      timeoutMs,
    );

    const raw = (response as { data?: { results?: unknown } })?.data?.results;
    const rows = Array.isArray(raw) ? (raw as WigoloSearchRow[]) : [];
    const retrievedAt = new Date().toISOString();

    const evidence = rows
      .map((row, index) => this.toEvidence(row, index, retrievedAt))
      .filter((row): row is RetrievedFactEvidence => Boolean(row))
      .slice(0, input.maxResults);

    this.remember(key, evidence);
    if (!evidence.length) {
      this.logger.log({
        event: 'engine_evidence_empty',
        claimLength: claim.length,
      });
    }
    return evidence;
  }

  /**
   * Rejects anything that is not a usable, attributable source.
   *
   * A row without a resolvable http(s) URL or without retrieved text is not
   * evidence — it is a search artefact, and treating it as evidence is how a
   * claim ends up "verified" by a blank result.
   */
  private toEvidence(
    row: WigoloSearchRow,
    index: number,
    retrievedAt: string,
  ): RetrievedFactEvidence | undefined {
    const url = typeof row.url === 'string' ? row.url.trim() : '';
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:')
      return undefined;

    const excerpt = [row.snippet, row.content, row.description]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .find((value) => value.length > 0);
    if (!excerpt) return undefined;

    const title =
      typeof row.title === 'string' && row.title.trim()
        ? row.title.trim()
        : parsed.hostname;

    return {
      sourceId: `${parsed.hostname}#${index}`,
      sourceName: title.slice(0, 160),
      url,
      excerpt: excerpt.slice(0, 1_000),
      retrievedAt,
      relation: this.assess(),
    };
  }

  /**
   * Always `mentions`. This is the correction, not a placeholder.
   *
   * The previous implementation inferred `supports` when every distinctive
   * term of the claim appeared in the retrieved text, and `contradicts` when a
   * negation sat nearby. Term co-occurrence is not entailment. A page carrying
   * "Genji", "Dragonblade" and "ultimate" is equally likely to be a patch note
   * removing the ability, a forum question about it, an ability list, or a page
   * about a different hero that mentions Genji in passing. Calling any of those
   * `supports` is precisely "SUPPORTED because retrieval returned a result",
   * and `SUPPORTED` is the state that unlocks spending.
   *
   * So the adapter now does what it can actually do: retrieve real sources and
   * preserve them. Deciding what they *mean* is left to an assessor that can
   * read them. Until one exists, claims resolve to `UNSUPPORTED`
   * (`EVIDENCE_ONLY_MENTIONS_CLAIM`) — non-advancing, with every source
   * attached for the human who will decide.
   *
   * The seam for that future assessor is this method: a model reading the
   * retrieved text — never inventing citations — returns a relation here, and
   * nothing else in the pipeline changes.
   */
  private assess(): RetrievedFactEvidence['relation'] {
    return 'mentions';
  }

  private normalize(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private async withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(new Error(`evidence retrieval timed out after ${ms}ms`)),
            ms,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
