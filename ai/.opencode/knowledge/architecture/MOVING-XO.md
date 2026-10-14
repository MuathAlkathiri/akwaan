# Moving XO — Canonical Authoring Definition

Moving XO is the Puzzles World **Signature** mechanic: a 3×3 X/O board played
*through* puzzles. Solving a puzzle earns the right to place a mark; the board
decides who wins. The puzzle is the challenge, the board is the stake.

It is **not** a renamed Rakkibha. ركّبها remains an independent, preserved
mechanic with its own runtime, validators and content — see `RAKKIBHA.md`.
Neither replaces the other.

## What the runtime actually consumes

Moving XO reads the **generic `answerPayload`** and nothing else. There is no
`mechanicPayload`, no bespoke schema, and none is needed: the mechanic only ever
asks the item for a binary verdict, and the item keeps its own answer contract.

An item the runtime can play carries:

| Field | Source | Notes |
|---|---|---|
| `prompt` | ContentItem | shown on the **shared screen** |
| `media` | ContentItem | shown on the **shared screen**; image, audio or video |
| `scopeId` | ContentItem | one of the six forward Puzzles Scopes |
| `answerPayload.mode` | ContentItem | `multiple_choice` or `match` — nothing else |
| `answerPayload.options` + `correctOptionId` | `multiple_choice` | |
| `answerPayload.acceptedAnswers` | `match` | |

Answer truth never leaves the server: `correctOptionId` and `acceptedAnswers`
are absent from every projection.

An item in any other answer mode is rejected by the same canonical parser used
for launch inventory and post-reservation hydration. If a legacy or raced write
still reaches hydration, the runtime releases that unseen reservation and tries
another candidate within a bounded recovery loop. It never presents the broken
item or burns its exposure.

That recovery is defense in depth, not permission to store bad READY content.
The READY policy remains the authoring gate: it keeps inventory counts honest
and makes the problem fixable before a host starts a Match.

## The two surfaces are asymmetric — design for it

This is the constraint that shapes every Moving XO puzzle:

- **The shared screen** renders the prompt *and* the media.
- **The answering phone** renders **neither**. It shows answer controls only:
  text choice buttons, or a single text input for `match`.

So the player answering is reading a screen **across the room** while tapping a
text answer in their hand.

Consequences that are not negotiable:

- **Answer choices are text.** The phone cannot render image options. A puzzle
  whose answers are pictures cannot be authored.
- **No fine detail.** Anything requiring close inspection is unfair when the
  stimulus is on a shared display several metres away.
- **No gestures.** There is no drag-drop, rotation or drawing surface. A puzzle
  that needs one is future design requiring approval, not content.

## Fifteen seconds

`MOVING_XO_QUESTION_SECONDS = 15`. Placement afterwards gets 10 more.

Fifteen seconds is the whole solving budget, including the time to look up at
the shared screen and read it. A puzzle that is *fair* in thirty seconds is
simply wrong here. Design for a single insight, not a chain of steps.

A wrong answer and a timeout are identical to the runtime: no mark, turn passes,
no further penalty. Difficulty is therefore a pacing decision, not a punishment.

## Answer-mode rules

**`multiple_choice` is the default.** Prefer it wherever text matching could be
ambiguous.

**`match` is narrow.** A typed answer is compared through the single canonical
Arabic normalizer, `normalizeAnswer`. It folds diacritics and tatweel, the alef
family, `ى→ي`, `ة→ه`, punctuation, case, and a leading `ال` or `the`. So
`سبعة ≡ سبعه`, `الشمس ≡ شمس`, and `مُثَلَّث ≡ مثلث` all match.

**It does not fold digits.** `٧` and `7` are different strings; so are `٢٥` and
`25`. A player typing an Arabic-Indic numeral for a correct numeric answer would
be marked wrong and lose the turn.

> **Numeric answers must use `multiple_choice`.** This is an authoring rule, not
> a normalizer change — the normalizer is shared by every mechanic and is not
> Moving XO's to widen.

`match` is acceptable only for short, single-token Arabic words with accepted
aliases covering the plausible spellings. Anything longer, numeric, or with more
than one defensible phrasing belongs in `multiple_choice`.

## Scope and family boundaries

Content belongs to one of the **six forward Puzzles Scopes** and, within it, to a
**Puzzle Family**. Families live here in the authoring Knowledge layer — in each
Scope's own `SCOPE.md` — and deliberately **not** as a database field. They
carry authoring guidance, not runtime behaviour.

The nine legacy Scopes (`general-knowledge`, `letters-words`,
`numbers-arithmetic`, `logic-deduction`, `shapes-patterns`, `symbols-codes`,
`patterns-sequences`, `lateral-thinking`, `visual-puzzles`) are retired. An item
on one of them cannot be Moving XO content.

## Media

Three Scopes are **definitionally visual** — their own boundaries say the image
*is* the puzzle:

- `observation-illusions` — "the image in front of the player is the whole puzzle"
- `assembly-rotation` — the object is transformed in the player's head
- `paths-motion` — the outcome follows from **what is drawn**

For these, a **resolved asset** is required before READY. The runtime applies the
same rule while counting launch inventory and hydrating a reserved item, so an
image-less visual puzzle is never presented. The READY policy still catches the
problem at its proper boundary rather than relying on runtime recovery. A declared
`media.type: image` with an empty `assets` array is not enough: intent is not an
asset, and a host cannot play an intent.

`wordplay-letters` is text-native. `numbers-estimation` and `spot-the-error` are
mixed, and there the requirement is **family-led** — see each Scope profile.

Authoring and media enrichment stay separate. An item may be drafted text-first
and sit in `draft` until its asset lands. Nothing forces enrichment to happen
inside the authoring step.

## READY blockers

Enforced by `ContentItemCompatibilityPolicy`, and only for items actually
compatible with the `moving-xo` ChallengeType:

| Code | Meaning |
|---|---|
| `MOVING_XO_ANSWER_MODE_UNSUPPORTED` | mode is not `multiple_choice` or `match` |
| `MOVING_XO_MATCH_ANSWER_NUMERIC` | a `match` item whose accepted answers are numeric |
| `MOVING_XO_SCOPE_NOT_FORWARD` | the item sits on a retired Puzzles Scope |
| `PUZZLE_SCOPE_REQUIRES_MEDIA` | a definitionally visual Scope with no resolved asset |

## Where the checks live

Two layers, deliberately not one:

| Layer | File | What only it can see |
|---|---|---|
| Authoring | `ai/.opencode/validators/validate_moving_xo.py` | the **Puzzle Family**, which is Knowledge-layer and never persisted — so the per-family media policy and answer modes are enforceable here and nowhere else |

A Puzzles pack is **not** automatically a Moving XO pack. The authored packs in
`ai/workbench/artifacts` mix Moving XO, Bomb, RYO and Closest rows in one file,
told apart only by an id convention that is not a contract. The validator
therefore checks a row only when the row, or the caller, says it is Moving XO —
through `compatibleChallengeTypeIds`, a `mechanic` key, pack `metadata`, or
`--mechanic moving-xo`. Rows it does not check are always reported as unchecked,
because a validator that quietly ignores rows reads exactly like one that
approved them.

| Backend | `ContentItemCompatibilityPolicy` | the stored item at READY, where a promotion actually stops |

The validator runs on authored packs, before a promotion; the policy is the gate
that holds. The validator is therefore allowed to be stricter — it can see the
family — and the policy falls back to the Scope, which is all the database knows.

## What authoring cannot prove

A validator can check structure. It cannot prove a puzzle is *fair*, *solvable
in fifteen seconds*, or *unambiguous*. Those stay human review, and the Scope
profiles name the rejection patterns reviewers should look for.

In particular, no persisted Puzzle Family identifier exists, so the mixed Scopes'
family-led media requirement is **review-enforced, not machine-enforced**. That
is a deliberate choice: a free-form metadata tag would look like enforcement
while being trivially omitted.

## Smoke fixtures

Twenty-one Moving XO items exist in the **local/dev** runtime only. They were
created by one-off scripts that bypassed this pipeline, sit on retired Scopes,
and read as ordinary trivia rather than mechanic-native puzzles.

They remain useful as local runtime fixtures and **must never be promoted**.
They are not examples of this contract.
