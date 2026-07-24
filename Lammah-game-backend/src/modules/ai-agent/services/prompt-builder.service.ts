import { Injectable } from '@nestjs/common';
import { ParsedKnowledge } from '../utils/markdown-parser';
import {
  CategoryAiConfig,
  CategoryGameplayConfig,
} from '../../categories/schemas/category.schema';
import { GameMode } from '../contracts/asset-provider.interface';
import { gulfMusicQuestionPolicy } from '../application/gulf-music-question.policy';
import type { CategoryGenerationProfile } from '../application/category-generation-profile.registry';

export const DEFAULT_GAMEPLAY_CONFIG: Required<
  Pick<
    CategoryGameplayConfig,
    | 'gameModes'
    | 'supportedAssetTypes'
    | 'preferredDifficultyMix'
    | 'maxAudioDuration'
    | 'imageRevealAllowed'
    | 'allowMultipleAssets'
  >
> = {
  gameModes: {
    trivia: 50,
    identifyCharacter: 15,
    identifyVoice: 10,
    identifyImage: 10,
    completeQuote: 5,
    timeline: 5,
    emojiPuzzle: 5,
  },
  supportedAssetTypes: [
    'text',
    'image',
    'audio',
    'video',
    'quote',
    'emoji',
    'timeline',
  ],
  preferredDifficultyMix: {
    easy: 30,
    medium: 50,
    hard: 20,
  },
  maxAudioDuration: 6,
  imageRevealAllowed: true,
  allowMultipleAssets: false,
};

type BuildReviewedPromptInput = {
  catalogName: string;
  categoryName: string;
  difficulty: 'easy' | 'medium' | 'hard';
  count: number;
  language: 'ar';
  knowledgeFile: string;
  usedDefaultKnowledge: boolean;
  knowledge: ParsedKnowledge;
  aiConfig?: CategoryAiConfig;
  gameplayConfig?: CategoryGameplayConfig;
  categoryProfile?: CategoryGenerationProfile;
  diversitySeed?: string;
};

@Injectable()
export class PromptBuilderService {
  buildReviewedQuestionsPrompt(input: BuildReviewedPromptInput): string {
    const gulfMusic = gulfMusicQuestionPolicy.isGulfMusicCategory({
      catalogName: input.catalogName,
      categoryName: input.categoryName,
      knowledgeFile: input.knowledgeFile,
    });
    return `You are a senior Arabic quiz editor for Lammah.
Lammah is an offline competitive party quiz game played by friends.

The Knowledge File below is the primary source of guidance.
Use it to decide what to ask, what to avoid, and what quality means for this category.

Global Rules:
- Questions must be fun, specific, and suitable for a fast social party quiz.
- Write like a human quiz host talking to friends, not like an AI summary or translated wiki page.
- The question field is one short playable sentence; start with the actual question immediately.
- Prefer 8-18 Arabic words, stay under 22 when practical, and never exceed 28 except for an essential proper name or short quote.
- It must be easy to understand and read aloud in under 6 seconds.
- Use natural modern conversational Arabic, not translated or textbook Arabic.
- Include one main idea and only the minimum clue needed for one clear answer.
- Put educational background after the reveal in explanation, never inside question.
- Avoid introductions, nested clauses, repeated clues, unnecessary translations, excessive punctuation, and parentheses.
- Never use academic filler such as: بناءً على ما سبق، في ضوء المعلومات، أي من الآتي، يُعرّف بأنه، يتمثل في، والمقصود هنا، مع العلم أن.
- Never mention the expected answer format or leak the answer.
- In Arabic generation, player-facing answers must be Arabic-first. Use Arabic only when natural, or Arabic followed by the canonical English name in parentheses for proper nouns. Avoid English-only correctAnswer/wrongAnswers unless the answer has no recognizable Arabic form.
- Keep canonical English names/titles inside assetRequest metadata when needed for search and verification; do not make the visible answer English-only just to help providers.
- Keep every difficulty concise: hard means more specific knowledge, not longer wording.
- Avoid generic school-style questions.
- Avoid robotic riddle phrasing such as "من هي الشخصية التي..." when a shorter host question works.
- Avoid long relative clauses: "الذي يمتلك..." / "التي ترتبط..." / "ويتمتع..." / "خلف الكواليس..." stacked together.
- Prefer lively direct Arabic: "مين..."، "وش..."، "أي..."، "تذكرون..."، "في FROM، مين..." when natural.
- Do not over-describe the answer. Give one clue, not a biography.
- Avoid very obvious questions.
- Avoid repeated topics, repeated names, repeated events, and repeated wording.
- Each question must have one clear correct answer.
- Wrong answers must be believable but clearly wrong.
- Do not ask yes/no questions.
- Do not use trick questions with disputed answers.
- Return JSON only.
- Do not include markdown.

Human Style Examples:
- Bad: "من هو الإستراتيجي الذي يمتلك عيونًا استثنائية ويتمتع بذاكرة قوية لقراءة الأحداث الماضية؟"
- Good: "مين يشوف الماضي والحاضر كأنه فاتح الأرشيف؟"
- Bad: "من الشخصية التي ترتبط دائمًا بالأسرار ويظهر خلف الكواليس؟"
- Good: "مين دايم يحرك الخيوط من وراء الستار؟"
- Bad: "ما العنصر الذي يمثل وسيلة الحماية الأساسية ضد الكائنات الليلية؟"
- Good: "وش الشيء اللي يحميهم من وحوش الليل؟"

Request:
- Catalog: "${input.catalogName}"
- Category: "${input.categoryName}"
- Difficulty: "${input.difficulty}"
- Language: "${input.language}"
- Required count: ${input.count}
- Diversity seed: "${input.diversitySeed ?? 'default'}"
- Knowledge file: "${input.knowledgeFile}"
- Used default knowledge: ${input.usedDefaultKnowledge}

${this.buildDifficultyGuidance(input.difficulty)}
${this.buildCategoryProfileBlock(input.categoryProfile)}
${gulfMusic ? this.buildGulfMusicRules(input.difficulty, input.count) : ''}

${this.buildAiConfigBlock(input.aiConfig)}
${this.buildGameplayConfigBlock(input.gameplayConfig, input.count)}

Knowledge File:
${input.knowledge.raw}

Required JSON schema:
{
  "questions": [
    {
      "question": "سؤال عربي طبيعي ومحدد",
      "correctAnswer": "الإجابة الصحيحة بالعربية أو بالعربية (English)",
      "wrongAnswers": ["إجابة خاطئة بالعربية", "إجابة خاطئة بالعربية", "إجابة خاطئة بالعربية"],
      "difficulty": "${input.difficulty}",
      "gameMode": "trivia",
      "type": "text",
      "assetRequest": null,
      "primaryAssetRequest": null,
      "coverImageRequest": {"type":"image","entity":"موضوع بصري ذو صلة","franchise":"اسم العمل عند توفره","context":"صورة زخرفية لا تكشف الإجابة","purpose":"decorative"},
      "assetStatus": "NOT_REQUIRED",
      "asset": null,
      "explanation": "شرح قصير يؤكد سبب صحة الإجابة",
      "qualityScore": 8,
      "issues": []
    }
  ]
}

Generate exactly ${input.count} reviewed question drafts.
Return only the JSON object.`;
  }

  private buildGulfMusicRules(
    difficulty: BuildReviewedPromptInput['difficulty'],
    count: number,
  ) {
    return `Arabic Music Workflow (mandatory and overrides general examples):
- Generate exactly ${count} distinct real Arabic songs suitable for ${difficulty} difficulty. The songs are chosen by the LLM and are not restricted to a local table.
- Use the diversity seed to vary artists, decades, countries, and titles between generation requests. Do not repeatedly default to the same famous songs.
- Every question field must be exactly: "ما اسم هذه الأغنية؟"
- correctAnswer must be the canonical song title; never ask for or answer with the artist.
- gameMode="identifySong", type="audio", assetStatus="PENDING".
- primaryAssetRequest and assetRequest must both contain: type="audio", assetType="audio", mediaIntent="music", sourceType="song", entityType="song", entity=<canonical title>, canonicalEntity=<canonical title>, title=<canonical title>, artist=<canonical artist>, language="ar", region="arab", duration=15.
- Artist is mandatory search and verification metadata. Only propose real released Arabic songs with an unambiguous title and artist pair; Wigolo will verify each pair before YouTube is searched.
- Use the exact official song title, not a lyric, refrain, nickname, album name, translated title, or title you reconstructed from memory. Never invent or combine words in a title. If uncertain about the exact title/artist pair, choose a different well-known song you are certain exists.
- The audio asset must be a 15–20 second snippet from the exact verified song; the player guesses the song title from the snippet.
- Wrong answers must be three other real Arabic song titles, never artist names.
- Do not generate trivia, voice, singer, image-identification, lyric-completion, album, year, or theme questions.
- Cover is decorative and must not contain the song title or album artwork.`;
  }

  private buildDifficultyGuidance(
    difficulty: BuildReviewedPromptInput['difficulty'],
  ) {
    const guidance = {
      easy: `Easy difficulty guidance:
- Ask familiar facts with direct wording and a widely recognizable answer.
- Require little specialized knowledge and minimize ambiguity.
- Keep distractors believable, but distinguishable with common knowledge.`,
      medium: `Medium difficulty guidance:
- Require reasonable subject knowledge; the answer should be less obvious but fair.
- Use specific wording and plausible distractors from the same topic.
- Reward familiarity with the subject rather than obscure recall.`,
      hard: `Hard difficulty guidance:
- Require deeper or more specific subject knowledge without resorting to hopelessly obscure trivia.
- Use precise wording that rules out multiple valid answers.
- Make distractors highly plausible while preserving one clearly defensible answer.`,
    } as const;
    return guidance[difficulty];
  }

  private buildCategoryProfileBlock(profile?: CategoryGenerationProfile) {
    if (!profile) return '';

    return `Category Generation Profile:
- profileId: ${profile.id}
- version: ${profile.version}
- objective: ${profile.objective}
- allowed entity types: ${profile.allowedEntityTypes.join(', ')}
- allowed patterns: ${profile.allowedPatternIds.join(', ')}
- allowed game modes: ${profile.allowedGameModes.join(', ')}
- supported asset types: ${profile.supportedAssetTypes.join(', ')}
- forbidden answer phrases: ${(profile.forbiddenAnswerPhrases ?? []).join(', ')}
- forbidden question phrases: ${(profile.forbiddenQuestionPhrases ?? []).join(', ')}
- knowledge policy: ${profile.knowledgePolicy}
- verification policy: ${profile.verificationPolicy}
- locale answer style: ${profile.localePolicy.answerStyle}
${profile.promptFragments?.guidance ? `- guidance: ${profile.promptFragments.guidance}` : ''}
${profile.promptFragments?.validExamples?.length ? `Valid profile examples:\n${profile.promptFragments.validExamples.map((example) => `- ${example}`).join('\n')}` : ''}
${profile.promptFragments?.invalidExamples?.length ? `Invalid profile examples:\n${profile.promptFragments.invalidExamples.map((example) => `- ${example}`).join('\n')}` : ''}
For entity-backed questions, include concrete assetRequest metadata with canonicalEntity/entity, entityType, related work/franchise/gameTitle/animeTitle when applicable, and verificationQuery.`;
  }

  normalizeGameplayConfig(
    gameplayConfig?: CategoryGameplayConfig,
  ): CategoryGameplayConfig {
    return {
      ...DEFAULT_GAMEPLAY_CONFIG,
      ...gameplayConfig,
      gameModes: {
        ...DEFAULT_GAMEPLAY_CONFIG.gameModes,
        ...this.mapLegacyQuestionTypesToGameModes(
          gameplayConfig?.questionTypes,
        ),
        ...gameplayConfig?.gameModes,
      },
      preferredDifficultyMix: {
        ...DEFAULT_GAMEPLAY_CONFIG.preferredDifficultyMix,
        ...gameplayConfig?.preferredDifficultyMix,
      },
      supportedAssetTypes: gameplayConfig?.supportedAssetTypes?.length
        ? gameplayConfig.supportedAssetTypes
        : DEFAULT_GAMEPLAY_CONFIG.supportedAssetTypes,
    };
  }

  private buildAiConfigBlock(aiConfig?: CategoryAiConfig): string {
    if (!aiConfig) {
      return 'AI Config: none';
    }

    const lines = ['AI Config Overrides:'];

    if (aiConfig.preferredQuestionTypes?.length) {
      lines.push(
        `- Preferred question types: ${aiConfig.preferredQuestionTypes.join(', ')}`,
      );
    }

    if (aiConfig.avoidTopics?.length) {
      lines.push(`- Avoid topics: ${aiConfig.avoidTopics.join(', ')}`);
    }

    if (aiConfig.extraInstructions) {
      lines.push(`- Extra instructions: ${aiConfig.extraInstructions}`);
    }

    return lines.join('\n');
  }

  private buildGameplayConfigBlock(
    gameplayConfig: CategoryGameplayConfig | undefined,
    count: number,
  ): string {
    const normalizedConfig = this.normalizeGameplayConfig(gameplayConfig);
    const distribution = this.calculateGameModeDistribution(
      normalizedConfig,
      count,
    );

    return `Gameplay Config:
- Supported asset types: ${normalizedConfig.supportedAssetTypes?.join(', ')}
- Required gameMode distribution for this batch: ${Object.entries(distribution)
      .map(([gameMode, gameModeCount]) => `${gameMode}=${gameModeCount}`)
      .join(', ')}
- Preferred difficulty mix: easy=${normalizedConfig.preferredDifficultyMix?.easy}, medium=${normalizedConfig.preferredDifficultyMix?.medium}, hard=${normalizedConfig.preferredDifficultyMix?.hard}
- Max audio duration: ${normalizedConfig.maxAudioDuration} seconds
- Image reveal allowed: ${normalizedConfig.imageRevealAllowed}
- Allow multiple assets per question: ${normalizedConfig.allowMultipleAssets}

Gameplay Mode Rules:
- gameMode describes how the player interacts with the question.
- type describes the primary asset needed: text, image, audio, video, quote, emoji, or timeline.
- For trivia, type is usually "text" and assetRequest=null.
- For identifyVoice, type must be "audio"; use it only when the category has a reliable voice/speech source. Do not invent voice clips for movies/series.
- For movies/series/anime scene or action clues, prefer type="video" with a short clip when video is supported.
- For identifyCharacter or identifyImage, type should be "image" or "video" when supported.
- For completeQuote, type should be "quote".
- For emojiPuzzle, type should be "emoji".
- For timeline, type should be "timeline".
- Trivia: ask one direct question with no background paragraph.
- identifyCharacter: use "من هذه الشخصية؟" when the image supplies the clue, or one short identifying clue otherwise.
- identifyImage: prefer "ما اسم هذا المكان؟" or "من هذه الشخصية؟" and do not narrate the image.
- identifyVoice: prefer "لمن هذا الصوت؟" or "من صاحب هذا المقطع؟" only for real voice/audio clues.
- completeQuote: prefer "من قال هذه العبارة؟".
- Music identification: prefer "ما اسم هذه الأغنية؟" or "من صاحب هذه الأغنية؟".
- timeline: keep the ordering question short, such as "أي حدث وقع أولًا؟".

Asset Rules:
- Every question must include coverImageRequest with type="image" and purpose="decorative".
- primaryAssetRequest is the gameplay clue. It is required for image/audio/video modes and must also be copied to assetRequest for backward compatibility.
- Cover images must be relevant without revealing an answer when that would trivialize the question.
- For identifyCharacter/identifyImage use a broader franchise, location, or theme for the cover, not the answer entity.
- For identifyVoice prefer a franchise/category cover. For completeQuote avoid the speaker when identity is asked. For timeline use a location, event, era, or franchise.
- The AI must never download assets.
- The AI must never invent URLs.
- Image requests must use concise semantic metadata: entity, franchise, entityType, originalName, localizedName, visualHint, and purpose.
- Never put a full sentence, question, explanation, or human-style search phrase in image query fields.
- Image example: {"type":"image","entity":"Itachi Uchiha","franchise":"Naruto","entityType":"character","originalName":"うちはイタチ","localizedName":"إيتاتشي أوتشيها","visualHint":"Akatsuki cloak portrait","purpose":"gameplay"}.
- For non-text questions, generate only an assetRequest describing what asset is needed.
- The AI must not generate final YouTube search queries or human-style search phrases.
- The provider owns search strategy. The AI owns semantic metadata only.
- Do not include assetRequest.query unless no metadata is possible.
- For audio/video, assetRequest must include metadata such as entity, franchise, language, originalName/localizedName when known, context/searchContext, and duration.
- Example audio assetRequest: {"type":"audio","assetType":"audio","entity":"Kankuro","franchise":"Naruto","language":"Japanese","originalName":"カンクロウ","context":"voice line or scene","duration":${normalizedConfig.maxAudioDuration}}.
- Example video assetRequest: {"type":"video","assetType":"video","entity":"Arya Stark","franchise":"Game of Thrones","entityType":"character","categoryType":"series","searchContext":"training sword scene","duration":${normalizedConfig.maxAudioDuration}}.
- For anime, include Japanese/original-language names when possible.
- For movies, include the English title when possible.
- For Arabic series, include Arabic names/titles.
- Do not choose an asset provider. Provider selection belongs to AssetService.
- If type is "audio", assetRequest.entity or assetRequest.originalName is required, and assetRequest.duration must not exceed ${normalizedConfig.maxAudioDuration}.
- If type is "video", assetRequest.entity plus franchise/searchContext are required, and assetRequest.duration must not exceed ${normalizedConfig.maxAudioDuration}.
- If type is "image", assetRequest.entity/context should describe the needed image.
- If type is "quote", include assetRequest.speaker when known plus entity/context.
- If type is "emoji" or "timeline", put the needed structured clue details in assetRequest.
- Do not generate an asset type outside the supported asset types.
- For text/trivia questions, use assetRequest=null and assetStatus="NOT_REQUIRED".
- For non-text questions, use assetStatus="PENDING" and asset=null.`;
  }

  private calculateGameModeDistribution(
    gameplayConfig: CategoryGameplayConfig,
    count: number,
  ): Record<GameMode, number> {
    const entries = Object.entries(gameplayConfig.gameModes ?? {})
      .map(([gameMode, percentage]) => ({
        gameMode: gameMode as GameMode,
        percentage: Number(percentage) || 0,
      }))
      .filter((entry) => entry.percentage > 0);

    if (!entries.length) {
      return {
        trivia: count,
        identifyCharacter: 0,
        identifyVoice: 0,
        identifyImage: 0,
        completeQuote: 0,
        timeline: 0,
        emojiPuzzle: 0,
        identifySong: 0,
        identifySinger: 0,
        identifyMusicIntro: 0,
      };
    }

    const totalPercentage = entries.reduce(
      (sum, entry) => sum + entry.percentage,
      0,
    );
    const distribution: Record<GameMode, number> = {
      trivia: 0,
      identifyCharacter: 0,
      identifyVoice: 0,
      identifyImage: 0,
      completeQuote: 0,
      timeline: 0,
      emojiPuzzle: 0,
      identifySong: 0,
      identifySinger: 0,
      identifyMusicIntro: 0,
    };
    const remainders = entries.map((entry) => {
      const exactCount = (count * entry.percentage) / totalPercentage;
      const floorCount = Math.floor(exactCount);
      distribution[entry.gameMode] = floorCount;

      return {
        gameMode: entry.gameMode,
        remainder: exactCount - floorCount,
      };
    });

    let assigned = Object.values(distribution).reduce(
      (sum, modeCount) => sum + modeCount,
      0,
    );

    for (const item of remainders.sort((a, b) => b.remainder - a.remainder)) {
      if (assigned >= count) {
        break;
      }

      distribution[item.gameMode] += 1;
      assigned += 1;
    }

    return distribution;
  }

  private mapLegacyQuestionTypesToGameModes(
    questionTypes?: CategoryGameplayConfig['questionTypes'],
  ): CategoryGameplayConfig['gameModes'] {
    if (!questionTypes) {
      return undefined;
    }

    return {
      trivia: questionTypes.text,
      identifyImage: questionTypes.image,
      identifyVoice: questionTypes.audio,
      completeQuote: questionTypes.quote,
      emojiPuzzle: questionTypes.emoji,
      timeline: questionTypes.timeline,
    };
  }
}
