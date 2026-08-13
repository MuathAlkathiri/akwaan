import type {
  AnswerKind,
  CanonicalEntityField,
  EntityType,
  QuestionPatternId,
  QualityIssue,
} from './generation-quality.types';
import type {
  GameMode,
  QuestionAssetType,
} from '../contracts/asset-provider.interface';
import { questionPatternRegistry } from './question-pattern.registry';

export type CategoryGenerationProfile = {
  version: 1;
  id: string;
  categoryKeys: string[];
  objective: string;
  allowedEntityTypes: EntityType[];
  forbiddenEntityTypes?: EntityType[];
  allowedPatternIds: QuestionPatternId[];
  patternWeights?: Partial<Record<QuestionPatternId, number>>;
  requiredFieldsByEntityType: Partial<
    Record<EntityType, CanonicalEntityField[]>
  >;
  forbiddenAnswerKinds: AnswerKind[];
  forbiddenAnswerPhrases?: string[];
  forbiddenQuestionPhrases?: string[];
  allowedGameModes: GameMode[];
  supportedAssetTypes: QuestionAssetType[];
  knowledgePolicy: 'required' | 'preferred' | 'optional';
  sourceRequired?: boolean;
  verificationPolicy: 'required-for-entity' | 'local-allowed' | 'none';
  localePolicy: {
    language: 'ar';
    answerStyle: 'arabic-first';
  };
  promptFragments?: {
    guidance?: string;
    validExamples?: string[];
    invalidExamples?: string[];
  };
  customRuleIds?: string[];
};

const genericForbiddenAnswers = [
  'political alliances',
  'science fiction',
  'battle',
  'power',
  'technology',
  'strategy',
  'friendship',
  'war',
  'adventure',
  'famous singer',
  'popular game',
  'لعبة مشهورة',
  'قوة',
  'حرب',
  'مغامرة',
  'صداقة',
  'استراتيجية',
  'تحالفات سياسية',
];

export const categoryGenerationProfiles: CategoryGenerationProfile[] = [
  {
    version: 1,
    id: 'general-text-trivia',
    categoryKeys: ['default', 'general', 'عام'],
    objective:
      'Generate objective text trivia with one clear answer and no unnecessary primary asset.',
    allowedEntityTypes: [
      'none',
      'unknown',
      'object',
      'event',
      'person',
      'location',
    ],
    allowedPatternIds: ['textTrivia', 'timelineEvent'],
    requiredFieldsByEntityType: {},
    forbiddenAnswerKinds: [],
    forbiddenAnswerPhrases: genericForbiddenAnswers,
    allowedGameModes: ['trivia', 'timeline'],
    supportedAssetTypes: ['text', 'image', 'timeline'],
    knowledgePolicy: 'preferred',
    verificationPolicy: 'local-allowed',
    localePolicy: { language: 'ar', answerStyle: 'arabic-first' },
  },
  {
    version: 1,
    id: 'gulf-music',
    categoryKeys: ['اغاني', 'اغاني الخليج', 'songs', 'music'],
    objective:
      'Generate grounded Gulf song-identification questions using a specific song and artist.',
    allowedEntityTypes: ['song', 'artist'],
    allowedPatternIds: ['identifySong', 'identifyArtist'],
    patternWeights: { identifySong: 100 },
    requiredFieldsByEntityType: {
      song: ['songTitle', 'artistName', 'verificationQuery'],
      artist: ['artistName', 'verificationQuery'],
    },
    forbiddenAnswerKinds: [],
    forbiddenAnswerPhrases: [
      ...genericForbiddenAnswers,
      'arabic music',
      'music of the 1980s',
      'gulf songs',
      'موسيقى الثمانينات',
      'اغاني الخليج',
    ],
    allowedGameModes: ['identifySong', 'identifySinger', 'identifyMusicIntro'],
    supportedAssetTypes: ['audio', 'image', 'video'],
    knowledgePolicy: 'required',
    verificationPolicy: 'required-for-entity',
    localePolicy: { language: 'ar', answerStyle: 'arabic-first' },
    customRuleIds: ['music-specific-song-required'],
  },
  {
    version: 1,
    id: 'anime',
    categoryKeys: ['anime', 'انمي', 'أنمي', 'naruto', 'ناروتو'],
    objective:
      'Generate anime questions grounded in concrete characters, works, abilities, and scenes.',
    allowedEntityTypes: [
      'anime-character',
      'character',
      'ability',
      'organization',
      'object',
      'location',
    ],
    allowedPatternIds: [
      'identifyCharacter',
      'identifyObject',
      'ability',
      'textTrivia',
    ],
    requiredFieldsByEntityType: {
      'anime-character': ['canonicalName', 'animeTitle', 'verificationQuery'],
      character: ['canonicalName', 'animeTitle', 'verificationQuery'],
    },
    forbiddenAnswerKinds: [],
    forbiddenAnswerPhrases: genericForbiddenAnswers,
    allowedGameModes: ['trivia', 'identifyCharacter', 'identifyImage'],
    supportedAssetTypes: ['text', 'image', 'video'],
    knowledgePolicy: 'preferred',
    verificationPolicy: 'required-for-entity',
    localePolicy: { language: 'ar', answerStyle: 'arabic-first' },
    customRuleIds: ['anime-related-work-required'],
  },
  {
    version: 1,
    id: 'video-games',
    categoryKeys: [
      'العاب',
      'الالعاب',
      'العاب الفيديو',
      'فيديو قيمز',
      'قيمز',
      'video games',
      'videogames',
      'games',
      'gaming',
    ],
    objective:
      'Generate strong video-game questions about concrete mechanics, items, locations, bosses, characters, and playable knowledge.',
    allowedEntityTypes: [
      'game',
      'franchise',
      'character',
      'weapon',
      'item',
      'boss',
      'creature',
      'location',
      'organization',
      'vehicle',
      'ability',
      'console',
      'object',
    ],
    allowedPatternIds: [
      'identifyCharacter',
      'identifyGame',
      'identifyWeapon',
      'identifyItem',
      'identifyBoss',
      'identifyLocation',
      'identifyObject',
      'timelineEvent',
      'textTrivia',
      'emojiPuzzle',
    ],
    patternWeights: {
      textTrivia: 35,
      identifyCharacter: 20,
      identifyLocation: 15,
      identifyItem: 10,
      identifyWeapon: 10,
      timelineEvent: 10,
    },
    requiredFieldsByEntityType: {
      character: ['canonicalName', 'gameTitle', 'verificationQuery'],
      weapon: ['canonicalName', 'gameTitle', 'verificationQuery'],
      item: ['canonicalName', 'gameTitle', 'verificationQuery'],
      boss: ['canonicalName', 'gameTitle', 'verificationQuery'],
      creature: ['canonicalName', 'gameTitle', 'verificationQuery'],
      location: ['canonicalName', 'gameTitle', 'verificationQuery'],
      ability: ['canonicalName', 'gameTitle', 'verificationQuery'],
      object: ['canonicalName', 'gameTitle', 'verificationQuery'],
      game: ['canonicalName', 'verificationQuery'],
    },
    forbiddenAnswerKinds: [],
    forbiddenAnswerPhrases: genericForbiddenAnswers,
    forbiddenQuestionPhrases: [
      'في لعبة مشهورة',
      'في سلسلة خيال علمي',
      'في سلسلة ألعاب خيال علمي',
      'في إحدى ألعاب التصويب',
      'في عالم ألعاب الفيديو',
      'شخصية معروفة',
      'سلاح شهير',
    ],
    allowedGameModes: [
      'trivia',
      'identifyCharacter',
      'identifyImage',
      'timeline',
      'emojiPuzzle',
    ],
    supportedAssetTypes: ['text', 'image', 'video', 'timeline', 'emoji'],
    knowledgePolicy: 'preferred',
    verificationPolicy: 'required-for-entity',
    localePolicy: { language: 'ar', answerStyle: 'arabic-first' },
    promptFragments: {
      validExamples: [
        'في لعبة Portal، ما اسم الجهاز الذي تستخدمه Chell لإنشاء بوابتين مترابطتين؟',
        'ما اسم المدينة الغارقة التي تدور فيها أحداث BioShock الأولى؟',
      ],
      invalidExamples: [
        'في سلسلة ألعاب خيال علمي، أي حدث وقع بين الثورة والحرب؟ answer=Political Alliances',
        'ما القوة التي يستخدمها البطل؟ answer=Power',
      ],
    },
    customRuleIds: ['video-game-concrete-entity-required'],
  },
  {
    version: 1,
    id: 'football',
    categoryKeys: [
      'football',
      'كرة قدم عالمية',
      'كره قدم عالميه',
      'كرة-قدم-عالمية',
      'world-football',
      'world cup',
      'كرة القدم',
      'كاس العالم',
      'كأس العالم',
      'champions league',
    ],
    objective:
      'Generate grounded football questions about people, clubs, venues, seasons, trophies, matches, and timelines.',
    allowedEntityTypes: [
      'person',
      'organization',
      'location',
      'event',
      'object',
    ],
    allowedPatternIds: ['identifyLocation', 'timelineEvent', 'textTrivia'],
    requiredFieldsByEntityType: {
      person: ['canonicalName', 'verificationQuery'],
      location: ['canonicalName', 'verificationQuery'],
    },
    forbiddenAnswerKinds: [],
    forbiddenAnswerPhrases: genericForbiddenAnswers,
    allowedGameModes: ['trivia', 'identifyImage', 'timeline'],
    supportedAssetTypes: ['text', 'image', 'timeline'],
    knowledgePolicy: 'required',
    verificationPolicy: 'required-for-entity',
    localePolicy: { language: 'ar', answerStyle: 'arabic-first' },
  },
  {
    version: 1,
    id: 'game-of-thrones',
    categoryKeys: ['game of thrones', 'got', 'صراع العروش'],
    objective:
      'Generate grounded questions about characters, houses, episodes, relationships, locations, quotes, and events.',
    allowedEntityTypes: [
      'character',
      'person',
      'organization',
      'location',
      'event',
      'object',
    ],
    allowedPatternIds: [
      'identifyCharacter',
      'identifyLocation',
      'timelineEvent',
      'textTrivia',
    ],
    requiredFieldsByEntityType: {
      character: ['canonicalName', 'relatedWork', 'verificationQuery'],
      person: ['canonicalName', 'relatedWork', 'verificationQuery'],
    },
    forbiddenAnswerKinds: [],
    forbiddenAnswerPhrases: genericForbiddenAnswers,
    allowedGameModes: [
      'trivia',
      'identifyCharacter',
      'identifyImage',
      'completeQuote',
      'timeline',
    ],
    supportedAssetTypes: ['text', 'image', 'quote', 'timeline'],
    knowledgePolicy: 'required',
    verificationPolicy: 'required-for-entity',
    localePolicy: { language: 'ar', answerStyle: 'arabic-first' },
  },
  {
    version: 1,
    id: 'from-series',
    categoryKeys: ['from', 'فروم'],
    objective:
      'Generate concrete FROM series questions about survival rules, places, objects, and character roles.',
    allowedEntityTypes: [
      'character',
      'location',
      'object',
      'creature',
      'event',
    ],
    allowedPatternIds: [
      'textTrivia',
      'identifyCharacter',
      'identifyLocation',
      'timelineEvent',
    ],
    requiredFieldsByEntityType: {
      character: ['canonicalName', 'relatedWork', 'verificationQuery'],
      location: ['canonicalName', 'relatedWork', 'verificationQuery'],
    },
    forbiddenAnswerKinds: [],
    forbiddenAnswerPhrases: genericForbiddenAnswers,
    allowedGameModes: [
      'trivia',
      'identifyCharacter',
      'identifyImage',
      'timeline',
    ],
    supportedAssetTypes: ['text', 'image', 'video', 'timeline'],
    knowledgePolicy: 'required',
    verificationPolicy: 'required-for-entity',
    localePolicy: { language: 'ar', answerStyle: 'arabic-first' },
  },
];

export type CategoryProfileResolution = {
  profile: CategoryGenerationProfile;
  fallbackUsed: boolean;
  issues: QualityIssue[];
  matchStrategy: string;
};

export class CategoryProfileRegistry {
  private readonly profiles = categoryGenerationProfiles;

  resolve(input: {
    catalogName: string;
    categoryName: string;
    knowledgeFile?: string;
    categoryKey?: string;
    categorySlug?: string;
    catalogKey?: string;
    catalogSlug?: string;
  }): CategoryProfileResolution {
    const stableValues = [
      ['category-key', input.categoryKey],
      ['category-slug', input.categorySlug],
      ['catalog-key', input.catalogKey],
      ['catalog-slug', input.catalogSlug],
    ] as const;
    const aliases = this.profiles.filter(
      (candidate) => candidate.id !== 'general-text-trivia',
    );
    let matchStrategy = 'none';
    let profile: CategoryGenerationProfile | undefined;
    for (const [strategy, value] of stableValues) {
      if (!value) continue;
      profile = aliases.find((candidate) =>
        candidate.categoryKeys.some(
          (key) => this.normalize(key) === this.normalize(value),
        ),
      );
      if (profile) {
        matchStrategy = strategy;
        break;
      }
    }
    if (!profile) {
      const names = [input.categoryName, input.catalogName, input.knowledgeFile]
        .filter((value): value is string => Boolean(value))
        .map((value) => this.normalize(value));
      profile = aliases.find((candidate) =>
        candidate.categoryKeys.some((key) =>
          names.some((value) => value.includes(this.normalize(key))),
        ),
      );
      if (profile) matchStrategy = 'normalized-name-alias';
    }
    return {
      profile: profile ?? this.byId('general-text-trivia'),
      fallbackUsed: !profile,
      matchStrategy,
      issues: profile
        ? []
        : [
            {
              code: 'CATEGORY_PROFILE_NOT_FOUND',
              message: 'No specific category generation profile matched.',
            },
          ],
    };
  }

  validateBuiltIns(): QualityIssue[] {
    const issues: QualityIssue[] = [];
    const ids = new Set<string>();
    for (const profile of this.profiles) {
      if (profile.version !== 1)
        issues.push({
          code: 'PROFILE_SCHEMA_INVALID',
          message: `Unsupported profile version for ${profile.id}`,
        });
      if (ids.has(profile.id))
        issues.push({
          code: 'PROFILE_SCHEMA_INVALID',
          message: `Duplicate profile id: ${profile.id}`,
        });
      ids.add(profile.id);
      if (!profile.allowedPatternIds.length)
        issues.push({
          code: 'PROFILE_SCHEMA_INVALID',
          message: `Profile ${profile.id} has no allowed patterns`,
        });
      issues.push(
        ...questionPatternRegistry.validateReferences(
          profile.allowedPatternIds,
        ),
      );
    }
    return issues;
  }

  byId(id: string): CategoryGenerationProfile {
    const profile = this.profiles.find((candidate) => candidate.id === id);
    if (!profile) throw new Error(`Unknown profile id: ${id}`);
    return profile;
  }

  all(): CategoryGenerationProfile[] {
    return this.profiles;
  }

  private normalize(value: string): string {
    return value
      .trim()
      .toLowerCase()
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/[ـ\u064b-\u065f\u0670]/g, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ');
  }
}

export const categoryProfileRegistry = new CategoryProfileRegistry();
