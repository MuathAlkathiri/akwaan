import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ChallengeType } from '../schemas/challenge-type.schema';
import { ContentItem } from '../schemas/content-item.schema';
import {
  deriveTutorialOutcome,
  deriveClosestTutorialOutcome,
  deriveBombTutorialOutcome,
  deriveOneClueTutorialOutcome,
  deriveEkshifniTutorialOutcome,
  deriveTop5TutorialOutcome,
  deriveComboTutorialOutcome,
  deriveMarhalaTutorialOutcome,
  deriveLaqathaTutorialOutcome,
  deriveFirstNoteTutorialOutcome,
  deriveLaTahriqhaTutorialOutcome,
  deriveOddPieceTutorialOutcome,
  findTutorialOverlap,
  ClosestTutorialScenarioInput,
  BombTutorialScenarioInput,
  OneClueTutorialScenarioInput,
  EkshifniTutorialScenarioInput,
  Top5TutorialScenarioInput,
  ComboTutorialScenarioInput,
  MarhalaTutorialScenarioInput,
  LaqathaTutorialScenarioInput,
  FirstNoteTutorialScenarioInput,
  LaTahriqhaTutorialScenarioInput,
  OddPieceTutorialScenarioInput,
  RyoTutorialScenarioInput,
  TutorialScenarioInput,
  tutorialKind,
  validateMechanicTutorialScenario,
} from '../domain/mechanic-tutorial.policy';
import { StoredTutorialScenario } from '../domain/world-content.types';
import { WorldContentValidationError } from '../domain/world-content.errors';
import {
  SCOPED_TUTORIAL_FLOW_CONTRACT_VERSION,
  isScopedTutorialMechanicKey,
  validateScopedTutorialFlow,
} from '../domain/scoped-mechanic-tutorial.policy';
import { WorldChallengeConfigurationRepository } from '../persistence/world-challenge-configuration.repository';
import { WorldRepository } from '../persistence/world.repository';
import { ScopedMechanicTutorialRepository } from '../persistence/scoped-mechanic-tutorial.repository';

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
    private readonly worlds: WorldRepository,
    private readonly configurations: WorldChallengeConfigurationRepository,
    private readonly scopedTutorials: ScopedMechanicTutorialRepository,
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
    const overlaps = issues.length ? [] : await this.overlapsFor(input);
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
            : tutorialKind(input) === 'one-clue'
              ? deriveOneClueTutorialOutcome(
                  input as OneClueTutorialScenarioInput,
                )
              : tutorialKind(input) === 'ekshifni'
                ? deriveEkshifniTutorialOutcome(
                    input as EkshifniTutorialScenarioInput,
                  )
                : tutorialKind(input) === 'top-5'
                  ? deriveTop5TutorialOutcome(
                      input as Top5TutorialScenarioInput,
                    )
                  : tutorialKind(input) === 'combo'
                    ? deriveComboTutorialOutcome(
                        input as ComboTutorialScenarioInput,
                      )
                    : tutorialKind(input) === 'marhala'
                      ? deriveMarhalaTutorialOutcome(
                          input as MarhalaTutorialScenarioInput,
                        )
                      : tutorialKind(input) === 'laqatha'
                        ? deriveLaqathaTutorialOutcome(
                            input as LaqathaTutorialScenarioInput,
                          )
                        : tutorialKind(input) === 'first-note'
                          ? deriveFirstNoteTutorialOutcome(
                              input as FirstNoteTutorialScenarioInput,
                            )
                          : tutorialKind(input) === 'la-tahriqha'
                            ? deriveLaTahriqhaTutorialOutcome(
                                input as LaTahriqhaTutorialScenarioInput,
                              )
                            : tutorialKind(input) === 'odd-piece'
                              ? deriveOddPieceTutorialOutcome(
                                  input as OddPieceTutorialScenarioInput,
                                )
                              : deriveTutorialOutcome(
                                  input as RyoTutorialScenarioInput,
                                ),
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

    const overlaps = await this.overlapsFor(draft as TutorialScenarioInput);
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

  /** Admin view for one World/mechanic pair. */
  async getScopedForAdmin(worldId: string, mechanicKey: string) {
    const pair = await this.requireScopedPair(worldId, mechanicKey);
    const record = await this.scopedTutorials.findByPair(
      worldId,
      String(pair.mechanic._id),
    );
    const generic = pair.mechanic.tutorial;
    return {
      worldId,
      challengeTypeId: String(pair.mechanic._id),
      mechanicKey: pair.mechanic.slug,
      mechanicName: pair.mechanic.name,
      associated: true,
      generic: {
        published: Boolean(generic?.published),
        publishedRevision: generic?.publishedRevision ?? 0,
      },
      draft: record?.draft ?? null,
      published: record?.published ?? null,
      publishedRevision: record?.publishedRevision ?? 0,
      publishedAt: record?.publishedAt ?? null,
      draftUpdatedAt: record?.draftUpdatedAt ?? null,
      withdrawnAt: record?.withdrawnAt ?? null,
      hasUnpublishedChanges: hasUnpublishedChanges(
        record?.draft as StoredTutorialScenario | undefined,
        record?.published as StoredTutorialScenario | undefined,
      ),
      revisions: (record?.revisionHistory ?? []).map((revision) => ({
        revision: revision.revision,
        publishedAt: revision.publishedAt,
        restoredFromRevision: revision.restoredFromRevision ?? null,
      })),
    };
  }

  async saveScopedDraft(
    worldId: string,
    mechanicKey: string,
    input: TutorialScenarioInput,
  ) {
    const pair = await this.requireScopedPair(worldId, mechanicKey);
    const record = await this.scopedTutorials.findByPair(
      worldId,
      String(pair.mechanic._id),
    );
    const issues = await this.validateScopedInput(
      pair.mechanic,
      mechanicKey,
      input,
    );
    if (issues.length) {
      throw new WorldContentValidationError(
        issues,
        'Scoped tutorial scenario invalid',
      );
    }
    const draft = this.compose(input) as unknown as Record<string, unknown>;
    const value =
      record ??
      (await this.scopedTutorials.create({
        worldId: new Types.ObjectId(worldId),
        challengeTypeId: pair.mechanic._id,
        mechanicKey: pair.mechanic.slug,
        scenarioVersion: Number((draft.version as number | undefined) ?? 1),
        flowContractVersion: SCOPED_TUTORIAL_FLOW_CONTRACT_VERSION,
        revisionHistory: [],
      }));
    value.draft = draft;
    value.draftUpdatedAt = new Date();
    value.flowContractVersion = SCOPED_TUTORIAL_FLOW_CONTRACT_VERSION;
    value.scenarioVersion = Number((draft.version as number | undefined) ?? 1);
    await value.save();
    return this.getScopedForAdmin(worldId, mechanicKey);
  }

  async validateScoped(
    worldId: string,
    mechanicKey: string,
    input: TutorialScenarioInput,
  ) {
    const pair = await this.requireScopedPair(worldId, mechanicKey);
    const issues = await this.validateScopedInput(
      pair.mechanic,
      mechanicKey,
      input,
    );
    const overlaps = issues.length ? [] : await this.overlapsFor(input);
    return {
      valid: issues.length === 0 && overlaps.length === 0,
      issues,
      competitiveOverlap: overlaps,
      outcome: issues.length ? null : this.compose(input).outcome,
    };
  }

  async publishScoped(worldId: string, mechanicKey: string) {
    const pair = await this.requireScopedPair(worldId, mechanicKey);
    const record = await this.scopedTutorials.findByPair(
      worldId,
      String(pair.mechanic._id),
    );
    const draft = record?.draft as unknown as TutorialScenarioInput | null;
    if (!record || !draft) {
      throw new WorldContentValidationError(
        [
          {
            code: 'SCOPED_TUTORIAL_DRAFT_MISSING',
            message: 'لا توجد مسودة للنشر.',
          },
        ],
        'No scoped tutorial draft to publish',
      );
    }
    const issues = await this.validateScopedInput(
      pair.mechanic,
      mechanicKey,
      draft,
    );
    if (issues.length) {
      throw new WorldContentValidationError(
        issues,
        'Scoped tutorial scenario invalid',
      );
    }
    const overlaps = await this.overlapsFor(draft);
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
    const published = this.compose(draft) as unknown as Record<string, unknown>;
    const previous = record.published;
    const nextRevision = (record.publishedRevision ?? 0) + 1;
    if (previous && record.publishedRevision > 0) {
      record.revisionHistory.push({
        revision: record.publishedRevision,
        scenario: JSON.parse(JSON.stringify(previous)),
        publishedAt: record.publishedAt ?? new Date(),
      });
    }
    record.published = published;
    record.publishedRevision = nextRevision;
    record.publishedAt = new Date();
    record.withdrawnAt = null;
    record.flowContractVersion = SCOPED_TUTORIAL_FLOW_CONTRACT_VERSION;
    await record.save();
    return this.getScopedForAdmin(worldId, mechanicKey);
  }

  async listScopedRevisions(worldId: string, mechanicKey: string) {
    const pair = await this.requireScopedPair(worldId, mechanicKey);
    const record = await this.scopedTutorials.findByPair(
      worldId,
      String(pair.mechanic._id),
    );
    return (record?.revisionHistory ?? []).map((revision) => ({
      revision: revision.revision,
      publishedAt: revision.publishedAt,
      restoredFromRevision: revision.restoredFromRevision ?? null,
      scenario: revision.scenario,
    }));
  }

  async restoreScopedRevision(
    worldId: string,
    mechanicKey: string,
    revision: number,
  ) {
    const pair = await this.requireScopedPair(worldId, mechanicKey);
    const record = await this.scopedTutorials.findByPair(
      worldId,
      String(pair.mechanic._id),
    );
    const historical = record?.revisionHistory.find(
      (entry) => entry.revision === revision,
    );
    if (!record || !historical) {
      throw new NotFoundException({
        code: 'SCOPED_TUTORIAL_REVISION_NOT_FOUND',
        message: `No scoped tutorial revision ${revision} exists`,
      });
    }
    record.draft = JSON.parse(JSON.stringify(historical.scenario));
    record.draftUpdatedAt = new Date();
    await record.save();
    return this.publishScoped(worldId, mechanicKey);
  }

  async withdrawScoped(worldId: string, mechanicKey: string) {
    const pair = await this.requireScopedPair(worldId, mechanicKey);
    const record = await this.scopedTutorials.findByPair(
      worldId,
      String(pair.mechanic._id),
    );
    if (!record) return this.getScopedForAdmin(worldId, mechanicKey);
    record.published = null;
    record.publishedAt = null;
    record.withdrawnAt = new Date();
    await record.save();
    return this.getScopedForAdmin(worldId, mechanicKey);
  }

  /** World-aware public resolver. Drafts and revision history never escape. */
  async getPublishedForWorld(worldId: string, mechanicKey: string) {
    try {
      const pair = await this.requireScopedPair(worldId, mechanicKey);
      const record = await this.scopedTutorials.findByPair(
        worldId,
        String(pair.mechanic._id),
      );
      if (record?.published) {
        return {
          source: 'world' as const,
          worldId,
          mechanicKey: pair.mechanic.slug,
          revision: record.publishedRevision,
          scenario: record.published,
        };
      }
      const generic = pair.mechanic.tutorial?.published;
      return generic
        ? {
            source: 'generic' as const,
            worldId: null,
            mechanicKey: pair.mechanic.slug,
            revision: pair.mechanic.tutorial?.publishedRevision ?? 0,
            scenario: generic,
          }
        : null;
    } catch {
      try {
        const generic = await this.getPublished(mechanicKey);
        return generic
          ? { ...generic, source: 'generic' as const, worldId: null }
          : null;
      } catch {
        return null;
      }
    }
  }

  private async validateScopedInput(
    mechanic: ChallengeType,
    mechanicKey: string,
    input: TutorialScenarioInput,
  ) {
    const issues = validateMechanicTutorialScenario(mechanic.slug, input);
    if (!isScopedTutorialMechanicKey(mechanicKey)) {
      issues.push({
        code: 'SCOPED_TUTORIAL_MECHANIC_UNSUPPORTED',
        message: 'This mechanic is not eligible for World-specific tutorials.',
      });
      return issues;
    }
    const baseline = mechanic.tutorial?.published ?? mechanic.tutorial?.draft;
    issues.push(
      ...validateScopedTutorialFlow(
        mechanicKey,
        input,
        baseline as unknown as TutorialScenarioInput | null | undefined,
      ),
    );
    return issues;
  }

  private async requireScopedPair(worldId: string, mechanicKey: string) {
    if (!Types.ObjectId.isValid(worldId)) {
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'World not found',
      });
    }
    const [world, mechanic] = await Promise.all([
      this.worlds.findById(worldId),
      this.findMechanic(mechanicKey),
    ]);
    if (!world) {
      throw new NotFoundException({
        code: 'WORLD_NOT_FOUND',
        message: 'World not found',
      });
    }
    const configuration = await this.configurations.findByWorldAndChallengeType(
      worldId,
      String(mechanic._id),
    );
    if (!configuration) {
      throw new NotFoundException({
        code: 'WORLD_MECHANIC_NOT_ASSOCIATED',
        message: 'This mechanic is not associated with the World',
      });
    }
    return { world, mechanic, configuration };
  }

  private compose(input: TutorialScenarioInput): StoredTutorialScenario {
    if (tutorialKind(input) === 'ekshifni') {
      const ekshifni = input as EkshifniTutorialScenarioInput;
      return {
        kind: 'ekshifni',
        version: 1,
        prompt: ekshifni.prompt.trim(),
        celebrityIdentity: ekshifni.celebrityIdentity.trim(),
        image: {
          url: ekshifni.image.url.trim(),
          altText: ekshifni.image.altText.trim(),
          sha256: ekshifni.image.sha256.toLowerCase(),
          provenanceNote: ekshifni.image.provenanceNote.trim(),
        },
        regions: ekshifni.regions.map((region) => ({
          id: region.id.trim(),
          number: region.number,
          shape: { ...region.shape },
        })),
        wrongSubmittedAnswer: ekshifni.wrongSubmittedAnswer.trim(),
        correctSubmittedAnswer: ekshifni.correctSubmittedAnswer.trim(),
        ...(ekshifni.caption?.trim()
          ? { caption: ekshifni.caption.trim() }
          : {}),
        outcome: deriveEkshifniTutorialOutcome(ekshifni),
      };
    }
    if (tutorialKind(input) === 'one-clue') {
      const oneClue = input as OneClueTutorialScenarioInput;
      return {
        kind: 'one-clue',
        version: 1,
        prompt: oneClue.prompt.trim(),
        clues: oneClue.clues.map((clue) => ({
          order: clue.order,
          value: clue.value,
          text: clue.text.trim(),
        })),
        acceptedAnswer: oneClue.acceptedAnswer.trim(),
        firstSubmittedAnswer: oneClue.firstSubmittedAnswer.trim(),
        secondSubmittedAnswer: oneClue.secondSubmittedAnswer.trim(),
        ...(oneClue.caption?.trim() ? { caption: oneClue.caption.trim() } : {}),
        outcome: deriveOneClueTutorialOutcome(oneClue),
      };
    }
    if (tutorialKind(input) === 'bomb') {
      const bomb = input as BombTutorialScenarioInput;
      return {
        kind: 'bomb',
        version: 1,
        prompt: bomb.prompt.trim(),
        acceptedAnswer: bomb.acceptedAnswer.trim(),
        nextPrompt: bomb.nextPrompt.trim(),
        ...(bomb.media
          ? {
              media: {
                type: 'image' as const,
                url: bomb.media.url.trim(),
                altText: bomb.media.altText.trim(),
              },
            }
          : {}),
        ...(bomb.nextQuestion
          ? {
              nextQuestion: {
                prompt: bomb.nextQuestion.prompt.trim(),
                acceptedAnswer: bomb.nextQuestion.acceptedAnswer.trim(),
                ...(bomb.nextQuestion.media
                  ? {
                      media: {
                        type: 'image' as const,
                        url: bomb.nextQuestion.media.url.trim(),
                        altText: bomb.nextQuestion.media.altText.trim(),
                      },
                    }
                  : {}),
              },
            }
          : {}),
        ...(bomb.returnQuestion
          ? {
              returnQuestion: {
                prompt: bomb.returnQuestion.prompt.trim(),
                acceptedAnswer: bomb.returnQuestion.acceptedAnswer.trim(),
                ...(bomb.returnQuestion.media
                  ? {
                      media: {
                        type: 'image' as const,
                        url: bomb.returnQuestion.media.url.trim(),
                        altText: bomb.returnQuestion.media.altText.trim(),
                      },
                    }
                  : {}),
              },
            }
          : {}),
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
    if (tutorialKind(input) === 'top-5') {
      const top5 = input as Top5TutorialScenarioInput;
      return {
        kind: 'top-5',
        version: 1,
        prompt: top5.prompt.trim(),
        title: top5.title.trim(),
        rankingBasis: top5.rankingBasis.trim(),
        sourceLabel: top5.sourceLabel.trim(),
        entries: top5.entries.map((entry) => ({
          id: entry.id.trim(),
          label: entry.label.trim(),
          rank: entry.rank,
        })),
        decisions: top5.decisions.map((decision) => ({
          action: decision.action,
        })),
        startingTeam: top5.startingTeam,
        ...(top5.instruction?.trim()
          ? { instruction: top5.instruction.trim() }
          : {}),
        ...(top5.caption?.trim() ? { caption: top5.caption.trim() } : {}),
        outcome: deriveTop5TutorialOutcome(top5),
      };
    }
    if (tutorialKind(input) === 'combo') {
      const combo = input as ComboTutorialScenarioInput;
      return {
        kind: 'combo',
        version: 1,
        prompt: combo.stages[0]?.prompt.trim() ?? '',
        stages: combo.stages.map((stage) => ({
          stage: stage.stage,
          prompt: stage.prompt.trim(),
          correctAnswer: stage.correctAnswer.trim(),
          submittedAnswer: stage.submittedAnswer.trim(),
        })),
        ...(combo.caption?.trim() ? { caption: combo.caption.trim() } : {}),
        outcome: deriveComboTutorialOutcome(combo),
      };
    }
    if (tutorialKind(input) === 'marhala') {
      const marhala = input as MarhalaTutorialScenarioInput;
      return {
        kind: 'marhala',
        version: 1,
        prompt: marhala.prompt.trim(),
        correctAnswer: marhala.correctAnswer.trim(),
        submittedAnswer: marhala.submittedAnswer.trim(),
        teamAPosition: marhala.teamAPosition,
        teamBPosition: marhala.teamBPosition,
        activeTeam: marhala.activeTeam,
        difficulty: marhala.difficulty,
        movement: marhala.movement,
        baseLanding: marhala.baseLanding,
        tile: marhala.tile,
        finalLanding: marhala.finalLanding,
        ...(marhala.caption?.trim() ? { caption: marhala.caption.trim() } : {}),
        outcome: deriveMarhalaTutorialOutcome(marhala),
      };
    }
    if (tutorialKind(input) === 'laqatha') {
      const laqatha = input as LaqathaTutorialScenarioInput;
      return {
        kind: 'laqatha',
        version: 1,
        prompt: laqatha.prompt.trim(),
        title: laqatha.title.trim(),
        clues: laqatha.clues.map((clue) => ({
          order: clue.order,
          value: clue.value,
          text: clue.text.trim(),
        })),
        acceptedAnswers: laqatha.acceptedAnswers.map((answer) => answer.trim()),
        firstSubmittedAnswer: laqatha.firstSubmittedAnswer.trim(),
        secondSubmittedAnswer: laqatha.secondSubmittedAnswer.trim(),
        ...(laqatha.caption?.trim() ? { caption: laqatha.caption.trim() } : {}),
        outcome: deriveLaqathaTutorialOutcome(laqatha),
      };
    }
    if (tutorialKind(input) === 'first-note') {
      const firstNote = input as FirstNoteTutorialScenarioInput;
      return {
        kind: 'first-note',
        version: 1,
        prompt: firstNote.prompt.trim(),
        title: firstNote.title.trim(),
        ...(firstNote.clueLabel?.trim()
          ? { clueLabel: firstNote.clueLabel.trim() }
          : {}),
        contextualClue: firstNote.contextualClue.trim(),
        bids: firstNote.bids.map((bid) => ({
          team: bid.team,
          seconds: bid.seconds,
        })),
        acceptedAnswers: firstNote.acceptedAnswers.map((answer) =>
          answer.trim(),
        ),
        firstSubmittedAnswer: firstNote.firstSubmittedAnswer.trim(),
        stealSubmittedAnswer: firstNote.stealSubmittedAnswer.trim(),
        ...(firstNote.caption?.trim()
          ? { caption: firstNote.caption.trim() }
          : {}),
        outcome: deriveFirstNoteTutorialOutcome(firstNote),
      };
    }
    if (tutorialKind(input) === 'la-tahriqha') {
      const laTahriqha = input as LaTahriqhaTutorialScenarioInput;
      return {
        kind: 'la-tahriqha',
        version: 1,
        prompt: laTahriqha.prompt.trim(),
        dishWindowSeconds: laTahriqha.dishWindowSeconds,
        dishes: laTahriqha.dishes.map((dish) => ({
          id: dish.id.trim(),
          name: dish.name.trim(),
          ingredients: dish.ingredients.map((ingredient) => ({
            id: ingredient.id.trim(),
            label: ingredient.label.trim(),
            correct: ingredient.correct,
          })),
          teamASelection: [...dish.teamASelection],
          teamBSelection: [...dish.teamBSelection],
        })),
        captainRotation: {
          teamA: laTahriqha.captainRotation.teamA.map((captain) =>
            captain.trim(),
          ),
          teamB: laTahriqha.captainRotation.teamB.map((captain) =>
            captain.trim(),
          ),
        },
        ...(laTahriqha.caption?.trim()
          ? { caption: laTahriqha.caption.trim() }
          : {}),
        outcome: deriveLaTahriqhaTutorialOutcome(laTahriqha),
      };
    }
    if (tutorialKind(input) === 'odd-piece') {
      const oddPiece = input as OddPieceTutorialScenarioInput;
      if (oddPiece.version === 2) {
        return {
          kind: 'odd-piece',
          version: 2,
          prompt: oddPiece.prompt.trim(),
          targetVehicleIdentity: oddPiece.targetVehicleIdentity.trim(),
          targetVehicleLabel: oddPiece.targetVehicleLabel.trim(),
          intruderVehicleIdentity: oddPiece.intruderVehicleIdentity.trim(),
          intruderVehicleLabel: oddPiece.intruderVehicleLabel.trim(),
          intruderPartIdentity: oddPiece.intruderPartIdentity.trim(),
          intruderPartLabel: oddPiece.intruderPartLabel.trim(),
          modifiedImage: oddPiece.modifiedImage,
          originalImage: oddPiece.originalImage,
          ...(oddPiece.tutorialRevealMode
            ? { tutorialRevealMode: oddPiece.tutorialRevealMode }
            : {}),
          ...(oddPiece.tutorialMediaDisclosure?.trim()
            ? {
                tutorialMediaDisclosure:
                  oddPiece.tutorialMediaDisclosure.trim(),
              }
            : {}),
          ...(oddPiece.team1Tap ? { team1Tap: { ...oddPiece.team1Tap } } : {}),
          ...(oddPiece.team2Tap ? { team2Tap: { ...oddPiece.team2Tap } } : {}),
          hotspot: oddPiece.hotspot,
          wrongPoint: oddPiece.wrongPoint,
          correctPoint: oddPiece.correctPoint,
          ...(oddPiece.caption?.trim()
            ? { caption: oddPiece.caption.trim() }
            : {}),
          outcome: deriveOddPieceTutorialOutcome(oddPiece),
        };
      }
      return {
        kind: 'odd-piece',
        version: 1,
        prompt: oddPiece.prompt.trim(),
        targetVehicleIdentity: oddPiece.targetVehicleIdentity.trim(),
        targetVehicleLabel: oddPiece.targetVehicleLabel.trim(),
        intruderVehicleIdentity: oddPiece.intruderVehicleIdentity.trim(),
        intruderVehicleLabel: oddPiece.intruderVehicleLabel.trim(),
        pieces: oddPiece.pieces.map((piece) => ({
          id: piece.id.trim(),
          imageUrl: piece.imageUrl.trim(),
          altText: piece.altText.trim(),
          vehicleIdentity: piece.vehicleIdentity.trim(),
          vehicleLabel: piece.vehicleLabel.trim(),
        })),
        wrongSelectionPieceId: oddPiece.wrongSelectionPieceId.trim(),
        correctSelectionPieceId: oddPiece.correctSelectionPieceId.trim(),
        targetReveal: {
          imageUrl: oddPiece.targetReveal.imageUrl.trim(),
          altText: oddPiece.targetReveal.altText.trim(),
        },
        ...(oddPiece.caption?.trim()
          ? { caption: oddPiece.caption.trim() }
          : {}),
        outcome: deriveOddPieceTutorialOutcome(oddPiece),
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

  private async overlapsFor(input: TutorialScenarioInput) {
    if (tutorialKind(input) === 'ekshifni') {
      return this.overlaps((input as EkshifniTutorialScenarioInput).prompt);
    }
    if (tutorialKind(input) === 'one-clue') {
      return this.overlaps((input as OneClueTutorialScenarioInput).prompt);
    }
    if (tutorialKind(input) === 'combo') {
      const combo = input as ComboTutorialScenarioInput;
      const matches = await Promise.all(
        combo.stages.map((stage) => this.overlaps(stage.prompt)),
      );
      return matches.flat();
    }
    if (tutorialKind(input) === 'marhala') {
      return this.overlaps((input as MarhalaTutorialScenarioInput).prompt);
    }
    if (tutorialKind(input) === 'laqatha') {
      return this.overlaps((input as LaqathaTutorialScenarioInput).prompt);
    }
    if (tutorialKind(input) === 'first-note') {
      return this.overlaps((input as FirstNoteTutorialScenarioInput).prompt);
    }
    if (tutorialKind(input) === 'la-tahriqha') {
      return this.overlaps((input as LaTahriqhaTutorialScenarioInput).prompt);
    }
    if (tutorialKind(input) === 'odd-piece') {
      return this.overlaps((input as OddPieceTutorialScenarioInput).prompt);
    }
    return this.overlaps((input as RyoTutorialScenarioInput).prompt);
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
