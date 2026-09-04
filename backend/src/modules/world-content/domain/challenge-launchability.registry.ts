import { Injectable } from '@nestjs/common';

/**
 * Whether a configured mechanic has a runtime that can actually play it.
 *
 * Admin could mark a World ready while one of its enabled slots pointed at a
 * ChallengeType no launcher answers to. Production shipped exactly that twice —
 * a Cars slot displaying القطعة الدخيلة carrying the generated slug
 * `mechanic-1788286859228`, and a Video Games slot displaying المرحلة carrying
 * `mechanic-1787503326785`. Both boards read "enabled/ready" to the author while
 * every new Match correctly refused to launch them, so the defect only ever
 * surfaced to players, as "هذا التحدي مو مفعّل في أكوان".
 *
 * The answer lives in the Match module's `ChallengeLauncherRegistry`, which
 * World Content may not import — Match is the designed consumer of World
 * Content, never the reverse, and `world-content.architecture.spec.ts` enforces
 * that edge. So the question is inverted rather than the dependency: World
 * Content owns this hole, and Match fills it at startup through the same
 * self-registration idiom every launcher already uses.
 *
 * There is **no second list of slugs here**. This holds one predicate, and that
 * predicate is the launcher registry itself.
 */
@Injectable()
export class ChallengeLaunchabilityRegistry {
  private answer?: (challengeTypeSlug: string) => boolean;

  /**
   * Called once at startup by the runtime that owns the launchers. Registering
   * twice is a wiring mistake, not a merge of two opinions.
   */
  publish(answer: (challengeTypeSlug: string) => boolean): void {
    this.answer = answer;
  }

  /** Whether anything has told us how to judge a slug yet. */
  get wired(): boolean {
    return Boolean(this.answer);
  }

  /**
   * Whether a launcher exists for this exact slug.
   *
   * Matching is exact: `odd_piece`, `oddPiece` and a generated `mechanic-*` slug
   * are all simply *not* `odd-piece`, and normalising them here would re-create
   * the ambiguity this registry exists to expose.
   *
   * Unwired, it answers `true` — the honest reading of "nobody has told me what
   * the runtime supports" is *no opinion*, not *unlaunchable*. A policy unit
   * test that never wires a runtime therefore keeps asserting content rules
   * only, and the composed application always wires it.
   */
  supports(challengeTypeSlug: string): boolean {
    return this.answer ? this.answer(challengeTypeSlug) : true;
  }
}
