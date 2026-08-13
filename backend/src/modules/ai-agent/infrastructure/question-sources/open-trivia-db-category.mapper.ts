const mappings = new Map<string, number>([
  ['general knowledge', 9],
  ['معلومات عامة', 9],
  ['عام', 9],
  ['books', 10],
  ['كتب', 10],
  ['film', 11],
  ['movies', 11],
  ['افلام', 11],
  ['أفلام', 11],
  ['music', 12],
  ['موسيقى', 12],
  ['television', 14],
  ['تلفزيون', 14],
  ['video games', 15],
  ['العاب فيديو', 15],
  ['ألعاب فيديو', 15],
  ['science & nature', 17],
  ['science', 17],
  ['علوم', 17],
  ['computers', 18],
  ['حاسوب', 18],
  ['mathematics', 19],
  ['رياضيات', 19],
  ['mythology', 20],
  ['اساطير', 20],
  ['أساطير', 20],
  ['sports', 21],
  ['رياضة', 21],
  ['geography', 22],
  ['جغرافيا', 22],
  ['history', 23],
  ['تاريخ', 23],
  ['politics', 24],
  ['سياسة', 24],
  ['art', 25],
  ['فن', 25],
  ['celebrities', 26],
  ['مشاهير', 26],
  ['animals', 27],
  ['حيوانات', 27],
  ['vehicles', 28],
  ['مركبات', 28],
  ['comics', 29],
  ['قصص مصورة', 29],
  ['gadgets', 30],
  ['اجهزة', 30],
  ['أجهزة', 30],
  ['anime & manga', 31],
  ['انمي ومانغا', 31],
  ['أنمي ومانغا', 31],
  ['cartoon & animations', 32],
  ['رسوم متحركة', 32],
]);

const footballCategoryNames = new Set([
  'football',
  'soccer',
  'كرة قدم عالمية',
  'كره قدم عالميه',
  'كرة-قدم-عالمية',
  'world-football',
  'world football',
  'كرة القدم',
  'world cup',
  'كاس العالم',
  'كأس العالم',
  'champions league',
]);

export type OpenTriviaDbCategorySelection = {
  category: number;
  topicFilter?: 'football';
};

function normalizeCategoryName(categoryName: string): string {
  return categoryName.normalize('NFKC').trim().toLocaleLowerCase();
}

export function mapOpenTriviaDbCategory(categoryName: string): number | null {
  return mappings.get(normalizeCategoryName(categoryName)) ?? null;
}

/**
 * Resolves specific categories only when the broad upstream category can be
 * narrowed deterministically. The adapter must apply topicFilter before a
 * candidate can enter the curation pipeline.
 */
export function resolveOpenTriviaDbCategory(
  categoryName: string,
): OpenTriviaDbCategorySelection | null {
  const normalized = normalizeCategoryName(categoryName);
  const category = mappings.get(normalized);
  if (category !== undefined) return { category };
  if (footballCategoryNames.has(normalized))
    return { category: 21, topicFilter: 'football' };
  return null;
}
