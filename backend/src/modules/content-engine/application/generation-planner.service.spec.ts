import { GenerationPlannerService } from './generation-planner.service';

describe('GenerationPlannerService', () => {
  let planner: GenerationPlannerService;

  beforeEach(() => {
    planner = new GenerationPlannerService();
  });

  it('computes mixed difficulty quotas for N=5 candidates', () => {
    const plan = planner.plan({
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
      count: 5,
      difficulty: 'mixed',
    });

    expect(plan.difficultyQuotas).toEqual({
      medium: 3,
      easy: 1,
      hard: 1,
    });
    expect(plan.count).toBe(5);
    expect(plan.digest).toBeDefined();
    expect(plan.digest).toHaveLength(64);
  });

  it('computes targeted quotas when specific difficulty is requested', () => {
    const plan = planner.plan({
      worldKey: 'football',
      scopeKey: 'world-cup',
      mechanicKey: 'read-your-opponent',
      count: 4,
      difficulty: 'hard',
    });

    expect(plan.difficultyQuotas).toEqual({
      hard: 4,
    });
  });

  it('includes RYO archetypes, 40-80% bluff sweet spot, and anti-patterns', () => {
    const plan = planner.plan({
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
      count: 5,
    });

    expect(plan.archetypes.some((a) => a.includes('Misconception Trap'))).toBe(
      true,
    );
    expect(
      plan.decisionLoopGuidelines.some((g) =>
        g.includes('40-80% CONFIDENCE SWEET SPOT'),
      ),
    ).toBe(true);
    expect(
      plan.antiPatterns.some((ap) => ap.includes('NO 100% ELEMENTARY TRIVIA')),
    ).toBe(true);
    expect(
      plan.antiPatterns.some((ap) => ap.includes('NO UNSOLVABLE ANAGRAMS')),
    ).toBe(true);
    expect(
      plan.antiPatterns.some((ap) => ap.includes('NO ANSWER LEAKAGE')),
    ).toBe(true);
  });

  it('specifies 16:9 aspect ratio and fallback policy in media intent', () => {
    const plan = planner.plan({
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
      count: 3,
    });

    expect(plan.mediaIntent.allowedAspectRatios).toEqual(['16:9']);
    expect(plan.mediaIntent.displayArtworkPolicy).toContain(
      'World Question Fallback',
    );
  });

  it('formats plan cleanly into markdown for prompt embedding', () => {
    const plan = planner.plan({
      worldKey: 'puzzles',
      scopeKey: 'wordplay-letters',
      mechanicKey: 'read-your-opponent',
      count: 5,
    });

    const formatted = planner.formatPlanForPrompt(plan);
    expect(formatted).toContain('## TACTICAL GENERATION PLAN');
    expect(formatted).toContain('### 1. DIFFICULTY TARGET QUOTAS');
    expect(formatted).toContain(
      '### 3. GAMEPLAY DECISION LOOP & BLUFF SWEET SPOT',
    );
    expect(formatted).toContain('### 4. CRITICAL NEGATIVE ANTI-PATTERNS');
    expect(formatted).toContain('NO UNSOLVABLE ANAGRAMS');
  });
});
