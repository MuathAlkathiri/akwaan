import { evaluateFamilyCompliance } from './family-compliance.policy';

describe('FamilyCompliance Policy', () => {
  describe('1. Basic & missing fields handling', () => {
    it('returns manual_review when assignedFamilyKey is missing', () => {
      const result = evaluateFamilyCompliance({
        assignedFamilyKey: '',
        draft: {},
      });
      expect(result.isCompliant).toBe(false);
      expect(result.verificationMethod).toBe('manual_review');
      expect(result.mismatchReason).toContain('NO_ASSIGNED_FAMILY');
    });

    it('returns manual_review for non-strictly-verifiable families without known patterns', () => {
      const result = evaluateFamilyCompliance({
        assignedFamilyKey: 'general-knowledge-history',
        draft: {
          prompt: { ar: 'متى تأسست الدولة السعودية الأولى؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: 'opt-1', label: { ar: '1727 م' } }],
            correctOptionId: 'opt-1',
          },
        },
      });
      expect(result.isCompliant).toBe(false);
      expect(result.verificationMethod).toBe('manual_review');
      expect(result.assignedFamilyKey).toBe('general-knowledge-history');
      expect(result.detectedFamilyKey).toBeUndefined();
    });
  });

  describe('2. Declared familyKey overrides', () => {
    it('detects mismatch when candidate declares a different familyKey in metadata', () => {
      const result = evaluateFamilyCompliance({
        assignedFamilyKey: 'anagram-rearrange',
        draft: {
          metadata: { familyKey: 'plural-form' },
          prompt: { ar: 'ما جمع كلمة كتاب؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: 'opt-1', label: { ar: 'كتب' } }],
            correctOptionId: 'opt-1',
          },
        },
      });
      expect(result.isCompliant).toBe(false);
      expect(result.assignedFamilyKey).toBe('anagram-rearrange');
      expect(result.detectedFamilyKey).toBe('plural-form');
      expect(result.verificationMethod).toBe('rule_evaluated');
      expect(result.mismatchReason).toContain('does not match assigned family');
    });

    it('verifies match when candidate declares matching familyKey and satisfies rules', () => {
      const result = evaluateFamilyCompliance({
        assignedFamilyKey: 'plural-form',
        draft: {
          metadata: { familyKey: 'plural-form' },
          prompt: { ar: 'ما جمع كلمة مفتاح؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: 'opt-1', label: { ar: 'مفاتيح' } }],
            correctOptionId: 'opt-1',
          },
        },
      });
      expect(result.isCompliant).toBe(true);
      expect(result.assignedFamilyKey).toBe('plural-form');
      expect(result.detectedFamilyKey).toBe('plural-form');
      expect(result.verificationMethod).toBe('rule_evaluated');
    });

    it('refuses to forge compliance when candidate metadata declares matching familyKey but content does not exhibit structural patterns', () => {
      const result = evaluateFamilyCompliance({
        assignedFamilyKey: 'anagram-rearrange',
        draft: {
          metadata: { familyKey: 'anagram-rearrange' },
          prompt: { ar: 'ما هي عاصمة جمهورية مصر العربية؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: 'opt-1', label: { ar: 'القاهرة' } }],
            correctOptionId: 'opt-1',
          },
        },
      });
      expect(result.isCompliant).toBe(false);
      expect(result.assignedFamilyKey).toBe('anagram-rearrange');
      expect(result.verificationMethod).toBe('heuristic');
      expect(result.mismatchReason).toContain(
        'does not exhibit expected structural patterns',
      );
    });
  });

  describe('3. Structural detection & rule evaluation', () => {
    it('verifies compliant anagram puzzle with matching letter multiset', () => {
      const result = evaluateFamilyCompliance({
        assignedFamilyKey: 'anagram-rearrange',
        draft: {
          prompt: {
            ar: 'رتب الحروف التالية لتكوين اسم فاكهة: (م - ن - ج - ا)',
          },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: 'opt-1', label: { ar: 'منجا' } }],
            correctOptionId: 'opt-1',
          },
        },
      });
      expect(result.isCompliant).toBe(true);
      expect(result.assignedFamilyKey).toBe('anagram-rearrange');
      expect(result.detectedFamilyKey).toBe('anagram-rearrange');
      expect(result.verificationMethod).toBe('rule_evaluated');
    });

    it('rejects anagram puzzle with letter multiset mismatch', () => {
      const result = evaluateFamilyCompliance({
        assignedFamilyKey: 'anagram-rearrange',
        draft: {
          prompt: {
            ar: 'رتب الحروف التالية لتكوين اسم فاكهة: (ت - ف - ا - ح)',
          },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: 'opt-1', label: { ar: 'موز' } }],
            correctOptionId: 'opt-1',
          },
        },
      });
      expect(result.isCompliant).toBe(false);
      expect(result.assignedFamilyKey).toBe('anagram-rearrange');
      expect(result.detectedFamilyKey).toBe('anagram-rearrange');
      expect(result.verificationMethod).toBe('rule_evaluated');
      expect(result.mismatchReason).toContain(
        'Anagram letter multiset mismatch',
      );
    });

    it('flags structural mismatch when assigned anagram but content is plural form', () => {
      const result = evaluateFamilyCompliance({
        assignedFamilyKey: 'anagram-rearrange',
        draft: {
          prompt: { ar: 'ما هو جمع كلمة قلم؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: 'opt-1', label: { ar: 'أقلام' } }],
            correctOptionId: 'opt-1',
          },
        },
      });
      expect(result.isCompliant).toBe(false);
      expect(result.assignedFamilyKey).toBe('anagram-rearrange');
      expect(result.detectedFamilyKey).toBe('plural-form');
      expect(result.verificationMethod).toBe('rule_evaluated');
      expect(result.mismatchReason).toContain(
        'matches structural pattern for family "plural-form"',
      );
    });

    it('verifies compliant palindrome puzzle', () => {
      const result = evaluateFamilyCompliance({
        assignedFamilyKey: 'palindrome-symmetry',
        draft: {
          prompt: { ar: 'ما الكلمة التي تقرأ طرديا وعكسيا بنفس المعنى؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: 'opt-1', label: { ar: 'توت' } }],
            correctOptionId: 'opt-1',
          },
        },
      });
      expect(result.isCompliant).toBe(true);
      expect(result.assignedFamilyKey).toBe('palindrome-symmetry');
      expect(result.detectedFamilyKey).toBe('palindrome-symmetry');
      expect(result.verificationMethod).toBe('rule_evaluated');
    });

    it('rejects palindrome puzzle when answer is not a palindrome', () => {
      const result = evaluateFamilyCompliance({
        assignedFamilyKey: 'palindrome-symmetry',
        draft: {
          prompt: { ar: 'ما الكلمة التي تقرأ طرديا وعكسيا بنفس المعنى؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: 'opt-1', label: { ar: 'تفاح' } }],
            correctOptionId: 'opt-1',
          },
        },
      });
      expect(result.isCompliant).toBe(false);
      expect(result.assignedFamilyKey).toBe('palindrome-symmetry');
      expect(result.detectedFamilyKey).toBe('palindrome-symmetry');
      expect(result.verificationMethod).toBe('rule_evaluated');
      expect(result.mismatchReason).toContain('not a palindrome');
    });

    it('recognizes family alias hidden-word and word-inside-word', () => {
      const result = evaluateFamilyCompliance({
        assignedFamilyKey: 'word-inside-word',
        draft: {
          prompt: { ar: 'ابحث عن اسم حيوان مختبئ داخل هذه الجملة: ...' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: 'opt-1', label: { ar: 'نمر' } }],
            correctOptionId: 'opt-1',
          },
        },
      });
      expect(result.isCompliant).toBe(true);
      expect(result.assignedFamilyKey).toBe('word-inside-word');
      expect(result.detectedFamilyKey).toBe('hidden-word');
      expect(result.verificationMethod).toBe('rule_evaluated');
    });

    it('flags heuristic failure when strictly verifiable family lacks expected patterns', () => {
      const result = evaluateFamilyCompliance({
        assignedFamilyKey: 'anagram-rearrange',
        draft: {
          prompt: { ar: 'ما هي عاصمة المملكة العربية السعودية؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: 'opt-1', label: { ar: 'الرياض' } }],
            correctOptionId: 'opt-1',
          },
        },
      });
      expect(result.isCompliant).toBe(false);
      expect(result.assignedFamilyKey).toBe('anagram-rearrange');
      expect(result.detectedFamilyKey).toBeUndefined();
      expect(result.verificationMethod).toBe('heuristic');
      expect(result.mismatchReason).toContain(
        'does not exhibit expected structural patterns',
      );
    });
  });
});
