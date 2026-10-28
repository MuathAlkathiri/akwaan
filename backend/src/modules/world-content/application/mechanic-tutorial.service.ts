import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChallengeType } from '../schemas/challenge-type.schema';
import { ContentItem } from '../schemas/content-item.schema';
import {
  deriveTutorialOutcome,
  deriveClosestTutorialOutcome,
  deriveBombTutorialOutcome,
  findTutorialOverlap,
  ClosestTutorialScenarioInput,
  BombTutorialScenarioInput,
  RyoTutorialScenarioInput,
  TutorialScenarioInput,
  tutorialKind,
  validateMechanicTutorialScenario,
} from '../domain/mechanic-tutorial.policy';
import { StoredTutorialScenario } from '../domain/world-content.types';
import { WorldContentValidationError } from '../domain/world-content.errors';

/**
 * Draft, validate, publish and read a mechanic's educational demonstration.
 *
 * The split that matters is the read surface, not the write one: `getPublished`
 * is the only method the player-facing controller can reach, and it cannot
 * return a draft because it never reads that field. An editor revising a
 * scenario therefore cannot change what hosts are shown until they publish.
 *
 * Nothing here reads, reserves or writes competitive content. The one place the
 * catalog is touched at all is the overlap guard, which reads prompts to refuse
 * a publish — never to select or modify an item.
 */
@Injectable()
export class MechanicTutorialService {
  constructor(
    @InjectModel(ChallengeType.name)
    private readonly challengeTypes: Model<ChallengeType>,
    @InjectModel(ContentItem.name)
    private readonly contentItems: Model<ContentItem>,
  ) {}

  /** Admin view: both documents, so an editor can see what hosts currently get. */
  async getForAdmin(mechanicKey: string) {
    const mechanic = await this.findMechanic(mechanicKey);
    const tutorial = mechanic.tutorial;
    return {
      mechanicKey: mechanic.slug,
      mechanicName: mechanic.name,
      draft: tutorial?.draft ?? null,
      published: tutorial?.published ?? null,
      publishedRevision: tutorial?.publishedRevision ?? 0,
      publishedAt: tutorial?.publishedAt ?? null,
      draftUpdatedAt: tutorial?.draftUpdatedAt ?? null,
      hasUnpublishedChanges: hasUnpublishedChanges(
        tutorial?.draft,
        tutorial?.published,
      ),
    };
  }

  /**
   * The public projection. Published only, and deliberately no `draft` key at
   * all rather than a nulled one — a field that is never built cannot leak.
   */
  async getPublished(mechanicKey: string) {
    const mechanic = await this.findMechanic(mechanicKey);
    const published = mechanic.tutorial?.published;
    if (!published) return null;
    return {
      mechanicKey: mechanic.slug,
      revision: mechanic.tutorial?.publishedRevision ?? 0,
      scenario: published,
    };
  }

  /**
   * Save a draft. Structurally validated, but not overlap-checked: an editor is
   * allowed to work on something unfinished. The gate is publishing.
   */
  async saveDraft(mechanicKey: string, input: TutorialScenarioInput) {
    const mechanic = await this.findMechanic(mechanicKey);
    const issues = validateMechanicTutorialScenario(mechanic.slug, input);
    if (issues.length) {
      throw new WorldContentValidationError(
        issues,
        'Tutorial scenario invalid',
      );
    }

    const draft = this.compose(input);
    mechanic.tutorial = {
      ...(mechanic.tutorial ?? { publishedRevision: 0 }),
      draft,
      draftUpdatedAt: new Date(),
    } as never;
    mechanic.markModified('tutorial');
    await mechanic.save();
    return this.getForAdmin(mechanicKey);
  }

  /** Dry-run: the same checks publish applies, without writing anything. */
  async validate(mechanicKey: string, input: TutorialScenarioInput) {
    const mechanic = await this.findMechanic(mechanicKey);
    const issues = validateMechanicTutorialScenario(mechanic.slug, input);
    const overlaps = issues.length ? [] : await this.overlaps(input.prompt);
    return {
      valid: issues.length === 0 && overlaps.length === 0,
      issues,
      competitiveOverlap: overlaps,
      outcome: issues.length
        ? null
        : tutorialKind(input) === 'closest'
          ? deriveClosestTutorialOutcome(input as ClosestTutorialScenarioInput)
          : tutorialKind(input) === 'bomb'
            ? deriveBombTutorialOutcome(input as BombTutorialScenarioInput)
            : deriveTutorialOutcome(input as RyoTutorialScenarioInput),
    };
  }

  /**
   * Promote the draft to published.
   *
   * Publishing is where the content-safety gate bites, because publishing is
   * what makes the correct answer public. A scenario that reads as a question a
   * team could still be asked is refused here rather than being allowed through
   * and flagged somewhere else.
   */
  async publish(mechanicKey: string) {
    const mechanic = await this.findMechanic(mechanicKey);
    const draft = mechanic.tutorial?.draft;
    if (!draft) {
      throw new WorldContentValidationError(
        [{ code: 'TUTORIAL_DRAFT_MISSING', message: 'لا توجد مسودة للنشر.' }],
        'No tutorial draft to publish',
      );
    }

    const issues = validateMechanicTutorialScenario(mechanic.slug, draft);
    if (issues.length) {
      throw new WorldContentValidationError(
        issues,
        'Tutorial scenario invalid',
      );
    }

    const overlaps = await this.overlaps(draft.prompt);
    if (overlaps.length) {
      throw new WorldContentValidationError(
        [
          {
            code: 'TUTORIAL_OVERLAPS_COMPETITIVE_CONTENT',
            message:
              'هذا السؤال يطابق محتوى تنافسي قابل للعب. اختر سؤالًا تعليميًا مختلفًا.',
            details: { matches: overlaps },
          },
        ],
        'Tutorial overlaps competitive content',
      );
    }

    // Recomposed rather than copied: the outcome is re-derived from the rule at
    // the moment of publishing, so a published revision can never carry a score
    // the current rules would not produce.
    const published = this.compose(draft);
    const revision = (mechanic.tutorial?.publishedRevision ?? 0) + 1;
    mechanic.tutorial = {
      ...(mechanic.tutorial ?? {}),
      draft,
      published,
      publishedRevision: revision,
      publishedAt: new Date(),
    } as never;
    mechanic.markModified('tutorial');
    await mechanic.save();
    return this.getForAdmin(mechanicKey);
  }

  private compose(input: TutorialScenarioInput): StoredTutorialScenario {
    if (tutorialKind(input) === 'bomb') {
      const bomb = input as BombTutorialScenarioInput;
      return {
        kind: 'bomb',
        version: 1,
        prompt: bomb.prompt.trim(),
        acceptedAnswer: bomb.acceptedAnswer.trim(),
        nextPrompt: bomb.nextPrompt.trim(),
        startingTeam: bomb.startingTeam,
        correctAtSecondsRemaining: bomb.correctAtSecondsRemaining,
        opponentExpiresAtSecondsRemaining: 0,
        ...(bomb.caption?.trim() ? { caption: bomb.caption.trim() } : {}),
        outcome: deriveBombTutorialOutcome(bomb),
      };
    }
    if (tutorialKind(input) === 'closest') {
      const closest = input as ClosestTutorialScenarioInput;
      return {
        kind: 'closest',
        version: 1,
        prompt: closest.prompt.trim(),
        teamAEstimate: closest.teamAEstimate,
        teamBEstimate: closest.teamBEstimate,
        correctValue: closest.correctValue,
        ...(closest.unit?.trim() ? { unit: closest.unit.trim() } : {}),
        ...(closest.caption?.trim() ? { caption: closest.caption.trim() } : {}),
        outcome: deriveClosestTutorialOutcome(closest),
      };
    }
    const ryo = input as RyoTutorialScenarioInput;
    return {
      kind: 'ryo',
      version: 1,
      prompt: ryo.prompt.trim(),
      options: ryo.options.map((option) => ({
        id: option.id.trim(),
        label: option.label.trim(),
      })),
      correctOptionId: ryo.correctOptionId.trim(),
      answeringSelectionOptionId: ryo.answeringSelectionOptionId.trim(),
      opposingDecision: ryo.opposingDecision,
      ...(ryo.caption?.trim() ? { caption: ryo.caption.trim() } : {}),
      outcome: deriveTutorialOutcome(ryo),
    };
  }

  /** Reads competitive prompts to compare them. Never writes, never reserves. */
  private async overlaps(prompt: string) {
    const items = await this.contentItems
      .find({}, { prompt: 1 })
      .lean<{ _id: unknown; prompt?: { ar?: string } | string }[]>();
    return findTutorialOverlap(
      prompt,
      items.map((item) => ({
        contentItemId: String(item._id),
        prompt:
          typeof item.prompt === 'string'
            ? item.prompt
            : (item.prompt?.ar ?? ''),
      })),
    );
  }

  private async findMechanic(mechanicKey: string) {
    const mechanic = await this.challengeTypes.findOne({ slug: mechanicKey });
    if (!mechanic) {
      throw new NotFoundException({
        code: 'MECHANIC_NOT_FOUND',
        message: `No mechanic with key "${mechanicKey}"`,
      });
    }
    return mechanic;
  }
}

function hasUnpublishedChanges(
  draft?: StoredTutorialScenario,
  published?: StoredTutorialScenario,
): boolean {
  if (!draft) return false;
  if (!published) return true;
  return JSON.stringify(draft) !== JSON.stringify(published);
}
