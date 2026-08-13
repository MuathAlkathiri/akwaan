import { categoryProfileRegistry } from './category-generation-profile.registry';
import { KnowledgePackRegistry } from './knowledge-pack.registry';

describe('KnowledgePackRegistry', () => {
  const registry = new KnowledgePackRegistry();
  it('turns category policy into data instead of branching orchestration', () => {
    const pack = registry.fromProfile(
      categoryProfileRegistry.byId('video-games'),
    );
    expect(pack).toMatchObject({
      id: 'video-games',
      verificationPolicy: 'required',
    });
    expect(pack.topicIntents).toEqual(
      expect.arrayContaining(['mechanic', 'boss', 'location']),
    );
  });
  it('models songs as a strict extension', () => {
    expect(
      registry.fromProfile(categoryProfileRegistry.byId('gulf-music'))
        .songExtension,
    ).toEqual({ catalogRequired: true, audioRequired: true });
  });
  it.each([
    ['football', 'football'],
    ['video-games', 'video-games'],
    ['game-of-thrones', 'game-of-thrones'],
    ['anime', 'anime'],
    ['general-text-trivia', 'general-text-trivia'],
  ])('uses the same pack contract for %s', (profileId, expected) => {
    const pack = registry.fromProfile(categoryProfileRegistry.byId(profileId));
    expect(pack.id).toBe(expected);
    expect(Object.keys(pack.sourcePreferenceByIntent)).toEqual(
      pack.topicIntents,
    );
  });
});
