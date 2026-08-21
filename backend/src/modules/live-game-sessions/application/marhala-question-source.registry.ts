import { Injectable, Logger } from '@nestjs/common';
import { MarhalaDifficulty } from '../../world-content/domain/marhala-content.policy';
import { MarhalaRuntimeQuestion } from '../domain/marhala-gameplay.plugin';

/**
 * Where a المرحلة question comes from.
 *
 * Marhala draws content **on demand**, one question at a time, and the knowledge
 * needed to draw it — the Match's owner account, its selected Scopes, the shared
 * selector and the exposure ledger — all lives in the Match layer. The runtime
 * cannot reach up for it.
 *
 * So the runtime declares what it needs and the Match layer registers something
 * that can answer, exactly as `GameplayObserverRegistry` already does for
 * reconciliation: the dependency arrow keeps pointing match → live-game-sessions,
 * and no module cycle exists to work around.
 */

export interface MarhalaDrawRequest {
  sessionId: string;
  runtimeId: string;
  difficulty: MarhalaDifficulty;
  /** The turn this draw belongs to, so a late answer cannot open a later turn. */
  turnNumber: number;
  /** Items this race has already put in front of a team. */
  playedContentItemIds: readonly string[];
}

export type MarhalaDrawOutcome =
  /** One question, reserved for this Match and ready to open. */
  | { kind: 'question'; question: MarhalaRuntimeQuestion }
  /**
   * Nothing left at that difficulty, with what *is* still playable — so the
   * runtime can withdraw the choice rather than downgrade it.
   */
  | { kind: 'unavailable'; available: MarhalaDifficulty[] }
  /** No difficulty can be served: the race has to end honestly. */
  | { kind: 'exhausted' }
  /**
   * The source cannot answer *yet* — not the same thing as having nothing.
   *
   * A launch starts the runtime before the Match records which challenge is
   * running, so the first convergence legitimately arrives before the context a
   * draw needs exists. Reading that as depletion would end a race that has forty
   * unseen questions waiting, so it is its own outcome: the obligation stays
   * pending and the next mutation or read serves it.
   */
  | { kind: 'unknown' };

export interface MarhalaQuestionSource {
  readonly name: string;
  /** Draw and reserve exactly one unseen item at this difficulty. */
  draw(request: MarhalaDrawRequest): Promise<MarhalaDrawOutcome>;
  /**
   * Which difficulties currently have at least one eligible unseen item.
   *
   * `undefined` is "cannot tell yet", for the same reason `unknown` exists above,
   * and is deliberately distinct from `[]` — which asserts the account has seen
   * everything this occurrence can offer.
   */
  availability(input: {
    sessionId: string;
    runtimeId: string;
    playedContentItemIds: readonly string[];
  }): Promise<MarhalaDifficulty[] | undefined>;
}

@Injectable()
export class MarhalaQuestionSourceRegistry {
  private readonly logger = new Logger(MarhalaQuestionSourceRegistry.name);
  private source?: MarhalaQuestionSource;

  register(source: MarhalaQuestionSource): void {
    if (this.source?.name === source.name) return;
    this.source = source;
    this.logger.log(`Registered المرحلة question source "${source.name}"`);
  }

  /**
   * Absent until the Match layer has registered one.
   *
   * A runtime with no source cannot invent content, so the supplier simply does
   * nothing and the obligation stays pending — visible, rather than resolved with
   * a fabricated question.
   */
  current(): MarhalaQuestionSource | undefined {
    return this.source;
  }
}
