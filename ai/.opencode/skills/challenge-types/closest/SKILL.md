# Mechanic Profile: Closest (مين أقرب)

## Identity & Player Experience
Estimation and numerical deduction. A team that knows the exact figure should win;
a team that reasons well from what it does know should come close. The slider is
the reasoning space — it tells the player what kind of quantity this is and how
big the world of plausible answers is.

## Two valid content directions

Closest supports **both** of these, and neither is a lesser form of the other.

**A — Knowledge-anchored estimation.** The answer is a real quantity a player
may or may not know exactly. A team that knows it wins; a team that reasons from
familiar reference points should land close. *How many goals were scored in a
given World Cup? How tall is a landmark? In what year did an event happen?*

**B — Reasoning-derived estimation.** The prompt supplies what the player needs,
and the answer is reached by visualising, counting, comparing or approximating.
*How many layers after folding a page ten times? How many tiles cover this
floor?*

The distinction that matters is **not** whether the answer is a fact. It is
whether the player has an **anchor**:

> Does a team that does not know the exact answer still have somewhere to stand?

In direction A the anchor is familiarity — a sense of the right order of
magnitude from ordinary life. In direction B the anchor is in the prompt. A
question offering neither is a lottery, and that is the thing this mechanic
cannot carry. "Has a knowable answer" is not the defect; **"has no way in" is.**

### Which direction a World permits

Subject matter is owned by the World and Scope profiles, not by this file. Where
they disagree with anything here, they win.

Most Worlds permit both directions. **`puzzles` permits direction B only** — its
identity rules `PUZZLES_WORLD_NO_TRIVIA` and `PUZZLE_ITSELF_IS_THE_CHALLENGE`
(roadmap §23.11) make recall-dependent solving invalid in every Puzzles Scope,
and a slider does not exempt it. That is a World boundary, not a mechanic one:
the same knowledge-anchored question that is excellent in `football` or
`general-knowledge` is invalid in `puzzles`.

Read the target Scope before authoring. Where a Scope supplies `EXEMPLARS.md`,
those items govern.

## The quality rubric

Apply to every Closest item, in either direction. The first four are what make
the round fun; the rest are what make it fair.

| | Ask | Fails when |
|---|---|---|
| **Uncertainty** | Is the answer genuinely in doubt for most teams? | Everyone knows it, or nobody could place it |
| **Guessability** | Does a team without the answer have an anchor? | No familiarity (A) and nothing supplied (B) |
| **Discussion** | Is there something for a table to argue about? | One player knows and the rest watch |
| **Accessibility** | Would an ordinary player recognise the subject? | Specialist knowledge, niche fandom, obscure record |
| **Defensibility** | Is the number verifiable and unambiguous? | Undefined set, contested measure, "average of major cities" |
| **Stability** | Will it still be right next year? | Career totals, current records, growing counts — unless pinned to a stated date |
| **Calibration** | Is the span domain-first, with the target away from the ends? | Answer-shaped range, target at an endpoint, too few positions |
| **Mechanic fit** | Does the slider add something a multiple choice would not? | Four positions; a yes/no in disguise |
| **Distinctness** | Is this different from existing content and from the exemplars? | A worked example with the numbers changed |

A known exact answer never invalidates an item on its own. Weigh it on the
rubric.

### Examples illustrate quality, never templates

Every worked example in this file and in any Scope's `EXEMPLARS.md` is a
**retired subject**. Its job is to show which property makes an item work. Do not
reuse its subject, its wording, its numbers or its slider, and do not produce it
with one value changed — that is the most common failure in review, and it is
rejected on **Distinctness** every time.

### What separates an anchored fact from a lottery

Both of these are knowledge questions about football. One is strong Closest
content and one is unusable, and the difference is not how factual they are.

**Works** — *total goals scored across a named World Cup tournament.* A team
that does not know reasons its way in: roughly sixty-odd matches, a couple of
goals a match, so somewhere around 150. The anchor is ordinary familiarity with
how football scores. The tournament is finished, so the number is fixed forever.
Every team has something to say, and the team that knows is rewarded.

**Fails** — *goals scored by one player across his career so far.* Nothing
anchors it: a team either carries the figure or picks a number. It is also
unstable, since it changes while he plays. Pinning it — «حتى نهاية موسم ٢٠٢٤» —
fixes the stability half and leaves the anchor problem untouched.

The test is the same in direction B, only the anchor moves into the prompt.

## Payload Contract
`answerPayload.mode: 'closest'` with numeric `correctValue`, plus an explicit
interaction on `mechanicPayload.closestSlider`.

## Interaction Modes — new content MUST choose one

| Mode | Shape |
|---|---|
| `numeric-range` | `{ mode, min, max, step, unit?, displayFormat? }` |
| `between-anchors` | `{ mode, min, max, leftAnchor, rightAnchor, step? }` |

**Never author:** `legacy`, an unset mode, or a fabricated default continuum.
`legacy` — a Closest item carrying no `closestSlider` — exists only as backward
compatibility for content written before the slider. The runtime still plays it
by falling back to a bare number input. New content joining that set is how the
catalog quietly refills with items the slider can never reach, so the authoring
guard refuses it (`CLOSEST_SLIDER_MODE_REQUIRED`).

## THE RULE: bounds are domain-first

**The range comes from the question's natural quantitative or historical domain,
never from `correctValue`.**

Author a numeric range in two passes, in this order.

### Pass A — domain first
Decide, without looking at the answer:
- the **domain type** (what kind of quantity this is)
- `min`, `max`, `step`
- optional `unit`
- optional `displayFormat`

Ask only: *what is the plausible span for this kind of question?* A career goal
tally in a top league lives somewhere in the low hundreds whether the answer is
250 or 474. That span is the continuum.

### Pass B — target validation
**Only now** look at `correctValue`, and check two things:
1. the target lies inside `[min, max]`
2. the target is exactly reachable — `(correctValue - min)` is a whole multiple of `step`

If an honestly authored range excludes the target.**do not stretch an endpoint
just far enough to admit it.** That is target-shaping wearing a disguise. Flag:

```
needs-human-authoring
```

## Forbidden authoring patterns

- `target ± N`
- answer-centred ranges of any kind
- moving one endpoint after seeing the answer
- giving every item a bespoke range when a shared domain continuum exists
- a fake universal `0–100`
- deriving `min`/`max` from `acceptedTolerance`
- **altering `correctValue` to fit the slider** — the answer is the fact; the slider is the presentation
- choosing bounds purely to avoid midpoint proximity

## Shared domain continua

Pilot 02 established this as the strongest single protection against target
shaping: a range that has to serve several questions cannot be bent around any
one answer.

1. Identify comparable questions **before** authoring any bounds.
2. Group them by natural domain.
3. Prefer **one shared continuum** wherever the same reasoning space applies.

Groups verified in Pilot 02 (Football) — *examples of grouping, not a global
taxonomy and not approved subject matter for other Worlds*:
World Cup career goals · Premier League club title count · World Cup national
title count · World Cup finals field size · Premier League career goals ·
Premier League single-season goals.

### Domain families
Guidance, not a closed enum. Classify to the family that describes the
*reasoning*, not the subject matter:

title / win counts · career totals · season totals · tournament totals ·
participant counts · historical years · age · duration · distance · capacity ·
ranking positions · population · percentages · scores · prices or amounts where
appropriate · any other defensible numerical domain.

If a question does not sit cleanly in one, flag `needs-domain-review` rather
than forcing it.

## Display semantics

### Ordinary number (default)
Locale numeric formatting, grouping allowed, optional authored `unit`.

### Calendar year
```
displayFormat: 'calendar-year'
```
Localized digits, **no thousands separator**, **no `سنة` unit**.

**Never inferred from magnitude.** A four-digit number is not a year because it
is large: 1930 as a year renders `١٩٣٠`, and 1930 as a goal tally renders
`١٬٩٣٠ هدف`. The distinction is authored or it is wrong.

No other display formats exist. If a recurring semantic cannot be expressed with
what is here, **report it as a product requirement** — do not invent a format.

## between-anchors

Still supported, and still the exception. Use it only when:
- the question genuinely lives on a meaningful semantic continuum
- **both endpoints themselves help define the reasoning space**
- the target's mapping onto that continuum is natural and defensible

Do **not** use it for visual variety, to dress up an ordinary numeric question,
to expose a meaningless normalized `0–100` scale, or where the anchor labels
leak the answer.

## Midpoint — a QA signal, never a rejection

Classify every authored item **after** the continuum exists:
`exact-midpoint` · `near-midpoint` · `clear`.

Pilot 01 failed because six of seventeen ranges seeded the thumb exactly on the
answer, so a team that touched nothing and pressed Confirm won outright. That is
what this signal is for.

It is a **signal only**. A shared, independently defensible continuum may put one
answer at its midpoint honestly, and neither the backend nor authoring may reject
an item for that alone.

## Anti-Patterns
- **A question with no way in.** Not "the answer is a fact" — that is fine and
  often excellent. The defect is an answer no team can place: an obscure record,
  a specialist statistic, a quantity with no familiar reference point and nothing
  supplied in the prompt. See the **Guessability** and **Accessibility** rows.
- **An answer that moves.** A career total, a current record, a count that grows
  with each new discovery decays after authoring and can no longer be graded.
  Pin it to a stated date — «حتى نهاية موسم ٢٠٢٤» — or choose another quantity.
  The quantity is not the problem; the open-ended "so far" is.
- **An undefined set.** "The average population of major cities" has no answer
  until *major* and *which cities* are stated.
- **A worked example with the numbers changed.** See Distinctness.
- A range so broad the slider is noise, or so narrow it is a coin flip.
- A step too fine to hit on a phone.

## QA Gates
- `CLOSEST_SLIDER_MODE_REQUIRED`
- `CLOSEST_SLIDER_DISPLAY_FORMAT_INVALID`
- `CLOSEST_SLIDER_YEAR_UNIT_FORBIDDEN`
- `CLOSEST_TARGET_UNREACHABLE`
- `CLOSEST_DOMAIN_UNJUSTIFIED`

## Batch 01 & 02 Workflow Learnings — Canonicalization

The following rules govern the integrity of Closest slider domains:

- **Shared unit != shared domain**: Do not blindly group items just because they share a unit. A player's career goals and a team's season goals both use `هدف`, but they are entirely different domains with vastly different ceilings.
- **Deliberate headroom must be explicit**: If you intend to leave room above the highest known answer (e.g. 60 trophies for a manager when the highest is 49), you must state it explicitly.
- **Underlying ceiling/tier requires independent evidence**: A domain's maximum must be backed by an external reality (e.g., "The UCL has been contested ~70 times"), not the answer itself.
- **That evidence may not be the item's own correctValue**: A rationale may never derive its ceiling from the item's own target.
- **Editorial endpoints must be labelled honestly**: If a range is purely editorial and subjective, it must be acknowledged as such.
- **Truthful-but-weak Slider questions become Content Holds**: Do not invent dishonest wider ranges for items that naturally have tiny, unplayable domains. They must be moved to `holdForContentReview` instead.
- **Held content must be excluded from application**: Held items are preserved untouched and excluded from local migration and runtime gameplay until revised.
