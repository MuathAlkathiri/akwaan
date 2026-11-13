---
name: challenge-type-combo
description: Anime Signature push-your-luck knowledge run — four rising stages, a cash-out decision after each correct answer, and typed answers graded by text match.
---

# ChallengeType: الكومبو (combo)

## Experience Goal
Knowledge under rising risk. A team answers a climbing ladder of questions and,
after each correct one, decides out loud whether to bank what it has or push for
more. The recurring **«نوقف أو نكمل؟»** is the mechanic. A question set that
turns this into ordinary trivia with a multiplier bolted on has failed, however
good the individual questions are.

## Social Dynamic
The decision belongs to the whole team, so the best questions are the ones a
team *argues about*: one member is sure, another is not, and the balance at risk
decides who wins the argument. Questions nobody can discuss — either everyone
knows it or nobody does — produce a silent table.

## Interaction Pattern
One challenge is **two Runs**: Team A's Run, then Team B's. Each Run is at most
**four** questions.

- Every question gets a fresh **30-second** timer. The clock is not a difficulty
  lever.
- A correct answer adds **+1** to the Run's **unbanked** balance.
- A wrong answer — or a timeout, which is identical — is a **Combo Break** and
  loses the Run's **entire unbanked balance**.
- After a correct answer on Q1–Q3 the team chooses **ثبت** (bank and end the
  Run) or **كمل** (play on with everything still at risk).
- A correct Q4 banks automatically. There is no decision after Q4.

Each team also holds one **كسر الكومبو** charge per challenge. It pressures the
opponent's cash-out decision and never changes a question's difficulty, so it
has no bearing on authoring.

## Difficulty progression — fixed and load-bearing
Every Run climbs these four stages, in this exact order, for both teams:

| Question | Difficulty | Canonical value |
|---|---|---|
| Q1 | متوسط | `mechanicPayload.comboStage: 1` |
| Q2 | متوسط صعب | `mechanicPayload.comboStage: 2` |
| Q3 | صعب | `mechanicPayload.comboStage: 3` |
| Q4 | صعب جدًا | `mechanicPayload.comboStage: 4` |

The order is never randomised, reordered, skipped or substituted, and there is
no downgrade when a stage runs short: the launch fails cleanly instead. Two Runs
of four means a challenge consumes **eight** items — **two per stage** — so a
batch that leaves any stage thin blocks the whole mechanic, not just that stage.

Note that **stage 1 is متوسط, not easy**. There is no easy rung. A question a
casual viewer answers without thinking is below the ladder entirely.

`comboStage` is Combo's own metadata, never a shared `difficulty` field: a stage
is a position in this Run, meaningful only here.

## Scope and stage are independent dimensions
A **Scope** says what the question is about. A **stage** says how hard it is
inside the Run. They are orthogonal, and no mapping between them exists or may
be introduced.

One Scope legitimately holds questions at every stage — ناروتو can supply
متوسط and صعب جدًا alike. A Run moves freely across Scopes while its difficulty
climbs 1 → 2 → 3 → 4.

**This is wrong and must never be written:** *Naruto = medium, Attack on Titan =
hard, Bleach = very hard.*

When you author a batch for one Scope, spread it across all four stages rather
than deciding that this Scope "is" a difficulty.

## Input Contract
The answering team types one answer on a phone. There are no options to choose
from, and no partial credit: the answer either matches or breaks the combo.

## Resolution Contract
Grading is a text match after normalization on both sides. The normalizer folds
**أ/إ/آ → ا**, **ة → ه**, **ى → ي**, diacritics, tatweel, punctuation and
symbols, letter case, a leading **ال** and a leading **"the"**.

It does **not** fold digits: **٧ and 7 are different answers**, and a player who
types the numeral their keyboard offers loses the Run.

## Content Structure
An ordinary ContentItem. Nothing is nested and no new media format appears:

- `prompt.ar` — the question.
- `answerPayload.mode: 'match'` with `acceptedAnswers`: **1 to 10** entries, each
  at most **120** characters.
- `mechanicPayload.comboStage`: `1 | 2 | 3 | 4`.

## Writing the accepted answers
Put the canonical short form first, then only forms that differ **as words**: a
well-known nickname, the full name beside the common one, a widely used Latin
transliteration.

Do not spend an entry on a spelling the normalizer already folds — أحمد beside
احمد is one answer written twice, and it buys nothing.

The answer must have a stable written form. If two players who both know the
answer would plausibly type genuinely different words, the question has no
single typed answer and belongs to another mechanic.

## The stakes test — apply it to every candidate
A wrong answer at Q3 destroys everything the team banked nothing of. Ambiguity
costs more here than in any mechanic where a wrong answer costs one point, so:

1. Exactly one answer is defensible, and you can say why every near-miss is not.
2. The prompt gives the answer away nowhere — not in a word, not in a list, not
   in the grammar.
3. A team that knows the subject can answer **within 30 seconds, including the
   discussion**. A question that needs enumeration, counting or arithmetic fails
   this test even when it is perfectly fair.
4. The difficulty comes from how deep the knowledge runs — never from trick
   wording, a deliberately obscure phrasing, or a detail no source records.

## Content Safety Rules
Real people appear only as public figures in their public work. Nothing about a
private life, and nothing a fan community treats as a leak.

## Anti-patterns
- Mapping a Scope to a difficulty.
- Reaching stage 4 by obscurity: an unrecorded production detail is not hard, it
  is unanswerable.
- Difficulty manufactured from wording rather than knowledge.
- An answer that is a number, a date, or anything carrying digits.
- A multi-part answer, a list, or a sentence.
- Accepted answers that differ only by a fold the normalizer applies.
- A near-miss accepted "to be generous": it makes a wrong answer bank points.

## Machine-readable rules
The block below restates bounds already stated in this Skill and enforced by the
runtime (`COMBO_STAGES`, `COMBO_MAX_ANSWERS`, `COMBO_MAX_ANSWER_LENGTH`,
`COMBO_ITEM_COUNT`, `COMBO_QUESTION_SECONDS`). It adds nothing new and is not a
second source of truth: the prose above governs, and this block must agree.

**`bounded`** means a World or Scope may narrow the range. **`invariant`** means
the runtime fixes it and no layer may change it, narrowing included.

```akwaan-rules
{
  "version": 1,
  "rules": [
    {
      "id": "combo.stage",
      "kind": "integer-range",
      "policy": "invariant",
      "min": 1,
      "max": 4
    },
    {
      "id": "combo.items-per-challenge",
      "kind": "integer-range",
      "policy": "invariant",
      "min": 8,
      "max": 8
    },
    {
      "id": "combo.question-timer-seconds",
      "kind": "integer-range",
      "policy": "invariant",
      "min": 30,
      "max": 30
    },
    {
      "id": "combo.accepted-answer-count",
      "kind": "integer-range",
      "policy": "bounded",
      "min": 1,
      "max": 10
    },
    {
      "id": "combo.accepted-answer-length",
      "kind": "integer-range",
      "policy": "bounded",
      "min": 1,
      "max": 120
    }
  ]
}
```
