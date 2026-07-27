import { Injectable } from '@nestjs/common';
import type { CategoryGameplayConfig } from '../../categories/schemas/category.schema';
import type { CategoryGenerationProfile } from './category-generation-profile.registry';
import type {
  GenerationPlanSlot,
  PipelineDifficulty,
} from './ai-generation-pipeline.types';
import type {
  GameMode,
  QuestionAssetType,
} from '../contracts/asset-provider.interface';
import type { KnowledgePack } from '../domain/knowledge-unit.types';
import type { SourceQuestionCandidate } from '../domain/question-source.types';

@Injectable()
export class GenerationPlannerService {
  planSourceCandidates(input: {
    count: number;
    requestedDifficulty?: PipelineDifficulty;
    profile: CategoryGenerationProfile;
    candidates: SourceQuestionCandidate[];
    sourceRequired?: boolean;
  }): GenerationPlanSlot[] {
    return Array.from({ length: input.count }, (_, index) => {
      const candidate = input.candidates[index];
      return {
        slotId: `slot-${index + 1}`,
        difficulty:
          input.requestedDifficulty ??
          candidate?.originalDifficulty ??
          'medium',
        gameMode: 'trivia',
        topicIntent: candidate?.sourceCategory,
        candidateSource: candidate?.sourceId,
        requestedAssetType: 'text',
        sourceCandidate: candidate,
        sourceRequired: input.sourceRequired ?? false,
      };
    });
  }

  plan(input: {
    count: number;
    requestedDifficulty?: PipelineDifficulty;
    profile: CategoryGenerationProfile;
    gameplay?: CategoryGameplayConfig;
    pack?: KnowledgePack;
  }): GenerationPlanSlot[] {
    const difficulties = input.requestedDifficulty
      ? (Array(input.count).fill(
          input.requestedDifficulty,
        ) as PipelineDifficulty[])
      : this.allocate(
          input.count,
          input.gameplay?.preferredDifficultyMix ?? {
            easy: 30,
            medium: 50,
            hard: 20,
          },
          ['easy', 'medium', 'hard'],
        );
    const modes = this.allocate(
      input.count,
      input.gameplay?.gameModes ??
        input.profile.allowedGameModes.reduce<
          Partial<Record<GameMode, number>>
        >((a, mode) => ({ ...a, [mode]: 1 }), {}),
      input.profile.allowedGameModes,
    );
    const topicIntents = input.pack?.topicIntents ?? ['general'];
    return Array.from({ length: input.count }, (_, index) => {
      const gameMode = modes[index];
      const topicIntent = topicIntents[index % topicIntents.length];
      const configured = input.pack?.candidatesByIntent?.[topicIntent] ?? [];
      const eligible = configured.filter(
        (candidate) =>
          !candidate.difficulties?.length ||
          candidate.difficulties.includes(difficulties[index]),
      );
      const pool = eligible.length ? eligible : configured;
      const intentOccurrence = topicIntents
        .slice(0, index)
        .filter((intent) => intent === topicIntent).length;
      const selected = pool[intentOccurrence % Math.max(1, pool.length)];
      const requestedAssetType = this.assetType(gameMode);
      return {
        slotId: `slot-${index + 1}`,
        difficulty: difficulties[index],
        gameMode,
        topicIntent,
        ...(selected
          ? {
              entityCandidate: selected.entity,
              candidateAliases: selected.aliases,
              candidateSource: 'knowledge-pack-seed' as const,
              candidateAliasUsed: selected.aliases[0],
            }
          : {}),
        requestedAssetType,
        sourceRequired: this.isSourceRequired(
          input.profile,
          requestedAssetType,
        ),
      };
    });
  }

  isSourceRequired(
    profile: CategoryGenerationProfile,
    assetType: QuestionAssetType,
  ): boolean {
    return (
      ['image', 'video', 'audio'].includes(assetType) ||
      profile.sourceRequired === true
    );
  }

  private allocate<T extends string>(
    count: number,
    weights: Partial<Record<T, number>>,
    allowed: readonly T[],
  ): T[] {
    const entries = allowed
      .map((key) => ({ key, weight: Math.max(0, weights[key] ?? 0) }))
      .filter((item) => item.weight > 0);
    const usable = entries.length
      ? entries
      : allowed.map((key) => ({ key, weight: 1 }));
    const total = usable.reduce((sum, item) => sum + item.weight, 0);
    const result: T[] = [];
    const quotas = usable.map((item) => ({
      ...item,
      exact: (item.weight / total) * count,
      used: 0,
    }));
    while (result.length < count) {
      const next = [...quotas].sort(
        (a, b) => b.exact - b.used - (a.exact - a.used),
      )[0];
      result.push(next.key);
      next.used += 1;
    }
    return result;
  }

  private assetType(mode: GameMode): QuestionAssetType {
    if (
      [
        'identifyVoice',
        'identifySong',
        'identifySinger',
        'identifyMusicIntro',
      ].includes(mode)
    )
      return 'audio';
    if (['identifyCharacter', 'identifyImage'].includes(mode)) return 'image';
    if (mode === 'emojiPuzzle') return 'emoji';
    if (mode === 'timeline') return 'timeline';
    return 'text';
  }
}
