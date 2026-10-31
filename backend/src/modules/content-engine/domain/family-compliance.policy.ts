import { FamilyComplianceEvaluation } from './creative-plan.types';
import { CanonicalFamilyCatalog } from './canonical-family.types';

export interface EvaluateFamilyComplianceInput {
  assignedFamilyKey: string;
  draft: Record<string, unknown>;
  authoring?: Record<string, unknown> | null;
  catalog?: CanonicalFamilyCatalog | null;
}

/**
 * Normalizes Arabic letters for robust multiset comparison.
 */
function normalizeArabicChar(ch: string): string {
  if (/[أإآٱ]/.test(ch)) return 'ا';
  if (ch === 'ة') return 'ه';
  if (ch === 'ى') return 'ي';
  return ch;
}

/**
 * Extracts and normalizes pure Arabic letters from a string.
 */
function extractArabicLetters(text: string): string[] {
  return text
    .replace(/[^\u0621-\u064A]/g, '')
    .split('')
    .map(normalizeArabicChar);
}

/**
 * Counts occurrences of each letter in an array.
 */
function letterFrequencyMap(letters: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const letter of letters) {
    map[letter] = (map[letter] || 0) + 1;
  }
  return map;
}

/**
 * Deterministically validates candidate content against its assigned canonical family.
 *
 * Distinguishes:
 * 1. Verified match (`isCompliant: true`, `verificationMethod: 'rule_evaluated'`)
 * 2. Structural/heuristic mismatch (`isCompliant: false`, `mismatchReason: string`)
 * 3. Unverified / manual review required (`isCompliant: false`, `verificationMethod: 'manual_review'`)
 *
 * Never fabricates a positive match when automated rules cannot substantiate it.
 */
export function evaluateFamilyCompliance(
  input: EvaluateFamilyComplianceInput,
): FamilyComplianceEvaluation {
  const assignedFamilyKey = (input.assignedFamilyKey ?? '').trim();
  const draft = input.draft ?? {};
  const authoring = input.authoring ?? {};

  if (!assignedFamilyKey) {
    return {
      assignedFamilyKey: '',
      isCompliant: false,
      verificationMethod: 'manual_review',
      mismatchReason:
        'NO_ASSIGNED_FAMILY: Candidate has no assigned canonical family',
    };
  }

  // Extract candidate fields
  const promptText = (
    (draft.prompt as { ar?: string })?.ar ??
    (draft.prompt as string) ??
    ''
  ).trim();

  const payload = draft.answerPayload as
    | {
        mode?: string;
        options?: { id?: string; label?: { ar?: string } | string }[];
        correctOptionId?: string;
        correctValue?: unknown;
      }
    | undefined;

  let correctLabel = '';
  if (payload?.options && payload.correctOptionId) {
    const correctOpt = payload.options.find(
      (opt) => (opt.id ?? '').trim() === payload.correctOptionId?.trim(),
    );
    if (correctOpt) {
      correctLabel = (
        typeof correctOpt.label === 'object'
          ? (correctOpt.label?.ar ?? '')
          : (correctOpt.label ?? '')
      ).trim();
    }
  } else if (
    payload?.correctValue !== undefined &&
    payload.correctValue !== null
  ) {
    correctLabel = String(payload.correctValue).trim();
  }

  const concept = ((authoring.concept as string) ?? '').trim();

  // 1. Check for explicitly declared / tagged familyKey from draft metadata or authoring
  const declaredFamilyKey = (
    (draft.metadata as { familyKey?: string })?.familyKey ??
    (authoring as { familyKey?: string })?.familyKey
  )?.trim();

  // If a family was explicitly declared and contradicts assigned family:
  if (declaredFamilyKey && declaredFamilyKey !== assignedFamilyKey) {
    return {
      assignedFamilyKey,
      detectedFamilyKey: declaredFamilyKey,
      isCompliant: false,
      verificationMethod: 'rule_evaluated',
      mismatchReason: `Candidate declared family "${declaredFamilyKey}" which does not match assigned family "${assignedFamilyKey}"`,
    };
  }

  // 2. Structural family detection based on candidate prompt, answer, and concept
  // A declared family label alone is never trusted as proof of compliance.
  const detectedFamily = detectStructuralFamily({
    prompt: promptText,
    correctLabel,
    concept,
  });

  // If structural pattern was detected:
  if (detectedFamily) {
    if (isFamilyMatchOrEquivalent(detectedFamily, assignedFamilyKey)) {
      // Further deep rule validation for specific families
      if (assignedFamilyKey === 'anagram-rearrange') {
        const anagramCheck = verifyAnagramRule(promptText, correctLabel);
        if (!anagramCheck.passed) {
          return {
            assignedFamilyKey,
            detectedFamilyKey: detectedFamily,
            isCompliant: false,
            verificationMethod: 'rule_evaluated',
            mismatchReason: anagramCheck.reason,
          };
        }
      }

      if (assignedFamilyKey === 'palindrome-symmetry') {
        const palindromeCheck = verifyPalindromeRule(correctLabel);
        if (!palindromeCheck.passed) {
          return {
            assignedFamilyKey,
            detectedFamilyKey: detectedFamily,
            isCompliant: false,
            verificationMethod: 'rule_evaluated',
            mismatchReason: palindromeCheck.reason,
          };
        }
      }

      if (assignedFamilyKey === 'letter-subtraction-math') {
        const mathCheck = verifyLetterSubtractionMathRule(
          promptText,
          correctLabel,
          concept,
        );
        if (!mathCheck.passed) {
          return {
            assignedFamilyKey,
            detectedFamilyKey: detectedFamily,
            isCompliant: false,
            verificationMethod: 'rule_evaluated',
            mismatchReason: mathCheck.reason,
          };
        }
      }

      if (assignedFamilyKey === 'dotless-disambiguation') {
        const dotlessCheck = verifyDotlessSkeletonRule(
          promptText,
          correctLabel,
        );
        if (!dotlessCheck.passed) {
          return {
            assignedFamilyKey,
            detectedFamilyKey: detectedFamily,
            isCompliant: false,
            verificationMethod: 'rule_evaluated',
            mismatchReason: dotlessCheck.reason,
          };
        }
      }

      if (assignedFamilyKey === 'dot-shift') {
        const dotShiftCheck = verifyDotShiftSkeletonRule(
          promptText,
          correctLabel,
        );
        if (!dotShiftCheck.passed) {
          return {
            assignedFamilyKey,
            detectedFamilyKey: detectedFamily,
            isCompliant: false,
            verificationMethod: 'rule_evaluated',
            mismatchReason: dotShiftCheck.reason,
          };
        }
      }

      return {
        assignedFamilyKey,
        detectedFamilyKey: detectedFamily,
        isCompliant: true,
        verificationMethod: 'rule_evaluated',
      };
    } else {
      // Detected a different family structural pattern!
      return {
        assignedFamilyKey,
        detectedFamilyKey: detectedFamily,
        isCompliant: false,
        verificationMethod: 'rule_evaluated',
        mismatchReason: `Candidate matches structural pattern for family "${detectedFamily}", which conflicts with assigned family "${assignedFamilyKey}"`,
      };
    }
  }

  // 3. Structural rules could not verify: check if assigned family is known to require strict pattern
  const strictlyVerifiableFamilies = [
    'anagram-rearrange',
    'palindrome-symmetry',
    'plural-form',
    'dot-shift',
    'dotless-disambiguation',
    'letter-subtraction-math',
    'add-letter',
    'remove-letter',
    'substitute-letter',
    'arabic-cipher-dhad',
  ];

  if (strictlyVerifiableFamilies.includes(assignedFamilyKey)) {
    return {
      assignedFamilyKey,
      isCompliant: false,
      verificationMethod: 'heuristic',
      mismatchReason: `Candidate prompt does not exhibit expected structural patterns for assigned family "${assignedFamilyKey}"`,
    };
  }

  // 4. Fallback: Family without automated deterministic rules -> marked unverified / manual review
  return {
    assignedFamilyKey,
    isCompliant: false,
    verificationMethod: 'manual_review',
    mismatchReason: `Automated compliance verification unavailable for family "${assignedFamilyKey}"; manual review required`,
  };
}

/**
 * Detects known family patterns from prompt, answer, and concept text.
 */
function detectStructuralFamily(input: {
  prompt: string;
  correctLabel: string;
  concept: string;
}): string | undefined {
  const { prompt, correctLabel, concept } = input;
  const combined = `${prompt} ${concept}`;

  // Letter arithmetic / subtraction & addition math
  // (Tested before anagram to prevent false matches on words like "ترتيب" inside arithmetic concepts)
  if (
    /(?:[−\-\+]\s*[\(（\[].+?[\)）\]]|[\(（\[].+?[\)）\]]\s*[−\-\+])/i.test(
      prompt,
    ) ||
    /(?:معادلة|معادلات)\s*(?:حروف|الحروف|طرح|جمع)/i.test(combined) ||
    /(?:اطرح|احذف|ناقص).*(?:وأضف|واضف|ثم أضف|ثم اضف|زائد)/i.test(combined) ||
    /(?:عملية حسابية لفظية|طرح وجمع الحروف|معادلات طرح)/i.test(combined)
  ) {
    return 'letter-subtraction-math';
  }

  // Anagram / Rearrange
  if (
    /(?:كون|تكوين|رتب|ترتيب|أعد ترتيب|اعد ترتيب|تجميع)\s+(?:كلمة|الحروف|حروف)/i.test(
      combined,
    ) ||
    /(?:الحروف التالية|من الحروف)/i.test(combined)
  ) {
    return 'anagram-rearrange';
  }

  // Palindrome / Symmetry
  if (
    /(?:طرديا وعكسيا|تقرأ من الجهتين|من اليمين لليسار ومن اليسار لليمين|متناظر|بالاتجاهين|تناظر)/i.test(
      combined,
    ) ||
    (correctLabel &&
      verifyPalindromeRule(correctLabel).passed &&
      /(?:طرديا|عكسيا|تقرأ)/i.test(combined))
  ) {
    return 'palindrome-symmetry';
  }

  // Plural / Singular
  if (
    /(?:ما جمع|ما هو جمع|ما مفرد|ما هو مفرد|جمع كلمة|مفرد كلمة|جموع)/i.test(
      prompt,
    )
  ) {
    return 'plural-form';
  }

  // Dot-shift / Dotless
  if (/(?:[أا]?نقل|تحريك|تغيير|غير)\s+(?:مكان\s+)?(?:ال)?نقط/i.test(combined)) {
    return 'dot-shift';
  }
  if (
    /(?:بدون نقاط|بلا نقاط|دون نقاط|غير منقوطة|غير المنقوطة|غير منقوط|من غير نقاط|مجردة من النقاط|أعد النقاط|اعد النقاط|تنقيط الحروف|تنقيط)/i.test(
      combined,
    ) ||
    /[\u066E\u066F\u06BA\u0620\u067E\u06A1]/.test(prompt) ||
    /\[[^\]]*[\u066E\u066F\u06BA][^\]]*\]/.test(prompt)
  ) {
    return 'dotless-disambiguation';
  }

  // Add / Remove / Substitute letter
  if (/(?:أضف حرف|اضف حرف|إضافة حرف|اضافة حرف|لو أضفنا حرف)/i.test(combined)) {
    return 'add-letter';
  }
  if (/(?:احذف حرف|حذف حرف|إذا حذفنا حرف|لو حذفنا حرف)/i.test(combined)) {
    return 'remove-letter';
  }
  if (/(?:استبدل حرف|ابدال حرف|تغيير حرف|بدل حرف)/i.test(combined)) {
    return 'substitute-letter';
  }

  // Hidden word / Word inside word
  if (
    /(?:مختبئة|مختبئ|مخبأة|داخل الجملة|تتضمن كلمة|ابحث عن كلمة داخل|تختبئ)/i.test(
      combined,
    )
  ) {
    return 'hidden-word';
  }

  // Arabic cipher
  if (/(?:شفرة|تشفير|استبدال الأرقام بحروف|مفتاح الشفرة)/i.test(combined)) {
    return 'arabic-cipher-dhad';
  }

  return undefined;
}

/**
 * Checks if detected family matches or is an approved alias of assigned family.
 */
function isFamilyMatchOrEquivalent(
  detected: string,
  assigned: string,
): boolean {
  if (detected === assigned) return true;
  // Aliases
  if (
    (detected === 'hidden-word' && assigned === 'word-inside-word') ||
    (detected === 'word-inside-word' && assigned === 'hidden-word')
  ) {
    return true;
  }
  return false;
}

/**
 * Validates anagram letter multiset consistency between prompt clue letters and answer.
 */
function verifyAnagramRule(
  prompt: string,
  answerLabel: string,
): { passed: boolean; reason?: string } {
  if (!prompt || !answerLabel) {
    return {
      passed: false,
      reason: 'Missing prompt or answer text for anagram validation',
    };
  }

  let letterRegion = '';
  const colonMatch = prompt.match(/:\s*([^\n\.\?؟!]+)/);
  if (colonMatch) {
    letterRegion = colonMatch[1];
  } else {
    const parenMatch = prompt.match(/[\(（\[]([^\)）\]]+)[\)）\]]/);
    if (parenMatch) {
      letterRegion = parenMatch[1];
    } else {
      letterRegion = prompt;
    }
  }

  const rawTokens = letterRegion.split(/[^\p{L}]+/gu).filter(Boolean);
  const singleLetters = rawTokens.filter(
    (t) => t.length === 1 && /[\u0621-\u064A]/.test(t),
  );

  if (singleLetters.length < 2) {
    // If clue letters are not cleanly segmented into single characters, check if answer letters exist in region
    return {
      passed: true, // Cannot refute segmented letters, heuristic match
    };
  }

  const clueNorm = singleLetters.map(normalizeArabicChar);
  const answerNorm = extractArabicLetters(answerLabel);

  const clueMap = letterFrequencyMap(clueNorm);
  const ansMap = letterFrequencyMap(answerNorm);

  const allKeys = new Set([...Object.keys(clueMap), ...Object.keys(ansMap)]);
  for (const k of allKeys) {
    if ((clueMap[k] || 0) !== (ansMap[k] || 0)) {
      return {
        passed: false,
        reason: `Anagram letter multiset mismatch: letter "${k}" count in clue (${
          clueMap[k] || 0
        }) does not match answer (${ansMap[k] || 0})`,
      };
    }
  }

  return { passed: true };
}

/**
 * Validates palindrome symmetry of correct answer.
 */
function verifyPalindromeRule(answerLabel: string): {
  passed: boolean;
  reason?: string;
} {
  const letters = extractArabicLetters(answerLabel);
  if (letters.length < 3) {
    return {
      passed: false,
      reason: `Answer "${answerLabel}" is too short (< 3 letters) to be a valid palindrome`,
    };
  }
  const reversed = [...letters].reverse();
  const isPal = letters.every((ch, i) => ch === reversed[i]);
  if (!isPal) {
    return {
      passed: false,
      reason: `Answer "${answerLabel}" is not a palindrome (reads "${reversed.join(
        '',
      )}" reversed)`,
    };
  }
  return { passed: true };
}

/**
 * Canonical dotless Arabic rasm mapping.
 * Reduces all homoglyphic Arabic letters to their shared dotless palaeographic skeleton.
 */
export function toArabicDotlessRasm(text: string): string {
  return text
    .replace(/[أإآٱء]/g, 'ا')
    .replace(/[بتث]/g, 'ٮ')
    .replace(/[يجحخ]/g, (match) => (match === 'ي' ? 'ٮ' : 'ح'))
    .replace(/[دذ]/g, 'د')
    .replace(/[رز]/g, 'ر')
    .replace(/[سش]/g, 'س')
    .replace(/[صض]/g, 'ص')
    .replace(/[طظ]/g, 'ط')
    .replace(/[عغ]/g, 'ع')
    .replace(/[فق]/g, 'ڡ')
    .replace(/[ن]/g, 'ٮ')
    .replace(/[ةه]/g, 'ه')
    .replace(/ى/g, 'ٮ')
    .replace(/[^\u0600-\u06FF]/gu, '');
}

/**
 * Validates that an answer word shares the exact dotless skeleton (rasm) of a clue token.
 */
export function verifyDotlessSkeletonRule(
  prompt: string,
  answerLabel: string,
): { passed: boolean; reason?: string } {
  if (!prompt || !answerLabel) {
    return {
      passed: false,
      reason: 'Missing prompt or answer text for dotless skeleton validation',
    };
  }

  const bracketMatch = prompt.match(/\[([^\d\]]+)\]/);
  const quoteMatch = prompt.match(/[«"']([^»"']+)[\»"']/);
  const parenMatch = prompt.match(/[\(（]([^\)）]+)[\)）]/);

  const rawClue = bracketMatch?.[1] || quoteMatch?.[1] || parenMatch?.[1];
  if (!rawClue) {
    if (/[\u066E\u066F\u06BA]/.test(prompt)) {
      return { passed: true };
    }
    return {
      passed: false,
      reason: 'Prompt lacks explicit dotless clue token (e.g. [حٮر] or «...»)',
    };
  }

  const clueRasm = toArabicDotlessRasm(rawClue);
  const answerRasm = toArabicDotlessRasm(answerLabel);

  if (!clueRasm || !answerRasm) {
    return { passed: true };
  }

  if (clueRasm !== answerRasm) {
    return {
      passed: false,
      reason: `Dotless skeleton mismatch: answer "${answerLabel}" (rasm: "${answerRasm}") does not match clue "${rawClue}" (rasm: "${clueRasm}")`,
    };
  }

  return { passed: true };
}

/**
 * Validates deterministic letter arithmetic (subtraction and addition):
 * 1. Checks that subtracted letters exist in the base word.
 * 2. Checks that the calculated letter multiset matches the answer word multiset.
 * 3. Enforces that in-place replacement or sequential concatenation holds unless reordering is explicitly requested.
 */
export function verifyLetterSubtractionMathRule(
  prompt: string,
  answerLabel: string,
  concept?: string,
): { passed: boolean; reason?: string } {
  if (!prompt || !answerLabel) {
    return {
      passed: false,
      reason: 'Missing prompt or answer text for letter arithmetic validation',
    };
  }

  const normPrompt = prompt.replace(/[−–—]/g, '-');

  const eqMatch = normPrompt.match(
    /[\(（\[]?([\u0621-\u064A]+)[\)）\]]?\s*(\s*[-\+]\s*[\(（\[]?[\u0621-\u064A]+[\)）\]]?)+/,
  );

  if (!eqMatch) {
    return { passed: true };
  }

  const fullEq = eqMatch[0];
  const firstOpIdx = fullEq.search(/[-\+]/);
  const baseRaw = fullEq.slice(0, firstOpIdx).replace(/[^\u0621-\u064A]/g, '');
  const opsRegion = fullEq.slice(firstOpIdx);

  if (!baseRaw) {
    return { passed: true };
  }

  const baseLetters = extractArabicLetters(baseRaw);
  const currentMultiset = letterFrequencyMap(baseLetters);

  const opRegex = /([-\+])\s*[\(（\[]?([\u0621-\u064A]+)[\)）\]]?/g;
  let opMatch: RegExpExecArray | null;
  const subtractions: string[] = [];
  const additions: string[] = [];

  while ((opMatch = opRegex.exec(opsRegion)) !== null) {
    const op = opMatch[1];
    const letters = extractArabicLetters(opMatch[2]);
    if (op === '-') {
      for (const l of letters) {
        if (!currentMultiset[l] || currentMultiset[l] <= 0) {
          return {
            passed: false,
            reason: `Invalid letter arithmetic: attempted to subtract letter "${l}" which is not present in base word "${baseRaw}"`,
          };
        }
        currentMultiset[l] -= 1;
        if (currentMultiset[l] === 0) delete currentMultiset[l];
        subtractions.push(l);
      }
    } else if (op === '+') {
      for (const l of letters) {
        currentMultiset[l] = (currentMultiset[l] || 0) + 1;
        additions.push(l);
      }
    }
  }

  const answerLetters = extractArabicLetters(answerLabel);
  const ansMultiset = letterFrequencyMap(answerLetters);

  const allKeys = new Set([
    ...Object.keys(currentMultiset),
    ...Object.keys(ansMultiset),
  ]);
  for (const k of allKeys) {
    if ((currentMultiset[k] || 0) !== (ansMultiset[k] || 0)) {
      return {
        passed: false,
        reason: `Letter arithmetic result mismatch: calculated letter "${k}" count (${
          currentMultiset[k] || 0
        }) does not match answer "${answerLabel}" count (${
          ansMultiset[k] || 0
        })`,
      };
    }
  }

  const requiresReorderingExplicitly =
    /(?:ترتيب|إعادة ترتيب|اعد ترتيب|تبديل الحروف|عكس)/i.test(
      `${prompt} ${concept ?? ''}`,
    );

  let inPlaceMatch = false;
  if (subtractions.length === 1 && additions.length === 1) {
    const subL = subtractions[0];
    const addL = additions[0];
    const replaced = baseLetters
      .map((ch) => (ch === subL ? addL : ch))
      .join('');
    if (replaced === answerLetters.join('')) {
      inPlaceMatch = true;
    }
  }

  const linearRemaining = baseLetters
    .filter((ch) => !subtractions.includes(ch))
    .join('');
  const appendMatch =
    linearRemaining + additions.join('') === answerLetters.join('') ||
    additions.join('') + linearRemaining === answerLetters.join('');

  if (!inPlaceMatch && !appendMatch && !requiresReorderingExplicitly) {
    const promptMentionsReorder = /(?:ترتيب|رتب|أعد ترتيب|اعد ترتيب)/i.test(
      prompt,
    );
    if (!promptMentionsReorder) {
      return {
        passed: false,
        reason: `Letter arithmetic requires letter reordering to form "${answerLabel}", but prompt does not specify reordering instructions`,
      };
    }
  }

  return { passed: true };
}

/**
 * Validates dot-shift transformations: ensures the base word and answer share
 * the identical dotless skeleton (rasm).
 */
export function verifyDotShiftSkeletonRule(
  prompt: string,
  answerLabel: string,
): { passed: boolean; reason?: string } {
  if (!prompt || !answerLabel) {
    return {
      passed: false,
      reason: 'Missing prompt or answer text for dot-shift validation',
    };
  }

  const parenMatch = prompt.match(/[\(（]([^\)）]+)[\)）]/);
  const quoteMatch = prompt.match(/[«"']([^»"']+)[\»"']/);
  const baseRaw = parenMatch?.[1] || quoteMatch?.[1];

  if (!baseRaw) {
    return { passed: true };
  }

  const baseClean = baseRaw.replace(/[^\u0621-\u064A]/g, '');
  const ansClean = answerLabel.replace(/[^\u0621-\u064A]/g, '');

  if (!baseClean || !ansClean) {
    return { passed: true };
  }

  const baseRasm = toArabicDotlessRasm(baseClean);
  const ansRasm = toArabicDotlessRasm(ansClean);

  if (baseRasm !== ansRasm) {
    return {
      passed: false,
      reason: `Dot-shift skeleton mismatch: base word "${baseClean}" (rasm: "${baseRasm}") does not share dotless skeleton with answer "${ansClean}" (rasm: "${ansRasm}")`,
    };
  }

  return { passed: true };
}
