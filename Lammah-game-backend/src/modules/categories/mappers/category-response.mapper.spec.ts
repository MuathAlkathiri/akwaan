import { CategoryResponseMapper } from './category-response.mapper';

describe('CategoryResponseMapper', () => {
  it('preserves gameplay and knowledge configuration while hiding local paths', () => {
    expect(
      CategoryResponseMapper.toResponse({
        _id: 'category-id',
        name: 'World Cup',
        slug: 'world-cup',
        gameplayConfig: { maxAudioDuration: 6 },
        aiConfig: { knowledgeFile: 'sports/world-cup.md' },
        banner: { path: '/internal/file', url: '/uploads/banner.webp' },
        __v: 2,
      }),
    ).toEqual({
      _id: 'category-id',
      name: 'World Cup',
      slug: 'world-cup',
      gameplayConfig: { maxAudioDuration: 6 },
      aiConfig: { knowledgeFile: 'sports/world-cup.md' },
      banner: { url: '/uploads/banner.webp' },
      audioPolicy: 'optional',
      gameplayMode: 'STANDARD',
    });
  });
});
