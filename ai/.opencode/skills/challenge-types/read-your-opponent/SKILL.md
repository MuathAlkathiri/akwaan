---
name: challenge-type-read-your-opponent
description: Global bluff-and-prediction mechanic using simultaneous private answer and Steal or Trust decisions.
---

# ChallengeType: Read Your Opponent

## Experience Goal
Create a meaningful read of an opponent's confidence, honesty, and bluff.

## Social Dynamic
One team answers privately while the opposing team privately chooses Steal or
Trust during the same blind window.

## Player Emotion
Suspicion, confidence, doubt, risk, relief, and reveal tension.

## Interaction Pattern
Prompt → simultaneous hidden choices → simultaneous reveal → payoff resolution.

## Thinking Pattern
Answer plausibly, estimate confidence, read rivals, and decide whether risk is
worth taking.

## Success Pattern
Both answer and prediction feel defensible before reveal; the outcome changes
how teams read each other across the three-item sequence.

## Failure Pattern
An obvious or impossible answer eliminates the social decision. Ambiguity,
human judgment, or leaked in-progress state invalidates the exchange.

## Input Contract
Answering team submits an option ID or numeric estimate. Opposing team submits
`steal` or `trust`. Neither receives the other's in-progress state.

## Resolution Contract
`trust + correct`: answering team +1. `trust + wrong`: opposing team +1.
`steal + correct`: opposing team +1. `steal + wrong`: opposing team −1.
Preserve signed events even if display totals clamp at zero.

## Content Structure
Three discrete ContentItems per challenge. Each item uses `multiple_choice` or
`closest`. Optimize for confidence uncertainty and bluff potential, not maximum
factual demand.

## Allowed Content Patterns
- `multiple-choice`
- `closest`

## Content Safety Rules
Use fair, quickly understood material. Reject sensitive personal inference,
humiliation, and claims without reliable support.

## Media Compatibility
Text, image, audio, or video may be used when essential and answer-safe. Media
belongs to the ContentItem.

## Scope Compatibility
Works across Worlds. Respect Scope exclusions and Pattern-specific limits.

## Validation Rules
Confirm deterministic truth, meaningful uncertainty, automatic resolution,
server-side privacy, no leakage, plausible alternatives, and three-item variety.

## Anti-patterns
Obscure date recall, certainty near 0% or 100%, opinion, explanation-dependent
outcomes, open judged text, absurd alternatives, decorative media, or unequal
private information.

### The certainty test — apply it to every candidate

«certainty near 0% or 100%» is the anti-pattern that gets missed most, because
such a question looks perfectly valid: real answer, four plausible options,
no leakage. It still breaks the mechanic.

Work the payoff matrix. If the opposing team is confident the answering team
will be **right**, `steal + correct` pays them +1, so they always steal. If
they are confident the answering team will be **wrong**, `trust + wrong` pays
them +1, so they always trust. Either way the Steal/Trust decision is
arithmetic, not a read, and the mechanic has nothing left to do.

So the question is never "is this true and well formed?" It is:

> **Would a reasonable opposing team have to think about Steal or Trust?**

If the answer is no, reject it regardless of how clean the item is. The target
is a question a knowledgeable team usually gets right and sometimes does not —
roughly 40–80% confidence from the table's point of view.

### Saying it out loud: the authoring rationale

A generated candidate states three things beside the question, for the reviewer
and never for the player:

- **`concept`** — the knowledge or misconception the item turns on, in one line,
  decided before any wording exists.
- **`distractorRationale`** — one entry per **incorrect** option, keyed by that
  option's id, saying why a real player might pick it. If nothing plausible can
  be said for an option, it is filler and the option should be replaced, not
  the sentence padded. Never name the correct answer here.
- **`estimatedConfidence`** — one of `near-certain` · `likely` · `even` ·
  `unlikely` · `near-impossible`, with a line on what makes it that hard. The
  mechanic needs **`likely`** or **`even`**; at either extreme the Steal/Trust
  decision answers itself.

These are an authoring **hypothesis**, not measured player performance, and no
figure here is a probability. Writing them is part of the work: an item whose
distractors cannot be justified is the costume case above, and the rationale is
where that becomes visible before a reviewer spends time on it.

None of it reaches gameplay.

## Reviewing an RYO candidate: five separate judgements

These are independent. A candidate can pass four and still be unusable, and the
most common mistake in review is letting one carry another.

**1. Factual correctness.** Is the keyed answer true? Checked independently of
anything the candidate says about itself — a confident `factualClaims` entry is
an assertion, not evidence.

**2. Originality.** Is this a worked example with the words changed? Every
exemplar in this Skill and in a Scope's `EXEMPLARS.md` is a **retired subject**.
The screen raises `CANDIDATE_RESEMBLES_EXEMPLAR` as a warning when a candidate
looks derivative; it is a prompt to look, not a verdict, and it cannot catch a
copy that shares an idea without sharing words.

**3. Distractor plausibility.** Can each wrong option be justified in a
sentence? If not, the option is filler, visible elimination collapses the item
back to certainty, and the right fix is to replace the option — not to write a
better-sounding rationale for it.

**4. Opponent-prediction uncertainty.** Would a reasonable opposing team have to
think about Steal or Trust? See the certainty test above.

**5. Answer clarity and dispute risk.** *A scientifically defensible answer can
still be unsuitable.* The question is not "can this be defended" but "would
ordinary players at a table reasonably read it differently, and would the
losing side feel cheated?" Judgement five is about the room, not the textbook.

### Two worked cases for judgement five

Both of these are **factually correct** and both carry a real dispute risk.
Neither is automatically rejected — a reviewer decides, and often the fix is one
word in the prompt rather than a new question.

- **«أي معدن يكون سائلاً في درجة حرارة الغرفة؟» — mercury, with gallium offered.**
  Correct at the conventional 20–25 °C, and the confusion with gallium is
  exactly what makes it a good item. But gallium melts at about 29.8 °C, so in a
  genuinely warm room the premise softens, and a player who knows that has a
  real argument. Naming the temperature in the prompt removes the dispute and
  keeps the trap.

- **«أي جزء من العين يتحكم في كمية الضوء الداخلة؟» — the iris, with the pupil offered.**
  Anatomically right: the iris carries the muscle, the pupil is the aperture it
  changes. But everyday speech credits the pupil, and a table that answers
  «البؤبؤ» will feel the distinction is a technicality rather than a question.
  The designed confusion is the point — so the reviewer's call is whether it
  reads as a fair catch or a trick.

The test to apply: **if the losing team would argue, say why they would be
wrong — in one sentence a player would accept.** If that sentence needs a
lecture, the item is a dispute waiting to happen.

*Rejected example (Overwatch):* «وش اسم القدرة المميزة اللي يستخدمها Genji؟» —
answer «نصل التنين». Canonical, universally known to anyone who plays the game,
so every opposing team simply steals. Valid trivia, dead RYO.

### Point at nothing and the question breaks

A prompt that says «هذه القدرة» / «هذا اللاعب» / «تلك الخريطة» is pointing at
something. If no media is attached, it points at nothing and the player is
being asked about a thing they were never shown. Either attach the media the
wording implies, or name the subject outright. «أي من هذه…» is fine — that one
points at the answer options, which are always present.

World configuration must provide a distinct display name and differ from other
World presentations in at least two of input type, timer, media profile, sound,
or reveal style. This configuration never changes the mechanic.

---

## Machine-readable rules

The block below is the structured form of a rule already stated in this Skill
and in roadmap §6.1 — a multiple-choice prompt carries **2 to 4 options**. It
restates nothing new: the same bound is enforced today by
`ANSWER_OPTIONS_REQUIRED` and `ANSWER_OPTIONS_TOO_MANY`.

It exists so the rule can be read by the engine as data rather than inferred
from prose. Everything else in this Skill remains prose guidance: active in the
generation prompt, and **not** machine-verifiable. Nothing here is a second
source of truth — the prose above governs, and this block must agree with it.

Two policies appear below. **`bounded`** means a World or Scope may narrow the
range to a subset — a World that wants every item to offer exactly four options
may say so. **`invariant`** means the value is fixed by the runtime and no layer
may change it, narrowing included.

```akwaan-rules
{
  "version": 1,
  "rules": [
    {
      "id": "ryo.answer-option-count",
      "kind": "integer-range",
      "policy": "bounded",
      "min": 2,
      "max": 4
    },
    {
      "id": "ryo.items-per-challenge",
      "kind": "integer-range",
      "policy": "invariant",
      "min": 3,
      "max": 3
    }
  ]
}
```

`ryo.items-per-challenge` is invariant because the runtime enforces it: a
Challenge that is not exactly three items is refused outright by the RYO
launcher, and roadmap §6.1 explains why three is load-bearing — it is the span
over which teams build a read on each other. A World narrowing it to two would
not be a specialization; it would be a different mechanic.
