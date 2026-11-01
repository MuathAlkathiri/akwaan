import {
  isLibraryRowGenerationEligible,
  libraryExemplarWording,
  LibraryRowError,
  LibrarySheetRow,
  mapLibrarySheetRow,
} from './library-row';

const approvedRow = (
  overrides: Partial<LibrarySheetRow> = {},
): LibrarySheetRow => ({
  id: 'LIB-900',
  src: 'A·s1',
  question: 'سؤال أصلي؟',
  world: 'football',
  scope: 'saudi-league',
  scope_status: 'MATCH',
  akwaan_fit: 'RYO',
  quality_p1: 'GOOD',
  asof_needed: 'N',
  role: 'FACT_SEED',
  review_status: 'APPROVED',
  verified_answer: 'الهلال',
  source_url: 'https://example.com/source',
  verified_on: '2026-11-01',
  ...overrides,
});

describe('mapLibrarySheetRow', () => {
  it('prefers the approved rewrite over the original question', () => {
    expect(
      mapLibrarySheetRow(approvedRow({ claude_rewrite: 'صياغة معتمدة؟' })),
    ).toMatchObject({
      questionText: 'صياغة معتمدة؟',
      hasApprovedRewrite: true,
    });
    expect(mapLibrarySheetRow(approvedRow())).toMatchObject({
      questionText: 'سؤال أصلي؟',
      hasApprovedRewrite: false,
    });
  });

  it.each([
    ['RYO', ['read-your-opponent']],
    ['RYO (فخ التوقع)', ['read-your-opponent']],
    ['Closest (سنة)', ['closest']],
    ['Top-5 (أول 5 من 9)', ['top-5']],
    ['RYO / Closest (عدد المباريات)', ['read-your-opponent', 'closest']],
    ['Bomb (صورة) / Closest (موسم)', ['bomb', 'closest']],
    ['أدلة متدرجة (بدليل واحد / لغز)', []],
    ['-', []],
  ])('reads the mechanics in "%s"', (akwaanFit, expected) => {
    expect(
      mapLibrarySheetRow(approvedRow({ akwaan_fit: akwaanFit })).mechanicKeys,
    ).toEqual(expected);
  });

  it('derives the canonical answer and a Closest target', () => {
    const row = mapLibrarySheetRow(
      approvedRow({
        akwaan_fit: 'Closest (سنة)',
        verified_answer: '1904 (21 مايو 1904، في باريس)',
      }),
    );
    expect(row.canonicalAnswer).toBe('1904');
    expect(row.canonicalNumber).toBe(1904);
  });

  it('reads Arabic digits and leaves non-Closest rows without a number', () => {
    expect(
      mapLibrarySheetRow(
        approvedRow({
          akwaan_fit: 'Closest (عدد)',
          verified_answer: '٩٦ نقطة',
        }),
      ).canonicalNumber,
    ).toBe(96);
    expect(
      mapLibrarySheetRow(approvedRow({ verified_answer: '50 ملكًا' }))
        .canonicalNumber,
    ).toBeNull();
  });

  it('keeps Top-5 year labels away from the card labels', () => {
    const { top5 } = mapLibrarySheetRow(
      approvedRow({
        top5_window: '2002–2026',
        top5_correct_5: 'فرنسا (2006 و2022)، هولندا (2010)',
        top5_traps_5: 'إسبانيا، إنجلترا (لم يخسر أحد منهم نهائيًا)',
      }),
    );
    expect(top5).toEqual({
      window: '2002–2026',
      correct: [
        { label: 'فرنسا', annotation: '2006 و2022' },
        { label: 'هولندا', annotation: '2010' },
      ],
      traps: ['إسبانيا', 'إنجلترا'],
      trapAttestation: 'لم يخسر أحد منهم نهائيًا',
    });
  });

  it('derives no single canonical answer for a Top-5 row', () => {
    const row = mapLibrarySheetRow(
      approvedRow({
        akwaan_fit: 'Top-5',
        verified_answer: 'فرنسا (2006)، هولندا (2010)',
        top5_correct_5: 'فرنسا (2006)، هولندا (2010)',
      }),
    );
    expect(row.verifiedAnswer).toBe('فرنسا (2006)، هولندا (2010)');
    expect(row.canonicalAnswer).toBeNull();
  });

  it('does not split a list inside a parenthetical', () => {
    const { top5 } = mapLibrarySheetRow(
      approvedRow({ top5_correct_5: 'ألف (2001، 2002)، باء (2003)' }),
    );
    expect(top5?.correct.map((entry) => entry.label)).toEqual(['ألف', 'باء']);
  });

  it('schedules a re-check from the event estimate when one exists', () => {
    expect(
      mapLibrarySheetRow(
        approvedRow({
          asof_needed: 'Y',
          next_event_date_estimate: '2027-05-31 (نهاية موسم 2026–27)',
        }),
      ),
    ).toMatchObject({
      nextEventDateEstimate: '2027-05-31',
      revalidateAfter: '2027-05-31',
    });
  });

  it('defaults the re-check to twelve months after verification', () => {
    expect(
      mapLibrarySheetRow(approvedRow({ asof_needed: 'Y' })).revalidateAfter,
    ).toBe('2027-11-01');
  });

  it('does not expire a row that does not go stale', () => {
    const row = mapLibrarySheetRow(
      approvedRow({ next_event_date_estimate: '2027-05-31' }),
    );
    expect(row.nextEventDateEstimate).toBe('2027-05-31');
    expect(row.revalidateAfter).toBeNull();
  });

  it.each([
    ['verified_answer', { verified_answer: undefined }],
    ['source_url', { source_url: undefined }],
    ['an http(s) source_url', { source_url: 'javascript:alert(1)' }],
    ['verified_on', { verified_on: undefined }],
  ])('refuses an APPROVED row without %s', (_label, overrides) => {
    expect(() =>
      mapLibrarySheetRow(approvedRow(overrides as Partial<LibrarySheetRow>)),
    ).toThrow(LibraryRowError);
  });

  it('accepts a second source after " | "', () => {
    const row = mapLibrarySheetRow(
      approvedRow({
        source_url: 'https://a.example/x | https://b.example/y',
      }),
    );
    expect(row.sourceUrl).toBe('https://a.example/x');
    expect(row.sourceUrls).toEqual([
      'https://a.example/x',
      'https://b.example/y',
    ]);
  });

  it('refuses a third source', () => {
    expect(() =>
      mapLibrarySheetRow(
        approvedRow({
          source_url:
            'https://a.example | https://b.example | https://c.example',
        }),
      ),
    ).toThrow('at most 2');
  });

  it('refuses a bad second source', () => {
    expect(() =>
      mapLibrarySheetRow(
        approvedRow({ source_url: 'https://a.example | not-a-url' }),
      ),
    ).toThrow(LibraryRowError);
  });

  it('flags a row whose second source is weak', () => {
    expect(
      mapLibrarySheetRow(
        approvedRow({
          source_url: 'https://en.wikipedia.org/x | https://otakumode.com/y',
        }),
      ).sourceWarning,
    ).toBe('WEAK_SOURCE');
  });

  it('stores a PARK row that has no answer yet', () => {
    expect(
      mapLibrarySheetRow(
        approvedRow({
          review_status: 'PARK',
          verified_answer: undefined,
          source_url: undefined,
          verified_on: undefined,
        }),
      ).verifiedAnswer,
    ).toBeNull();
  });

  it.each([
    ['review_status', 'MAYBE'],
    ['scope_status', 'SOMEWHERE'],
    ['role', 'HERO'],
    ['asof_needed', 'yes'],
    ['verified_on', '1 November'],
    ['next_event_date_estimate', 'next season'],
  ])('refuses %s = %s', (column, value) => {
    expect(() => mapLibrarySheetRow(approvedRow({ [column]: value }))).toThrow(
      LibraryRowError,
    );
  });

  it('hashes content, so a changed answer is a changed row', () => {
    const first = mapLibrarySheetRow(approvedRow());
    expect(mapLibrarySheetRow(approvedRow()).rowHash).toBe(first.rowHash);
    expect(
      mapLibrarySheetRow(approvedRow({ verified_answer: 'النصر' })).rowHash,
    ).not.toBe(first.rowHash);
  });
});

describe('library generation eligibility', () => {
  const row = (overrides: Partial<LibrarySheetRow> = {}) =>
    mapLibrarySheetRow(approvedRow(overrides));

  it('admits an APPROVED MATCH fact seed or exemplar candidate', () => {
    expect(isLibraryRowGenerationEligible(row())).toBe(true);
    expect(
      isLibraryRowGenerationEligible(row({ role: 'EXEMPLAR_CANDIDATE' })),
    ).toBe(true);
  });

  it.each(['PARK', 'REJECT', 'REWRITE', 'TO_REVIEW'])(
    'keeps %s rows out',
    (reviewStatus) => {
      expect(
        isLibraryRowGenerationEligible(row({ review_status: reviewStatus })),
      ).toBe(false);
    },
  );

  it.each(['NEAR', 'NEW_SCOPE', 'WORLD_ONLY', 'FUTURE_WORLD', 'NO_WORLD'])(
    'gates an APPROVED row whose scope_status is %s',
    (scopeStatus) => {
      expect(
        isLibraryRowGenerationEligible(row({ scope_status: scopeStatus })),
      ).toBe(false);
    },
  );

  it.each(['NEGATIVE_BENCHMARK', 'PARK'])(
    'keeps role %s out even when APPROVED',
    (role) => {
      expect(isLibraryRowGenerationEligible(row({ role }))).toBe(false);
    },
  );

  it('lends question wording only from an eligible exemplar candidate', () => {
    expect(libraryExemplarWording(row())).toBeNull();
    expect(libraryExemplarWording(row({ role: 'EXEMPLAR_CANDIDATE' }))).toBe(
      'سؤال أصلي؟',
    );
    expect(
      libraryExemplarWording(
        row({ role: 'EXEMPLAR_CANDIDATE', scope_status: 'NEW_SCOPE' }),
      ),
    ).toBeNull();
  });
});
