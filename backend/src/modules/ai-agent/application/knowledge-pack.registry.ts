import { Injectable } from '@nestjs/common';
import type { KnowledgePack } from '../domain/knowledge-unit.types';
import type { CategoryGenerationProfile } from './category-generation-profile.registry';

const topicIntents: Record<string, string[]> = {
  'video-games': [
    'character',
    'mechanic',
    'item',
    'location',
    'boss',
    'history',
  ],
  anime: ['character', 'ability', 'organization', 'location'],
  'from-series': ['character', 'location', 'object', 'event'],
  'gulf-music': ['song-title', 'artist', 'release'],
  football: [
    'player-career',
    'tournament-history',
    'club-history',
    'national-team',
    'competition',
    'manager',
    'stadium',
    'award',
  ],
  'game-of-thrones': [
    'character',
    'house',
    'episode',
    'relationship',
    'location',
    'quote',
    'event-timeline',
  ],
  'general-text-trivia': ['person', 'event', 'location', 'object'],
};

const structuredIntents = new Set([
  'career-path',
  'player',
  'club',
  'statistics',
  'trophy',
  'season',
  'character',
  'item',
  'boss',
  'developer',
  'platform',
  'house',
  'relationship',
  'release',
  'artist',
]);
const narrativeIntents = new Set([
  'history',
  'event',
  'event-timeline',
  'timeline',
  'episode',
  'quote',
  'location',
  'stadium',
  'mechanic',
  'ability',
]);

const footballCandidates = {
  'player-career': [
    { entity: 'Lionel Messi', aliases: ['ليونيل ميسي', 'ميسي'] },
    { entity: 'Cristiano Ronaldo', aliases: ['كريستيانو رونالدو', 'رونالدو'] },
  ],
  'tournament-history': [
    { entity: '2014 FIFA World Cup Final', aliases: ['نهائي كأس العالم 2014'] },
    { entity: '2022 FIFA World Cup Final', aliases: ['نهائي كأس العالم 2022'] },
  ],
  'club-history': [
    { entity: 'Real Madrid CF', aliases: ['ريال مدريد'] },
    { entity: 'FC Barcelona', aliases: ['برشلونة'] },
  ],
  'national-team': [
    { entity: 'Brazil national football team', aliases: ['منتخب البرازيل'] },
    {
      entity: 'Argentina national football team',
      aliases: ['منتخب الأرجنتين'],
    },
  ],
  competition: [
    { entity: 'UEFA Champions League', aliases: ['دوري أبطال أوروبا'] },
  ],
  manager: [{ entity: 'Pep Guardiola', aliases: ['بيب غوارديولا'] }],
  stadium: [{ entity: 'Wembley Stadium', aliases: ['ملعب ويمبلي'] }],
  award: [{ entity: "Ballon d'Or", aliases: ['الكرة الذهبية'] }],
} satisfies NonNullable<KnowledgePack['candidatesByIntent']>;

@Injectable()
export class KnowledgePackRegistry {
  fromProfile(profile: CategoryGenerationProfile): KnowledgePack {
    const music = profile.id === 'gulf-music';
    return {
      id: profile.id,
      version: profile.version,
      categoryKeys: profile.categoryKeys,
      topicIntents:
        topicIntents[profile.id] ?? topicIntents['general-text-trivia'],
      sourceStrategies:
        profile.verificationPolicy === 'none' ? ['local'] : ['local', 'web'],
      sourcePreferenceByIntent: Object.fromEntries(
        (topicIntents[profile.id] ?? topicIntents['general-text-trivia']).map(
          (intent) => [
            intent,
            structuredIntents.has(intent)
              ? 'structured'
              : narrativeIntents.has(intent)
                ? 'narrative'
                : 'both',
          ],
        ),
      ),
      queryTemplates: ['{category} {topic}', '{category} {topic} facts'],
      knowledgePolicy: profile.knowledgePolicy,
      freshnessPolicy: music ? 'seasonal' : 'static',
      verificationPolicy:
        profile.verificationPolicy === 'required-for-entity'
          ? 'required'
          : profile.verificationPolicy === 'none'
            ? 'local-allowed'
            : 'preferred',
      difficultyMix: { easy: 30, medium: 50, hard: 20 },
      allowedGameModes: profile.allowedGameModes,
      supportedAssetTypes: profile.supportedAssetTypes,
      diversity: { maxSameAnswer: 1, maxSameTopic: 2 },
      ...(profile.id === 'football'
        ? {
            localKnowledgeFiles: [
              'sports/world-cup.md',
              'sports/champions-league.md',
            ],
            candidatesByIntent: footballCandidates,
          }
        : {}),
      ...(music
        ? {
            songExtension: {
              catalogRequired: true,
              audioRequired: true,
            } as const,
          }
        : {}),
    };
  }
}
