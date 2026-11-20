/**
 * Did the deciding team read its opponent correctly?
 *
 * The whole of "اقرأ خصمك" reduces to this one question, and both the payoff
 * and anything shown to a player must answer it the same way — so it is
 * defined once, here, and never re-derived. A screen that works it out for
 * itself starts lying the day the rule moves.
 *
 * `STEAL` is the confident read ("متأكد منهم"), `TRUST` the doubtful one
 * ("شاكك فيهم"), so a read matches when confidence and correctness agree.
 */
export function ryoReadMatchedOutcome(
  decision: 'STEAL' | 'TRUST',
  correct: boolean,
): boolean {
  return (decision === 'STEAL') === correct;
}
