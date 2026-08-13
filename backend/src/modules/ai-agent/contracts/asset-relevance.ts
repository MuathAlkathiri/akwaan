import {
  AssetRequest,
  MediaIntent,
  QuestionAssetType,
} from './asset-provider.interface';

export type AssetRejectionCode =
  | 'ASSET_TYPE_MISMATCH'
  | 'ENTITY_TYPE_MISMATCH'
  | 'FRANCHISE_MISMATCH'
  | 'MEDIA_INTENT_MISMATCH'
  | 'LIKELY_NAME_COLLISION'
  | 'INSUFFICIENT_ENTITY_EVIDENCE'
  | 'INSUFFICIENT_FRANCHISE_EVIDENCE'
  | 'GENERIC_PRIMARY_IMAGE'
  | 'LOW_RESOLUTION'
  | 'LOW_RELEVANCE'
  | 'VOICE_ENTITY_MISMATCH'
  | 'VOICE_ENTITY_EVIDENCE_MISSING'
  | 'VOICE_CONTEXT_ONLY_RESULT'
  | 'VOICE_FRANCHISE_MISMATCH'
  | 'VOICE_VIDEO_MUSIC_METADATA'
  | 'VOICE_VIDEO_GENERIC_COMPILATION'
  | 'MUSIC_TITLE_ARTIST_MISMATCH'
  | 'MUSIC_COVER_VERSION_REJECTED'
  | 'MUSIC_REMIX_REJECTED'
  | 'MUSIC_COMPILATION_REJECTED';
export type NormalizedAssetCandidate = {
  provider: string;
  assetType: QuestionAssetType;
  mediaIntent?: MediaIntent | 'character-image' | 'cover';
  sourceType?: string;
  title?: string;
  description?: string;
  pageUrl?: string;
  mediaUrl?: string;
  queryUsed?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  metadataTerms?: string[];
  providerMetadata?: Record<string, unknown>;
};
export type AssetRelevanceDecision = {
  accepted: boolean;
  score: number;
  rejectionCodes: AssetRejectionCode[];
  evidence: string[];
};

const REAL_PERSON =
  /\b(singer|actor|actress|politician|athlete|footballer|musician|rapper|born|biography|interview)\b/;
const CHARACTER =
  /\b(anime|manga|character|fictional|ninja|hero|villain|voice actor|seiyuu)\b/;
const MUSIC =
  /\b(ost|soundtrack|opening|ending|theme|song|lyrics|music|instrumental|remix|official audio|topic|amv)\b/;
const VOICE =
  /\b(voice|voices|scene|scenes|dialogue|speaking|speech|quote|quotes|dub|dubbed|moment|moments|clip|clips|voice line|voice lines|seiyuu)\b/;
const VOICE_NEGATIVE =
  /\b(ost|soundtrack|opening|ending|theme|song|lyrics|instrumental|remix|amv|edit|edit audio|music|reaction|review|analysis|explained)\b/;

export function evaluateAssetRelevance(
  request: AssetRequest,
  candidate: NormalizedAssetCandidate,
): AssetRelevanceDecision {
  const rejectionCodes: AssetRejectionCode[] = [];
  const evidence: string[] = [];
  let score = 0;
  let minimumScore = request.purpose === 'decorative' ? 30 : 40;
  if (candidate.assetType !== request.type)
    rejectionCodes.push('ASSET_TYPE_MISMATCH');
  // The query expresses intent, not provider evidence; never let it make its own result pass.
  const text = normalize(
    [candidate.title, candidate.description, ...(candidate.metadataTerms ?? [])]
      .filter(Boolean)
      .join(' '),
  );
  const entity = normalize(
    request.entity ??
      request.originalName ??
      request.localizedName ??
      request.title ??
      request.query ??
      '',
  );
  const aliases = [
    request.entity,
    request.originalName,
    request.localizedName,
    ...(Array.isArray(request.aliases) ? request.aliases : []),
  ]
    .filter((value): value is string => typeof value === 'string')
    .map(normalize)
    .filter(Boolean);
  const franchise = normalize(
    request.franchise ?? request.englishTitle ?? request.arabicTitle ?? '',
  );
  const entityMatch = aliases.length
    ? aliases.some((alias) => containsPhrase(text, alias))
    : Boolean(entity && containsPhrase(text, entity));
  const franchiseMatch = Boolean(franchise && containsPhrase(text, franchise));
  if (entityMatch) {
    score += 45;
    evidence.push('entity');
  }
  if (franchiseMatch) {
    score += 30;
    evidence.push('franchise');
  }
  if (request.type === 'image') {
    const cover = request.purpose === 'decorative';
    const characterRequest =
      ['character', 'anime-character', 'fictional-character'].includes(
        normalize(request.entityType ?? ''),
      ) || request.gameMode === 'identifyCharacter';
    if (!cover && characterRequest) minimumScore = 55;
    if (!cover && !entityMatch)
      rejectionCodes.push('INSUFFICIENT_ENTITY_EVIDENCE');
    if (!cover && characterRequest && franchise && !franchiseMatch)
      rejectionCodes.push('INSUFFICIENT_FRANCHISE_EVIDENCE');
    if (
      !cover &&
      characterRequest &&
      REAL_PERSON.test(text) &&
      !CHARACTER.test(text)
    )
      rejectionCodes.push('LIKELY_NAME_COLLISION');
    if (!cover && characterRequest && franchiseMatch && !entityMatch)
      rejectionCodes.push('GENERIC_PRIMARY_IMAGE');
    if (cover && !entityMatch && !franchiseMatch)
      rejectionCodes.push('LOW_RELEVANCE');
    if (
      (candidate.width && candidate.width < 320) ||
      (candidate.height && candidate.height < 180)
    )
      rejectionCodes.push('LOW_RESOLUTION');
    if (
      /\b(logo|icon|coat of arms|disambiguation|list of)\b/.test(text) &&
      !cover
    )
      score -= 25;
    if (CHARACTER.test(text)) score += 10;
  }
  const intent = request.mediaIntent;
  if (request.type === 'audio' && intent) {
    const musicEvidence = MUSIC.test(text),
      voiceEvidence = VOICE.test(text);
    if (intent === 'voice' || intent === 'dialogue' || intent === 'speech') {
      if (!voiceEvidence) rejectionCodes.push('MEDIA_INTENT_MISMATCH');
      if (VOICE_NEGATIVE.test(text))
        rejectionCodes.push(
          'MEDIA_INTENT_MISMATCH',
          'VOICE_VIDEO_MUSIC_METADATA',
        );
      if (!entityMatch) {
        rejectionCodes.push('INSUFFICIENT_ENTITY_EVIDENCE');
        rejectionCodes.push('VOICE_ENTITY_EVIDENCE_MISSING');
        if (request.context && containsPhrase(text, normalize(request.context)))
          rejectionCodes.push('VOICE_CONTEXT_ONLY_RESULT');
      }
      if (franchise && !franchiseMatch)
        rejectionCodes.push(
          'INSUFFICIENT_FRANCHISE_EVIDENCE',
          'VOICE_FRANCHISE_MISMATCH',
        );
      if (voiceEvidence) score += 25;
      if (
        /\b(compilation|best anime|anime moments)\b/.test(text) &&
        !entityMatch
      )
        rejectionCodes.push('VOICE_VIDEO_GENERIC_COMPILATION');
    } else if (intent === 'music') {
      if (voiceEvidence && !musicEvidence)
        rejectionCodes.push('MEDIA_INTENT_MISMATCH');
      const artistAliases = [
        request.artist,
        ...(Array.isArray(request.artistAliases) ? request.artistAliases : []),
      ]
        .filter((value): value is string => typeof value === 'string')
        .map(normalize)
        .filter(Boolean);
      const artistMatch = artistAliases.some((alias) =>
        containsPhrase(text, alias),
      );
      if (!entityMatch || (artistAliases.length > 0 && !artistMatch))
        rejectionCodes.push('MUSIC_TITLE_ARTIST_MISMATCH');
      else {
        if (artistMatch) {
          score += 45;
          evidence.push('artist');
        }
      }
      if (/\b(cover|karaoke|instrumental|reaction|tutorial)\b/.test(text))
        rejectionCodes.push('MUSIC_COVER_VERSION_REJECTED');
      if (/\b(remix|slowed|reverb|sped up|speed up|nightcore)\b/.test(text))
        rejectionCodes.push('MUSIC_REMIX_REJECTED');
      if (
        /\b(compilation|medley|full album|album كامل|اغاني منوعه)\b/.test(text)
      )
        rejectionCodes.push('MUSIC_COMPILATION_REJECTED');
      if (musicEvidence) score += 25;
    }
  }
  if (score < minimumScore) rejectionCodes.push('LOW_RELEVANCE');
  return {
    accepted: rejectionCodes.length === 0,
    score,
    rejectionCodes: [...new Set(rejectionCodes)],
    evidence,
  };
}
function containsPhrase(text: string, phrase: string) {
  return (
    text === phrase ||
    text.startsWith(`${phrase} `) ||
    text.endsWith(` ${phrase}`) ||
    text.includes(` ${phrase} `)
  );
}
export function normalize(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ـ/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
}
