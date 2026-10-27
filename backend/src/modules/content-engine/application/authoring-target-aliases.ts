/**
 * Canonical runtime and authoring aliases.
 *
 * Sourced directly from `ai/scripts/promote_approved_content.py` (lines 588-632)
 * to ensure that off-board authoring keys (e.g. "puzzles") resolve deterministically
 * to live production database entities (e.g. slug "world-1786388973542") across
 * preflight, generation, review, and promotion without database mutations.
 */

export const CANONICAL_WORLD_ALIASES: Record<string, readonly string[]> = {
  football: ['football', 'test', 'عالم كرة القدم', 'كرة قدم'],
  anime: ['anime', 'world-1785615381449', 'عالم الانمي', 'عالم الأنمي'],
  'video-games': [
    'video-games',
    'world-1785784447249',
    'عالم الالعاب الالكترونية',
    'عالم الألعاب الإلكترونية',
    'فيديو قيمز',
  ],
  puzzles: ['puzzles', 'world-1786388973542', 'عالم الالغاز', 'عالم الألغاز'],
  series: ['series', 'world-1786143410891', 'مسلسلات'],
  movies: ['movies', 'world-1787503885931', 'عالم الافلام', 'عالم الأفلام'],
  cars: ['cars', 'world-1787503872700', 'عالم السيارات'],
  'general-knowledge': [
    'general-knowledge',
    'world-1787503939420',
    'عالم المعلومات',
  ],
};

export const CANONICAL_SCOPE_ALIASES: Record<string, readonly string[]> = {
  'premier-league': [
    'premier-league',
    'scope-1785790447091',
    'الدوري الانجليزي',
    'الدوري الإنجليزي',
  ],
  'champions-league': [
    'champions-league',
    'scope-1785790471367',
    'ابطال اوروبا',
    'أبطال أوروبا',
    'دوري أبطال أوروبا',
  ],
  'world-cup': ['world-cup', 'scope-1785788790909', 'كأس العالم'],
  'saudi-league': ['saudi-league', 'scope-1785790461277', 'الدوري السعودي'],
  naruto: ['naruto', 'scope-1785880972070', 'ناروتو'],
  'one-piece': ['one-piece', 'scope-1785795316988', 'ون بيس'],
  'attack-on-titan': [
    'attack-on-titan',
    'scope-1785880979981',
    'هجوم العمالقة',
  ],
  bleach: ['bleach', 'scope-1785880986570', 'بليتش'],
  'call-of-duty': ['call-of-duty', 'scope-1785795334994', 'كول اوف ديوتي'],
  fifa: ['fifa', 'scope-1785881042167', 'فيفا'],
  gta: ['gta', 'scope-1785881026837', 'قراند'],
  overwatch: ['overwatch', 'scope-1785881026837', 'اوفر ووتش'],
  'wordplay-letters': [
    'wordplay-letters',
    'تلاعب بالكلمات',
    'حروف وكلمات',
    'لعب بالحروف',
  ],
};

export const CANONICAL_CHALLENGE_TYPE_ALIASES: Record<
  string,
  readonly string[]
> = {
  marhala: ['marhala', 'المرحلة'],
  bomb: ['bomb', 'القنبلة'],
  combo: ['combo', 'الكومبو'],
  'read-your-opponent': ['read-your-opponent', 'اقرأ خصمك', 'اقرا خصمك'],
  closest: ['closest', 'مين اقرب', 'مين أقرب'],
  'top-5': ['top-5', 'أفضل 5', 'افضل 5'],
  first_note: ['first_note', 'first-note', 'من أول نغمة', 'من اول نغمة'],
};
