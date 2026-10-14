import { Injectable, Logger } from '@nestjs/common';
import { MovingXoQuestion } from '../domain/moving-xo-gameplay.plugin';

/**
 * Where a Moving XO puzzle comes from.
 *
 * Moving XO draws content **on demand**, one puzzle per turn, and the knowledge
 * needed to draw it — the Match's owner account, its selected Scopes, the shared
 * selector and the exposure ledger — all lives in the Match layer. The runtime
 * cannot reach up for it.
 *
 * So the runtime declares what it needs and the Match layer registers something
 * that can answer, exactly as `MarhalaQuestionSourceRegistry` and
 * `GameplayObserverRegistry` already do: the dependency arrow keeps pointing
 * match → live-game-sessions, and no module cycle exists to work around.
 */

export interface MovingXoDrawRequest {
  sessionId: string;
  runtimeId: string;
  /** The turn this draw belongs to, so a late answer cannot open a later turn. */
  turnNumber: number;
  /** Every puzzle this challenge has already put in front of a team. */
  presentedContentItemIds: readonly string[];
}

export type MovingXoDrawOutcome =
  /** One puzzle, reserved for this Match and ready to open. */
  | { kind: 'question'; question: MovingXoQuestion }
  /**
   * Nothing eligible remains for this account in this occurrence. The challenge
   * ends with no winner rather than repeating an item.
   */
  | { kind: 'exhausted' }
  /**
   * The source cannot answer *yet* — not the same thing as having nothing.
   *
   * A launch starts the runtime before the Match records which challenge is
   * running, so the first convergence legitimately arrives before the context a
   * draw needs exists. Reading that as depletion would end a game that has a
   * hundred unseen puzzles waiting, so it is its own outcome: the obligation
   * stays pending and the next mutation or read serves it.
   */
  | { kind: 'unknown' };

export interface MovingXoQuestionSource {
  readonly name: string;
  /** Draw and reserve exactly one unseen eligible item. */
  draw(request: MovingXoDrawRequest): Promise<MovingXoDrawOutcome>;
}

@Injectable()
export class MovingXoQuestionSourceRegistry {
  private readonly logger = new Logger(MovingXoQuestionSourceRegistry.name);
  private source?: MovingXoQuestionSource;

  register(source: MovingXoQuestionSource): void {
    if (this.source?.name === source.name) return;
    this.source = source;
    this.logger.log(`Registered Moving XO question source "${source.name}"`);
  }

  /**
   * Absent until the Match layer has registered one.
   *
   * A runtime with no source cannot invent content, so the supplier simply does
   * nothing and the obligation stays pending — visible, rather than resolved with
   * a fabricated puzzle.
   */
  current(): MovingXoQuestionSource | undefined {
    return this.source;
  }
}
