import { randomInt, randomUUID } from 'crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ContentItemRepository } from '../../world-content/persistence/content-item.repository';
import { ChallengeTypeRepository } from '../../world-content/persistence/challenge-type.repository';
import { WorldChallengeConfigurationRepository } from '../../world-content/persistence/world-challenge-configuration.repository';
import {
  ContentItemStatus,
  RAKKIBHA_ITEM_COUNT,
  RAKKIBHA_TEAM_SIZES,
  RAKKIBHA_TIMER_SECONDS,
  RAKKIBHA_VARIANT,
  WorldChallengeSlotKey,
} from '../../world-content/domain/world-content.constants';
import {
  ContentItemMedia,
  RakkibhaPayload,
} from '../../world-content/domain/world-content.types';
import {
  GAMEPLAY_RUNTIME_REPOSITORY,
  GameplayRuntimeRepository,
} from '../domain/gameplay-runtime.repository';
import {
  LIVE_GAME_SESSION_REPOSITORY,
  LiveGameSessionRepository,
} from '../domain/live-game-session.repository';
import { LiveSessionDomainError } from '../domain/live-session.errors';
import {
  RAKKIBHA_MODE_KEY,
  RakkibhaCandidateView,
  RakkibhaMedia,
  RakkibhaParticipantAssignment,
  RakkibhaPuzzle,
  RakkibhaTeamPlan,
} from '../domain/rakkibha.plugin';
import {
  CreateGameplayRuntime,
  GetGameplayRuntime,
} from './gameplay-runtime.queries';
import {
  CreateGameplayRound,
  StartGameplayRound,
  StartGameplayRuntime,
} from './gameplay-runtime.lifecycle';

function shuffled<T>(values: readonly T[]): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = randomInt(index + 1);
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}
function compactMedia(
  media: ContentItemMedia | undefined,
): RakkibhaMedia | undefined {
  if (!media || !['image', 'audio', 'video'].includes(media.type))
    return undefined;
  const asset = media.assets?.[0];
  if (!asset?.url?.trim()) return undefined;
  return {
    type: media.type as RakkibhaMedia['type'],
    url: asset.url.trim(),
    ...(asset.altText ? { altText: asset.altText } : {}),
  };
}

@Injectable()
export class StartRakkibha {
  constructor(
    @Inject(LIVE_GAME_SESSION_REPOSITORY)
    private readonly sessions: LiveGameSessionRepository,
    @Inject(GAMEPLAY_RUNTIME_REPOSITORY)
    private readonly runtimes: GameplayRuntimeRepository,
    private readonly items: ContentItemRepository,
    private readonly challengeTypes: ChallengeTypeRepository,
    private readonly configurations: WorldChallengeConfigurationRepository,
    private readonly createRuntime: CreateGameplayRuntime,
    private readonly startRuntime: StartGameplayRuntime,
    private readonly createRound: CreateGameplayRound,
    private readonly startRound: StartGameplayRound,
    private readonly getRuntime: GetGameplayRuntime,
  ) {}

  async execute(input: {
    sessionId: string;
    actorId: string;
    worldId: string;
    slotKey: WorldChallengeSlotKey;
    contentItemIds: string[];
  }) {
    if (
      input.contentItemIds.length !== RAKKIBHA_ITEM_COUNT ||
      new Set(input.contentItemIds).size !== RAKKIBHA_ITEM_COUNT
    ) {
      throw new LiveSessionDomainError(
        'RAKKIBHA_REQUIRES_THREE_ITEMS',
        `Select exactly ${RAKKIBHA_ITEM_COUNT} distinct ContentItems`,
      );
    }
    const session = await this.sessions.findById(input.sessionId);
    if (!session || session.controllerActorId !== input.actorId)
      throw new LiveSessionDomainError(
        'RAKKIBHA_LAUNCH_FORBIDDEN',
        'Only the session controller can launch this challenge',
      );
    const sessionState = session.serialize();
    if (sessionState.status !== 'active')
      throw new LiveSessionDomainError(
        'SESSION_NOT_ACTIVE',
        'Start the live session before launching this challenge',
      );
    const configuration = await this.configurations.findByWorldAndSlot(
      input.worldId,
      input.slotKey,
    );
    const mechanic = configuration
      ? await this.challengeTypes.findById(
          String(configuration.challengeTypeId),
        )
      : null;
    if (
      !configuration ||
      !configuration.isEnabled ||
      !mechanic ||
      mechanic.slug !== RAKKIBHA_MODE_KEY
    ) {
      throw new LiveSessionDomainError(
        'RAKKIBHA_SLOT_INVALID',
        'The selected board position must use the canonical ركّبها mechanic',
      );
    }
    const teams = this.eligibleTeams(sessionState);
    const puzzles = await this.loadPuzzles(
      input.contentItemIds,
      input.worldId,
      String(mechanic._id),
    );
    const now = new Date();
    const deadlineAt = new Date(now.getTime() + RAKKIBHA_TIMER_SECONDS * 1000);
    const plans = teams.map((team) =>
      this.planFor(team.teamId, team.participantIds, puzzles),
    );
    const actor = { kind: 'user' as const, actorId: input.actorId };
    await this.createRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      modeKey: RAKKIBHA_MODE_KEY,
      modeVersion: 1,
      initialState: {
        variant: RAKKIBHA_VARIANT,
        worldId: input.worldId,
        slotKey: input.slotKey,
        phase: 'active',
        puzzlesJson: JSON.stringify(puzzles),
        plansJson: JSON.stringify(plans),
        progressJson: JSON.stringify(
          plans.map((plan) => ({
            teamId: plan.teamId,
            solved: 0,
            wrongAttempts: 0,
            lastProgressAt: 0,
            lockUntil: 0,
          })),
        ),
        contentItemIdsJson: JSON.stringify(input.contentItemIds),
        startedAtMs: now.getTime(),
        deadlineAt: deadlineAt.toISOString(),
      },
    });
    let runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    await this.startRuntime.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
    });
    runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    await this.createRound.execute({
      sessionId: input.sessionId,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
    });
    runtime = (await this.runtimes.findBySessionId(input.sessionId))!;
    await this.startRound.execute({
      sessionId: input.sessionId,
      roundId: runtime.serialize().activeRound!.id,
      actor,
      commandId: randomUUID(),
      expectedSessionRevision: session.revision,
      expectedRuntimeRevision: runtime.revision,
    });
    return this.getRuntime.execute(input.sessionId, actor);
  }

  private eligibleTeams(
    sessionState: ReturnType<
      import('../domain/live-game-session').LiveGameSession['serialize']
    >,
  ) {
    const teams = sessionState.teams.filter((team) => team.active);
    if (teams.length !== 2)
      throw new LiveSessionDomainError(
        'RAKKIBHA_REQUIRES_TWO_TEAMS',
        'Rakkibha is a race between exactly two teams',
      );
    return teams.map((team) => {
      const participantIds = sessionState.participants
        .filter(
          (participant) =>
            participant.role === 'team-player' &&
            participant.teamId === team.id &&
            participant.connected &&
            !participant.removedAt,
        )
        .map((participant) => participant.id);
      if (participantIds.length < 2 || participantIds.length > 3)
        throw new LiveSessionDomainError(
          'RAKKIBHA_TEAM_SIZE_UNSUPPORTED',
          'Each team needs two or three connected players',
        );
      return { teamId: team.id, participantIds };
    });
  }

  private async loadPuzzles(
    contentItemIds: string[],
    worldId: string,
    challengeTypeId: string,
  ): Promise<RakkibhaPuzzle[]> {
    const documents = await Promise.all(
      contentItemIds.map((id) => this.items.findById(id)),
    );
    return documents.map((item) => {
      const payload = item?.mechanicPayload as RakkibhaPayload | undefined;
      if (
        !item ||
        item.status !== ContentItemStatus.READY ||
        String(item.worldId) !== worldId ||
        !item.compatibleChallengeTypeIds.some(
          (id) => String(id) === challengeTypeId,
        ) ||
        payload?.variant !== RAKKIBHA_VARIANT ||
        payload.family !== RAKKIBHA_VARIANT ||
        !payload.instruction?.ar?.trim() ||
        !payload.reference?.media ||
        !Array.isArray(payload.candidateViews) ||
        payload.authorSafetyConfirmation !== true
      ) {
        throw new LiveSessionDomainError(
          'RAKKIBHA_CONTENT_INVALID',
          'Every item must be ready, compatible, and a validated visual-assembly item',
        );
      }
      const candidateViews = payload.candidateViews;
      if (
        candidateViews.length < 2 ||
        new Set(candidateViews.map((view) => view.id)).size !==
          candidateViews.length ||
        candidateViews.some(
          (view) =>
            !view.id?.trim() ||
            view.candidates.length < 2 ||
            view.candidates.length > 3 ||
            new Set(view.candidates.map((candidate) => candidate.localId))
              .size !== view.candidates.length,
        )
      ) {
        throw new LiveSessionDomainError(
          'RAKKIBHA_CONTENT_INVALID',
          'Rakkibha needs unique candidate views with two or three candidates each',
        );
      }
      const trueCandidates = candidateViews
        .flatMap((view) => view.candidates)
        .filter(
          (candidate) =>
            candidate.canonicalIdentity === payload.correctCanonicalIdentity,
        );
      if (
        !payload.correctCanonicalIdentity?.trim() ||
        trueCandidates.length !== 1 ||
        !Array.isArray(payload.supportedTeamSizes) ||
        [...payload.supportedTeamSizes].sort().join(',') !==
          [...RAKKIBHA_TEAM_SIZES].sort().join(',')
      ) {
        throw new LiveSessionDomainError(
          'RAKKIBHA_CONTENT_INVALID',
          'Rakkibha needs exactly one true candidate and supports only two or three players',
        );
      }
      const referenceMedia = compactMedia(payload.reference.media);
      if (!referenceMedia)
        throw new LiveSessionDomainError(
          'RAKKIBHA_CONTENT_INVALID',
          'Reference media is required',
        );
      return {
        contentItemId: String(item._id),
        instruction: payload.instruction.ar,
        reference: {
          ...(payload.reference.content?.ar
            ? { content: payload.reference.content.ar }
            : {}),
          media: referenceMedia,
        },
        candidateViews: candidateViews.map((view) => ({
          id: view.id,
          ...(view.content?.ar ? { content: view.content.ar } : {}),
          candidates: view.candidates.map((candidate) => {
            const media = compactMedia(candidate.media);
            if (!media)
              throw new LiveSessionDomainError(
                'RAKKIBHA_CONTENT_INVALID',
                'Every candidate needs media',
              );
            return {
              localId: candidate.localId,
              canonicalIdentity: candidate.canonicalIdentity,
              ...(candidate.content?.ar
                ? { content: candidate.content.ar }
                : {}),
              media,
            };
          }),
        })),
        correctCanonicalIdentity: payload.correctCanonicalIdentity,
      };
    });
  }

  private planFor(
    teamId: string,
    participantIds: string[],
    puzzles: RakkibhaPuzzle[],
  ): RakkibhaTeamPlan {
    const order = shuffled(puzzles.map((_, index) => index));
    return {
      teamId,
      participantIds,
      order,
      assignments: order.map((puzzleIndex) =>
        this.assign(
          participantIds,
          puzzles[puzzleIndex].candidateViews,
          puzzles[puzzleIndex].correctCanonicalIdentity,
        ),
      ),
    };
  }
  private assign(
    participantIds: string[],
    views: RakkibhaCandidateView[],
    correctIdentity: string,
  ): RakkibhaParticipantAssignment[] {
    const trueView = views.find((view) =>
      view.candidates.some(
        (candidate) => candidate.canonicalIdentity === correctIdentity,
      ),
    );
    const distractorView = views.find(
      (view) =>
        !view.candidates.some(
          (candidate) => candidate.canonicalIdentity === correctIdentity,
        ),
    );
    if (!trueView)
      throw new LiveSessionDomainError(
        'RAKKIBHA_CONTENT_INVALID',
        'A true-holder view is required',
      );
    const participants = shuffled(participantIds);
    if (participants.length === 2) {
      return [
        { participantId: participants[0], hasReference: true },
        {
          participantId: participants[1],
          hasReference: false,
          candidateViewId: trueView.id,
        },
      ];
    }
    const distractorId =
      distractorView?.id ??
      (() => {
        throw new LiveSessionDomainError(
          'RAKKIBHA_CONTENT_INVALID',
          'A distractor-only view is required',
        );
      })();
    return [
      { participantId: participants[0], hasReference: true },
      {
        participantId: participants[1],
        hasReference: false,
        candidateViewId: trueView.id,
      },
      {
        participantId: participants[2],
        hasReference: false,
        candidateViewId: distractorId,
      },
    ];
  }
}
