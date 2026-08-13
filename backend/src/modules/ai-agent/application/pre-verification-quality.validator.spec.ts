import { categoryProfileRegistry } from './category-generation-profile.registry';
import { preVerificationQualityValidator } from './pre-verification-quality.validator';
import type { AssetRequest } from '../contracts/asset-provider.interface';

const videoGames = categoryProfileRegistry.byId('video-games');
const music = categoryProfileRegistry.byId('gulf-music');
const anime = categoryProfileRegistry.byId('anime');
const general = categoryProfileRegistry.byId('general-text-trivia');

describe('PreVerificationQualityValidator', () => {
  it('accepts Rapture / BioShock as a concrete video-game location', () => {
    const result = preVerificationQualityValidator.validate(videoGames, {
      question: 'ما اسم المدينة الغارقة التي تدور فيها أحداث BioShock الأولى؟',
      correctAnswer: 'رابتشر (Rapture)',
      gameMode: 'trivia',
      type: 'text',
      assetRequest: request({
        entityType: 'location',
        entity: 'Rapture',
        gameTitle: 'BioShock',
        franchise: 'BioShock',
        verificationQuery: 'Rapture BioShock city',
      }),
    });

    expect(result.status).toBe('PASS');
  });

  it('accepts Atreus / God of War as a concrete video-game character', () => {
    const result = preVerificationQualityValidator.validate(videoGames, {
      question: 'في God of War، مين الابن اللي يرافق كريتوس في رحلته؟',
      correctAnswer: 'أتريوس (Atreus)',
      gameMode: 'identifyCharacter',
      type: 'image',
      assetRequest: request({
        type: 'image',
        entityType: 'character',
        entity: 'Atreus',
        gameTitle: 'God of War',
        franchise: 'God of War',
        verificationQuery: 'Atreus God of War',
      }),
    });

    expect(result.status).toBe('PASS');
  });

  it('rejects generic video-game answer classes before Wigolo', () => {
    const result = preVerificationQualityValidator.validate(videoGames, {
      question: 'في سلسلة ألعاب خيال علمي، أي حدث وقع بين الثورة والحرب؟',
      correctAnswer: 'Political Alliances',
      gameMode: 'trivia',
      type: 'text',
      assetRequest: request({
        entityType: 'event',
        entity: 'Political Alliances',
      }),
    });

    expect(result.status).toBe('REJECTED');
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['ANSWER_TOO_GENERIC', 'MISSING_CONTEXT']),
    );
  });

  it('rejects a video-game entity missing gameTitle when required', () => {
    const result = preVerificationQualityValidator.validate(videoGames, {
      question: 'وش السلاح الأيقوني الذي يستخدمه لينك؟',
      correctAnswer: 'سلاح الماستر سورد (Master Sword)',
      gameMode: 'trivia',
      type: 'text',
      assetRequest: request({
        entityType: 'weapon',
        entity: 'Master Sword',
        verificationQuery: 'Master Sword',
      }),
    });

    expect(result.status).toBe('REJECTED');
    expect(result.issues.map((issue) => issue.code)).toContain(
      'MISSING_REQUIRED_ENTITY_FIELD',
    );
  });

  it('accepts الأماكن / محمد عبده music entity with audio intent', () => {
    const result = preVerificationQualityValidator.validate(music, {
      question: 'ما اسم هذه الأغنية؟',
      correctAnswer: 'الأماكن',
      gameMode: 'identifySong',
      type: 'audio',
      assetRequest: request({
        type: 'audio',
        entityType: 'song',
        entity: 'الأماكن',
        title: 'الأماكن',
        artist: 'محمد عبده',
        verificationQuery: 'محمد عبده الأماكن',
      }),
    });

    expect(result.status).toBe('PASS');
  });

  it('rejects broad music entities and missing artistName', () => {
    const result = preVerificationQualityValidator.validate(music, {
      question: 'ما اسم هذه الأغنية؟',
      correctAnswer: 'موسيقى الثمانينات',
      gameMode: 'identifySong',
      type: 'audio',
      assetRequest: request({
        type: 'audio',
        entityType: 'song',
        entity: 'موسيقى الثمانينات',
        title: 'موسيقى الثمانينات',
      }),
    });

    expect(result.status).toBe('REJECTED');
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'ANSWER_TOO_GENERIC',
        'MISSING_REQUIRED_ENTITY_FIELD',
      ]),
    );
  });

  it('requires anime title for anime characters', () => {
    const result = preVerificationQualityValidator.validate(anime, {
      question: 'مين الفنان المتفجر في الأكاتسكي؟',
      correctAnswer: 'ديدارا (Deidara)',
      gameMode: 'identifyCharacter',
      type: 'image',
      assetRequest: request({
        type: 'image',
        entityType: 'anime-character',
        entity: 'Deidara',
        verificationQuery: 'Deidara',
      }),
    });

    expect(result.status).toBe('REJECTED');
    expect(result.issues.map((issue) => issue.code)).toContain(
      'MISSING_REQUIRED_ENTITY_FIELD',
    );
  });

  it('accepts clear general text trivia without forcing verification', () => {
    const result = preVerificationQualityValidator.validate(general, {
      question: 'ما الكوكب المعروف باسم الكوكب الأحمر؟',
      correctAnswer: 'المريخ',
      gameMode: 'trivia',
      type: 'text',
      assetRequest: null,
    });

    expect(result.status).toBe('PASS');
  });
});

function request(overrides: Partial<AssetRequest>): AssetRequest {
  return {
    type: 'text',
    assetType: overrides.type ?? 'text',
    ...overrides,
  } as AssetRequest;
}
