# Mechanic Profile: Closest (مين أقرب)

## Identity & Player Experience
Estimation and numerical deduction. A team that knows the exact figure should win;
a team that reasons well from what it does know should come close. The slider is
the reasoning space — it tells the player what kind of quantity this is and how
big the world of plausible answers is.

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

Groups verified in Pilot 02 (Football) — *examples, not a global taxonomy*:
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
- Ordinary trivia with a slider bolted on: a question with one knowable answer
  and no estimable span is not a Closest question.
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
