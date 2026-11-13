import { Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import {
  QuestionPresentationDefect,
  resolveQuestionPresentation,
} from '../domain/question-presentation.policy';
import type { ContentAssetRef } from '../domain/world-content.types';
import { WorldRepository } from '../persistence/world.repository';

export interface WorldQuestionBackdrop {
  /** The artwork to paint behind a question, or null when the World has none. */
  asset: ContentAssetRef | null;
  /** Advisory findings for whoever authors the World. Never blocking. */
  defects: QuestionPresentationDefect[];
}

/**
 * The World's presentation facts, for the modules that show a question
 * (roadmap §30.22 Track A).
 *
 * This is world-content's narrow outward surface for question artwork: the
 * Match asks for one World's backdrop when it launches a challenge, and nothing
 * outside this module reads the `World` document to get it. The asset stays
 * referenced on the World — §30.22 decision 5's zero-duplication rule — and the
 * precedence decision itself stays in `question-presentation.policy`.
 */
@Injectable()
export class WorldPresentationService {
  constructor(private readonly worlds: WorldRepository) {}

  /**
   * The question backdrop for one World.
   *
   * A World that does not exist, or carries no artwork, is answered with `null`
   * and an advisory finding rather than an error: a missing decorative asset is
   * never allowed to stop a challenge from starting.
   */
  async questionBackdropFor(worldId: string): Promise<WorldQuestionBackdrop> {
    const world = Types.ObjectId.isValid(worldId)
      ? await this.worlds.findById(worldId)
      : null;
    const presentation = resolveQuestionPresentation({
      worldQuestionFallback: world?.questionFallback ?? null,
    });
    return {
      asset: presentation.backdrop.asset,
      defects: presentation.defects,
    };
  }
}
