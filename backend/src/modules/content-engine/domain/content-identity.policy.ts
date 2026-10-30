import { normalizeAnswer } from '../../../common/utils/answer-normalization.util';
import { ChallengeAnswerMode } from '../../world-content/domain/world-content.constants';
import {
  CognitiveTask,
  CognitiveTaskType,
  ContentIdentity,
  ContentIdentityComparison,
  ComparisonReasonCode,
  IdentityDimensionMatch,
  MechanicPayloadIdentity,
  RawContentItemInput,
  SemanticFact,
  SemanticTarget,
} from './content-identity.types';

/**
 * Standard Arabic generic stems where the prompt text does not define the puzzle.
 * The puzzle identity lives in the options, relationships, or puzzle payload.
 */
const GENERIC_ODD_ONE_OUT_STEMS = [
  'ما العنصر الدخيل',
  'ما الكلمة الدخيلة',
  'الكلمة الدخيلة',
  'العنصر الدخيل',
  'ما الكلمة الشاذة',
  'الكلمة الشاذة',
  'اختر الكلمة الشاذة',
  'اختر العنصر الدخيل',
  'اي مما يلي لا ينتمي',
  'اي من التالي لا ينتمي',
  'اي من الخيارات لا ينتمي',
  'لا ينتمي للمجموعة',
  'اختر الشاذ',
  'ما هو الشاذ',
];

const GENERIC_MULTIPLE_CHOICE_STEMS = [
  'اختر الاجابة الصحيحة',
  'ما هي الاجابة الصحيحة',
  'ما الاجابة الصحيحة',
  'اي مما يلي صحيح',
  'اي من الخيارات التالية صحيح',
  'حدد الاجابة الصحيحة',
  'اختر الصواب',
  'ما هو الصواب',
];

const NORMALIZED_GENERIC_ODD_ONE_OUT_STEMS =
  GENERIC_ODD_ONE_OUT_STEMS.map(normalizeAnswer);

const NORMALIZED_GENERIC_MULTIPLE_CHOICE_STEMS =
  GENERIC_MULTIPLE_CHOICE_STEMS.map(normalizeAnswer);

/** Extract raw text from string or LocalizedText */
export function extractText(input: unknown): string {
  if (typeof input === 'string') return input.trim();
  if (input && typeof input === 'object') {
    const loc = input as { ar?: string; en?: string };
    return (loc.ar ?? loc.en ?? '').trim();
  }
  return '';
}

/** Clean asset URL to an invariant media subject key, independent of CDN host / protocol / query */
export function cleanMediaSubjectKey(urlOrSubject: string): string {
  if (!urlOrSubject) return '';
  try {
    // If it's a URL, extract the path basename without query/hash
    const parsed = new URL(urlOrSubject);
    const pathname = parsed.pathname;
    const segments = pathname.split('/').filter(Boolean);
    const last = segments[segments.length - 1] ?? '';
    // Strip file extension (.mp3, .jpg, etc.)
    return normalizeAnswer(last.replace(/\.[a-z0-9]+$/i, ''));
  } catch {
    // Not a valid URL, treat as direct string/identifier
    return normalizeAnswer(urlOrSubject);
  }
}

/** Check if a normalized prompt is a generic puzzle stem */
export function isGenericStemText(normalizedPrompt: string): boolean {
  if (!normalizedPrompt) return false;
  return (
    NORMALIZED_GENERIC_ODD_ONE_OUT_STEMS.some((stem) =>
      normalizedPrompt.includes(stem),
    ) ||
    NORMALIZED_GENERIC_MULTIPLE_CHOICE_STEMS.some((stem) =>
      normalizedPrompt.includes(stem),
    ) ||
    normalizedPrompt.includes('عنصر دخيل') ||
    normalizedPrompt.includes('كلمه دخيل') ||
    normalizedPrompt.includes('كلمه شاذ') ||
    normalizedPrompt.includes('لا ينتمي')
  );
}

/** Strip generic stem prefixes to expose underlying specific text */
export function stripGenericStem(normalizedPrompt: string): string {
  let cleaned = normalizedPrompt;
  for (const stem of [
    ...NORMALIZED_GENERIC_ODD_ONE_OUT_STEMS,
    ...NORMALIZED_GENERIC_MULTIPLE_CHOICE_STEMS,
  ]) {
    if (cleaned.startsWith(stem)) {
      cleaned = cleaned.slice(stem.length).trim();
    }
  }
  return cleaned;
}

/** Clean extracted subject string of boundary noise and particles */
export function cleanExtractedSubject(raw: string): string {
  let s = normalizeAnswer(raw);
  s = s.replace(
    /^(?:هو|هي|هما|هم|في|من|دوله|جمهوريه|مملكه|روايه|كتاب|سلسله|فيلم|مسلسل)\s+/,
    '',
  );
  s = s.replace(/\s+(?:هو|هي|تكون|يكون|يقع|تقع|يوجد|توجد|تقريبا|بالمتر)$/, '');
  return s.trim();
}

export const LANDMARK_CATEGORY_HEADS = [
  'برج',
  'متحف',
  'جامع',
  'مسجد',
  'كاتدرائيه',
  'كنيسه',
  'قصر',
  'قلعه',
  'حديقه',
  'منتزه',
  'مطار',
  'محطه',
  'جسر',
  'ميدان',
  'شارع',
  'سوق',
  'بحيره',
  'نهر',
  'جبل',
  'جامعه',
  'مكتبه',
  'استاد',
  'ملعب',
  'نافوره',
  'شلال',
  'جزيره',
  'كهف',
  'سد',
];

export function haveDistinctLandmarkCategories(
  subA: string,
  subB: string,
): boolean {
  const normA = normalizeAnswer(subA);
  const normB = normalizeAnswer(subB);
  const headA = LANDMARK_CATEGORY_HEADS.find(
    (h) => normA.startsWith(h) || normA.includes(` ${h} `),
  );
  const headB = LANDMARK_CATEGORY_HEADS.find(
    (h) => normB.startsWith(h) || normB.includes(` ${h} `),
  );
  return Boolean(headA && headB && headA !== headB);
}

/**
 * Deterministically extract the core factual relationship (subject and property)
 * tested by an Arabic factual question.
 */
export function extractSemanticFact(
  prompt: string,
  metadataSubject?: string,
): SemanticFact {
  if (metadataSubject) {
    const cleanSub = cleanExtractedSubject(metadataSubject);
    return {
      subject: cleanSub,
      property: 'explicit_subject',
      isExtracted: true,
    };
  }

  const norm = normalizeAnswer(prompt);

  // 1. Capital question patterns:
  // Standard: "ما هي عاصمة اليابان", "عاصمة دولة فرنسا هي", "ما عاصمة مصر"
  const capitalMatch = norm.match(/(?:عاصم[هة]\s+(?:دول[هة]\s+)?)(.+)/);
  if (capitalMatch && capitalMatch[1]) {
    const sub = cleanExtractedSubject(capitalMatch[1]);
    if (sub) {
      return {
        subject: sub,
        property: 'capital',
        isExtracted: true,
      };
    }
  }

  // Fronted capital: "فرنسا ما هي عاصمتها", "اليابان ما عاصمتها"
  const frontedCapitalMatch = norm.match(
    /^(.+?)\s+ما\s+(?:هي\s+)?عاصمت(?:ها|ه)$/,
  );
  if (frontedCapitalMatch && frontedCapitalMatch[1]) {
    const sub = cleanExtractedSubject(frontedCapitalMatch[1]);
    if (sub) {
      return {
        subject: sub,
        property: 'capital',
        isExtracted: true,
      };
    }
  }

  // 2. Location / City patterns:
  // Standard: "اين يقع برج ايفل", "اين تقع الكعبة", "في اي مدينه تقع نوتردام", "اين توجد الاهرامات"
  const locationMatch = norm.match(
    /(?:اين\s+(?:يقع|تقع|يوجد|توجد)|في\s+اي\s+(?:مدين[هة]|دول[هة]|مكان)\s+(?:يقع|تقع|يوجد|توجد)|موقع)\s+(.+)/,
  );
  if (locationMatch && locationMatch[1]) {
    const sub = cleanExtractedSubject(locationMatch[1]);
    if (sub) {
      return {
        subject: sub,
        property: 'location',
        isExtracted: true,
      };
    }
  }

  // Fronted location patterns: "برج ايفل اين يقع", "الكعبة اين تقع", "الاهرامات اين توجد"
  const frontedLocationMatch = norm.match(
    /^(.+?)\s+اين\s+(?:يقع|تقع|يوجد|توجد)$/,
  );
  if (frontedLocationMatch && frontedLocationMatch[1]) {
    const sub = cleanExtractedSubject(frontedLocationMatch[1]);
    if (sub) {
      return {
        subject: sub,
        property: 'location',
        isExtracted: true,
      };
    }
  }

  // 3. Currency patterns: "ما هي عملة اليابان", "عملة دولة اليابان هي"
  const currencyMatch = norm.match(/(?:عمل[هة]\s+(?:دول[هة]\s+)?)(.+)/);
  if (currencyMatch && currencyMatch[1]) {
    const sub = cleanExtractedSubject(currencyMatch[1]);
    if (sub) {
      return {
        subject: sub,
        property: 'currency',
        isExtracted: true,
      };
    }
  }

  // 4. Founder / Inventor / Author / Director
  const creatorMatch = norm.match(
    /(?:من\s+(?:هو\s+)?(?:مؤسس|موسس|مخترع|مؤلف|مولف|كاتب|مخرج|شاعر)|مؤسس|موسس|مخترع|مؤلف|مولف|كاتب)\s+(.+)/,
  );
  if (creatorMatch && creatorMatch[1]) {
    const sub = cleanExtractedSubject(creatorMatch[1]);
    if (sub) {
      return {
        subject: sub,
        property: 'creator',
        isExtracted: true,
      };
    }
  }

  return {
    subject: '',
    property: '',
    isExtracted: false,
  };
}

/**
 * Infer the CognitiveTask required of the player based on mechanic mode,
 * prompt semantics, and authoring context.
 */
export function inferCognitiveTask(
  promptText: string,
  mode: ChallengeAnswerMode | string,
  familyKey?: string,
): CognitiveTask {
  const normPrompt = normalizeAnswer(promptText);
  const isGeneric = isGenericStemText(normPrompt);
  const stemStripped = stripGenericStem(normPrompt);

  let taskType: CognitiveTaskType = 'unknown';

  const isOddOneOut =
    NORMALIZED_GENERIC_ODD_ONE_OUT_STEMS.some((s) => normPrompt.includes(s)) ||
    normPrompt.includes('عنصر دخيل') ||
    normPrompt.includes('كلمه دخيل') ||
    normPrompt.includes('كلمه شاذ') ||
    normPrompt.includes('لا ينتمي');

  if (isOddOneOut) {
    taskType = 'odd_one_out';
  } else if (mode === ChallengeAnswerMode.CLOSEST) {
    taskType = 'numeric_estimate';
  } else if (mode === ChallengeAnswerMode.ONE_CLUE) {
    taskType = 'clue_deduction';
  } else if (mode === ChallengeAnswerMode.LAQATHA) {
    taskType = 'clue_progression';
  } else if (mode === ChallengeAnswerMode.ODD_PIECE) {
    taskType = 'visual_anomaly_detection';
  } else if (mode === ChallengeAnswerMode.LA_TAHRIQHA) {
    taskType = 'recipe_discrimination';
  } else if (mode === ChallengeAnswerMode.TOP_5) {
    taskType = 'ranked_selection';
  } else if (mode === ChallengeAnswerMode.FIRST_NOTE) {
    taskType = 'audio_recognition';
  } else if (mode === ChallengeAnswerMode.RYO) {
    taskType = 'bluff_prediction';
  } else if (mode === ChallengeAnswerMode.VOTE) {
    taskType = 'subjective_consensus';
  } else if (
    familyKey &&
    [
      'anagram',
      'dotless-disambiguation',
      'plural-form',
      'letter-math',
      'rhyme',
    ].includes(familyKey)
  ) {
    taskType = 'wordplay_transformation';
  } else if (mode === ChallengeAnswerMode.MULTIPLE_CHOICE) {
    taskType = isGeneric ? 'odd_one_out' : 'fact_recall';
  } else if (mode === ChallengeAnswerMode.MATCH) {
    taskType = 'fact_recall';
  }

  return {
    taskType,
    isGenericStem: isGeneric,
    normalizedStemPrompt: stemStripped,
    detail: familyKey ? `family:${familyKey}` : undefined,
  };
}

/**
 * Extract the SemanticTarget of the question.
 */
export function extractSemanticTarget(
  input: RawContentItemInput,
  normPrompt: string,
): SemanticTarget {
  const answer = input.answerPayload;
  const mode = answer?.mode;
  const rawPrompt = extractText(input.prompt);
  const semanticFact = extractSemanticFact(rawPrompt, input.metadata?.subject);
  const effectiveSubject = semanticFact.isExtracted
    ? semanticFact.subject
    : input.metadata?.subject
      ? normalizeAnswer(input.metadata.subject)
      : undefined;

  if (mode === ChallengeAnswerMode.MULTIPLE_CHOICE) {
    const options = answer?.options ?? [];
    const correctId = (answer?.correctOptionId ?? '').trim();
    const correctOpt = options.find((o) => (o.id ?? '').trim() === correctId);

    if (correctOpt) {
      const rawVal = extractText(correctOpt.label);
      const normVal = normalizeAnswer(rawVal);
      return {
        targetType: 'discrete_option',
        normalizedValue: normVal,
        rawValue: rawVal,
        subject: effectiveSubject,
        semanticFact,
      };
    }
    return {
      targetType: 'unspecified',
      normalizedValue: '',
      rawValue: null,
      semanticFact,
    };
  }

  if (mode === ChallengeAnswerMode.CLOSEST) {
    if (typeof answer?.correctValue === 'number') {
      return {
        targetType: 'numeric_value',
        normalizedValue: String(answer.correctValue),
        rawValue: answer.correctValue,
        numericDetails: {
          value: answer.correctValue,
          tolerance: answer.acceptedTolerance,
        },
        subject: effectiveSubject,
        semanticFact,
      };
    }
    return {
      targetType: 'unspecified',
      normalizedValue: '',
      semanticFact,
    };
  }

  if (
    mode === ChallengeAnswerMode.MATCH ||
    mode === ChallengeAnswerMode.ONE_CLUE ||
    mode === ChallengeAnswerMode.LAQATHA ||
    mode === ChallengeAnswerMode.FIRST_NOTE
  ) {
    const accepted = (answer?.acceptedAnswers ?? [])
      .map((a) => normalizeAnswer(a))
      .filter(Boolean);
    if (accepted.length > 0) {
      return {
        targetType: 'accepted_answers',
        normalizedValue: accepted[0] ?? '',
        acceptedAnswers: accepted,
        subject: effectiveSubject,
        semanticFact,
      };
    }
    return {
      targetType: 'unspecified',
      normalizedValue: '',
      semanticFact,
    };
  }

  if (mode === ChallengeAnswerMode.ODD_PIECE) {
    const mech = input.mechanicPayload as
      | {
          targetVehicleIdentity?: string;
          targetVehicleLabel?: string;
        }
      | undefined;
    const rawVal =
      mech?.targetVehicleIdentity || mech?.targetVehicleLabel || '';
    if (rawVal) {
      return {
        targetType: 'target_entity',
        normalizedValue: normalizeAnswer(rawVal),
        rawValue: rawVal,
        subject: effectiveSubject,
        semanticFact,
      };
    }
    return {
      targetType: 'unspecified',
      normalizedValue: '',
      semanticFact,
    };
  }

  if (mode === ChallengeAnswerMode.LA_TAHRIQHA) {
    const mech = input.mechanicPayload as
      | {
          ingredients?: Array<{ label?: unknown; correct?: boolean }>;
        }
      | undefined;
    const correctIngs = (mech?.ingredients ?? [])
      .filter((i) => i.correct === true)
      .map((i) => normalizeAnswer(extractText(i.label)))
      .filter(Boolean)
      .sort();

    if (correctIngs.length > 0) {
      return {
        targetType: 'dish_recipe',
        normalizedValue: correctIngs.join('~'),
        acceptedAnswers: correctIngs,
        subject: normPrompt,
        semanticFact,
      };
    }
    return {
      targetType: 'unspecified',
      normalizedValue: '',
      semanticFact,
    };
  }

  if (mode === ChallengeAnswerMode.TOP_5) {
    const mech = input.mechanicPayload as
      | {
          entries?: Array<{ title?: string; rank?: number | null }>;
        }
      | undefined;
    const ranked = (mech?.entries ?? [])
      .filter((e) => typeof e.rank === 'number' && e.rank >= 1 && e.rank <= 5)
      .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
      .map((e) => normalizeAnswer(e.title ?? ''));

    if (ranked.length > 0) {
      return {
        targetType: 'ordered_sequence',
        normalizedValue: ranked.join(' > '),
        acceptedAnswers: ranked,
        subject: effectiveSubject,
        semanticFact,
      };
    }
    return {
      targetType: 'unspecified',
      normalizedValue: '',
      semanticFact,
    };
  }

  return {
    targetType: 'unspecified',
    normalizedValue: '',
    semanticFact,
  };
}

/**
 * Extract the MechanicPayloadIdentity.
 */
export function extractMechanicPayloadIdentity(
  input: RawContentItemInput,
): MechanicPayloadIdentity {
  const answer = input.answerPayload;
  const mode = (answer?.mode ?? 'unknown') as ChallengeAnswerMode | string;

  // Media subjects extraction
  const mediaSubjectKeys: string[] = [];
  const assets = [
    ...(input.media?.assets ?? []),
    ...(input.revealMedia?.assets ?? []),
  ];
  for (const asset of assets) {
    const explicitSubject = asset.subject || asset.title || asset.label;
    if (explicitSubject) {
      mediaSubjectKeys.push(normalizeAnswer(explicitSubject));
    } else if (asset.url) {
      mediaSubjectKeys.push(cleanMediaSubjectKey(asset.url));
    }
  }

  if (mode === ChallengeAnswerMode.MULTIPLE_CHOICE) {
    const options = (answer?.options ?? [])
      .map((o) => normalizeAnswer(extractText(o.label)))
      .filter(Boolean)
      .sort();

    return {
      answerMode: mode,
      structureKey: `mc:${options.join('~')}`,
      options,
      mediaSubjectKeys:
        mediaSubjectKeys.length > 0 ? mediaSubjectKeys : undefined,
    };
  }

  if (mode === ChallengeAnswerMode.CLOSEST) {
    const val =
      typeof answer?.correctValue === 'number' ? answer.correctValue : 0;
    const tol =
      typeof answer?.acceptedTolerance === 'number'
        ? answer.acceptedTolerance
        : 0;
    return {
      answerMode: mode,
      structureKey: `closest:${val}:${tol}`,
      numericSpec: { value: val, tolerance: tol },
      mediaSubjectKeys:
        mediaSubjectKeys.length > 0 ? mediaSubjectKeys : undefined,
    };
  }

  if (
    mode === ChallengeAnswerMode.ONE_CLUE ||
    mode === ChallengeAnswerMode.LAQATHA
  ) {
    const mech = input.mechanicPayload as
      | {
          clues?: Array<{ order?: number; value?: number; text?: unknown }>;
        }
      | undefined;
    const clues = (mech?.clues ?? [])
      .map((c) => ({
        order: typeof c.order === 'number' ? c.order : 0,
        value: c.value,
        text: normalizeAnswer(extractText(c.text)),
      }))
      .sort((a, b) => a.order - b.order);

    return {
      answerMode: mode,
      structureKey: `clues:${clues.map((c) => `${c.order}#${c.text}`).join('|')}`,
      orderedClues: clues,
      mediaSubjectKeys:
        mediaSubjectKeys.length > 0 ? mediaSubjectKeys : undefined,
    };
  }

  if (mode === ChallengeAnswerMode.ODD_PIECE) {
    const mech = input.mechanicPayload as
      | {
          pieces?: Array<{ vehicleIdentity?: string; vehicleLabel?: string }>;
        }
      | undefined;
    const pieces = (mech?.pieces ?? [])
      .map((p) => normalizeAnswer(p.vehicleIdentity || p.vehicleLabel || ''))
      .filter(Boolean)
      .sort();

    return {
      answerMode: mode,
      structureKey: `odd_piece:${pieces.join('~')}`,
      pieces,
      mediaSubjectKeys:
        mediaSubjectKeys.length > 0 ? mediaSubjectKeys : undefined,
    };
  }

  if (mode === ChallengeAnswerMode.LA_TAHRIQHA) {
    const mech = input.mechanicPayload as
      | {
          ingredients?: Array<{ label?: unknown; correct?: boolean }>;
        }
      | undefined;
    const correct = (mech?.ingredients ?? [])
      .filter((i) => i.correct === true)
      .map((i) => normalizeAnswer(extractText(i.label)))
      .filter(Boolean)
      .sort();
    const traps = (mech?.ingredients ?? [])
      .filter((i) => i.correct !== true)
      .map((i) => normalizeAnswer(extractText(i.label)))
      .filter(Boolean)
      .sort();

    return {
      answerMode: mode,
      structureKey: `la_tahriqha:c[${correct.join('~')}]|t[${traps.join('~')}]`,
      ingredients: { correct, traps },
      mediaSubjectKeys:
        mediaSubjectKeys.length > 0 ? mediaSubjectKeys : undefined,
    };
  }

  return {
    answerMode: mode,
    structureKey: `generic:${mode}`,
    mediaSubjectKeys:
      mediaSubjectKeys.length > 0 ? mediaSubjectKeys : undefined,
  };
}

/**
 * Build the complete ContentIdentity contract for any content item or draft.
 */
export function extractContentIdentity(
  input: RawContentItemInput,
): ContentIdentity {
  const rawPrompt = extractText(input.prompt);
  const normPrompt = normalizeAnswer(rawPrompt);
  const familyKey = input.metadata?.familyKey;
  const mode = input.answerPayload?.mode ?? 'unknown';

  const cognitiveTask = inferCognitiveTask(rawPrompt, mode, familyKey);
  const semanticTarget = extractSemanticTarget(input, normPrompt);
  const mechanicPayload = extractMechanicPayloadIdentity(input);

  const fingerprint = `${cognitiveTask.taskType}:${semanticTarget.normalizedValue}:${mechanicPayload.structureKey}`;

  return {
    scopeKey: input.scopeKey,
    worldKey: input.worldKey,
    semanticTarget,
    cognitiveTask,
    mechanicPayload,
    fingerprint,
    metadata: {
      familyKey,
      tags: input.metadata?.tags,
      source: input.metadata?.source,
      subject: input.metadata?.subject,
      entityId: input.metadata?.entityId,
      rawPrompt,
    },
  };
}

/**
 * Compare two ContentIdentity objects deterministically across:
 * 1. Semantic Target
 * 2. Cognitive Task
 * 3. Mechanic Payload
 */
export function compareContentIdentities(
  a: ContentIdentity,
  b: ContentIdentity,
): ContentIdentityComparison {
  const isCrossScope = Boolean(
    a.scopeKey && b.scopeKey && a.scopeKey !== b.scopeKey,
  );

  // 1. Unsupported Mechanic Check (checked first, as subjective modes like VOTE naturally lack objective targets)
  if (
    a.cognitiveTask.taskType === 'subjective_consensus' ||
    b.cognitiveTask.taskType === 'subjective_consensus' ||
    a.mechanicPayload.answerMode === ChallengeAnswerMode.VOTE ||
    b.mechanicPayload.answerMode === ChallengeAnswerMode.VOTE
  ) {
    return {
      result: 'POTENTIAL_OVERLAP',
      reasonCode: 'UNSUPPORTED_MECHANIC_COMPARISON',
      explanation:
        'Subjective consensus (VOTE) mechanics lack objective deterministic answer identity; requires product policy decision.',
      dimensions: {
        semanticTarget: 'UNKNOWN',
        cognitiveTask: 'MATCH',
        mechanicPayload: 'UNKNOWN',
      },
      isCrossScope,
    };
  }

  // 2. Missing or Ambiguous Information Checks
  const isTargetMissingA =
    a.semanticTarget.targetType === 'unspecified' ||
    !a.semanticTarget.normalizedValue;
  const isTargetMissingB =
    b.semanticTarget.targetType === 'unspecified' ||
    !b.semanticTarget.normalizedValue;

  if (isTargetMissingA || isTargetMissingB) {
    return {
      result: 'POTENTIAL_OVERLAP',
      reasonCode: 'MISSING_SEMANTIC_TARGET',
      explanation:
        'One or both items lack a deterministically resolvable semantic target; cannot safely confirm distinction.',
      dimensions: {
        semanticTarget: 'UNKNOWN',
        cognitiveTask:
          a.cognitiveTask.taskType === b.cognitiveTask.taskType
            ? 'MATCH'
            : 'MISMATCH',
        mechanicPayload: 'UNKNOWN',
      },
      isCrossScope,
    };
  }

  // 3. Dimensional Evaluation

  // 3.1 Cognitive Task
  let taskMatch: IdentityDimensionMatch['cognitiveTask'] = 'MISMATCH';
  if (a.cognitiveTask.taskType === b.cognitiveTask.taskType) {
    if (a.cognitiveTask.taskType === 'odd_one_out') {
      taskMatch = 'MATCH';
    } else if (a.cognitiveTask.taskType === 'numeric_estimate') {
      // In numeric estimation, check if prompt asks for the same subject/quantity
      const promptA = a.cognitiveTask.normalizedStemPrompt;
      const promptB = b.cognitiveTask.normalizedStemPrompt;
      const hasSameFamily =
        Boolean(a.metadata?.familyKey) &&
        a.metadata?.familyKey === b.metadata?.familyKey;
      if (promptA === promptB || hasSameFamily) {
        taskMatch = 'MATCH';
      } else {
        // Different numeric questions (e.g. continents vs days)
        taskMatch = 'MISMATCH';
      }
    } else if (a.cognitiveTask.taskType === 'fact_recall') {
      const promptA = a.cognitiveTask.normalizedStemPrompt;
      const promptB = b.cognitiveTask.normalizedStemPrompt;
      const factA = a.semanticTarget.semanticFact;
      const factB = b.semanticTarget.semanticFact;

      if (promptA === promptB) {
        taskMatch = 'MATCH';
      } else if (factA?.isExtracted && factB?.isExtracted) {
        if (
          factA.property === factB.property &&
          factA.subject === factB.subject
        ) {
          taskMatch = 'MATCH';
        } else {
          taskMatch = 'MISMATCH';
        }
      } else {
        taskMatch = 'OVERLAP';
      }
    } else {
      taskMatch = 'MATCH';
    }
  }

  // 3.2 Semantic Target (evaluated independently of cognitive task)
  let targetMatch: IdentityDimensionMatch['semanticTarget'] = 'MISMATCH';
  if (
    a.semanticTarget.targetType === 'numeric_value' &&
    b.semanticTarget.targetType === 'numeric_value'
  ) {
    if (a.semanticTarget.normalizedValue === b.semanticTarget.normalizedValue) {
      targetMatch = 'MATCH';
    } else {
      targetMatch = 'MISMATCH';
    }
  } else if (
    a.semanticTarget.normalizedValue &&
    b.semanticTarget.normalizedValue &&
    a.semanticTarget.normalizedValue === b.semanticTarget.normalizedValue
  ) {
    targetMatch = 'MATCH';
  } else if (
    a.semanticTarget.acceptedAnswers &&
    b.semanticTarget.acceptedAnswers &&
    a.semanticTarget.acceptedAnswers.some((ans) =>
      b.semanticTarget.acceptedAnswers?.includes(ans),
    )
  ) {
    targetMatch = 'OVERLAP';
  }

  // 3.3 Mechanic Payload
  let payloadMatch: IdentityDimensionMatch['mechanicPayload'] = 'MISMATCH';

  // Check Clue Progression Order (where order matters)
  if (
    (a.mechanicPayload.answerMode === ChallengeAnswerMode.ONE_CLUE ||
      a.mechanicPayload.answerMode === ChallengeAnswerMode.LAQATHA) &&
    (b.mechanicPayload.answerMode === ChallengeAnswerMode.ONE_CLUE ||
      b.mechanicPayload.answerMode === ChallengeAnswerMode.LAQATHA)
  ) {
    const cluesA = a.mechanicPayload.orderedClues ?? [];
    const cluesB = b.mechanicPayload.orderedClues ?? [];

    if (cluesA.length === cluesB.length && cluesA.length > 0) {
      const textsA = cluesA.map((c) => c.text);
      const textsB = cluesB.map((c) => c.text);
      const isSameOrder = textsA.every((t, i) => t === textsB[i]);
      const isReordered =
        !isSameOrder &&
        [...textsA].sort().join('~') === [...textsB].sort().join('~');

      if (isSameOrder || isReordered) {
        payloadMatch = 'MATCH';
      } else {
        const commonClues = textsA.filter((t) => textsB.includes(t));
        payloadMatch = commonClues.length > 0 ? 'OVERLAP' : 'MISMATCH';
      }
    }
  } else if (
    a.mechanicPayload.answerMode === ChallengeAnswerMode.MULTIPLE_CHOICE &&
    b.mechanicPayload.answerMode === ChallengeAnswerMode.MULTIPLE_CHOICE
  ) {
    const optsA = a.mechanicPayload.options ?? [];
    const optsB = b.mechanicPayload.options ?? [];

    if (optsA.length === optsB.length && optsA.length > 0) {
      const isExactMatch = optsA.every((opt, i) => opt === optsB[i]);
      if (isExactMatch) {
        payloadMatch = 'MATCH';
      } else {
        const overlap = optsA.filter((opt) => optsB.includes(opt)).length;
        payloadMatch = overlap > 0 ? 'OVERLAP' : 'MISMATCH';
      }
    }
  } else if (
    a.mechanicPayload.structureKey === b.mechanicPayload.structureKey
  ) {
    payloadMatch = 'MATCH';
  }

  // Media Subject Equivalence (Asset URLs differ, but media subject / asset identifier matches)
  if (
    a.mechanicPayload.mediaSubjectKeys &&
    b.mechanicPayload.mediaSubjectKeys &&
    a.mechanicPayload.mediaSubjectKeys.length > 0 &&
    b.mechanicPayload.mediaSubjectKeys.length ===
      b.mechanicPayload.mediaSubjectKeys.length
  ) {
    const mediaMatch = a.mechanicPayload.mediaSubjectKeys.every((key) =>
      b.mechanicPayload.mediaSubjectKeys?.includes(key),
    );
    if (mediaMatch && payloadMatch === 'MISMATCH') {
      payloadMatch = 'MATCH';
    }
  }

  const dimensions: IdentityDimensionMatch = {
    semanticTarget: targetMatch,
    cognitiveTask: taskMatch,
    mechanicPayload: payloadMatch,
  };

  // 4. Decision Synthesis

  // 4.1 Distinct Cognitive Tasks / Different Factual Relationships
  if (taskMatch === 'MISMATCH') {
    if (a.semanticTarget.normalizedValue !== b.semanticTarget.normalizedValue) {
      return {
        result: 'DISTINCT',
        reasonCode: 'DISTINCT_SEMANTIC_TARGET',
        explanation:
          'Semantic targets are distinct; the gameplay solves for different answers or entities.',
        dimensions,
        isCrossScope,
      };
    }

    const factA = a.semanticTarget.semanticFact;
    const factB = b.semanticTarget.semanticFact;

    // Check if authoritative entity metadata establishes a genuine distinction
    const hasAuthoritativeEntityDistinction = Boolean(
      (a.metadata?.entityId &&
        b.metadata?.entityId &&
        a.metadata.entityId !== b.metadata.entityId) ||
      (a.metadata?.subject &&
        b.metadata?.subject &&
        a.metadata.subject !== b.metadata.subject &&
        !a.metadata.subject.includes(b.metadata.subject) &&
        !b.metadata.subject.includes(a.metadata.subject)),
    );

    if (factA?.isExtracted && factB?.isExtracted) {
      // 1. Same extracted property, differing subject strings
      if (factA.property === factB.property) {
        if (hasAuthoritativeEntityDistinction) {
          return {
            result: 'DISTINCT',
            reasonCode: 'DISTINCT_FACTUAL_RELATIONSHIP',
            explanation: `Authoritative entity metadata confirms distinct subjects ("${factA.subject}" vs "${factB.subject}") for property "${factA.property}".`,
            dimensions,
            isCrossScope,
          };
        }

        // For location questions with proven distinct landmark category heads and disjoint words
        if (
          factA.property === 'location' &&
          haveDistinctLandmarkCategories(factA.subject, factB.subject) &&
          !factA.subject.includes(factB.subject) &&
          !factB.subject.includes(factA.subject)
        ) {
          return {
            result: 'DISTINCT',
            reasonCode: 'DISTINCT_FACTUAL_RELATIONSHIP',
            explanation: `Proven different landmark entities: "${factA.subject}" vs "${factB.subject}" for location "${a.semanticTarget.normalizedValue}".`,
            dimensions,
            isCrossScope,
          };
        }

        // Differing subject strings without authoritative entity distinction cannot be proven distinct (e.g. أمريكا vs الولايات المتحدة, الهاتف vs التليفون)
        return {
          result: 'POTENTIAL_OVERLAP',
          reasonCode: 'UNCERTAIN_FACTUAL_RELATIONSHIP',
          explanation: `Same target answer and property "${factA.property}", but differing extracted subjects ("${factA.subject}" vs "${factB.subject}"); deterministic string comparison cannot verify entity distinction.`,
          dimensions,
          isCrossScope,
        };
      }

      // 2. Differing extracted properties
      const isKnownDistinctPropertyPair =
        (factA.property === 'capital' && factB.property === 'location') ||
        (factA.property === 'location' && factB.property === 'capital') ||
        (factA.property === 'currency' && factB.property === 'creator') ||
        (factA.property === 'creator' && factB.property === 'currency') ||
        (factA.property === 'capital' && factB.property === 'creator') ||
        (factA.property === 'creator' && factB.property === 'capital') ||
        (factA.property === 'location' && factB.property === 'creator') ||
        (factA.property === 'creator' && factB.property === 'location');

      const isNeitherGenericExplicit =
        factA.property !== 'explicit_subject' &&
        factB.property !== 'explicit_subject';

      if (
        isKnownDistinctPropertyPair &&
        isNeitherGenericExplicit &&
        factA.subject !== factB.subject &&
        !factA.subject.includes(factB.subject) &&
        !factB.subject.includes(factA.subject)
      ) {
        return {
          result: 'DISTINCT',
          reasonCode: 'DISTINCT_FACTUAL_RELATIONSHIP',
          explanation: `Proven different factual relationships: "${factA.subject}" (${factA.property}) vs "${factB.subject}" (${factB.property}).`,
          dimensions,
          isCrossScope,
        };
      }

      // Differing property labels without proven task difference (e.g. explicit_subject vs capital)
      return {
        result: 'POTENTIAL_OVERLAP',
        reasonCode: 'UNCERTAIN_FACTUAL_RELATIONSHIP',
        explanation: `Same target answer with differing property labels ("${factA.property}" vs "${factB.property}"); deterministic evidence cannot confirm distinct gameplay tasks.`,
        dimensions,
        isCrossScope,
      };
    }

    if (a.cognitiveTask.taskType === 'fact_recall') {
      return {
        result: 'POTENTIAL_OVERLAP',
        reasonCode: 'UNCERTAIN_FACTUAL_RELATIONSHIP',
        explanation:
          'Same target answer with differing question phrasing where factual equivalence cannot be deterministically proven.',
        dimensions,
        isCrossScope,
      };
    }

    return {
      result: 'DISTINCT',
      reasonCode: 'DISTINCT_COGNITIVE_TASK',
      explanation:
        'Cognitive tasks are materially different; gameplay requires different reasoning, inference, or calculation.',
      dimensions,
      isCrossScope,
    };
  }

  // 4.2 Generic Prompt Stems with Different Payloads (e.g. «ما العنصر الدخيل؟» with different options)
  if (a.cognitiveTask.isGenericStem && b.cognitiveTask.isGenericStem) {
    if (payloadMatch === 'MISMATCH') {
      return {
        result: 'DISTINCT',
        reasonCode: 'DISTINCT_PUZZLE_PAYLOAD',
        explanation:
          'Generic prompt stem is shared, but the puzzle payload (options/relationships) is completely distinct.',
        dimensions,
        isCrossScope,
      };
    }
  }

  // 4.3 Clue Progression Mechanics (One Clue, Laqatha)
  if (
    (a.mechanicPayload.answerMode === ChallengeAnswerMode.ONE_CLUE ||
      a.mechanicPayload.answerMode === ChallengeAnswerMode.LAQATHA) &&
    (b.mechanicPayload.answerMode === ChallengeAnswerMode.ONE_CLUE ||
      b.mechanicPayload.answerMode === ChallengeAnswerMode.LAQATHA)
  ) {
    if (targetMatch === 'MATCH') {
      const cluesA = a.mechanicPayload.orderedClues ?? [];
      const cluesB = b.mechanicPayload.orderedClues ?? [];
      const textsA = cluesA.map((c) => c.text);
      const textsB = cluesB.map((c) => c.text);
      const sortedA = [...textsA].sort().join('~');
      const sortedB = [...textsB].sort().join('~');

      if (sortedA === sortedB && sortedA.length > 0) {
        if (isCrossScope) {
          return {
            result: 'POTENTIAL_OVERLAP',
            reasonCode: 'CROSS_SCOPE_ADVISORY',
            explanation:
              'Identical clue challenge matches across different Scopes; returned as advisory potential overlap.',
            dimensions: {
              semanticTarget: 'MATCH',
              cognitiveTask: 'MATCH',
              mechanicPayload: 'MATCH',
            },
            isCrossScope,
          };
        }
        const isSameOrder = textsA.every((t, i) => t === textsB[i]);
        return {
          result: 'DUPLICATE',
          reasonCode: isSameOrder
            ? 'IDENTICAL_GAMEPLAY_TASK'
            : 'SAME_CLUES_REORDERED_PROGRESSION',
          explanation: isSameOrder
            ? 'Identical clues and progression order for the same target.'
            : 'Identical clues with reordered progression for the same target; progression reordering is a difficulty variation, not new content.',
          dimensions: {
            semanticTarget: 'MATCH',
            cognitiveTask: 'MATCH',
            mechanicPayload: 'MATCH',
          },
          isCrossScope,
        };
      }

      // Check partial overlap
      const commonClues = textsA.filter((t) => textsB.includes(t));
      if (commonClues.length > 0) {
        return {
          result: 'POTENTIAL_OVERLAP',
          reasonCode: 'PARTIAL_CLUE_OVERLAP',
          explanation:
            'Same target with partially overlapping clues; deterministic evidence cannot confirm full duplicate or distinct.',
          dimensions: {
            semanticTarget: 'MATCH',
            cognitiveTask: 'MATCH',
            mechanicPayload: 'OVERLAP',
          },
          isCrossScope,
        };
      }

      // Same target, but completely different clues
      return {
        result: 'POTENTIAL_OVERLAP',
        reasonCode: 'SAME_TARGET_DIFFERENT_CLUES',
        explanation:
          'Same semantic target with completely different clues; requires qualitative review to confirm independence.',
        dimensions: {
          semanticTarget: 'MATCH',
          cognitiveTask: 'MATCH',
          mechanicPayload: 'MISMATCH',
        },
        isCrossScope,
      };
    } else {
      return {
        result: 'DISTINCT',
        reasonCode: 'DISTINCT_SEMANTIC_TARGET',
        explanation: 'Different semantic target in clue challenge.',
        dimensions: {
          semanticTarget: 'MISMATCH',
          cognitiveTask: taskMatch,
          mechanicPayload: 'MISMATCH',
        },
        isCrossScope,
      };
    }
  }

  // 4.4 Same Puzzle Structure with Conflicting Answer Key (Contradiction)
  if (
    a.mechanicPayload.answerMode === ChallengeAnswerMode.MULTIPLE_CHOICE &&
    b.mechanicPayload.answerMode === ChallengeAnswerMode.MULTIPLE_CHOICE &&
    taskMatch === 'MATCH' &&
    payloadMatch === 'MATCH' &&
    targetMatch === 'MISMATCH'
  ) {
    if (isCrossScope) {
      return {
        result: 'POTENTIAL_OVERLAP',
        reasonCode: 'CROSS_SCOPE_ADVISORY',
        explanation:
          'Identical puzzle structure offered across different Scopes with a conflicting answer key; returned as non-blocking advisory contradiction.',
        dimensions,
        isCrossScope,
      };
    }

    return {
      result: 'DUPLICATE',
      reasonCode: 'SAME_PUZZLE_CONFLICTING_ANSWER',
      explanation:
        'Identical puzzle structure offered with a conflicting answer key; represents an authoring contradiction.',
      dimensions,
      isCrossScope,
    };
  }

  // 4.5 Distinct Semantic Targets
  if (targetMatch === 'MISMATCH') {
    return {
      result: 'DISTINCT',
      reasonCode: 'DISTINCT_SEMANTIC_TARGET',
      explanation:
        'Semantic targets are distinct; the gameplay solves for different answers or entities.',
      dimensions,
      isCrossScope,
    };
  }

  // 4.6 Multiple Choice Trivia: Distractor Variance for Same Fact
  if (
    a.mechanicPayload.answerMode === ChallengeAnswerMode.MULTIPLE_CHOICE &&
    b.mechanicPayload.answerMode === ChallengeAnswerMode.MULTIPLE_CHOICE &&
    a.cognitiveTask.taskType === 'fact_recall' &&
    b.cognitiveTask.taskType === 'fact_recall' &&
    targetMatch === 'MATCH' &&
    taskMatch === 'MATCH'
  ) {
    if (isCrossScope) {
      return {
        result: 'POTENTIAL_OVERLAP',
        reasonCode: 'CROSS_SCOPE_ADVISORY',
        explanation:
          'Identical factual question matches across different Scopes; returned as advisory potential overlap.',
        dimensions,
        isCrossScope,
      };
    }

    const optsA = a.mechanicPayload.options ?? [];
    const optsB = b.mechanicPayload.options ?? [];
    const isOptionsExactMatch =
      optsA.length === optsB.length &&
      optsA.every((opt, i) => opt === optsB[i]);
    const rawPromptA = a.metadata?.rawPrompt ?? '';
    const rawPromptB = b.metadata?.rawPrompt ?? '';

    let reasonCode: ComparisonReasonCode;
    if (isOptionsExactMatch) {
      reasonCode =
        rawPromptA !== rawPromptB
          ? 'SAME_TASK_REWORDED_PROMPT'
          : 'SAME_PUZZLE_REORDERED_OPTIONS';
    } else {
      reasonCode = 'SAME_FACT_DIFFERENT_DISTRACTORS';
    }

    return {
      result: 'DUPLICATE',
      reasonCode,
      explanation: isOptionsExactMatch
        ? 'Identical factual task and option set.'
        : 'Identical factual task and correct answer; distractor variation does not create a new gameplay task.',
      dimensions: {
        semanticTarget: 'MATCH',
        cognitiveTask: 'MATCH',
        mechanicPayload: isOptionsExactMatch ? 'MATCH' : 'OVERLAP',
      },
      isCrossScope,
    };
  }

  // 4.7 Uncertain Factual Relationship (Same answer, but differing descriptions without proven relation)
  const factA = a.semanticTarget.semanticFact;
  const factB = b.semanticTarget.semanticFact;
  if (
    targetMatch === 'MATCH' &&
    taskMatch === 'OVERLAP' &&
    (!factA?.isExtracted || !factB?.isExtracted)
  ) {
    return {
      result: 'POTENTIAL_OVERLAP',
      reasonCode: 'UNCERTAIN_FACTUAL_RELATIONSHIP',
      explanation:
        'Same target answer but questions use differing descriptions where factual equivalence cannot be deterministically proven.',
      dimensions,
      isCrossScope,
    };
  }

  // 4.6 Full Dimension Match -> Duplicate or Cross-Scope Advisory
  if (
    targetMatch === 'MATCH' &&
    taskMatch === 'MATCH' &&
    payloadMatch === 'MATCH'
  ) {
    if (isCrossScope) {
      return {
        result: 'POTENTIAL_OVERLAP',
        reasonCode: 'CROSS_SCOPE_ADVISORY',
        explanation:
          'Identical gameplay task matches across different Scopes; returned as advisory potential overlap.',
        dimensions,
        isCrossScope,
      };
    }

    // Determine precise reason code within Scope
    let reasonCode: ComparisonReasonCode = 'IDENTICAL_GAMEPLAY_TASK';
    const rawPromptA = a.metadata?.rawPrompt ?? '';
    const rawPromptB = b.metadata?.rawPrompt ?? '';

    if (rawPromptA && rawPromptB && rawPromptA !== rawPromptB) {
      reasonCode = 'SAME_TASK_REWORDED_PROMPT';
    } else if (
      a.mechanicPayload.options &&
      b.mechanicPayload.options &&
      a.mechanicPayload.structureKey === b.mechanicPayload.structureKey
    ) {
      reasonCode = 'SAME_PUZZLE_REORDERED_OPTIONS';
    }

    // Check media URL variation
    if (
      a.mechanicPayload.mediaSubjectKeys &&
      b.mechanicPayload.mediaSubjectKeys &&
      a.mechanicPayload.mediaSubjectKeys.length > 0
    ) {
      reasonCode = 'SAME_MEDIA_DIFFERENT_URL';
    }

    return {
      result: 'DUPLICATE',
      reasonCode,
      explanation:
        'Sufficient evidence that the same gameplay task is repeated across semantic target, cognitive task, and payload.',
      dimensions,
      isCrossScope,
    };
  }

  // 4.7 Partial Overlaps / Ambiguous Evidence
  return {
    result: 'POTENTIAL_OVERLAP',
    reasonCode: 'AMBIGUOUS_EVIDENCE',
    explanation:
      'Meaningful similarity exists across target or payload, but deterministic evidence cannot safely resolve it.',
    dimensions,
    isCrossScope,
  };
}
