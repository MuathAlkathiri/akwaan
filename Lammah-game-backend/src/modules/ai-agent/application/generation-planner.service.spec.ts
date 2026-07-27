import { GenerationPlannerService } from './generation-planner.service';
import { categoryProfileRegistry } from './category-generation-profile.registry';
import { KnowledgePackRegistry } from './knowledge-pack.registry';

describe('GenerationPlannerService', () => {
  const planner = new GenerationPlannerService();
  const profile = categoryProfileRegistry.byId('general-text-trivia');
  it('creates a stable balanced plan with the requested total', () => {
    const plan = planner.plan({
      count: 5,
      profile,
      gameplay: { preferredDifficultyMix: { easy: 20, medium: 60, hard: 20 } },
    });
    expect(plan).toHaveLength(5);
    expect(plan.map((slot) => slot.slotId)).toEqual([
      'slot-1',
      'slot-2',
      'slot-3',
      'slot-4',
      'slot-5',
    ]);
    expect(plan.filter((slot) => slot.difficulty === 'medium')).toHaveLength(3);
  });
  it('excludes unsupported modes and handles a single slot', () => {
    const plan = planner.plan({
      count: 1,
      profile,
      requestedDifficulty: 'hard',
      gameplay: { gameModes: { identifySong: 100, trivia: 1 } },
    });
    expect(plan[0]).toMatchObject({
      difficulty: 'hard',
      gameMode: 'trivia',
      requestedAssetType: 'text',
    });
  });
  it('assigns distinct focused football candidates for two persisted-category slots', () => {
    const football = categoryProfileRegistry.byId('football');
    const plan = planner.plan({
      count: 2,
      profile: football,
      pack: new KnowledgePackRegistry().fromProfile(football),
    });
    expect(plan).toMatchObject([
      {
        topicIntent: 'player-career',
        entityCandidate: 'Lionel Messi',
        candidateSource: 'knowledge-pack-seed',
      },
      {
        topicIntent: 'tournament-history',
        entityCandidate: '2014 FIFA World Cup Final',
        candidateSource: 'knowledge-pack-seed',
      },
    ]);
    expect(new Set(plan.map((slot) => slot.entityCandidate)).size).toBe(2);
  });
  it.each(['image', 'video', 'audio'] as const)(
    'requires a source for %s slots',
    (assetType) => {
      expect(planner.isSourceRequired(profile, assetType)).toBe(true);
    },
  );
  it('makes a standard text source optional unless the profile requires it', () => {
    expect(planner.isSourceRequired(profile, 'text')).toBe(false);
    expect(
      planner.isSourceRequired(
        {
          ...categoryProfileRegistry.byId('gulf-music'),
          sourceRequired: true,
        },
        'text',
      ),
    ).toBe(true);
  });
});
