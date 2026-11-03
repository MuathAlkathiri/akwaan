import {
  deriveLaTahriqhaTutorialOutcome,
  validateLaTahriqhaTutorialScenario,
  type LaTahriqhaTutorialScenarioInput,
} from './mechanic-tutorial.policy';

const dish = (
  id: string,
  correctIds: string[],
  teamASelection: string[],
  teamBSelection: string[],
) => ({
  id,
  name: id === 'kabsa' ? 'كبسة دجاج' : id === 'jareesh' ? 'جريش' : 'مندي دجاج',
  ingredients: [
    ...correctIds.map((ingredientId) => ({
      id: ingredientId,
      label: ingredientId,
      correct: true,
    })),
    { id: `${id}-wrong-1`, label: 'مكرونة', correct: false },
    { id: `${id}-wrong-2`, label: 'جبن', correct: false },
    { id: `${id}-wrong-3`, label: 'فراولة', correct: false },
  ],
  teamASelection,
  teamBSelection,
});

const scenario = (): LaTahriqhaTutorialScenarioInput => ({
  kind: 'la-tahriqha',
  version: 1,
  prompt: 'اختاروا مكونات الطبق',
  dishWindowSeconds: 30,
  dishes: [
    dish(
      'kabsa',
      ['rice', 'chicken', 'onion', 'tomato', 'loomi'],
      ['rice', 'chicken', 'onion', 'kabsa-wrong-1'],
      ['rice', 'chicken', 'onion', 'tomato', 'loomi'],
    ),
    dish(
      'jareesh',
      ['wheat', 'yogurt', 'onion', 'cumin', 'butter'],
      ['wheat', 'yogurt', 'onion', 'cumin'],
      ['wheat', 'yogurt', 'onion'],
    ),
    dish(
      'mandi',
      ['rice', 'chicken', 'onion', 'tomato', 'cardamom'],
      ['rice', 'chicken', 'onion'],
      ['rice', 'chicken', 'onion', 'tomato'],
    ),
  ],
  captainRotation: {
    teamA: ['نورة', 'مها', 'سارة'],
    teamB: ['فيصل', 'راشد', 'ماجد'],
  },
});

describe('la tahriqha tutorial contract', () => {
  it('validates three dishes and derives burn, perfect and final challenge totals', () => {
    const input = scenario();
    expect(validateLaTahriqhaTutorialScenario(input)).toEqual([]);
    expect(deriveLaTahriqhaTutorialOutcome(input)).toMatchObject({
      dishCount: 3,
      finalTotals: { 'team-a': 7, 'team-b': 14 },
      winnerTeam: 'team-b',
      matchPointDelta: 1,
      dishResults: [
        {
          teamA: { burned: true, points: 0 },
          teamB: { perfect: true, points: 7 },
        },
        { teamA: { points: 4 }, teamB: { points: 3 } },
        { teamA: { points: 3 }, teamB: { points: 4 } },
      ],
    });
  });

  it('rejects non-canonical card counts, selection paths and captain rotation', () => {
    const input = scenario();
    input.dishes[0].ingredients.pop();
    input.dishes[0].teamASelection = ['rice', 'chicken'];
    input.captainRotation.teamA[1] = input.captainRotation.teamA[0];
    const codes = validateLaTahriqhaTutorialScenario(input).map(
      (issue) => issue.code,
    );
    expect(codes).toEqual(
      expect.arrayContaining([
        'TUTORIAL_LA_TAHRIQHA_INGREDIENT_COUNT',
        'TUTORIAL_LA_TAHRIQHA_SELECTION_INVALID',
        'TUTORIAL_LA_TAHRIQHA_CAPTAIN_ROTATION_INVALID',
      ]),
    );
  });
});
