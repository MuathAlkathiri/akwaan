import {
  CategoryProfileRegistry,
  categoryProfileRegistry,
} from './category-generation-profile.registry';

describe('CategoryProfileRegistry', () => {
  it('validates built-in profile and pattern references', () => {
    expect(categoryProfileRegistry.validateBuiltIns()).toEqual([]);
  });

  it.each([
    ['ألعاب', 'عام', 'video-games'],
    ['Video Games', 'General', 'video-games'],
    ['مسلسلات', 'from', 'from-series'],
    ['Music', 'اغاني', 'gulf-music'],
    ['Anime', 'Naruto', 'anime'],
  ])('resolves %s / %s to %s', (catalogName, categoryName, profileId) => {
    expect(
      categoryProfileRegistry.resolve({ catalogName, categoryName }).profile.id,
    ).toBe(profileId);
  });

  it('falls back safely to general trivia for unknown categories', () => {
    const result = new CategoryProfileRegistry().resolve({
      catalogName: 'Unknown',
      categoryName: 'Something',
    });

    expect(result.profile.id).toBe('general-text-trivia');
    expect(result.fallbackUsed).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain(
      'CATEGORY_PROFILE_NOT_FOUND',
    );
  });

  it('resolves the real persisted world-football category by stable slug', () => {
    const result = categoryProfileRegistry.resolve({
      catalogName: 'رياضة',
      catalogSlug: 'رياضة',
      categoryName: 'كرة قدم عالمية',
      categorySlug: 'كرة-قدم-عالمية',
    });
    expect(result).toMatchObject({
      profile: { id: 'football' },
      fallbackUsed: false,
      matchStrategy: 'category-slug',
      issues: [],
    });
  });
});
